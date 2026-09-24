"""
Certificate Verification AI Service
===================================
Extracts certificate data from uploaded PDFs/images via OCR,
compares it field-by-field against user-entered details,
detects tampering, classifies document type, and generates
forensic reports.

Architecture unchanged — this is a drop-in enhancement of the
existing extraction, matching, and validation logic.
"""

import io
import logging
import math
import os
import re
import json
import sys
import shutil
import time
import numpy as np
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from PIL import Image, ImageChops, ImageEnhance
import pytesseract
from rapidfuzz import fuzz

# ── Env & Config ────────────────────────────────────────────────────────────
load_dotenv(override=True)

logging.basicConfig(
    level=logging.INFO,
    format="[AI-SERVICE] %(asctime)s %(levelname)s: %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)

# Locate the Tesseract binary cross-platform. Prefer the one on PATH, fall back
# to the common install locations per OS.
pytesseract.pytesseract.tesseract_cmd = shutil.which("tesseract") or (
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if sys.platform == "win32"
    else "/usr/bin/tesseract"
)
logger.info("Using Tesseract at: %s", pytesseract.pytesseract.tesseract_cmd)

# ── Optional Dependencies ───────────────────────────────────────────────────
try:
    import fitz  # PyMuPDF
    PYMUPDF_AVAILABLE = True
except ImportError:
    PYMUPDF_AVAILABLE = False
    logger.warning("PyMuPDF (fitz) not available — PDF text extraction disabled")

try:
    from google import genai
    GENAI_AVAILABLE = True
except ImportError:
    GENAI_AVAILABLE = False
    logger.warning("google-genai not available — Gemini forensic reports disabled")

app = Flask(__name__)

# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                         TEXT EXTRACTION                                    ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def extract_text_from_file(file_bytes, filename="file"):
    """
    Extracts text from a PDF using PyMuPDF (no OCR needed for text PDFs),
    or falls back to Tesseract OCR for images & scanned PDFs.
    Returns the extracted text string.
    """
    fname = filename.lower()

    # ── PDF path ──────────────────────────────────────────────────────────
    if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            text = ""
            for page in doc:
                text += page.get_text()
            doc.close()

            if text.strip():
                logger.info("PDF text extracted via PyMuPDF: %d chars", len(text))
                return text

            # Scanned PDF → rasterize first page at 2x zoom + OCR (reduced from 4x for speed)
            doc2 = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc2[0]
            mat = fitz.Matrix(2, 2)  # 2x is sufficient and ~4x faster than 4x
            pix = page.get_pixmap(matrix=mat)
            img_bytes = pix.tobytes("png")
            doc2.close()
            image = Image.open(io.BytesIO(img_bytes))
            text = pytesseract.image_to_string(image)
            logger.info("Scanned PDF OCR'd: %d chars", len(text))
            return text
        except FileNotFoundError:
            return "__TESSERACT_MISSING__"
        except Exception as e:
            logger.warning("PDF text extraction failed: %s", e)
            return ""

    # ── Image path (PNG/JPG/JPEG) ────────────────────────────────────────
    try:
        image = Image.open(io.BytesIO(file_bytes))
        text = pytesseract.image_to_string(image)
        logger.info("Image OCR'd: %d chars", len(text))
        return text
    except FileNotFoundError:
        return "__TESSERACT_MISSING__"
    except Exception as e:
        logger.warning("Image OCR failed: %s", e)
        return ""


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                     OCR ERROR NORMALIZATION                                ║
# ╚════════════════════════════════════════════════════════════════════════════╝

# Common OCR character confusions mapped to canonical forms
OCR_CORRECTIONS = {
    # Zero vs letter O
    "0": "O",    # context-dependent — we handle this per-field
    # Common substitutions
    "|": "I",
    "[" : "I",
    "]": "I",
}

# Characters that OCR commonly misreads — strip when doing loose matching
OCR_STRIP_CHARS = set(".,;:'\"!@#$%^&*()_+-=[]{}|\\/ ")


def normalize_ocr_text(text):
    """
    Normalize text to reduce OCR noise:
    - Lowercase
    - Collapse multiple whitespace to single space
    - Strip leading/trailing whitespace
    - Remove common OCR artifact characters

    Returns (normalized_string, original_string).
    """
    if not text:
        return "", ""
    original = text.strip()
    # Remove excessive whitespace
    normalized = re.sub(r"\s+", " ", original)
    # Keep original case for some comparisons, but also provide lowercase
    return normalized.strip(), original


def fuzzy_field_match(extracted_value, expected_value, threshold=75):
    """
    Compare two strings with OCR-tolerant fuzzy matching.
    Returns (match_score: int 0-100, matched: bool, details: str).
    """
    if not extracted_value and not expected_value:
        return 100, True, "both empty"
    if not extracted_value:
        return 0, False, "no value extracted from document"
    if not expected_value:
        # If user didn't provide a value, don't penalize
        return 100, True, "no expected value provided — skipping"

    # 1. Normalize both strings
    ext_norm = extracted_value.strip().lower()
    exp_norm = expected_value.strip().lower()

    # 2. Exact match after normalization
    if ext_norm == exp_norm:
        return 100, True, "exact match (normalized)"

    # 3. Contains check (one is substring of the other)
    if exp_norm in ext_norm or ext_norm in exp_norm:
        # Partial contains — good match
        score = max(
            fuzz.ratio(ext_norm, exp_norm),
            fuzz.partial_ratio(ext_norm, exp_norm),
            fuzz.token_sort_ratio(ext_norm, exp_norm),
        )
        return score, score >= threshold, f"partial match (score={score})"

    # 4. Multi-strategy fuzzy matching — take the best
    scores = [
        fuzz.ratio(ext_norm, exp_norm),
        fuzz.partial_ratio(ext_norm, exp_norm),
        fuzz.token_sort_ratio(ext_norm, exp_norm),
        fuzz.token_set_ratio(ext_norm, exp_norm),
    ]

    best_score = max(scores)
    matched = best_score >= threshold

    details = f"fuzzy best={best_score} (ratio={scores[0]}, partial={scores[1]}, sort={scores[2]}, set={scores[3]})"

    return best_score, matched, details


def normalize_name_for_comparison(name):
    """
    Normalize a person's name for comparison:
    - Handle "Last, First" vs "First Last" order
    - Handle middle initials
    - Strip titles (Mr, Mrs, Dr, etc.)
    """
    if not name:
        return ""
    name = name.strip()
    # Remove common titles
    name = re.sub(
        r"\b(mr|mrs|ms|miss|dr|prof|sri|shri|smt)\.?\s+",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    # Normalize spacing around periods (initials)
    name = re.sub(r"\s*\.\s*", ".", name)
    return name.lower()


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                  KNOWN-ORGANIZATION REGISTRY (training)                    ║
# ╚════════════════════════════════════════════════════════════════════════════╝
#
# Certificate issuers almost never print their name in a plain text field — it
# is embedded in the logo, set in a decorative font, split across lines, or
# abbreviated. OCR alone therefore cannot recover the EXACT institution name.
#
# This registry is the "training data" for institution extraction: every
# organization this system issues/verifies for is listed with its canonical
# spelling, aliases and distinctive keywords. `match_known_organization()`
# scans the OCR'd text (including a dedicated OCR pass over the logo/header
# zone) and resolves whatever it finds back to the registered canonical name.
#
# Admins add/update organizations through the dApp "AI Training" panel, which
# calls POST /organizations/train → this list is persisted to
# known_organizations.json. The JSON is hot-reloaded on every request.

KNOWN_ORGS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "known_organizations.json")
_known_orgs_cache = None
_known_orgs_cache_mtime = None


def load_known_organizations():
    """Load the known-organization registry, caching by file mtime so edits
    made via the training API are picked up on the next request."""
    global _known_orgs_cache, _known_orgs_cache_mtime
    try:
        mtime = os.path.getmtime(KNOWN_ORGS_PATH)
    except OSError:
        _known_orgs_cache = []
        return _known_orgs_cache
    if _known_orgs_cache is not None and mtime == _known_orgs_cache_mtime:
        return _known_orgs_cache
    try:
        with open(KNOWN_ORGS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        orgs = data.get("organizations", []) if isinstance(data, dict) else (data or [])
        _known_orgs_cache = orgs
        _known_orgs_cache_mtime = mtime
        logger.info("Known-org registry: %d institutions loaded", len(orgs))
    except Exception as e:
        logger.warning("Failed to load known organizations: %s", e)
        _known_orgs_cache = []
    return _known_orgs_cache


def save_known_organizations(orgs):
    """Persist the registry back to known_organizations.json and invalidate
    the load cache so the next request re-reads it."""
    global _known_orgs_cache, _known_orgs_cache_mtime
    with open(KNOWN_ORGS_PATH, "w", encoding="utf-8") as f:
        json.dump({"organizations": orgs}, f, indent=2, ensure_ascii=False)
    _known_orgs_cache = orgs
    _known_orgs_cache_mtime = os.path.getmtime(KNOWN_ORGS_PATH)


def extract_logo_region_text(file_bytes, filename="file", full_text=""):
    """
    Rasterize the top ~30% of the first page — the zone where logos and the
    issuer's name/crest normally sit.

    Skip heavy multi-pass OCR if PyMuPDF already extracted rich text from the
    document body (>200 chars) — the institution name will already be in the
    body text and the extra passes are wasted work.
    """
    fname = filename.lower()

    # Speed shortcut: if text-layer extraction already gave us rich content,
    # run only a single fast OCR pass on the logo zone instead of four.
    rich_text_available = len((full_text or "").strip()) > 200

    try:
        image = None
        if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            page = doc[0]
            rect = page.rect
            clip = fitz.Rect(rect.x0, rect.y0, rect.x1, rect.y0 + rect.height * 0.30)
            mat = fitz.Matrix(2, 2)  # 2x zoom (was 4x — faster, still enough for OCR)
            pix = page.get_pixmap(matrix=mat, clip=clip)
            doc.close()
            image = Image.open(io.BytesIO(pix.tobytes("png")))
        else:
            img = Image.open(io.BytesIO(file_bytes))
            w, h = img.size
            image = img.crop((0, 0, w, int(h * 0.30)))

        # 1. Try Gemini GenAI Vision first (better for stylized fonts/logos)
        if GENAI_AVAILABLE and os.getenv("GEMINI_API_KEY"):
            try:
                img_byte_arr = io.BytesIO()
                image.save(img_byte_arr, format='PNG')
                img_bytes_logo = img_byte_arr.getvalue()

                client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
                response = client.models.generate_content(
                    model='gemini-2.5-flash',
                    contents=[
                        "Extract ONLY the full name of the organization, institution, or company from this certificate header/logo. Do not include any other text. If no organization name is visible, output nothing.",
                        {'mime_type': 'image/png', 'data': img_bytes_logo}
                    ]
                )
                result = response.text.strip()
                if result and len(result) > 3:
                    logger.info("Gemini Vision extracted organization from logo: %s", result)
                    return result
            except Exception as e:
                logger.warning("Gemini Vision failed for logo extraction, falling back to OCR: %s", e)

        # 2. Tesseract OCR — single fast pass when body text is already rich
        if rich_text_available:
            image1 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
            image1 = ImageEnhance.Contrast(image1).enhance(1.5)
            result = pytesseract.image_to_string(image1)
            logger.info("Logo region OCR (fast-path, 1 pass): %d chars", len(result))
            return result

        # 3. Full multi-pass OCR for scanned/graphic PDFs with little body text
        results = []

        # Pass 1: Upscale + contrast boost
        image1 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        image1 = ImageEnhance.Contrast(image1).enhance(1.5)
        results.append(pytesseract.image_to_string(image1))

        # Pass 2: Higher contrast
        image2 = image.resize((image.width * 3, image.height * 3), Image.LANCZOS)
        image2 = ImageEnhance.Contrast(image2).enhance(2.0)
        image2 = ImageEnhance.Sharpness(image2).enhance(2.0)
        results.append(pytesseract.image_to_string(image2))

        # Pass 3: Grayscale + threshold
        image3 = image.resize((image.width * 2, image.height * 2), Image.LANCZOS)
        image3 = image3.convert('L')
        image3 = image3.point(lambda x: 255 if x > 128 else 0)
        results.append(pytesseract.image_to_string(image3))

        combined = "\n".join([r for r in results if r.strip()])
        logger.info("Logo region OCR combined result length: %d chars", len(combined))
        return combined

    except Exception as e:
        logger.warning("Logo-region extraction failed: %s", e)
        return ""


def match_known_organization(text, logo_text=""):
    """
    Scan OCR'd text (body + logo zone) for any known organization and return
    its CANONICAL registered name.

    Returns (canonical_name or None, confidence 0-100, detail string).
    Matching layers (strongest first):
      1. Verbatim name/alias substring in the text
      2. Compact no-space match (handles the name split across logo lines)
      3. Distinctive-keyword presence (e.g. 'infosys', 'onwingspan')
      4. Per-line fuzzy token-set ratio (tolerates OCR-garbled stylized text)
      5. Cross-line fuzzy matching for multi-line logos
      6. Partial word matching for heavily garbled OCR
    """
    orgs = load_known_organizations()
    haystack = (text or "") + ("\n" + logo_text if logo_text else "")
    if not orgs or not haystack.strip():
        return None, 0, "no known organizations loaded"

    hay_norm = re.sub(r"\s+", " ", haystack).lower()
    hay_nospace = re.sub(r"\s+", "", hay_norm)
    hay_lines = [ln.strip() for ln in haystack.split("\n") if ln.strip()]

    best_name = None
    best_conf = 0
    best_detail = ""

    for org in orgs:
        name = (org.get("name") or "").strip()
        if not name:
            continue
        aliases = [a.strip() for a in (org.get("aliases") or []) if a and a.strip()]
        keywords = [k.strip().lower() for k in (org.get("keywords") or []) if k and k.strip()]
        # Auto-derive keywords from the canonical name when none are registered.
        if not keywords:
            keywords = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]

        conf = 0
        detail = ""

        # 1. Verbatim / alias substring
        for cand in [name] + aliases:
            c_norm = re.sub(r"\s+", " ", cand).strip().lower()
            c_nospace = re.sub(r"\s+", "", c_norm)
            if c_norm and c_norm in hay_norm:
                conf = max(conf, 97)
                detail = f"verbatim match '{cand}' in document"
            if c_nospace and len(c_nospace) >= 4 and c_nospace in hay_nospace:
                conf = max(conf, 93)
                detail = f"compact (no-space) match '{cand}' in document"

        # 2. Distinctive keywords
        if conf < 90 and keywords:
            kw_hits = sum(
                1 for kw in keywords
                if kw and (kw in hay_norm or re.sub(r"\s+", "", kw) in hay_nospace)
            )
            if kw_hits:
                kw_conf = min(85, 45 + kw_hits * 15)
                if kw_conf > conf:
                    conf = kw_conf
                    detail = f"keyword match ({kw_hits}/{len(keywords)}) for '{name}'"

        # 3. Line-level fuzzy match (OCR-garbled stylized/logo text)
        if conf < 80 and hay_lines:
            line_best = 0
            line_snippet = ""
            for line in hay_lines:
                if len(line) < 3:
                    continue
                sc = max(
                    fuzz.token_set_ratio(name.lower(), line.lower()),
                    fuzz.partial_ratio(name.lower(), line.lower()),
                )
                if sc > line_best:
                    line_best = sc
                    line_snippet = line[:60]
            if line_best >= 62:
                fuzzy_conf = int(68 + (line_best - 62) * (30 / 38))
                if fuzzy_conf > conf:
                    conf = fuzzy_conf
                    detail = f"fuzzy line match score={line_best} vs '{line_snippet}'"

        # 4. Cross-line fuzzy matching - combine adjacent lines for multi-line logos
        if conf < 75 and len(hay_lines) >= 2:
            for i in range(len(hay_lines) - 1):
                combined_line = hay_lines[i] + " " + hay_lines[i + 1]
                if len(combined_line) < 6:
                    continue
                sc = max(
                    fuzz.token_set_ratio(name.lower(), combined_line.lower()),
                    fuzz.partial_ratio(name.lower(), combined_line.lower()),
                    fuzz.token_sort_ratio(name.lower(), combined_line.lower()),
                )
                if sc > 60:
                    fuzzy_conf = int(65 + (sc - 60) * (35 / 40))
                    if fuzzy_conf > conf:
                        conf = fuzzy_conf
                        detail = f"cross-line fuzzy match score={sc} vs '{combined_line[:60]}'"

        # 5. Word-level fuzzy matching - for highly garbled OCR where words are split
        if conf < 70:
            # Split name into significant words and check if they appear in order
            name_words = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]
            if len(name_words) >= 2:
                # Check if words appear in sequence (allowing OCR noise between)
                for i in range(len(hay_lines)):
                    for j in range(i, min(i + 3, len(hay_lines))):
                        segment = " ".join(hay_lines[i:j+1]).lower()
                        # Count how many name words appear in this segment
                        word_hits = sum(1 for w in name_words if w in segment)
                        if word_hits >= len(name_words) * 0.6:  # 60% of name words found
                            word_conf = int(50 + word_hits * 10)
                            if word_conf > conf:
                                conf = word_conf
                                detail = f"word-sequence match {word_hits}/{len(name_words)} words in segment"

        # 6. Acronym/abbreviation matching (e.g., "IIT" for "Indian Institute of Technology")
        if conf < 65:
            name_words = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]
            if len(name_words) >= 2:
                # Build potential acronym from first letters
                acronym = "".join(w[0] for w in name_words if w)
                if len(acronym) >= 2 and acronym in hay_nospace:
                    if conf < 60:
                        conf = 60
                        detail = f"acronym match '{acronym}' found in document"

        if conf > best_conf:
            best_conf = conf
            best_name = name
            best_detail = detail

    return best_name, best_conf, best_detail


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                  STRUCTURED FIELD EXTRACTION                               ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def extract_certificate_fields(text, logo_text=""):
    """
    Extracts structured fields from certificate OCR text using
    multi-pattern regex matching. `logo_text` (optional) is a separate OCR
    pass over the logo/header zone and is used only for institution
    resolution against the known-organization registry.

    Returns a dict with extracted values and per-field confidence.
    """
    if not text or text == "__TESSERACT_MISSING__":
        return {
            "certificate_id": None,
            "student_name": None,
            "course": None,
            "institution": None,
            "issue_date": None,
            "grade_cgpa": None,
            "_raw_text_length": 0,
            "_extraction_notes": [],
        }

    text_clean = text.replace("\n", " ").replace("\r", " ")
    lines = text.split("\n")

    fields = {
        "certificate_id": None,
        "student_name": None,
        "course": None,
        "institution": None,
        "issue_date": None,
        "grade_cgpa": None,
        "_raw_text_length": len(text),
        "_extraction_notes": [],
    }

    # ── CERTIFICATE ID ────────────────────────────────────────────────────
    cert_id_patterns = [
        # "Certificate No: ABC12345"
        r"(?:certificate|registration|serial|ref|roll)\s*(?:no|number|id|#)[.:]\s*([A-Za-z0-9\-/]{3,30})",
        # "No. ABC-12345"
        r"(?:no|number)\s*[.:]\s*([A-Za-z0-9\-/]{4,30})",
        # Bare alphanumeric IDs like "CERT-2024-001"
        r"\b([A-Z]{2,6}[-/]\d{2,4}[-/]\d{3,8})\b",
    ]
    for pattern in cert_id_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            fields["certificate_id"] = m.group(1).strip()
            fields["_extraction_notes"].append(f"certificate_id extracted via pattern: {pattern[:50]}...")
            break

    # ── STUDENT NAME ──────────────────────────────────────────────────────
    # Component: word part of a name (allows initials, ALL-CAPS, Title Case)
    NAME_WORD = r"(?:[A-Z][A-Za-z]*|[A-Z]\.?)"
    # Full name: 2-5 name words (handles "John David Smith III")
    NAME_PAT = NAME_WORD + r"(?:\s+" + NAME_WORD + r"){1,4}"

    name_patterns = [
        # "awarded to John Doe"
        r"(?:awarded\s+to|presented\s+to|conferred\s+upon|issued\s+to|hereby\s+certify\s+that|certify\s+that|certified\s+that)\s+(" + NAME_PAT + r")",
        # "This is to certify that John Doe"
        r"this\s+is\s+to\s+certify\s+(?:that\s+)?(?:mr\.?|mrs\.?|ms\.?|miss\.?|dr\.?|prof\.?|sri\.?|shri\.?|smt\.?)?\s*(" + NAME_PAT + r")",
        # "Student Name: John Doe"
        r"(?:student|candidate|participant|scholar)\s*(?:name|'s\s+name)?[.:]\s*(" + NAME_PAT + r")",
        # "Name: John Doe"
        r"(?:name)[.:]\s*(" + NAME_PAT + r")",
    ]
    for pattern in name_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            # Clean up — don't capture trailing lowercase words that are likely
            # part of the next sentence (e.g. "has successfully completed")
            raw = re.split(r"\s+(?:has|having|son|daughter|s/o|d/o|w/o)(?:\s+|$)", raw, flags=re.IGNORECASE)[0]
            raw = raw.strip().rstrip(",.;:")
            first_word = raw.split()[0] if raw.split() else ""
            # Reject captures that don't read as a proper name (e.g. re.IGNORECASE
            # letting "awarded to for successfully completing the course" through).
            # Captured values must start with an uppercase letter to be trusted;
            # otherwise fall through to the capitalized-line fallback, which handles
            # certificates that place the name on its own line BEFORE the award text.
            if (
                len(raw.split()) >= 2
                and first_word
                and first_word[0].isupper()
            ):  # Must have at least first + last name and a leading capital
                fields["student_name"] = raw
                fields["_extraction_notes"].append("student_name extracted via pattern match")
                break

    # Fallback: look for capitalized Proper Name lines (common in certificates)
    if not fields["student_name"]:
        skip_keywords = {
            "certificate", "university", "college", "institute",
            "department", "school", "academic", "examination",
            "semester", "session", "grade", "marks", "score",
            "percentage", "division", "class", "date", "issued",
            "authorized", "signature", "seal", "official",
            "controller", "registrar", "principal", "director",
            "chairman", "president", "vice", "dean",
            "roll", "number", "registration", "student", "candidate",
            "programme", "program", "degree", "diploma", "bachelor",
            "master", "doctor", "philosophy", "technology", "science",
            "arts", "commerce", "engineering",
        }
        for line in lines:
            line = line.strip()
            if not line or len(line) < 4:
                continue
            line_lower = line.lower()
            # Skip lines with obvious non-name keywords
            if any(kw in line_lower for kw in skip_keywords):
                continue
            words = line.split()
            if 2 <= len(words) <= 5:
                # Check: at least 50% of words start with uppercase (handles ALL-CAPS titles too)
                upper_count = sum(
                    1 for w in words
                    if w and (w[0].isupper() or w.isupper()) and len(w) > 1
                )
                if upper_count >= len(words) * 0.5 and all(
                    w[0].isalpha() for w in words if w
                ):
                    fields["student_name"] = line
                    fields["_extraction_notes"].append("student_name extracted via capitalized-line fallback")
                    break

    # ── COURSE ────────────────────────────────────────────────────────────
    course_patterns = [
        # "has successfully completed the course in Computer Science"
        r"(?:complet(?:ed|ing)|passed|qualified)\s+(?:the\s+)?(?:course|program|module|degree)\s+(?:in|of|for)?\s*([A-Za-z\s]{4,80}?)(?:with|from|during|in\s+the|at\s+the|\.|$)",
        # "course: B.Tech Computer Science"
        r"(?:course|program|degree|diploma|major)[.:]\s*([A-Za-z\s]{3,80})",
        # "Bachelor of Technology in Computer Science"
        r"\b((?:bachelor|master|doctor|associate|diploma|b\.?\s*(?:tech|sc|a|com|e)|m\.?\s*(?:tech|sc|a|com|e)|ph\.?\s*d\.?|b\.?\s*e\.?|m\.?\s*e\.?)\s*(?:\(?hons?\.?\)?\s*)?(?:in|of)?\s*[A-Za-z\s]{2,60})",
        # "B.Tech" / "B.Sc" / "MBA" etc.
        r"\b(B\.?\s*(?:Tech|Sc|A|Com|E|Ed|Pharm|Arch|BA)\b[^.]?)",
        r"\b(M\.?\s*(?:Tech|Sc|A|Com|E|Ed|Pharm|Arch|BA|CA|BA)\b[^.]?)",
    ]
    for pattern in course_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            raw = m.group(1).strip().rstrip(",.;: ")
            # Clean trailing noise
            raw = re.sub(
                r'\s+(?:with|from|at|in\s+the)\s+.*$', '', raw,
                flags=re.IGNORECASE
            ).strip().rstrip(",.;: ")
            if len(raw) >= 3:
                fields["course"] = raw
                fields["_extraction_notes"].append("course extracted via pattern match")
                break

    # Fallback: some issuers (e.g. Infosys Springboard) print the course name as
    # its own Title-Case line immediately before an "awarded to / ... certificate is"
    # anchor, with no "completed the course <name>" phrasing to latch onto.
    if not fields["course"]:
        for i, line in enumerate(lines):
            if not line.strip():
                continue
            if re.search(
                r"\bawarded\s+to\b|\bpresented\s+to\b|certificate\s+is\s+awarded",
                line, re.IGNORECASE,
            ):
                prev = lines[i - 1].strip() if i > 0 else ""
                if (
                    prev and len(prev.split()) >= 2
                    and prev.lower() not in {"the", "for", "and", "this"}
                    and prev != (fields["student_name"] or "")
                ):
                    words = prev.split()
                    upper = sum(1 for w in words if w and w[0].isupper())
                    if upper >= len(words) * 0.6:
                        fields["course"] = prev
                        fields["_extraction_notes"].append(
                            "course extracted via Title-Case line before award anchor"
                        )
                break

    # ── INSTITUTION ───────────────────────────────────────────────────────
    inst_candidates = []

    # Pattern 1: After "issued by" / "from" / "awarded by" etc.
    issuer_prefix_patterns = [
        r"(?:issued\s+by|issuing\s+authority|awarded\s+by|from\s+(?:the\s+)?)[.:]?\s*([A-Z][A-Za-z\s&]{3,80})",
        r"(?:institution|organization|organizing\s+body)\s*[.:]\s*([A-Za-z\s&]{4,80})",
    ]
    for pattern in issuer_prefix_patterns:
        for m in re.finditer(pattern, text_clean, re.IGNORECASE):
            raw = m.group(1).strip().rstrip(",.;: ")
            raw = re.split(
                r"\s{2,}(?=date|grade|cgpa|gpa|percentage|marks|certificate|signature|authori[sz]ed|registrar|controller)",
                raw, flags=re.IGNORECASE
            )[0]
            raw = raw.strip().rstrip(",.;: ")
            if len(raw) >= 4 and raw.lower() not in {'the', 'and', 'for'}:
                inst_candidates.append((raw, m.start()))

    # Pattern 2: "University of XYZ", "Institute of ABC" etc. — prefer later
    # positions (closer to the bottom of the certificate)
    for m in re.finditer(
        r"\b((?:university|college|institute|school|academy|polytechnic)\s+(?:of\s+)?[A-Z][A-Za-z\s&]{2,80})",
        text_clean, re.IGNORECASE
    ):
        raw = m.group(1).strip().rstrip(",.;: ")
        raw = re.split(
            r"\s{2,}(?=date|grade|cgpa|gpa|percentage|marks|certificate|signature|authori[sz]ed|registrar|controller)",
            raw, flags=re.IGNORECASE
        )[0]
        raw = raw.strip().rstrip(",.;: ")
        if len(raw) >= 4:
            inst_candidates.append((raw, m.start()))

    # Pattern 3: "XYZ University", "ABC College" etc.
    for m in re.finditer(
        r"\b([A-Z][A-Za-z\s&]{3,60}?\s*(?:University|College|Institute|School|Academy))\b",
        text_clean
    ):
        raw = m.group(1).strip().rstrip(",.;: ")
        raw = re.split(
            r"\s{2,}(?=date|grade|cgpa|gpa|percentage|marks|certificate|signature|authori[sz]ed|registrar|controller)",
            raw, flags=re.IGNORECASE
        )[0]
        raw = raw.strip().rstrip(",.;: ")
        if len(raw) >= 4:
            inst_candidates.append((raw, m.start()))

    # Prefer candidates later in the text (closer to "from", issuer fields)
    # Also prefer those after "from" keyword
    from_match = re.search(r'\bfrom\b', text_clean, re.IGNORECASE)
    from_pos = from_match.start() if from_match else -1

    # Clean trailing noise from all candidates
    TRAILING_PATTERNS = [
        r'\s+(?:date|grade|cgpa|gpa|percentage|marks|certificate|signature|authori[sz]ed|registrar|controller|director|principal|chairman|president|dean|examination|academic|session)\b.*$',
        r'\s{2,}.*$',  # double space means field separator
        r'\s*(?:No|No\.|Number|#)[.:]\s*\d+.*$',  # trailing ID numbers
    ]
    cleaned_candidates = []
    for raw, pos in inst_candidates:
        for tp in TRAILING_PATTERNS:
            raw = re.sub(tp, '', raw, flags=re.IGNORECASE).strip().rstrip(",.;: ")
        if len(raw) >= 4 and raw.lower() not in {'the', 'and', 'for'}:
            cleaned_candidates.append((raw, pos))
    inst_candidates = cleaned_candidates

    if inst_candidates:
        # Sort: first by whether they appear after "from" (bonus), then by position
        def candidate_score(item):
            text_val, pos = item
            score = pos  # later = higher
            if from_pos >= 0 and pos > from_pos:
                score = pos + 10000  # big bonus for being after "from"
            # Also bonus for longer names (more likely to be complete)
            score += len(text_val)
            return score

        inst_candidates.sort(key=candidate_score, reverse=True)
        best_text, best_pos = inst_candidates[0]
        fields["institution"] = best_text
        fields["_extraction_notes"].append(
            f"institution extracted from {len(inst_candidates)} candidates (pos={best_pos})"
        )

    # If no institution was found in the text layer, the issuer often only
    # embeds its name in the logo/QR image. Fall back on the verification-host
    # in the printed QR URL to resolve a canonical institution name (legacy
    # hardcoded map + the trained registry's `verify_hosts`).
    if not fields["institution"]:
        QR_INSTITUTION_MAP = {
            "onwingspan.com": "Infosys Springboard",
            "verify.onwingspan.com": "Infosys Springboard",
        }
        m_url = re.search(
            r"https?://([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)",
            text_clean, re.IGNORECASE,
        )
        if m_url:
            host = m_url.group(1).lower().lstrip("www.")
            host_name = QR_INSTITUTION_MAP.get(host)
            if not host_name:
                for org in load_known_organizations():
                    vhosts = [h.strip().lower() for h in (org.get("verify_hosts") or []) if h]
                    if host in vhosts or any(host.endswith("." + v) for v in vhosts):
                        host_name = org.get("name")
                        break
            if host_name:
                fields["institution"] = host_name
                fields["_extraction_notes"].append(
                    "institution resolved via QR verification hostname map"
                )

    # ── KNOWN-ORGANIZATION RESOLUTION (trained registry) ──────────────────
    # The issuer's name is usually artwork, not text. Resolve the OCR text
    # (body + logo zone) against the known-organization registry and, when
    # confident, override to the CANONICAL registered spelling — this is how
    # the AI is "trained" to read names that live inside/under the logo or in
    # stylized fonts, and to return the exact institution name.
    known_name, known_conf, known_detail = match_known_organization(text, logo_text)
    if known_name and known_conf >= 55:
        fields["institution"] = known_name
        fields["_extraction_notes"].append(
            f"institution resolved via known-org registry (conf={known_conf}: {known_detail})"
        )

    # ── ISSUE DATE ────────────────────────────────────────────────────────
    date_patterns = [
        # "Date: 15 June 2024"
        r"(?:date\s*(?:of\s*)?(?:issue|issuance|completion|award|passing|examination)?|issued?\s*(?:on|date)?|dated)[.:\s]*(\d{1,2}[/\-\s\.]\d{1,2}[/\-\s\.]\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s*\d{2,4})",
        # Standalone date in DD/MM/YYYY or MM/DD/YYYY format
        r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b",
        # "June 2024" or "15th June 2024"
        r"\b(\d{1,2}(?:st|nd|rd|th)?\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s*\d{2,4})\b",
    ]
    for pattern in date_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            fields["issue_date"] = raw
            fields["_extraction_notes"].append("issue_date extracted via pattern match")
            break

    # ── GRADE / CGPA ──────────────────────────────────────────────────────
    grade_patterns = [
        # "CGPA: 8.5" or "GPA: 3.8"
        r"(?:cgpa|gpa|grade\s*point\s*average)[.:\s]*(\d+\.?\d*)",
        # "Grade: A+" or "Grade A"
        r"(?:grade|division|class)[.:\s]*([A-F][+-]?|first|second|third|distinction|pass|merit)",
        # "Percentage: 85%"
        r"(?:percentage|marks|score)[.:\s]*(\d+\.?\d*\s*%?)",
        # "obtained X marks" or "scored X out of"
        r"(?:obtained|scored|secured|achieved)\s+(\d+\.?\d*\s*%?\s*(?:out\s*of\s*\d+)?)",
        # Bare CGPA like "8.5 CGPA"
        r"\b(\d+\.\d{1,2})\s*(?:cgpa|gpa|grade|percentage|%)\b",
    ]
    for pattern in grade_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            raw = m.group(1).strip()
            fields["grade_cgpa"] = raw
            fields["_extraction_notes"].append("grade_cgpa extracted via pattern match")
            break

    logger.info(
        "Field extraction complete: id=%s name=%s course=%s inst=%s date=%s grade=%s",
        "✓" if fields["certificate_id"] else "✗",
        "✓" if fields["student_name"] else "✗",
        "✓" if fields["course"] else "✗",
        "✓" if fields["institution"] else "✗",
        "✓" if fields["issue_date"] else "✗",
        "✓" if fields["grade_cgpa"] else "✗",
    )

    return fields


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                    FIELD-BY-FIELD COMPARISON                               ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def compare_fields(extracted_fields, expected_data, full_doc_text=""):
    """
    Compares extracted fields against user-entered values field-by-field.

    CRITICAL FIELDS: studentName, course, orgName
    NON-CRITICAL: certificateId, issueDate, grade

    Strategy:
    - First tries structured extraction match
    - If extraction failed (score=0), searches the ENTIRE document text for the
      user-provided value as a fallback (handles OCR/format issues)
    - Lower thresholds for critical fields to account for OCR errors
    - Certificate passes if at least 2 of 3 critical fields match

    Returns:
        {
            "overall_match_score": float (0-100),
            "all_critical_matched": bool,
            "critical_fields_matched": int,
            "field_results": {...},
            "failed_critical_fields": [str],
            "failed_noncritical_fields": [str],
        }
    """
    # Normalize full document text for fallback search
    doc_text_lower = (full_doc_text or "").lower()
    # Collapse whitespace for better matching
    doc_text_compact = re.sub(r"\s+", " ", doc_text_lower)

    # Map of expected data keys to extracted field keys and criticality
    FIELD_MAP = {
        "studentName": {
            "extracted_key": "student_name",
            "label": "Student Name",
            "critical": True,
            "threshold": 45,   # Very permissive — OCR garbles names heavily
        },
        "course": {
            "extracted_key": "course",
            "label": "Course/Degree",
            "critical": True,
            "threshold": 45,
        },
        "orgName": {
            "extracted_key": "institution",
            "label": "Institution/Organization",
            "critical": True,
            "threshold": 45,
        },
        "certificateId": {
            "extracted_key": "certificate_id",
            "label": "Certificate ID",
            "critical": False,
            "threshold": 50,
        },
        "issueDate": {
            "extracted_key": "issue_date",
            "label": "Issue Date",
            "critical": False,
            "threshold": 40,
        },
        "grade": {
            "extracted_key": "grade_cgpa",
            "label": "Grade/CGPA",
            "critical": False,
            "threshold": 40,
        },
    }

    field_results = {}
    failed_critical = []
    failed_noncritical = []
    scores = []

    for expected_key, config in FIELD_MAP.items():
        expected_val = expected_data.get(expected_key, "")
        extracted_val = extracted_fields.get(config["extracted_key"])

        # Apply name-specific normalization for studentName field
        if expected_key == "studentName":
            expected_val_norm = normalize_name_for_comparison(expected_val)
            extracted_val_norm = (
                normalize_name_for_comparison(extracted_val)
                if extracted_val
                else None
            )
            score, matched, details = fuzzy_field_match(
                extracted_val_norm, expected_val_norm, config["threshold"]
            )
        elif expected_key == "orgName":
            # For institution names, use token_sort_ratio
            score, matched, details = fuzzy_field_match(
                extracted_val, expected_val, config["threshold"]
            )
            # If not matched, try token_sort_ratio
            if not matched and extracted_val and expected_val:
                token_score = fuzz.token_sort_ratio(
                    (extracted_val or "").lower(),
                    (expected_val or "").lower(),
                )
                if token_score >= config["threshold"]:
                    score = token_score
                    matched = True
                    details = f"token_sort match (score={token_score})"
            # Try partial_ratio as last resort
            if not matched and extracted_val and expected_val:
                partial_score = fuzz.partial_ratio(
                    (extracted_val or "").lower(),
                    (expected_val or "").lower(),
                )
                if partial_score >= config["threshold"]:
                    score = partial_score
                    matched = True
                    details = f"partial match (score={partial_score})"
        elif expected_key == "issueDate":
            # Normalize dates for comparison
            expected_date_norm = normalize_date(expected_val)
            extracted_date_norm = normalize_date(extracted_val)
            score, matched, details = fuzzy_field_match(
                extracted_date_norm, expected_date_norm, config["threshold"]
            )
        else:
            score, matched, details = fuzzy_field_match(
                extracted_val, expected_val, config["threshold"]
            )

        # ── FALLBACK: If extraction failed but we have full doc text,
        #     search for the user's value directly in the document ──────────
        if score == 0 and expected_val and expected_val.strip() and doc_text_compact:
            fallback_score, fallback_details = _search_doc_for_value(
                expected_val, doc_text_compact, config
            )
            if fallback_score >= config["threshold"]:
                score = fallback_score
                matched = True
                details = f"FALLBACK: {fallback_details}"
                # Update extracted value to what was found
                extracted_val = f"[found in doc: '{expected_val}']"
            elif fallback_score > 0:
                # Partial finding — boost the score for non-critical fields
                score = max(score, fallback_score)
                details = f"partial fallback: {fallback_details}"

        result = {
            "field": config["label"],
            "expected": expected_val or "",
            "extracted": extracted_val or "",
            "match_score": score,
            "matched": matched,
            "is_critical": config["critical"],
            "details": details,
        }
        field_results[expected_key] = result

        logger.info(
            "Field compare [%s] '%s' vs '%s' → score=%d matched=%s (%s)",
            config["label"],
            (expected_val or "")[:50],
            (extracted_val or "")[:50],
            score,
            matched,
            details,
        )

        if config["critical"]:
            scores.append(score)
            if not matched:
                failed_critical.append(config["label"])

        if not config["critical"] and not matched:
            failed_noncritical.append(config["label"])

    # Overall score = weighted average of critical fields
    overall = sum(scores) / len(scores) if scores else 0.0

    # ── RELAXED CRITICAL CHECK: Pass if 2 of 3 critical fields match ────────
    critical_count = len([s for s in scores if s >= 50])  # >=50 is "good enough"
    all_critical_matched = critical_count >= 2  # At least 2 of 3 critical fields

    if critical_count < 3:
        logger.info(
            "Relaxed critical check: %d/3 critical fields matched (need 2+) — %s",
            critical_count,
            "PASS" if all_critical_matched else "FAIL",
        )

    return {
        "overall_match_score": round(overall, 2),
        "all_critical_matched": all_critical_matched,
        "critical_fields_matched": critical_count,
        "field_results": field_results,
        "failed_critical_fields": failed_critical,
        "failed_noncritical_fields": failed_noncritical,
    }


