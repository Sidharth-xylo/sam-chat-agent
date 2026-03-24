from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any


# ---------------------------------------------------------------------------
# Keyword marker sets (used by the LLM extraction fallback)
# ---------------------------------------------------------------------------

SHOW_VENUES_MARKERS = (
    "show venues",
    "show venue",
    "venue list",
    "available venues",
    "choose venue",
    "pick venue",
)

BOOKING_MARKERS = (
    "book",
    "booking",
    "reserve",
    "reservation",
    "play",
    "court",
    "slot",
)

# ---------------------------------------------------------------------------
# Compiled regex patterns (natural language only — NOT for picker events)
# ---------------------------------------------------------------------------

EXACT_TIME_RE = re.compile(
    r"\b(?:(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)|([01]?\d|2[0-3]):([0-5]\d))\b",
    re.IGNORECASE,
)

# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def normalize_text(value: str | None) -> str:
    """Lowercase, collapse whitespace."""
    return " ".join((value or "").strip().lower().split())


def has_exact_time_reference(text: str) -> bool:
    """True when the string contains a clock-style time (e.g. '6 pm', '18:00')."""
    return EXACT_TIME_RE.search(text or "") is not None


# ---------------------------------------------------------------------------
# Fuzzy option matching
# ---------------------------------------------------------------------------


def option_score(query: str, candidate_text: str) -> int:
    """Return a 0-100 similarity score between a query string and a candidate."""
    q = normalize_text(query)
    c = normalize_text(candidate_text)
    if not q or not c:
        return 0
    if q == c:
        return 100
    if q in c:
        return 92
    if c in q:
        return 80
    return int(SequenceMatcher(None, q, c).ratio() * 100)


def resolve_option(
    query: str,
    options: list[dict[str, Any]],
    fields: tuple[str, ...],
) -> tuple[dict[str, Any] | None, list[dict[str, Any]]]:
    """
    Try to resolve a free-text query against a list of option dicts.

    Returns (resolved, candidates):
      - resolved  - the single best match if confidence is high enough, else None.
      - candidates - shortlist to surface to the user when resolution fails.
    """
    scored: list[tuple[int, dict[str, Any]]] = []
    for option in options:
        best = max(
            (option_score(query, str(option.get(field) or "")) for field in fields),
            default=0,
        )
        if best > 0:
            scored.append((best, option))

    if not scored:
        return None, []

    scored.sort(key=lambda item: item[0], reverse=True)
    top_score = scored[0][0]
    top_candidates = [opt for score, opt in scored if score == top_score]

    if top_score >= 92 and len(top_candidates) == 1:
        return top_candidates[0], top_candidates
    if top_score >= 85 and len(top_candidates) == 1:
        return top_candidates[0], top_candidates
    if top_score >= 75 and len(scored) == 1:
        return scored[0][1], [scored[0][1]]
    if top_score >= 75 and len(scored) > 1 and top_score - scored[1][0] >= 8:
        return scored[0][1], [scored[0][1]]

    return None, [opt for score, opt in scored if score >= max(top_score - 8, 70)]