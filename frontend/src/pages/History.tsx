import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { get, post } from "../api/client";
import type { Assessment, Document, Framework } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import StatusBadge from "../components/StatusBadge";
import { formatDate, num } from "../lib/format";

export default function History() {
  const navigate = useNavigate();
  const [showNew, setShowNew] = useState(false);

  const { data, loading, error, reload } = useAsync<Assessment[]>(
    () => get<Assessment[]>("/history", { page_size: 50 }).then((r) => r.data),
    []
  );

  return (
    <div>
      <PageHeader
        title="Assessments"
        description="Compliance assessment runs and their outcomes."
        actions={
          <button className="btn-primary" onClick={() => setShowNew(true)}>
            + New Assessment
          </button>
        }
      />

      {showNew && (
        <NewAssessmentPanel
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            reload();
            navigate(`/assessment/${id}`);
          }}
        />
      )}

      {loading && <Spinner label="Loading assessments…" />}
      {error && !loading && <ErrorBanner message={error} onRetry={reload} />}

      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyState
          title="No assessments yet"
          description="Create a new assessment to evaluate documents against a framework."
          action={
            <button className="btn-primary" onClick={() => setShowNew(true)}>
              New Assessment
            </button>
          }
        />
      )}

      {!loading && data && data.length > 0 && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Name</th>
                  <th className="th">Framework</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Score</th>
                  <th className="th">Risk</th>
                  <th className="th text-right">Docs</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((a) => (
                  <tr
                    key={a.id}
                    className="cursor-pointer hover:bg-slate-50"
                    onClick={() => navigate(`/assessment/${a.id}`)}
                  >
                    <td className="td font-medium text-brand-700">
                      {a.name || "Untitled assessment"}
                    </td>
                    <td className="td text-slate-500">{a.framework_name}</td>
                    <td className="td">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                        {a.status}
                      </span>
                    </td>
                    <td className="td text-right tabular-nums">
                      {num(a.overall_score) === null
                        ? "—"
                        : num(a.overall_score)!.toFixed(1)}
                    </td>
                    <td className="td">
                      {a.risk_level ? (
                        <StatusBadge value={a.risk_level} kind="risk" />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="td text-right tabular-nums">
                      {a.document_count}
                    </td>
                    <td className="td text-slate-500">
                      {formatDate(a.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// --- New assessment panel ------------------------------------------------

interface NewAssessmentPanelProps {
  onClose: () => void;
  onCreated: (assessmentId: string) => void;
}

function NewAssessmentPanel({ onClose, onCreated }: NewAssessmentPanelProps) {
  const frameworks = useAsync<Framework[]>(
    () => get<Framework[]>("/frameworks").then((r) => r.data),
    []
  );
  const documents = useAsync<Document[]>(
    () => get<Document[]>("/documents", { page_size: 100 }).then((r) => r.data),
    []
  );

  const [frameworkId, setFrameworkId] = useState("");
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => frameworkId !== "" && selectedDocs.size > 0 && !submitting,
    [frameworkId, selectedDocs, submitting]
  );

  function toggleDoc(id: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await post<Assessment>("/process", {
        framework_id: frameworkId,
        document_ids: Array.from(selectedDocs),
        name: name || undefined,
      });
      onCreated(res.data.id);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to process");
      setSubmitting(false);
    }
  }

  return (
    <div className="card card-pad mb-6 border-brand-200">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">
          New assessment
        </h3>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label className="label">Framework</label>
          {frameworks.loading ? (
            <Spinner label="Loading frameworks…" />
          ) : frameworks.error ? (
            <ErrorBanner
              message={frameworks.error}
              onRetry={frameworks.reload}
            />
          ) : (
            <select
              className="input"
              value={frameworkId}
              onChange={(e) => setFrameworkId(e.target.value)}
            >
              <option value="">Select a framework…</option>
              {frameworks.data?.map((fw) => (
                <option key={fw.id} value={fw.id}>
                  {fw.name} v{fw.version} ({fw.requirement_count} reqs)
                </option>
              ))}
            </select>
          )}

          <label className="label mt-4">Assessment name (optional)</label>
          <input
            className="input"
            placeholder="Q3 SOC 2 review"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div>
          <label className="label">
            Documents{" "}
            <span className="font-normal text-slate-400">
              ({selectedDocs.size} selected)
            </span>
          </label>
          {documents.loading ? (
            <Spinner label="Loading documents…" />
          ) : documents.error ? (
            <ErrorBanner message={documents.error} onRetry={documents.reload} />
          ) : (documents.data?.length ?? 0) === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
              No documents available. Upload some first.
            </p>
          ) : (
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {documents.data?.map((doc) => (
                <label
                  key={doc.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-slate-50"
                >
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-400"
                    checked={selectedDocs.has(doc.id)}
                    onChange={() => toggleDoc(doc.id)}
                  />
                  <span className="truncate text-slate-700">
                    {doc.original_filename}
                  </span>
                  <span className="ml-auto text-xs text-slate-400">
                    {doc.doc_type_display || doc.doc_type}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      {submitError && (
        <div className="mt-4">
          <ErrorBanner message={submitError} />
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn-primary" disabled={!canSubmit} onClick={submit}>
          {submitting ? "Processing…" : "Run assessment"}
        </button>
      </div>
    </div>
  );
}