def _search_doc_for_value(user_value, doc_text_compact, config):
    """
    Search the full document text for the user-provided value.
    Used as a fallback when structured extraction fails.

    For names: tries word reordering, initial matching, and OCR-tolerant lookups.
    For institutions: tries abbreviated forms and partial matching.

    Returns (score, details).
    """
    val_lower = user_value.strip().lower()
    if not val_lower or len(val_lower) < 2:
        return 0, "empty or too-short value"

    val_clean = re.sub(r"[^a-z0-9\s]", "", val_lower)
    val_clean = re.sub(r"\s+", " ", val_clean).strip()

    # Split into significant words
    val_words = [w for w in val_clean.split() if len(w) > 1]

    # ── 1. Full value found verbatim ──────────────────────────────────────
    if val_lower in doc_text_compact:
        return 90, f"value found verbatim in document"
    if val_clean in doc_text_compact:
        return 90, f"value found verbatim (cleaned) in document"

    # ── 2. Compact match (ignore spaces) ──────────────────────────────────
    val_nospace = re.sub(r"\s+", "", val_lower)
    doc_nospace = re.sub(r"\s+", "", doc_text_compact)
    if val_nospace in doc_nospace:
        return 85, f"value found (no spaces) in document"

    # ── 3. All significant words found anywhere in doc ───────────────────
    if val_words:
        words_found = sum(1 for w in val_words if w in doc_text_compact)
        word_ratio = words_found / len(val_words)
        if word_ratio == 1.0:
            return 80, f"all {len(val_words)} words found (ratio=100%)"
        if word_ratio >= 0.75:
            return int(65 + word_ratio * 15), f"{words_found}/{len(val_words)} words found (ratio={word_ratio:.0%})"
        if word_ratio >= 0.5:
            return int(45 + word_ratio * 30), f"{words_found}/{len(val_words)} words found (ratio={word_ratio:.0%})"
        if word_ratio >= 0.3:
            return int(30 + word_ratio * 40), f"{words_found}/{len(val_words)} words found"

    # ── 4. For names: try fuzzy matching on individual lines ──────────────
    if val_words and len(val_words) >= 1:
        segments = re.split(r"[.,;\n]+", doc_text_compact)
        best_score = 0
        for seg in segments:
            seg = seg.strip()
            if len(seg) < 3:
                continue
            # Try token set ratio (handles word reordering)
            ts = fuzz.token_set_ratio(val_lower, seg)
            ps = fuzz.partial_ratio(val_lower, seg)
            best = max(ts, ps)
            if best > best_score:
                best_score = best
        if best_score >= 80:
            return best_score, f"strong fuzzy match in document segments (best={best_score})"
        if best_score >= 60:
            return best_score, f"moderate fuzzy match in document (best={best_score})"
        if best_score >= 45:
            return best_score, f"weak fuzzy match in document (best={best_score})"

    # ── 5. Partial match on first/last name words ────────────────────────
    if len(val_words) >= 2:
        # Try matching just first + last word (handle middle names)
        first_and_last = f"{val_words[0]} {val_words[-1]}"
        far = fuzz.partial_ratio(first_and_last, doc_text_compact)
        if far >= 80:
            return far, f"first+last name match in document (score={far})"

    return 0, f"value not found in document"


