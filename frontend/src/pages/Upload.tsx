import { useCallback, useState } from "react";
import { get } from "../api/client";
import type { Document } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import UploadZone from "../components/UploadZone";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import { bytes, formatDate } from "../lib/format";

export default function Upload() {
  const [justUploaded, setJustUploaded] = useState<Document[]>([]);
  const { data, loading, error, reload } = useAsync<Document[]>(
    () => get<Document[]>("/documents", { page_size: 50 }).then((r) => r.data),
    []
  );

  const onUploaded = useCallback(
    (docs: Document[]) => {
      setJustUploaded((prev) => [...docs, ...prev]);
      reload();
    },
    [reload]
  );

  // Merge just-uploaded (optimistic) with fetched, de-duped by id.
  const merged: Document[] = [];
  const seen = new Set<string>();
  for (const d of [...justUploaded, ...(data ?? [])]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    merged.push(d);
  }

  return (
    <div>
      <PageHeader
        title="Documents"
        description="Upload policy, procedure and evidence documents for assessment."
      />

      <div className="space-y-6">
        <UploadZone onUploaded={onUploaded} />

        <div>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">
              Uploaded documents
            </h3>
            <button onClick={reload} className="btn-secondary text-xs">
              Refresh
            </button>
          </div>

          {loading && <Spinner label="Loading documents…" />}
          {error && !loading && (
            <ErrorBanner message={error} onRetry={reload} />
          )}

          {!loading && !error && merged.length === 0 && (
            <EmptyState
              title="No documents yet"
              description="Upload files above to get started."
            />
          )}

          {!loading && merged.length > 0 && (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Filename</th>
                      <th className="th">Type</th>
                      <th className="th">Status</th>
                      <th className="th text-right">Size</th>
                      <th className="th text-right">Pages</th>
                      <th className="th">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {merged.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="td">
                          <span className="font-medium text-slate-800">
                            {doc.original_filename}
                          </span>
                          <span className="ml-1.5 text-xs uppercase text-slate-400">
                            {doc.extension}
                          </span>
                          {doc.is_scanned && (
                            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              scanned
                            </span>
                          )}
                        </td>
                        <td className="td text-slate-500">
                          {doc.doc_type_display || doc.doc_type || "—"}
                        </td>
                        <td className="td">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            {doc.status_display || doc.status}
                          </span>
                        </td>
                        <td className="td text-right tabular-nums">
                          {bytes(doc.size_bytes)}
                        </td>
                        <td className="td text-right tabular-nums">
                          {doc.page_count || "—"}
                        </td>
                        <td className="td text-slate-500">
                          {formatDate(doc.created_at)}
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
    </div>
  );
}
