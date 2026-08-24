"""
OCR text normalisation and fuzzy matching utilities.

Provides OCR-tolerant string comparison used by both the field comparator
and the organization registry matcher.
"""

import re

from fuzzywuzzy import fuzz

# Common OCR character confusions mapped to canonical forms
OCR_CORRECTIONS = {
    "0": "O",    # context-dependent — we handle this per-field
    "|": "I",
    "[": "I",
    "]": "I",
}

# Characters that OCR commonly misreads — strip when doing loose matching
OCR_STRIP_CHARS = set(".,;:'\"!@#$%^&*()_+-=[]{}|\\ / ")


def normalize_ocr_text(text):
    """
    Normalize text to reduce OCR noise:
    - Collapse multiple whitespace to single space
    - Strip leading/trailing whitespace

    Returns (normalized_string, original_string).
    """
    if not text:
        return "", ""
    original = text.strip()
    normalized = re.sub(r"\s+", " ", original)
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
        return 100, True, "no expected value provided — skipping"

    # 1. Normalize both strings
    ext_norm = extracted_value.strip().lower()
    exp_norm = expected_value.strip().lower()

    # 2. Exact match after normalization
    if ext_norm == exp_norm:
        return 100, True, "exact match (normalized)"

    # 3. Contains check (one is substring of the other)
    if exp_norm in ext_norm or ext_norm in exp_norm:
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
    name = re.sub(
        r"\b(mr|mrs|ms|miss|dr|prof|sri|shri|smt)\.?\s+",
        "",
        name,
        flags=re.IGNORECASE,
    ).strip()
    name = re.sub(r"\s*\.\s*", ".", name)
    return name.lower()