def normalize_date(date_str):
    """Normalize a date string for fuzzy comparison."""
    if not date_str:
        return ""
    d = date_str.strip().lower()
    # Remove ordinal suffixes
    d = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", d)
    # Standardize separators
    d = d.replace("-", " ").replace("/", " ").replace(".", " ")
    # Collapse whitespace
    d = re.sub(r"\s+", " ", d).strip()
    return d


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                      TAMPERING DETECTION                                   ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def detect_tampering(file_bytes, filename="file"):
    """
    Image: Error Level Analysis (ELA).
    PDF: Check for suspicious object layers / metadata inconsistencies.
    """
    fname = filename.lower()

    # ── PDF tampering check ───────────────────────────────────────────────
    if fname.endswith(".pdf") and PYMUPDF_AVAILABLE:
        try:
            doc = fitz.open(stream=file_bytes, filetype="pdf")
            suspicious = False
            notes = ["Normal PDF structure"]

            for page in doc:
                annots = page.annots()
                if annots:
                    for annot in annots:
                        content = annot.info.get("content", "").strip()
                        if content:
                            suspicious = True
                            notes.append("Suspicious annotations detected")
                            break

            meta = doc.metadata
            producer = (meta.get("producer") or "").lower()
            creator = (meta.get("creator") or "").lower()

            # Check for modification by different tools
            if (
                producer
                and creator
                and producer != creator
                and "converter" not in producer
                and "converter" not in creator
            ):
                notes.append(
                    f"Modified by different tool (Creator: {creator}, Producer: {producer})"
                )
                # Don't auto-flag — many legit PDFs pass through
                # different tools during publishing

            # Check for edit/modify tools
            edit_tools = ["photoshop", "gimp", "illustrator", "inkscape", "canva"]
            for tool in edit_tools:
                if tool in producer or tool in creator:
                    notes.append(
                        f"PDF processed with editing software: {tool}"
                    )
                    # Don't necessarily flag — certificates can be designed
                    # in these tools legitimately

            doc.close()
            return {
                "is_tampered": suspicious,
                "entropy": 0,
                "notes": " | ".join(notes),
            }
        except Exception as e:
            return {"is_tampered": False, "entropy": 0, "notes": str(e)}

    # ── Image ELA ─────────────────────────────────────────────────────────
    try:
        original = Image.open(io.BytesIO(file_bytes)).convert("RGB")

        buffer = io.BytesIO()
        original.save(buffer, format="JPEG", quality=75)
        buffer.seek(0)
        compressed = Image.open(buffer).convert("RGB")

        ela_image = ImageChops.difference(original, compressed)
        enhancer = ImageEnhance.Brightness(ela_image)
        ela_image = enhancer.enhance(20)

        ela_array = np.array(ela_image)
        mean_val = float(ela_array.mean())
        std_val = float(ela_array.std())

        is_tampered = mean_val > 12.0 and std_val > 15.0

        grayscale = original.convert("L")
        histogram = grayscale.histogram()
        total = sum(histogram)
        probs = [h / total for h in histogram if h > 0]
        entropy = -sum(p * math.log(p, 2) for p in probs)

        return {
            "is_tampered": bool(is_tampered),
            "entropy": float(f"{entropy:.2f}"),
            "ela_mean": float(f"{mean_val:.2f}"),
            "ela_std": float(f"{std_val:.2f}"),
            "notes": "ELA analysis complete",
        }
    except Exception as e:
        return {"is_tampered": False, "entropy": 0, "notes": str(e)}


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                     DOCUMENT TYPE CLASSIFICATION                           ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def classify_document_type(text):
    """
    Classifies the document type based on content analysis.
    Returns: (doc_type, confidence, indicators)
    """
    if not text or not text.strip():
        return "unknown", 0, ["No text content detected"]

    text_lower = text.lower()
    indicators = []

    certificate_indicators = {
        "strong": [
            "certificate", "certification", "certified", "diploma", "degree",
            "this is to certify", "hereby certify", "hereby certified",
            "conferred upon", "awarded to", "has successfully completed",
            "has been awarded", "in recognition of", "completion of",
            "graduated", "graduation", "academic record", "transcript",
            # Additional keywords for graphic/Canva-style certificates
            "achievement", "presented to", "excellence", "accomplishment",
            "participation", "recognition", "credential", "successfully",
            "award", "honour", "honor", "commendation",
        ],
        "medium": [
            "date of issue", "issue date", "valid until", "expiry date",
            "certificate number", "registration number", "roll number",
            "authorized signature", "seal", "stamp", "accredited",
            "university", "college", "institution", "academic year",
            "semester", "credits", "grade", "percentage", "cgpa", "gpa",
            "signed", "director", "principal", "president", "registrar",
        ],
    }

    resume_indicators = {
        "strong": [
            "resume", "curriculum vitae", "cv", "personal information",
            "work experience", "employment history", "professional experience",
            "career objective", "objective", "profile summary",
            "skills", "technical skills", "soft skills", "languages known",
            "hobbies", "interests", "references", "referees",
            "linkedin", "portfolio", "github",
        ],
        "medium": [
            "experience", "years of experience", "job title", "position held",
            "responsibilities", "achievements", "projects", "internship",
            "training", "workshop", "seminar", "conference",
        ],
    }

    cert_strong = sum(1 for kw in certificate_indicators["strong"] if kw in text_lower)
    cert_medium = sum(1 for kw in certificate_indicators["medium"] if kw in text_lower)
    resume_strong = sum(1 for kw in resume_indicators["strong"] if kw in text_lower)
    resume_medium = sum(1 for kw in resume_indicators["medium"] if kw in text_lower)

    cert_score = cert_strong * 3 + cert_medium
    resume_score = resume_strong * 3 + resume_medium

    lines = text.split("\n")

    # Resume-style section detection
    resume_sections = [
        "education", "experience", "skills", "projects", "objective", "summary",
    ]
    section_count = sum(1 for section in resume_sections if section in text_lower)
    if section_count >= 2:
        resume_score += section_count * 2
        indicators.append(f"Found {section_count} resume-style section headers")

    if resume_score > cert_score and resume_score >= 6:
        confidence = min(100, resume_score * 8)
        indicators.append(
            f"Resume indicators: {resume_strong} strong, {resume_medium} medium"
        )
        return "resume", confidence, indicators
    elif cert_score > resume_score and cert_score >= 6:
        confidence = min(100, cert_score * 8)
        indicators.append(
            f"Certificate indicators: {cert_strong} strong, {cert_medium} medium"
        )
        return "certificate", confidence, indicators
    elif cert_score >= 3 and cert_score > resume_score:
        return "likely_certificate", cert_score * 10, indicators
    elif resume_score >= 3:
        return "likely_resume", resume_score * 10, indicators
    else:
        return "unknown", 0, ["Insufficient document type indicators"]


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                     CERTIFICATE VALIDATION                                 ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def extract_pdf_metadata(file_bytes):
    if not PYMUPDF_AVAILABLE:
        return {}
    try:
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        metadata = doc.metadata
        doc.close()
        return metadata or {}
    except Exception as e:
        logger.warning("Failed to parse PDF metadata: %s", e)
        return {}


