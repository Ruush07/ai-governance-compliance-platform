"""LLM providers (Phase 4) — provider-agnostic.

The default ``MockProvider`` is fully deterministic and offline: it derives a
grounded, schema-valid verdict from keyword coverage between the requirement's
evidence expectations and the retrieved context, and always quotes a *verbatim*
span of a real context block (so the quote verifier passes). This lets the
entire assessment pipeline run and be tested with zero external dependencies and
100% reproducibility.

Real providers (Anthropic Claude, OpenAI, Gemini, Ollama) are lazy-imported and
selected via settings; they receive the built system/user prompts and return raw
text that the client validates.
"""
from __future__ import annotations

import json
import re
from abc import ABC, abstractmethod
from dataclasses import dataclass, field

from django.conf import settings

from common.enums import ComplianceStatus

_TOKEN_RE = re.compile(r"[a-z]{4,}")
_STOPWORDS = {
    "with", "that", "this", "from", "have", "which", "when", "into", "such",
    "each", "must", "shall", "should", "documented", "document", "requirement",
    "system", "systems", "ensure", "provide", "including", "information", "used",
    "their", "there", "where", "these", "those", "your", "about", "been",
}


@dataclass
class LLMResponse:
    text: str
    model: str
    raw: dict = field(default_factory=dict)


class LLMProvider(ABC):
    name: str = "base"

    @abstractmethod
    def complete(self, system: str, user: str, *, meta: dict | None = None) -> LLMResponse:
        ...


def _tokens(text: str) -> set[str]:
    return {t for t in _TOKEN_RE.findall((text or "").lower()) if t not in _STOPWORDS}


def _first_span(text: str, limit: int = 220) -> str:
    """A verbatim leading span of ``text``, cut at a sentence boundary if near."""
    snippet = text.strip()[:limit]
    dot = snippet.rfind(". ")
    if dot > 40:
        snippet = snippet[: dot + 1]
    return snippet.strip()


class MockProvider(LLMProvider):
    """Deterministic offline provider used by default and in tests."""

    name = "mock"

    def complete(self, system: str, user: str, *, meta: dict | None = None) -> LLMResponse:
        meta = meta or {}
        req = meta.get("requirement", {})
        blocks = meta.get("context_blocks", [])
        verdict = self._decide(req, blocks)
        return LLMResponse(text=json.dumps(verdict), model="mock-deterministic", raw=verdict)

    @staticmethod
    def _decide(req: dict, blocks: list[dict]) -> dict:
        rid = req.get("identifier", "")
        expectation_text = " ".join(
            [req.get("title", ""), req.get("description", "")]
            + list(req.get("evidence_expectations", []))
        )
        keywords = _tokens(expectation_text)
        context_text = " ".join(b.get("text", "") for b in blocks)

        if not blocks or not context_text.strip() or not keywords:
            return {
                "requirement_id": rid,
                "status": ComplianceStatus.CANNOT_DETERMINE,
                "confidence": 0.4,
                "evidence": [],
                "reasoning": "No sufficiently relevant evidence was retrieved from the provided documents.",
                "missing_information": sorted(keywords)[:5],
            }

        ctoks = _tokens(context_text)
        found = keywords & ctoks
        coverage = len(found) / max(1, len(keywords))

        if coverage >= 0.66:
            status = ComplianceStatus.PASS
        elif coverage >= 0.33:
            status = ComplianceStatus.PARTIAL
        else:
            status = ComplianceStatus.FAIL

        best = max(blocks, key=lambda b: len(_tokens(b.get("text", "")) & keywords))
        quote = _first_span(best.get("text", ""))
        confidence = round(0.5 + 0.45 * coverage, 3)
        missing = sorted(keywords - found)[:5]

        evidence = []
        if quote:
            evidence.append({"quote": quote, "page": best.get("page") or best.get("page_number") or 1})

        return {
            "requirement_id": rid,
            "status": status,
            "confidence": confidence,
            "evidence": evidence,
            "reasoning": (
                f"Evidence coverage of expected controls is {coverage:.0%} "
                f"({len(found)}/{len(keywords)} expected concepts found in the retrieved context)."
            ),
            "missing_information": missing,
        }


class AnthropicProvider(LLMProvider):  # pragma: no cover - requires API key
    name = "anthropic"

    def __init__(self):
        import anthropic

        cfg = settings.LLM
        self._client = anthropic.Anthropic(api_key=cfg["API_KEY"])
        self._model = cfg["MODEL"]
        self._cfg = cfg

    def complete(self, system: str, user: str, *, meta: dict | None = None) -> LLMResponse:
        msg = self._client.messages.create(
            model=self._model,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=self._cfg["TEMPERATURE"],
            max_tokens=self._cfg["MAX_TOKENS"],
        )
        text = "".join(block.text for block in msg.content if getattr(block, "type", "") == "text")
        return LLMResponse(text=text, model=self._model, raw={"id": msg.id})


class OpenAIProvider(LLMProvider):  # pragma: no cover - requires API key
    name = "openai"

    def __init__(self):
        from openai import OpenAI

        cfg = settings.LLM
        self._client = OpenAI(api_key=cfg["API_KEY"], base_url=cfg["BASE_URL"] or None)
        self._cfg = cfg

    def complete(self, system: str, user: str, *, meta: dict | None = None) -> LLMResponse:
        resp = self._client.chat.completions.create(
            model=self._cfg["MODEL"],
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=self._cfg["TEMPERATURE"],
            response_format={"type": "json_object"},
        )
        return LLMResponse(text=resp.choices[0].message.content, model=self._cfg["MODEL"])


class OllamaProvider(LLMProvider):  # pragma: no cover - requires local server
    name = "ollama"

    def __init__(self):
        self._cfg = settings.LLM
        self._base = self._cfg["BASE_URL"] or "http://localhost:11434"

    def complete(self, system: str, user: str, *, meta: dict | None = None) -> LLMResponse:
        import urllib.request

        payload = json.dumps(
            {
                "model": self._cfg["MODEL"],
                "prompt": f"{system}\n\n{user}",
                "stream": False,
                "format": "json",
                "options": {"temperature": self._cfg["TEMPERATURE"]},
            }
        ).encode()
        req = urllib.request.Request(f"{self._base}/api/generate", data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = json.loads(resp.read())
        return LLMResponse(text=body.get("response", ""), model=self._cfg["MODEL"])


_PROVIDERS = {
    "mock": MockProvider,
    "anthropic": AnthropicProvider,
    "openai": OpenAIProvider,
    "ollama": OllamaProvider,
}


def get_provider() -> LLMProvider:
    """Instantiate the configured provider (default: deterministic mock)."""
    provider_name = settings.LLM["PROVIDER"]
    factory = _PROVIDERS.get(provider_name, MockProvider)
    return factory()
