"""LLM output validation + hallucination prevention (Phase 4).

Enforces the strict JSON contract (Rule 3) and grounds every quote in the
source text (Rule 2). These functions are the gate between raw model output and
anything the platform persists.
"""
from __future__ import annotations

import json
import re
from typing import Any

from jsonschema import Draft202012Validator

from common.enums import ComplianceStatus

VERDICT_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": True,
    "required": ["requirement_id", "status", "confidence", "evidence", "reasoning"],
    "properties": {
        "requirement_id": {"type": "string"},
        "status": {"type": "string", "enum": list(ComplianceStatus.values)},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "evidence": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["quote"],
                "properties": {
                    "quote": {"type": "string"},
                    "page": {"type": ["integer", "null"]},
                },
            },
        },
        "reasoning": {"type": "string"},
        "missing_information": {"type": "array", "items": {"type": "string"}},
    },
}

_VALIDATOR = Draft202012Validator(VERDICT_SCHEMA)
_WS_RE = re.compile(r"\s+")


class VerdictValidationError(ValueError):
    pass


def extract_json(text: str) -> dict:
    """Pull a JSON object out of raw model text (tolerates code fences / prose)."""
    if not text or not text.strip():
        raise VerdictValidationError("Empty model output.")
    cleaned = text.strip()
    # strip ``` / ```json fences
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```$", "", cleaned.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass
    # fall back to the first balanced {...} span
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(cleaned[start : end + 1])
        except json.JSONDecodeError as exc:
            raise VerdictValidationError(f"Could not parse JSON: {exc}") from exc
    raise VerdictValidationError("No JSON object found in model output.")


def validate_verdict(data: Any) -> None:
    errors = sorted(_VALIDATOR.iter_errors(data), key=lambda e: list(e.path))
    if errors:
        msg = "; ".join(f"{'/'.join(map(str, e.path)) or '(root)'}: {e.message}" for e in errors[:5])
        raise VerdictValidationError(msg)


def _normalise(text: str) -> str:
    return _WS_RE.sub(" ", (text or "").strip().lower())


def verify_quote(quote: str, source_text: str, *, min_len: int = 8) -> bool:
    """True iff ``quote`` appears (whitespace-normalised) in ``source_text``.

    Rejects trivially short quotes to avoid spurious matches. This is the core
    anti-hallucination check: a quote the model invented will not be found in
    the retrieved source and is flagged unverified.
    """
    q = _normalise(quote)
    if len(q) < min_len:
        return False
    return q in _normalise(source_text)