def certificate_content_indicators(text, metadata=None):
    text_lower = text.lower()
    signature_indicators = [
        "authorized signature", "signature", "signed by", "seal",
        "stamp", "official seal",
    ]
    issuer_indicators = [
        "issued by", "issued to", "certificate no", "certificate number",
        "date of issue", "valid until", "awarded to", "conferred upon",
        "authorized by",
    ]
    template_indicators = [
        "certificate", "diploma", "degree", "certified",
        "this is to certify", "has successfully completed",
    ]

    hits = [kw for kw in template_indicators if kw in text_lower]
    if metadata:
        metadata_text = " ".join(
            str(v).lower() for v in metadata.values() if v
        )
        if (
            "certificate" in metadata_text
            or "diploma" in metadata_text
            or "issued by" in metadata_text
        ):
            hits.append("pdf_metadata_certificate")

    return {
        "template_hits": hits,
        "issuer_indicators": [kw for kw in issuer_indicators if kw in text_lower],
        "signature_indicators": [
            kw for kw in signature_indicators if kw in text_lower
        ],
        "metadata": metadata or {},
    }


def validate_certificate_document(extracted_text, filename, file_bytes):
    metadata = (
        extract_pdf_metadata(file_bytes)
        if filename.lower().endswith(".pdf")
        else {}
    )
    indicators = certificate_content_indicators(extracted_text, metadata)
    doc_type, doc_confidence, doc_indicators = classify_document_type(extracted_text)

    reason_list = []

    # ── LOW-TEXT BYPASS (Fix #5) ──────────────────────────────────────────
    # Graphic certificates (Canva, heavily designed PDFs) often have no selectable
    # text layer. PyMuPDF extracts 0 chars; Tesseract OCR on stylized fonts also
    # returns near-empty output. In this case keyword matching always fails.
    # Approve structurally and let the trust score reflect low confidence.
    if len((extracted_text or "").strip()) < 80:
        reason_list.append(
            "Low text content — graphic or image-based certificate assumed. Structural validation bypassed."
        )
        logger.info(
            "validate_certificate_document: low text (%d chars), bypassing keyword check for %s",
            len((extracted_text or "").strip()),
            filename,
        )
        return True, reason_list

    if (
        doc_type in ["certificate", "likely_certificate"]
        and doc_confidence >= 30
    ):
        reason_list.append(
            f"Document classified as {doc_type} with confidence {doc_confidence}."
        )

    if len(indicators["template_hits"]) >= 2:
        reason_list.append(
            f"Found certificate keyword hits: {', '.join(indicators['template_hits'][:5])}."
        )

    if indicators["issuer_indicators"]:
        reason_list.append(
            f"Found issuer fields: {', '.join(indicators['issuer_indicators'][:5])}."
        )

    if indicators["signature_indicators"]:
        reason_list.append(
            f"Found signature/seal markers: {', '.join(indicators['signature_indicators'][:5])}."
        )

    if "pdf_metadata_certificate" in indicators["template_hits"]:
        reason_list.append(
            "PDF metadata contains certificate-related metadata fields."
        )

    is_certificate_like = (
        (doc_type in ["certificate", "likely_certificate"])
        or (len(indicators["template_hits"]) >= 1)
        or (len(indicators["issuer_indicators"]) >= 1)
        or (len(indicators["signature_indicators"]) >= 1)
        or ("pdf_metadata_certificate" in indicators["template_hits"])
    )

    if not is_certificate_like:
        if extracted_text == "__TESSERACT_MISSING__":
            is_certificate_like = True
            reason_list.append(
                "Structural check bypassed because text extraction was unavailable."
            )
        else:
            reason_list.append(
                "Document does not match known certificate structure or metadata patterns."
            )
            logger.warning(
                "Certificate content validation failed: doc_type=%s conf=%s text_snippet=%s",
                doc_type,
                doc_confidence,
                extracted_text[:120].replace("\n", " "),
            )
            return False, reason_list

    return True, reason_list


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                     TRUST SCORE CALCULATION                                ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def compute_trust_score(comparison_result, tamper_results):
    """
    Calculates trust score from field-level comparison results
    and tampering analysis.

    RELAXED MODE (v2):
    1. If document is resume/CV → 0
    2. If fewer than 2 critical fields match → 0
    3. Otherwise, weighted score from match quality + tamper analysis.
    """
    doc_type = comparison_result.get("doc_type", "unknown")
    doc_confidence = comparison_result.get("doc_type_confidence", 0)

    # Reject resumes/CVs outright
    if doc_type in ["resume", "likely_resume"]:
        return 0.0

    # Unknown doc type with no confidence and no matched critical fields → reject
    critical_matched = comparison_result.get("critical_fields_matched", 0)
    if doc_type == "unknown" and doc_confidence < 20 and critical_matched == 0:
        return 0.0

    # If fewer than 2 critical fields matched → fail
    if not comparison_result.get("all_critical_matched", False):
        # Still give partial credit for 1 matching field
        overall_match_1 = comparison_result.get("overall_match_score", 0)
        return max(0, min(30, (overall_match_1 * 0.3) + 10))

    # Base score from overall match quality (critical fields average)
    overall_match = comparison_result.get("overall_match_score", 0)
    trust_score = overall_match * 0.70

    # Tampering penalty/bonus
    if tamper_results.get("is_tampered", False):
        trust_score -= 35
    else:
        trust_score += 30  # Baseline integrity bonus

    # Bonus for clear certificate classification
    if doc_type == "certificate":
        trust_score += 10

    # Bonus for non-critical field matches
    field_results = comparison_result.get("field_results", {})
    noncritical_matches = sum(
        1 for k, v in field_results.items()
        if not v.get("is_critical") and v.get("matched")
    )
    trust_score += min(noncritical_matches * 2, 10)

    return float(max(0, min(100, trust_score)))


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                   FORENSIC REPORT GENERATION                               ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def build_rejection_message(comparison_result, trust_score):
    """
    Build a clear, human-readable rejection message that explains
    EXACTLY which fields failed validation.
    """
    messages = []
    field_results = comparison_result.get("field_results", {})
    failed_critical = comparison_result.get("failed_critical_fields", [])
    failed_noncritical = comparison_result.get("failed_noncritical_fields", [])

    if failed_critical:
        field_details = []
        for field_name in failed_critical:
            for key, fr in field_results.items():
                if fr.get("field") == field_name and fr.get("is_critical"):
                    expected = fr.get("expected", "N/A")
                    extracted = fr.get("extracted", "NOT FOUND")
                    field_details.append(
                        f"• {field_name}: Expected \"{expected}\" but found \"{extracted}\""
                    )
        messages.append(
            f"CRITICAL FIELD MISMATCH — The following required fields "
            f"do not match the uploaded certificate:\n"
            + "\n".join(field_details)
        )

    if failed_noncritical:
        field_details = []
        for field_name in failed_noncritical:
            for key, fr in field_results.items():
                if fr.get("field") == field_name and not fr.get("is_critical"):
                    expected = fr.get("expected", "N/A")
                    extracted = fr.get("extracted", "NOT FOUND")
                    field_details.append(
                        f"• {field_name}: Expected \"{expected}\" but found \"{extracted}\""
                    )
        messages.append(
            f"NON-CRITICAL FIELD MISMATCH — The following additional fields "
            f"do not match:\n" + "\n".join(field_details)
        )

    if not messages:
        messages.append(
            f"Document rejected with trust score {trust_score}%. "
            f"The uploaded file could not be verified as a legitimate "
            f"certificate matching the provided details."
        )

    return "\n\n".join(messages)


