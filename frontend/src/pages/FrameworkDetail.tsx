import { Link, useParams } from "react-router-dom";
import { get } from "../api/client";
import type { FrameworkDetail as FrameworkDetailData } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import { titleCase } from "../lib/format";

export default function FrameworkDetail() {
  const { id } = useParams<{ id: string }>();
  const { data, loading, error, reload } = useAsync<FrameworkDetailData>(
    () => get<FrameworkDetailData>(`/framework/${id}`).then((r) => r.data),
    [id]
  );

  if (loading) return <Spinner label="Loading framework…" />;
  if (error) return <ErrorBanner message={error} onRetry={reload} />;
  if (!data) return <EmptyState title="Framework not found" />;

  return (
    <div>
      <PageHeader
        title={`${data.name} v${data.version}`}
        description={`${data.publisher} · ${data.category}`}
        actions={
          <Link to="/frameworks" className="btn-secondary">
            ← All frameworks
          </Link>
        }
      />

      {data.description && (
        <div className="card card-pad mb-6">
          <p className="text-sm leading-relaxed text-slate-600">
            {data.description}
          </p>
          <div className="mt-3 flex gap-6 text-sm">
            <span className="text-slate-500">
              Controls:{" "}
              <strong className="text-slate-800">{data.control_count}</strong>
            </span>
            <span className="text-slate-500">
              Requirements:{" "}
              <strong className="text-slate-800">
                {data.requirement_count}
              </strong>
            </span>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {data.controls.length === 0 && (
          <EmptyState title="No controls defined for this framework" />
        )}
        {data.controls.map((control) => (
          <div key={control.id} className="card card-pad">
            <h3 className="text-sm font-semibold text-slate-800">
              {control.title}
              <span className="ml-2 text-xs font-normal text-slate-400">
                {control.requirements.length} requirement(s)
              </span>
            </h3>

            <div className="mt-4 space-y-4">
              {control.requirements.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-slate-200 p-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">
                      {req.identifier}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      weight {req.weight}
                    </span>
                    {req.risk_domain && (
                      <span className="text-[11px] text-slate-400">
                        {titleCase(req.risk_domain)}
                      </span>
                    )}
                  </div>
                  <h4 className="mt-1.5 text-sm font-medium text-slate-800">
                    {req.title}
                  </h4>
                  {req.description && (
                    <p className="mt-1 text-sm text-slate-600">
                      {req.description}
                    </p>
                  )}

                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <Criteria
                      label="Pass"
                      value={req.pass_criteria}
                      tone="emerald"
                    />
                    <Criteria
                      label="Partial"
                      value={req.partial_criteria}
                      tone="amber"
                    />
                    <Criteria
                      label="Fail"
                      value={req.fail_criteria}
                      tone="red"
                    />
                  </div>

                  {req.evidence_expectations.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Evidence expectations
                      </p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
                        {req.evidence_expectations.map((e, i) => (
                          <li key={i}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {req.references.length > 0 && (
                    <p className="mt-2 text-[11px] text-slate-400">
                      References: {req.references.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Criteria({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "emerald" | "amber" | "red";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-200 bg-emerald-50"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : "border-red-200 bg-red-50";
  return (
    <div className={`rounded-lg border p-2.5 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">{value || "—"}</p>
    </div>
  );
}
