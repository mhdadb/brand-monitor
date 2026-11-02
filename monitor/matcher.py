"""Finds brand terms in text, tolerating small spelling mistakes."""

import re

_CHAR_MAP = str.maketrans({
    "ي": "ی", "ى": "ی", "ك": "ک", "ة": "ه", "أ": "ا", "إ": "ا", "آ": "ا",
    "‌": "", "‏": "", "‎": "", "ـ": "",
})
_SEPARATORS = re.compile(r"[\s\-_.]+")


def normalize(text: str) -> str:
    """Lowercase, unify Arabic/Persian letters, drop ZWNJ, spaces and dots."""
    text = text.lower().translate(_CHAR_MAP)
    return _SEPARATORS.sub("", text)


def _edit_distance(a: str, b: str, limit: int) -> int:
    """Levenshtein distance, stopping early once it exceeds `limit`."""
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        cur = [i]
        for j, cb in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca != cb)))
        if min(cur) > limit:
            return limit + 1
        prev = cur
    return prev[-1]


def find_match(text: str, terms: list[str], max_typos: int = 2) -> str | None:
    """Return the brand term found in `text` (exactly or with typos), else None.

    Short terms allow fewer typos so that common words don't match by accident.
    """
    haystack = normalize(text)
    for term in terms:
        needle = normalize(term)
        if needle in haystack:
            return term
        allowed = min(max_typos, max(0, len(needle) // 5))
        if allowed == 0:
            continue
        for size in range(len(needle) - allowed, len(needle) + allowed + 1):
            for start in range(0, max(0, len(haystack) - size) + 1):
                window = haystack[start:start + size]
                if _edit_distance(needle, window, allowed) <= allowed:
                    return term
    return None
