import { useMemo, useState } from "react";
import { get, post } from "../api/client";
import type { Assessment, Report } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import { formatDate } from "../lib/format";

export default function Reports() {
  const { data, loading, error, reload } = useAsync<Assessment[]>(
    () => get<Assessment[]>("/history", { page_size: 100 }).then((r) => r.data),
    []
  );

  const [assessmentId, setAssessmentId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);

  const completed = useMemo(
    () => (data ?? []).filter((a) => a.status === "COMPLETED"),
    [data]
  );

  async function generate(format: "PDF" | "JSON") {
    if (!assessmentId) return;
    setBusy(format);
    setGenError(null);
    try {
      const res = await post<Report>("/report", {
        assessment_id: assessmentId,
        format,
      });
      setReports((prev) => [res.data, ...prev]);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Generate downloadable compliance reports from completed assessments."
      />

      {loading && <Spinner label="Loading assessments…" />}
      {error && !loading && <ErrorBanner message={error} onRetry={reload} />}

      {!loading && !error && (
        <div className="space-y-6">
          <div className="card card-pad">
            <label className="label">Completed assessment</label>
            {completed.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                No completed assessments available.
              </p>
            ) : (
              <>
                <select
                  className="input"
                  value={assessmentId}
                  onChange={(e) => setAssessmentId(e.target.value)}
                >
                  <option value="">Select an assessment…</option>
                  {completed.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name || "Untitled"} — {a.framework_name} (
                      {formatDate(a.completed_at || a.created_at)})
                    </option>
                  ))}
                </select>
                <div className="mt-4 flex gap-2">
                  <button
                    className="btn-secondary"
                    disabled={!assessmentId || busy !== null}
                    onClick={() => generate("JSON")}
                  >
                    {busy === "JSON" ? "Generating…" : "Generate JSON"}
                  </button>
                  <button
                    className="btn-primary"
                    disabled={!assessmentId || busy !== null}
                    onClick={() => generate("PDF")}
                  >
                    {busy === "PDF" ? "Generating…" : "Generate PDF"}
                  </button>
                </div>
              </>
            )}
            {genError && (
              <div className="mt-4">
                <ErrorBanner message={genError} />
              </div>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-700">
              Generated reports
            </h3>
            {reports.length === 0 ? (
              <EmptyState
                title="No reports generated"
                description="Generated reports will appear here with a download link."
              />
            ) : (
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="th">Format</th>
                        <th className="th">Status</th>
                        <th className="th">Generated</th>
                        <th className="th">Checksum</th>
                        <th className="th"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {reports.map((r) => (
                        <tr key={r.id} className="hover:bg-slate-50">
                          <td className="td font-medium text-slate-800">
                            {r.report_format}
                          </td>
                          <td className="td">
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                              {r.status}
                            </span>
                          </td>
                          <td className="td text-slate-500">
                            {formatDate(r.generated_at || r.created_at)}
                          </td>
                          <td className="td font-mono text-xs text-slate-400">
                            {r.checksum ? r.checksum.slice(0, 12) : "—"}
                          </td>
                          <td className="td text-right">
                            {r.download_url ? (
                              <a
                                href={r.download_url}
                                target="_blank"
                                rel="noreferrer"
                                className="font-medium text-brand-600 hover:underline"
                              >
                                Download
                              </a>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