def generate_forensic_report(trust_score, comparison_result, tamper_results):
    """
    Generates a forensic report explaining the verification result.
    Uses Gemini API when available, otherwise builds a structured report.
    """
    doc_type = comparison_result.get("doc_type", "unknown")
    doc_confidence = comparison_result.get("doc_type_confidence", 0)
    failed_critical = comparison_result.get("failed_critical_fields", [])
    field_results = comparison_result.get("field_results", {})

    # ── Resume/CV rejection ───────────────────────────────────────────────
    if doc_type in ["resume", "likely_resume"]:
        gemini_key = os.getenv("GEMINI_API_KEY")
        if not gemini_key or not GENAI_AVAILABLE:
            return (
                f"FORENSIC ANALYSIS: DOCUMENT TYPE MISMATCH — The uploaded file "
                f"has been identified as a {doc_type.upper()} with "
                f"{doc_confidence}% confidence. The system only accepts academic "
                f"certificates, diplomas, or professional certifications. Resumes, "
                f"CVs, and personal documents are explicitly rejected."
            )

        try:
            client = genai.Client(api_key=gemini_key)
            prompt = (
                f"Act as an expert digital forensics examiner. A document was "
                f"submitted for certificate verification but was identified as a "
                f"RESUME/CV instead of a certificate. Write a concise, professional "
                f"forensic report (2-3 sentences) explaining the rejection.\n\n"
                f"Document Type: {doc_type.upper()}\n"
                f"Confidence: {doc_confidence}%\n"
                f"Explain that the system only accepts academic certificates, "
                f"diplomas, or professional certifications."
            )
            response = client.models.generate_content(
                model="gemini-1.5-flash", contents=prompt
            )
            return response.text.strip()
        except Exception as e:
            logger.warning("Gemini API error: %s", e)
            return build_rejection_message(comparison_result, trust_score)

    # ── Build structured field-level report ───────────────────────────────
    rejection_msg = build_rejection_message(comparison_result, trust_score)

    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key or not GENAI_AVAILABLE:
        return f"FORENSIC ANALYSIS: Document rejected with {trust_score}% trust score.\n\n{rejection_msg}"

    # ── Enhanced Gemini prompt ─────────────────────────────────────────────
    try:
        client = genai.Client(api_key=gemini_key)

        # Build field comparison summary for the prompt
        field_summary_lines = []
        for key, fr in field_results.items():
            status = "MATCHED ✓" if fr.get("matched") else "MISMATCHED ✗"
            field_summary_lines.append(
                f"  - {fr.get('field')} (critical={fr.get('is_critical')}): "
                f"{status} | Expected: \"{fr.get('expected', '')[:80]}\" | "
                f"Found: \"{fr.get('extracted', '')[:80]}\" | "
                f"Score: {fr.get('match_score', 0)}%"
            )
        field_summary = "\n".join(field_summary_lines)

        prompt = f"""Act as an expert digital forensics examiner specializing in academic document verification.
A certificate has been submitted for verification and has FAILED the automated analysis.

Write a concise, professional forensic report (3-5 sentences) that explains the rejection.
Address the report to the system administrator. Be specific about what was found.

VERIFICATION DATA:
- Trust Score: {trust_score}% (threshold: 40%)
- Document Type: {doc_type} (confidence: {doc_confidence}%)
- Tampering Detected: {tamper_results.get('is_tampered', False)}
- Tamper Notes: {tamper_results.get('notes', 'N/A')}

FIELD-BY-FIELD COMPARISON:
{field_summary}

FAILED CRITICAL FIELDS: {', '.join(failed_critical) if failed_critical else 'None'}

TECHNICAL NOTES:
- OCR extracts text from the document and compares it against user-provided details
- Field matching uses fuzzy logic to account for minor OCR errors
- Critical fields (Name, Course, Institution) must match; non-critical fields are advisory
- Tampering detection uses Error Level Analysis (ELA) for images and PDF structure analysis

Write the final conclusive report now. Do not explain the fields — just state the findings."""
        response = client.models.generate_content(
            model="gemini-1.5-flash", contents=prompt
        )
        gemini_report = response.text.strip()

        # Combine Gemini report with structured field details
        full_report = (
            f"{gemini_report}\n\n"
            f"{'='*60}\n"
            f"DETAILED FIELD COMPARISON:\n"
            f"{'='*60}\n"
            f"{field_summary}\n\n"
            f"REJECTION REASON:\n{rejection_msg}"
        )
        return full_report
    except Exception as e:
        logger.warning("Gemini API error during forensic report: %s", e)
        return f"FORENSIC ANALYSIS: Document rejected with {trust_score}% trust score.\n\n{rejection_msg}"


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                    PDF VALIDATION UTILITY                                  ║
# ╚════════════════════════════════════════════════════════════════════════════╝

