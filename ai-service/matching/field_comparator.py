"""
Field-by-field comparison of extracted certificate data against user-provided values.

Implements multi-strategy matching with fallback full-document search,
OCR-tolerant thresholds, and critical vs non-critical field classification.
"""

import logging
import re

from rapidfuzz import fuzz

from matching.ocr_normalizer import fuzzy_field_match, normalize_name_for_comparison

logger = logging.getLogger(__name__)


def normalize_date(date_str):
    """Normalize a date string for fuzzy comparison."""
    if not date_str:
        return ""
    d = date_str.strip().lower()
    d = re.sub(r"(\d+)(st|nd|rd|th)", r"\1", d)
    d = d.replace("-", " ").replace("/", " ").replace(".", " ")
    d = re.sub(r"\s+", " ", d).strip()
    return d


def _search_doc_for_value(user_value, doc_text_compact, config):
    """
    Search the full document text for the user-provided value.
    Used as a fallback when structured extraction fails.

    Returns (score, details).
    """
    val_lower = user_value.strip().lower()
    if not val_lower or len(val_lower) < 2:
        return 0, "empty or too-short value"

    val_clean = re.sub(r"[^a-z0-9\s]", "", val_lower)
    val_clean = re.sub(r"\s+", " ", val_clean).strip()
    val_words = [w for w in val_clean.split() if len(w) > 1]

    # 1. Full value found verbatim
    if val_lower in doc_text_compact:
        return 90, "value found verbatim in document"
    if val_clean in doc_text_compact:
        return 90, "value found verbatim (cleaned) in document"

    # 2. Compact match (ignore spaces)
    val_nospace = re.sub(r"\s+", "", val_lower)
    doc_nospace = re.sub(r"\s+", "", doc_text_compact)
    if val_nospace in doc_nospace:
        return 85, "value found (no spaces) in document"

    # 3. All significant words found anywhere in doc
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

    # 4. Fuzzy matching on individual lines
    if val_words and len(val_words) >= 1:
        segments = re.split(r"[.,;\n]+", doc_text_compact)
        best_score = 0
        for seg in segments:
            seg = seg.strip()
            if len(seg) < 3:
                continue
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

    # 5. Partial match on first/last name words
    if len(val_words) >= 2:
        first_and_last = f"{val_words[0]} {val_words[-1]}"
        far = fuzz.partial_ratio(first_and_last, doc_text_compact)
        if far >= 80:
            return far, f"first+last name match in document (score={far})"

    return 0, "value not found in document"


# ── Field map: expected data keys → extracted field keys + criticality ──────

FIELD_MAP = {
    "studentName": {
        "extracted_key": "student_name",
        "label": "Student Name",
        "critical": True,
        "threshold": 45,
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


def compare_fields(extracted_fields, expected_data, full_doc_text=""):
    """
    Compares extracted fields against user-entered values field-by-field.

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
    doc_text_lower = (full_doc_text or "").lower()
    doc_text_compact = re.sub(r"\s+", " ", doc_text_lower)

    field_results = {}
    failed_critical = []
    failed_noncritical = []
    scores = []

    for expected_key, config in FIELD_MAP.items():
        expected_val = expected_data.get(expected_key, "")
        extracted_val = extracted_fields.get(config["extracted_key"])

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
            score, matched, details = fuzzy_field_match(
                extracted_val, expected_val, config["threshold"]
            )
            if not matched and extracted_val and expected_val:
                token_score = fuzz.token_sort_ratio(
                    (extracted_val or "").lower(),
                    (expected_val or "").lower(),
                )
                if token_score >= config["threshold"]:
                    score = token_score
                    matched = True
                    details = f"token_sort match (score={token_score})"
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
            expected_date_norm = normalize_date(expected_val)
            extracted_date_norm = normalize_date(extracted_val)
            score, matched, details = fuzzy_field_match(
                extracted_date_norm, expected_date_norm, config["threshold"]
            )
        else:
            score, matched, details = fuzzy_field_match(
                extracted_val, expected_val, config["threshold"]
            )

        # Fallback: search full document text
        if score == 0 and expected_val and expected_val.strip() and doc_text_compact:
            fallback_score, fallback_details = _search_doc_for_value(
                expected_val, doc_text_compact, config
            )
            if fallback_score >= config["threshold"]:
                score = fallback_score
                matched = True
                details = f"FALLBACK: {fallback_details}"
                extracted_val = f"[found in doc: '{expected_val}']"
            elif fallback_score > 0:
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

    overall = sum(scores) / len(scores) if scores else 0.0
    critical_count = len([s for s in scores if s >= 50])
    all_critical_matched = critical_count >= 2

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
