from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework.generics import ListAPIView
from rest_framework.views import APIView

from common.enums import AssessmentStatus
from common.permissions import IsAuditorOrAbove
from common.responses import ok

from .models import Assessment
from .pipeline import run_assessment
from .serializers import (
    AssessmentCreateSerializer,
    AssessmentDetailSerializer,
    AssessmentListSerializer,
    ReprocessSerializer,
)
from .services import create_assessment, reprocess_assessment
print("ASSESSMENTS VIEW LOADED")

_DETAIL_PREFETCH = (
    "documents",
    "scores",
    "scores__requirement",
    "evidence",
    "recommendations",
)


def _run_and_serialize(assessment, request) -> tuple[dict, dict]:
    """Run the pipeline (mock LLM by default) and return (data, meta).

    Pipeline failures are captured on the assessment (status FAILED); the
    endpoint still returns the assessment record rather than a 500 so the client
    can inspect the error.
    """
    meta: dict = {}
    try:
        run_assessment(assessment)
    except Exception as exc:  # noqa: BLE001 - surfaced via assessment.error_message
        meta = {"pipeline": "failed", "error": str(exc)}
    assessment = (
        Assessment.objects.prefetch_related(*_DETAIL_PREFETCH)
        .select_related("framework")
        .get(pk=assessment.pk)
    )
    meta.setdefault("pipeline", assessment.status.lower())
    return AssessmentDetailSerializer(assessment, context={"request": request}).data, meta


class ProcessView(APIView):
    """POST /api/process — create an assessment (framework × documents) and run
    the full pipeline (ingest → index → LLM assess → score → recommend).

    Runs synchronously with the configured LLM provider (deterministic mock by
    default). With a real provider a task queue would be introduced (Phase 8).
    """

    permission_classes = [IsAuditorOrAbove]

    def post(self, request):
        serializer = AssessmentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = request.user if request.user.is_authenticated else None
        assessment = create_assessment(
            framework_id=serializer.validated_data["framework_id"],
            document_ids=serializer.validated_data["document_ids"],
            name=serializer.validated_data.get("name", ""),
            created_by=actor,
        )
        data, meta = _run_and_serialize(assessment, request)
        return ok(data, meta=meta)


class ReprocessView(APIView):
    """POST /api/reprocess — reset an assessment and run it again."""

    permission_classes = [IsAuditorOrAbove]

    def post(self, request):
        serializer = ReprocessSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        actor = request.user if request.user.is_authenticated else None
        assessment = get_object_or_404(Assessment, pk=serializer.validated_data["assessment_id"])
        assessment = reprocess_assessment(assessment, requested_by=actor)
        data, meta = _run_and_serialize(assessment, request)
        return ok(data, meta=meta)


class AssessmentDetailView(APIView):
    """GET /api/assessment/{id} — full assessment with scores, evidence,
    recommendations."""

    def get(self, request, assessment_id):
        assessment = get_object_or_404(
            Assessment.objects.prefetch_related(*_DETAIL_PREFETCH).select_related("framework"),
            pk=assessment_id,
        )
        return ok(AssessmentDetailSerializer(assessment, context={"request": request}).data)


class HistoryView(ListAPIView):
    """GET /api/history — paginated assessment history."""

    serializer_class = AssessmentListSerializer
    queryset = Assessment.objects.select_related("framework").all()
    filterset_fields = ["status", "framework", "risk_level"]
    ordering_fields = ["created_at", "completed_at", "overall_score"]
    search_fields = ["name"]