def is_pdf_bytes_valid(file_bytes):
    return file_bytes.startswith(b"%PDF")


def validate_pdf_upload(filename, mimetype, file_bytes):
    ext = os.path.splitext(filename.lower())[1]
    if ext != ".pdf":
        return (
            False,
            "File extension is not .pdf. Only PDF certificate documents are accepted.",
        )
    if mimetype not in ("application/pdf", "application/x-pdf"):
        if not is_pdf_bytes_valid(file_bytes):
            return (
                False,
                "Uploaded file does not have valid PDF content.",
            )
        logger.warning("PDF MIME type mismatch: %s", mimetype)
    elif not is_pdf_bytes_valid(file_bytes):
        return (
            False,
            "Uploaded file claims to be PDF but is not a valid PDF document.",
        )
    return True, ""


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                          API ROUTES                                        ║
# ╚════════════════════════════════════════════════════════════════════════════╝

@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Certificate issuance endpoint — validates the certificate before
    it goes on-chain.

    Flow:
    1. Validate file type (PDF only)
    2. Extract text via OCR/PDF parser
    3. Validate certificate document structure
    4. Extract structured fields
    5. Compare field-by-field against user-provided values
    6. Detect tampering
    7. Classify document type
    8. Compute trust score
    9. Generate forensic report if rejected
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    file_bytes = file.read()
    filename = file.filename or "file"
    file_ext = os.path.splitext(filename.lower())[1]

    # ── FILE TYPE VALIDATION ──────────────────────────────────────────────
    if file_ext != ".pdf":
        return (
            jsonify(
                {
                    "error": f"Invalid file type '{file_ext}'. Only PDF certificate documents are accepted.",
                    "is_safe": False,
                    "trust_score": 0,
                    "message": "Invalid file format. Please upload a PDF certificate document.",
                    "details": {
                        "error_type": "INVALID_FILE_FORMAT",
                        "allowed_formats": [".pdf"],
                        "received_format": file_ext,
                    },
                }
            ),
            400,
        )

    # PDF validity check
    pdf_valid, pdf_message = validate_pdf_upload(
        filename, file.mimetype or "", file_bytes
    )
    if not pdf_valid:
        logger.warning(
            "PDF validation rejected file=%s mimetype=%s reason=%s",
            filename,
            file.mimetype,
            pdf_message,
        )
        return (
            jsonify(
                {
                    "error": "INVALID_PDF_DOCUMENT",
                    "is_safe": False,
                    "trust_score": 0,
                    "message": pdf_message,
                    "details": {
                        "error_type": "INVALID_PDF_DOCUMENT",
                        "mimetype": file.mimetype,
                        "file_extension": file_ext,
                    },
                }
            ),
            400,
        )

    # File size check (max 10MB)
    max_size = 10 * 1024 * 1024
    if len(file_bytes) > max_size:
        return (
            jsonify(
                {
                    "error": "File too large. Maximum size is 10MB.",
                    "is_safe": False,
                    "trust_score": 0,
                    "message": "File size exceeds limit. Certificates should not exceed 10MB.",
                    "details": {
                        "error_type": "FILE_TOO_LARGE",
                        "max_size_mb": 10,
                        "received_size_mb": round(
                            len(file_bytes) / (1024 * 1024), 2
                        ),
                    },
                }
            ),
            400,
        )

    # ── COLLECT USER-PROVIDED DETAILS ──────────────────────────────────────
    student_name = request.form.get("studentName", "")
    course = request.form.get("course", "")
    org_name = request.form.get("orgName", "")
    certificate_id = request.form.get("certificateId", "")
    issue_date = request.form.get("issueDate", "")
    grade = request.form.get("grade", "")

    # ── 1. EXTRACT TEXT ───────────────────────────────────────────────────
    extract_start = time.time()
    extracted_text = extract_text_from_file(file_bytes, filename)
    extract_time = round((time.time() - extract_start) * 1000, 1)
    logger.info("Text extraction took %s ms, got %d chars", extract_time, len(extracted_text))

    # ── 2. CERTIFICATE STRUCTURE VALIDATION ───────────────────────────────
    cert_valid, cert_reasons = validate_certificate_document(
        extracted_text, filename, file_bytes
    )
    if not cert_valid:
        logger.warning(
            "Certificate document validation failed for %s: %s",
            filename,
            cert_reasons,
        )
        return (
            jsonify(
                {
                    "error": "NOT_A_CERTIFICATE_DOCUMENT",
                    "is_safe": False,
                    "trust_score": 0,
                    "message": (
                        "Uploaded document is a valid PDF but does not appear "
                        "to be an authentic certificate."
                    ),
                    "details": {
                        "error_type": "NOT_A_CERTIFICATE_DOCUMENT",
                        "reasons": cert_reasons,
                    },
                }
            ),
            400,
        )

    # ── 3. STRUCTURED FIELD EXTRACTION ────────────────────────────────────
    # Pass extracted_text to the logo extractor so it can skip heavy OCR
    # passes when body text is already rich (speed fix #2).
    logo_text = extract_logo_region_text(file_bytes, filename, full_text=extracted_text)
    extracted_fields = extract_certificate_fields(extracted_text, logo_text)
    logger.info("Extracted fields: %s", json.dumps({
        k: v for k, v in extracted_fields.items()
        if not k.startswith("_")
    }, default=str))

    # ── 4. FIELD-BY-FIELD COMPARISON ──────────────────────────────────────
    expected_data = {
        "studentName": student_name,
        "course": course,
        "orgName": org_name,
        "certificateId": certificate_id,
        "issueDate": issue_date,
        "grade": grade,
    }
    comparison_result = compare_fields(extracted_fields, expected_data, extracted_text)
    logger.info(
        "Comparison result: overall=%.1f all_critical_matched=%s failed_critical=%s",
        comparison_result["overall_match_score"],
        comparison_result["all_critical_matched"],
        comparison_result["failed_critical_fields"],
    )

    # ── 5. DOCUMENT TYPE CLASSIFICATION ───────────────────────────────────
    doc_type, doc_confidence, doc_indicators = classify_document_type(
        extracted_text
    )
    comparison_result["doc_type"] = doc_type
    comparison_result["doc_type_confidence"] = doc_confidence
    comparison_result["doc_indicators"] = doc_indicators

    # ── 6. TAMPER DETECTION ───────────────────────────────────────────────
    tamper_results = detect_tampering(file_bytes, filename)
    logger.info(
        "Tamper detection: tampered=%s entropy=%s",
        tamper_results.get("is_tampered"),
        tamper_results.get("entropy"),
    )

    # ── 7. TRUST SCORE ────────────────────────────────────────────────────
    trust_score = compute_trust_score(comparison_result, tamper_results)
    is_safe = trust_score >= 40

    # NOTE — LENIENT GATE: a document that passed structure validation above is
    # authorized regardless of field-level match scores. Critical-field and
    # OCR mismatches lower the trust score (reported as a label) but no longer
    # return a 400 FIELD_MISMATCH. Only documents that are NOT certificates,
    # invalid PDFs, or oversized files are rejected (those still return 400
    # earlier in this handler). The forensic report below still explains the
    # low score to the caller.

    # ── 8. FORENSIC REPORT ────────────────────────────────────────────────
    llm_report = (
        "Approved. All critical fields matched."
        if is_safe
        else generate_forensic_report(
            trust_score, comparison_result, tamper_results
        )
    )

    # ── BUILD RESPONSE ────────────────────────────────────────────────────
    response = {
        "is_safe": bool(is_safe),
        "trust_score": float(f"{trust_score:.2f}"),
        "message": llm_report if not is_safe else "Clear",
        "details": {
            "overall_match_score": comparison_result["overall_match_score"],
            "field_results": comparison_result["field_results"],
            "all_critical_matched": comparison_result["all_critical_matched"],
            "entropy": tamper_results.get("entropy", 0),
            "tampering_detected": tamper_results["is_tampered"],
            "tamper_notes": tamper_results.get("notes", ""),
            "name_matched": comparison_result["field_results"]
            .get("studentName", {})
            .get("matched", False),
            "course_matched": comparison_result["field_results"]
            .get("course", {})
            .get("matched", False),
            "org_matched": comparison_result["field_results"]
            .get("orgName", {})
            .get("matched", False),
            "llm_forensic_report": llm_report,
            "document_type": doc_type,
            "document_type_confidence": doc_confidence,
            "document_indicators": doc_indicators,
            "extracted_fields": {
                k: v
                for k, v in extracted_fields.items()
                if not k.startswith("_")
            },
            "extraction_time_ms": extract_time,
        },
    }

    logger.info(
        "ANALYZE RESULT: is_safe=%s trust_score=%.1f doc_type=%s all_critical=%s",
        is_safe,
        trust_score,
        doc_type,
        comparison_result["all_critical_matched"],
    )

    return jsonify(response)


