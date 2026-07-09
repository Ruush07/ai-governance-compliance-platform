"""LLM client (Phase 4).

Wraps a provider with the reliability layer required by the spec's
hallucination-prevention section: strict JSON parsing + schema validation, retry
on malformed output, and a safe deterministic fallback so a bad model response
can never crash the assessment pipeline (it degrades to CANNOT_DETERMINE, which
the human-review queue then surfaces).
"""
from __future__ import annotations

import logging

from django.conf import settings

from common.enums import ComplianceStatus
from prompts.services import build_requirement_assessment

from .providers import LLMProvider, get_provider
from .validation import VerdictValidationError, extract_json, validate_verdict

logger = logging.getLogger(__name__)


class LLMClient:
    def __init__(self, provider: LLMProvider | None = None):
        self.provider = provider or get_provider()
        self.max_retries = settings.LLM["MAX_RETRIES"]

    @property
    def provider_name(self) -> str:
        return self.provider.name

    def assess_requirement(self, requirement: dict, context_blocks: list[dict]) -> dict:
        """Return a validated verdict dict for a single requirement.

        Retries on malformed output; on exhaustion returns a safe
        CANNOT_DETERMINE verdict rather than raising.
        """
        messages = build_requirement_assessment(requirement, context_blocks)
        meta = {"requirement": requirement, "context_blocks": context_blocks}

        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            try:
                response = self.provider.complete(messages.system, messages.user, meta=meta)
                data = extract_json(response.text)
                validate_verdict(data)
                # never trust the model's own id echo
                data["requirement_id"] = requirement.get("identifier", data.get("requirement_id", ""))
                data.setdefault("missing_information", [])
                return data
            except (VerdictValidationError, Exception) as exc:  # noqa: BLE001
                last_error = exc
                logger.warning(
                    "LLM verdict invalid for %s (attempt %d/%d): %s",
                    requirement.get("identifier"), attempt + 1, self.max_retries + 1, exc,
                )

        return {
            "requirement_id": requirement.get("identifier", ""),
            "status": ComplianceStatus.CANNOT_DETERMINE,
            "confidence": 0.0,
            "evidence": [],
            "reasoning": f"Model output could not be validated after {self.max_retries + 1} attempts: {last_error}",
            "missing_information": ["a valid, schema-conformant model response"],
        }
