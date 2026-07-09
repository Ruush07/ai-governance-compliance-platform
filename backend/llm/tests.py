"""Tests for Phase 4 LLM layer (validation, mock provider, client)."""
from __future__ import annotations

import pytest

from llm.client import LLMClient
from llm.providers import LLMProvider, LLMResponse, MockProvider
from llm.validation import (
    VerdictValidationError,
    extract_json,
    validate_verdict,
    verify_quote,
)

REQ = {
    "identifier": "X-1",
    "title": "data governance lineage",
    "description": "maintain dataset provenance and lineage records for training data",
    "evidence_expectations": ["dataset lineage records", "data provenance documentation"],
    "framework_name": "Test",
}
CTX = [{"text": "We maintain dataset lineage records and data provenance documentation for all training data.", "page": 3}]


# --- validation ---
def test_extract_json_handles_code_fence():
    assert extract_json('```json\n{"a": 1}\n```') == {"a": 1}


def test_extract_json_finds_embedded_object():
    assert extract_json('Sure! {"a": 2} done')["a"] == 2


def test_validate_verdict_rejects_bad_status():
    with pytest.raises(VerdictValidationError):
        validate_verdict({"requirement_id": "x", "status": "MAYBE", "confidence": 0.5, "evidence": [], "reasoning": "r"})


def test_verify_quote():
    src = "The organization maintains a documented AI risk management policy."
    assert verify_quote("maintains a documented AI risk management", src) is True
    assert verify_quote("we use blockchain for everything", src) is False
    assert verify_quote("short", src) is False  # too short


# --- mock provider / client ---
def test_mock_provider_grounded_verdict():
    client = LLMClient(provider=MockProvider())
    verdict = client.assess_requirement(REQ, CTX)
    assert verdict["requirement_id"] == "X-1"
    assert verdict["status"] in {"PASS", "PARTIAL"}
    assert verdict["evidence"]
    # quote must be a verbatim substring of the context (anti-hallucination)
    assert verdict["evidence"][0]["quote"] in CTX[0]["text"]


def test_mock_provider_no_context_is_cannot_determine():
    client = LLMClient(provider=MockProvider())
    verdict = client.assess_requirement(REQ, [])
    assert verdict["status"] == "CANNOT_DETERMINE"
    assert verdict["evidence"] == []


def test_client_safe_fallback_on_garbage():
    class BadProvider(LLMProvider):
        name = "bad"

        def complete(self, system, user, *, meta=None):
            return LLMResponse(text="this is not json at all", model="bad")

    verdict = LLMClient(provider=BadProvider()).assess_requirement(REQ, CTX)
    assert verdict["status"] == "CANNOT_DETERMINE"
    assert verdict["confidence"] == 0.0


def test_determinism_same_inputs_same_verdict():
    c = LLMClient(provider=MockProvider())
    assert c.assess_requirement(REQ, CTX) == c.assess_requirement(REQ, CTX)