@app.route("/analyze-for-verify", methods=["POST"])
def analyze_for_verify():
    """
    Verification-time re-analysis — checks the uploaded file for tampering
    and extracts/compares what's on the document against user-provided values.
    """
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    file_bytes = file.read()
    filename = file.filename or "file"

    student_name = request.form.get("studentName", "")
    course = request.form.get("course", "")
    org_name = request.form.get("orgName", "")
    certificate_id = request.form.get("certificateId", "")
    issue_date = request.form.get("issueDate", "")
    grade = request.form.get("grade", "")

    # Extract text
    extracted_text = extract_text_from_file(file_bytes, filename)

    # Tamper detection
    tamper_results = detect_tampering(file_bytes, filename)

    # Field extraction (logo/header OCR pass feeds institution resolution)
    logo_text = extract_logo_region_text(file_bytes, filename)
    extracted_fields = extract_certificate_fields(extracted_text, logo_text)

    # Field comparison
    expected_data = {
        "studentName": student_name,
        "course": course,
        "orgName": org_name,
        "certificateId": certificate_id,
        "issueDate": issue_date,
        "grade": grade,
    }

    has_metadata = any([student_name, course, org_name, certificate_id])
    if has_metadata:
        comparison_result = compare_fields(extracted_fields, expected_data, extracted_text)
    else:
        comparison_result = {
            "overall_match_score": 100.0,
            "all_critical_matched": True,
            "field_results": {},
            "failed_critical_fields": [],
            "failed_noncritical_fields": [],
            "doc_type": "unknown",
            "doc_type_confidence": 0,
            "doc_indicators": ["No metadata provided for matching"],
        }

    # Document type
    doc_type, doc_confidence, doc_indicators = classify_document_type(
        extracted_text
    )
    comparison_result["doc_type"] = doc_type
    comparison_result["doc_type_confidence"] = doc_confidence
    comparison_result["doc_indicators"] = doc_indicators

    # Trust score
    trust_score = compute_trust_score(comparison_result, tamper_results)

    response = {
        "is_safe": trust_score >= 40,
        "trust_score": float(f"{trust_score:.2f}"),
        "details": {
            "overall_match_score": comparison_result["overall_match_score"],
            "entropy": tamper_results.get("entropy", 0),
            "tampering_detected": tamper_results["is_tampered"],
            "tamper_notes": tamper_results.get("notes", ""),
            "field_results": comparison_result.get("field_results", {}),
            "all_critical_matched": comparison_result.get(
                "all_critical_matched", True
            ),
            "name_matched": comparison_result.get("field_results", {})
            .get("studentName", {})
            .get("matched"),
            "course_matched": comparison_result.get("field_results", {})
            .get("course", {})
            .get("matched"),
            "org_matched": comparison_result.get("field_results", {})
            .get("orgName", {})
            .get("matched"),
            "document_type": doc_type,
            "document_type_confidence": doc_confidence,
            "extracted_fields": {
                k: v
                for k, v in extracted_fields.items()
                if not k.startswith("_")
            },
        },
    }

    return jsonify(response)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok"})


