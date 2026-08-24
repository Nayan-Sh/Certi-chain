"""
Structured field extraction from certificate OCR text.

Uses multi-pattern regex matching to extract: certificate ID, student name,
course/degree, institution, issue date, and grade/CGPA.
"""

import logging
import re

from matching.org_registry import load_known_organizations, match_known_organization

logger = logging.getLogger(__name__)


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
            raw = re.split(r"\s+(?:has|having|son|daughter|s/o|d/o|w/o)(?:\s+|$)", raw, flags=re.IGNORECASE)[0]
            raw = raw.strip().rstrip(",.;:")
            first_word = raw.split()[0] if raw.split() else ""
            if (
                len(raw.split()) >= 2
                and first_word
                and first_word[0].isupper()
            ):
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
            if any(kw in line_lower for kw in skip_keywords):
                continue
            words = line.split()
            if 2 <= len(words) <= 5:
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
        r"(?:complet(?:ed|ing)|passed|qualified)\s+(?:the\s+)?(?:course|program|module|degree)\s+(?:in|of|for)?\s*([A-Za-z\s]{4,80}?)(?:with|from|during|in\s+the|at\s+the|\.|$)",
        r"(?:course|program|degree|diploma|major)[.:]\s*([A-Za-z\s]{3,80})",
        r"\b((?:bachelor|master|doctor|associate|diploma|b\.?\s*(?:tech|sc|a|com|e)|m\.?\s*(?:tech|sc|a|com|e)|ph\.?\s*d\.?|b\.?\s*e\.?|m\.?\s*e\.?)\s*(?:\(?hons?\.?\)?\s*)?(?:in|of)?\s*[A-Za-z\s]{2,60})",
        r"\b(B\.?\s*(?:Tech|Sc|A|Com|E|Ed|Pharm|Arch|BA)\b[^.]?)",
        r"\b(M\.?\s*(?:Tech|Sc|A|Com|E|Ed|Pharm|Arch|BA|CA|BA)\b[^.]?)",
    ]
    for pattern in course_patterns:
        m = re.search(pattern, text_clean, re.IGNORECASE)
        if m:
            raw = m.group(1).strip().rstrip(",.;: ")
            raw = re.sub(
                r'\s+(?:with|from|at|in\s+the)\s+.*$', '', raw,
                flags=re.IGNORECASE
            ).strip().rstrip(",.;: ")
            if len(raw) >= 3:
                fields["course"] = raw
                fields["_extraction_notes"].append("course extracted via pattern match")
                break

    # Fallback: Title-Case line before award anchor
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

    from_match = re.search(r'\bfrom\b', text_clean, re.IGNORECASE)
    from_pos = from_match.start() if from_match else -1

    TRAILING_PATTERNS = [
        r'\s+(?:date|grade|cgpa|gpa|percentage|marks|certificate|signature|authori[sz]ed|registrar|controller|director|principal|chairman|president|dean|examination|academic|session)\b.*$',
        r'\s{2,}.*$',
        r'\s*(?:No|No\.|Number|#)[.:]\s*\d+.*$',
    ]
    cleaned_candidates = []
    for raw, pos in inst_candidates:
        for tp in TRAILING_PATTERNS:
            raw = re.sub(tp, '', raw, flags=re.IGNORECASE).strip().rstrip(",.;: ")
        if len(raw) >= 4 and raw.lower() not in {'the', 'and', 'for'}:
            cleaned_candidates.append((raw, pos))
    inst_candidates = cleaned_candidates

    if inst_candidates:
        def candidate_score(item):
            text_val, pos = item
            score = pos
            if from_pos >= 0 and pos > from_pos:
                score = pos + 10000
            score += len(text_val)
            return score

        inst_candidates.sort(key=candidate_score, reverse=True)
        best_text, best_pos = inst_candidates[0]
        fields["institution"] = best_text
        fields["_extraction_notes"].append(
            f"institution extracted from {len(inst_candidates)} candidates (pos={best_pos})"
        )

    # QR verification hostname fallback
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

    # Known-organization resolution (trained registry)
    known_name, known_conf, known_detail = match_known_organization(text, logo_text)
    if known_name and known_conf >= 55:
        fields["institution"] = known_name
        fields["_extraction_notes"].append(
            f"institution resolved via known-org registry (conf={known_conf}: {known_detail})"
        )

    # ── ISSUE DATE ────────────────────────────────────────────────────────
    date_patterns = [
        r"(?:date\s*(?:of\s*)?(?:issue|issuance|completion|award|passing|examination)?|issued?\s*(?:on|date)?|dated)[.:\s]*(\d{1,2}[/\-\s\.]\d{1,2}[/\-\s\.]\d{2,4}|\d{1,2}\s+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s*\d{2,4})",
        r"\b(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\b",
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
        r"(?:cgpa|gpa|grade\s*point\s*average)[.:\s]*(\d+\.?\d*)",
        r"(?:grade|division|class)[.:\s]*([A-F][+-]?|first|second|third|distinction|pass|merit)",
        r"(?:percentage|marks|score)[.:\s]*(\d+\.?\d*\s*%?)",
        r"(?:obtained|scored|secured|achieved)\s+(\d+\.?\d*\s*%?\s*(?:out\s*of\s*\d+)?)",
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
