"""Per-requirement LLM assessment (Phase 4).

For one requirement: retrieve grounded context, obtain a validated LLM verdict,
verify each quote against the source documents, then persist the ``Evidence``
rows and the requirement-level ``AssessmentScore`` (LLM-sourced fields only —
the numeric score is computed later by the deterministic engine, Rule 1).

Hallucination prevention applied here:
* quotes are verified verbatim against the documents' extracted text;
* verdicts below the confidence threshold, CANNOT_DETERMINE verdicts, and
  verdicts with unverified/absent evidence are flagged for the human-review
  queue (``breakdown.needs_review``).
"""
from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings

from common.enums import ComplianceStatus, ScoreLevel
from llm.client import LLMClient
from llm.validation import verify_quote
from rag.retriever import Retriever
from scoring.models import AssessmentScore

from .models import Evidence

logger = logging.getLogger(__name__)


def requirement_to_dict(requirement, framework_name: str = "") -> dict:
    return {
        "identifier": requirement.identifier,
        "title": requirement.title,
        "description": requirement.description,
        "control": requirement.control,
        "pass_criteria": requirement.pass_criteria,
        "partial_criteria": requirement.partial_criteria,
        "fail_criteria": requirement.fail_criteria,
        "evidence_expectations": requirement.evidence_expectations or [],
        "framework_name": framework_name or requirement.framework_id,
    }


def assess_requirement(
    assessment,
    requirement,
    *,
    retriever: Retriever,
    client: LLMClient,
    source_text: str,
    document_ids: list,
) -> AssessmentScore:
    req_dict = requirement_to_dict(requirement, assessment.framework.name)
    query = f"{requirement.title}. {requirement.description}"

    retrieved = retriever.retrieve(query, document_ids=document_ids)
    context_blocks = [
        {"text": r.text, "page": r.page_number, "document": r.document_id} for r in retrieved
    ]

    verdict = client.assess_requirement(req_dict, context_blocks)

    # Persist + verify evidence.
    unverified = 0
    evidence_count = 0
    for item in verdict.get("evidence", []):
        quote = (item.get("quote") or "").strip()
        if not quote:
            continue
        verified = verify_quote(quote, source_text)
        if not verified:
            unverified += 1
        evidence_count += 1
        Evidence.objects.create(
            assessment=assessment,
            requirement=requirement,
            requirement_identifier=requirement.identifier,
            quote=quote,
            page=item.get("page") or None,
            verified=verified,
            verification_method="verbatim_normalised",
            confidence=Decimal(str(verdict.get("confidence", 0))),
        )

    status = verdict["status"]
    confidence = Decimal(str(verdict.get("confidence", 0)))
    threshold = Decimal(str(settings.LLM["CONFIDENCE_THRESHOLD"]))

    needs_review = (
        confidence < threshold
        or status == ComplianceStatus.CANNOT_DETERMINE
        or unverified > 0
        or (status in {ComplianceStatus.PASS, ComplianceStatus.PARTIAL} and evidence_count == 0)
    )

    score = AssessmentScore.objects.create(
        assessment=assessment,
        level=ScoreLevel.REQUIREMENT,
        requirement=requirement,
        requirement_identifier=requirement.identifier,
        control_id=requirement.control_group,
        label=requirement.title,
        status=status,
        confidence=confidence,
        weight=Decimal(requirement.weight),
        reasoning=verdict.get("reasoning", ""),
        missing_information=verdict.get("missing_information", []),
        breakdown={
            "needs_review": needs_review,
            "evidence_count": evidence_count,
            "unverified_evidence": unverified,
            "provider": client.provider_name,
        },
    )
    logger.debug("Assessed %s -> %s (review=%s)", requirement.identifier, status, needs_review)
    return score
