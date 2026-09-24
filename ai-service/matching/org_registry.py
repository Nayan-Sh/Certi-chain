"""
Known-organization registry for institution name resolution.

Manages the training-data file (known_organizations.json) that maps
OCR text (body + logo zone) to canonical institution names. Hot-reloads
on every request via file mtime caching.
"""

import json
import logging
import os
import re

from rapidfuzz import fuzz

from config import KNOWN_ORGS_PATH

logger = logging.getLogger(__name__)

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

        # 4. Cross-line fuzzy matching
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

        # 5. Word-level fuzzy matching
        if conf < 70:
            name_words = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]
            if len(name_words) >= 2:
                for i in range(len(hay_lines)):
                    for j in range(i, min(i + 3, len(hay_lines))):
                        segment = " ".join(hay_lines[i:j+1]).lower()
                        word_hits = sum(1 for w in name_words if w in segment)
                        if word_hits >= len(name_words) * 0.6:
                            word_conf = int(50 + word_hits * 10)
                            if word_conf > conf:
                                conf = word_conf
                                detail = f"word-sequence match {word_hits}/{len(name_words)} words in segment"

        # 6. Acronym/abbreviation matching
        if conf < 65:
            name_words = [w for w in re.split(r"[^a-z0-9]+", name.lower()) if len(w) > 2]
            if len(name_words) >= 2:
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