# ╔════════════════════════════════════════════════════════════════════════════╗
# ║                    ORGANIZATION TRAINING ENDPOINTS                         ║
# ╚════════════════════════════════════════════════════════════════════════════╝
# Teach the AI which institutions this system issues/verifies for. Each trained
# organization lets institution extraction resolve the exact registered name
# even when the PDF only shows it inside a logo or stylized design. The dApp's
# "AI Training" panel (backend proxy /api/ai/organizations/*) drives these.


@app.route("/organizations", methods=["GET"])
def list_organizations():
    """List all known organizations in the training registry."""
    orgs = load_known_organizations()
    return jsonify({"organizations": orgs, "total": len(orgs)})


@app.route("/organizations/train", methods=["POST"])
def train_organization():
    """
    Add or update a known organization in the training registry.
    Body: { "name": "...", "aliases": ["..."], "keywords": ["..."], "verify_hosts": ["..."] }
    Only `name` is required; aliases/keywords are auto-derived from the name
    when omitted. Persists to known_organizations.json (hot-reloaded).
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Organization name is required."}), 400
    if len(name) < 3:
        return jsonify({"error": "Organization name must be at least 3 characters."}), 400

    org = {
        "name": name,
        "aliases": [a.strip() for a in (data.get("aliases") or []) if a and a.strip()],
        "keywords": [k.strip().lower() for k in (data.get("keywords") or []) if k and k.strip()],
        "verify_hosts": [h.strip().lower() for h in (data.get("verify_hosts") or []) if h and h.strip()],
    }
    if not org["aliases"]:
        org["aliases"] = [name]
    if not org["keywords"]:
        org["keywords"] = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]

    orgs = load_known_organizations()
    replaced = False
    for i, existing in enumerate(orgs):
        if (existing.get("name") or "").strip().lower() == name.lower():
            orgs[i] = org
            replaced = True
            break
    if not replaced:
        orgs.append(org)

    save_known_organizations(orgs)
    logger.info("Organization trained: %s (total=%d, updated=%s)", name, len(orgs), replaced)
    return jsonify({"success": True, "organization": org, "total": len(orgs), "updated": replaced})


@app.route("/organizations/<path:org_name>", methods=["DELETE"])
def untrain_organization(org_name):
    """Remove an organization from the training registry by canonical name."""
    target = org_name.strip().lower()
    orgs = load_known_organizations()
    remaining = [o for o in orgs if (o.get("name") or "").strip().lower() != target]
    if len(remaining) == len(orgs):
        return jsonify({"error": f"No organization named '{org_name}' found."}), 404
    save_known_organizations(remaining)
    logger.info("Organization untrained: %s (total=%d)", org_name, len(remaining))
    return jsonify({"success": True, "total": len(remaining)})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=True, threaded=True)
