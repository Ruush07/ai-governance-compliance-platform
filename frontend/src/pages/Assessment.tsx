import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { get, post } from "../api/client";
import type {
  AssessmentDetail,
  Evidence,
  Report,
  Score,
} from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import ComplianceCard from "../components/ComplianceCard";
import RiskCard from "../components/RiskCard";
import StatusBadge from "../components/StatusBadge";
import EvidenceViewer from "../components/EvidenceViewer";
import Recommendations from "../components/Recommendations";
import { formatDate, num, ratioPct } from "../lib/format";

export default function Assessment() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync<AssessmentDetail>(
    () => get<AssessmentDetail>(`/assessment/${id}`).then((r) => r.data),
    [id]
  );

  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function reprocess() {
    if (!id) return;
    setBusy("reprocess");
    setActionError(null);
    try {
      await post<AssessmentDetail>("/reprocess", { assessment_id: id });
      reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setBusy(null);
    }
  }

  async function generateReport(format: "PDF" | "JSON") {
    if (!id) return;
    setBusy(`report-${format}`);
    setActionError(null);
    try {
      const res = await post<Report>("/report", {
        assessment_id: id,
        format,
      });
      setReport(res.data);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Report generation failed"
      );
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <Spinner label="Loading assessment…" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Assessment not found" />;

  const controlScores = data.scores.filter((s) => s.level === "CONTROL");
  const requirementScores = data.scores.filter(
    (s) => s.level === "REQUIREMENT"
  );

  const evidenceByReq = new Map<string, Evidence[]>();
  for (const ev of data.evidence) {
    const list = evidenceByReq.get(ev.requirement_identifier) ?? [];
    list.push(ev);
    evidenceByReq.set(ev.requirement_identifier, list);
  }

  return (
    <div>
      <PageHeader
        title={data.name || "Assessment"}
        description={`${data.framework_name} · ${data.document_count} document(s) · created ${formatDate(
          data.created_at
        )}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link to="/history" className="btn-secondary">
              ← All
            </Link>
            <button
              className="btn-secondary"
              onClick={reprocess}
              disabled={busy !== null}
            >
              {busy === "reprocess" ? "Reprocessing…" : "Reprocess"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => generateReport("JSON")}
              disabled={busy !== null}
            >
              {busy === "report-JSON" ? "Generating…" : "JSON report"}
            </button>
            <button
              className="btn-primary"
              onClick={() => generateReport("PDF")}
              disabled={busy !== null}
            >
              {busy === "report-PDF" ? "Generating…" : "PDF report"}
            </button>
          </div>
        }
      />

      {actionError && (
        <div className="mb-4">
          <ErrorBanner message={actionError} />
        </div>
      )}

      {report && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
          <span className="text-emerald-800">
            {report.report_format} report {report.status?.toLowerCase() || "ready"}.
          </span>
          {report.download_url && (
            <a
              href={report.download_url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-emerald-700 underline"
            >
              Download
            </a>
          )}
        </div>
      )}

      {data.status !== "COMPLETED" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Assessment status: <strong>{data.status}</strong>
          {data.error_message ? ` — ${data.error_message}` : ""}
        </div>
      )}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <ComplianceCard
            score={data.overall_score}
            status={data.overall_status}
          />
          <RiskCard score={data.risk_score} level={data.risk_level} />
        </div>

        {data.summary && (
          <div className="card card-pad">
            <h3 className="mb-2 text-sm font-semibold text-slate-700">
              Summary
            </h3>
            <p className="text-sm leading-relaxed text-slate-600">
              {JSON.stringify(data.summary, null, 2)}
            </p>
          </div>
        )}

        {/* Control scores */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Control scores
          </h3>
          {controlScores.length === 0 ? (
            <EmptyState title="No control-level scores" />
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Control</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Score</th>
                      <th className="th text-right">Confidence</th>
                      <th className="th text-right">Weight</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {controlScores.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="td">
                          <span className="font-medium text-slate-800">
                            {s.label || s.control_id}
                          </span>
                        </td>
                        <td className="td">
                          <StatusBadge value={s.status} />
                        </td>
                        <td className="td text-right tabular-nums">
                          {num(s.normalized_score) === null
                            ? "—"
                            : num(s.normalized_score)!.toFixed(1)}
                        </td>
                        <td className="td text-right tabular-nums">
                          {ratioPct(s.confidence, 0)}
                        </td>
                        <td className="td text-right tabular-nums">
                          {s.weight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Requirements */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Requirements ({requirementScores.length})
          </h3>
          {requirementScores.length === 0 ? (
            <EmptyState title="No requirement-level scores" />
          ) : (
            <div className="space-y-3">
              {requirementScores.map((s) => (
                <RequirementCard
                  key={s.id}
                  score={s}
                  evidence={
                    evidenceByReq.get(s.requirement_identifier) ?? []
                  }
                />
              ))}
            </div>
          )}
        </section>

        {/* Recommendations */}
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Recommendations ({data.recommendations.length})
          </h3>
          <Recommendations recommendations={data.recommendations} />
        </section>
      </div>
    </div>
  );
}

// --- Requirement card ----------------------------------------------------

interface RequirementCardProps {
  score: Score;
  evidence: Evidence[];
}

function RequirementCard({ score, evidence }: RequirementCardProps) {
  const [open, setOpen] = useState(false);
  const needsReview = score.breakdown?.needs_review === true;

  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {score.requirement_identifier && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                {score.requirement_identifier}
              </span>
            )}
            <StatusBadge value={score.status} label={score.status_display} />
            {needsReview && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                Needs review
              </span>
            )}
            {score.is_human_overridden && (
              <span className="rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                Human override
              </span>
            )}
          </div>
          <h4 className="mt-2 text-sm font-semibold text-slate-800">
            {score.label || score.requirement_identifier}
          </h4>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className="text-lg font-semibold tabular-nums text-slate-900">
            {num(score.normalized_score) === null
              ? "—"
              : num(score.normalized_score)!.toFixed(1)}
          </p>
          <p className="text-[11px] text-slate-400">
            conf {ratioPct(score.confidence, 0)}
          </p>
        </div>
      </div>

      {score.reasoning && (
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          {score.reasoning}
        </p>
      )}

      {score.missing_information.length > 0 && (
        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Missing information
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
            {score.missing_information.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-slate-100 pt-3">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-xs font-medium text-brand-600 hover:underline"
        >
          {open ? "Hide" : "Show"} evidence ({evidence.length})
        </button>
        {open && (
          <div className="mt-3">
            <EvidenceViewer evidence={evidence} />
          </div>
        )}
      </div>
    </div>
  );
}
