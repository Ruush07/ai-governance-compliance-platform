import { get } from "../api/client";
import type { AuditLog, Dashboard as DashboardData } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import StatCard from "../components/StatCard";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import Timeline from "../components/Timeline";
import { ChartCard, CoverageBar, RiskPie, StatusBar } from "../components/Charts";
import { duration, pct, ratioPct } from "../lib/format";

const icons = {
  shield: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V6l7-3z" strokeLinejoin="round" />
    </svg>
  ),
  clipboard: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M9 4h6v3H9V4zM7 5h2m6 0h2a1 1 0 011 1v13a1 1 0 01-1 1H6a1 1 0 01-1-1V6a1 1 0 011-1h1" strokeLinejoin="round" />
    </svg>
  ),
  users: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0M16 6a3 3 0 010 6m5 8a5 5 0 00-4-5" strokeLinecap="round" />
    </svg>
  ),
  question: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 013.9 2c-.7.9-1.4 1.2-1.4 2.2M12 17h.01" strokeLinecap="round" />
    </svg>
  ),
  layers: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 3l9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5" strokeLinejoin="round" />
    </svg>
  ),
  clock: (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  ),
};

const TOTAL_LABELS: { key: keyof DashboardData["totals"]; label: string }[] = [
  { key: "documents", label: "Documents" },
  { key: "frameworks", label: "Frameworks" },
  { key: "assessments", label: "Assessments" },
  { key: "completed_assessments", label: "Completed" },
  { key: "requirements_evaluated", label: "Requirements evaluated" },
  { key: "audit_events", label: "Audit events" },
];

export default function Dashboard() {
  const { data, loading, error, reload } = useAsync<DashboardData>(
    () => get<DashboardData>("/dashboard").then((r) => r.data),
    []
  );
  const audit = useAsync<AuditLog[]>(
    () => get<AuditLog[]>("/audit-logs", { page_size: 8 }).then((r) => r.data),
    []
  );

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Compliance posture across your frameworks and assessments."
      />

      {loading && <Spinner label="Loading dashboard…" />}
      {error && !loading && <ErrorBanner message={error} onRetry={reload} />}

      {data && !loading && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              label="Compliance score"
              value={
                data.kpis.compliance_score === null
                  ? "—"
                  : pct(data.kpis.compliance_score)
              }
              hint={
                data.kpis.compliance_score === null
                  ? "No completed assessments yet"
                  : "Weighted across frameworks"
              }
              accent="brand"
              icon={icons.shield}
            />
            <StatCard
              label="Pending recommendations"
              value={data.kpis.pending_recommendations}
              hint="Awaiting remediation"
              accent="amber"
              icon={icons.clipboard}
            />
            <StatCard
              label="Human override rate"
              value={ratioPct(data.kpis.human_override_rate)}
              hint="Auditor adjustments to AI scores"
              accent="slate"
              icon={icons.users}
            />
            <StatCard
              label="Cannot-determine rate"
              value={ratioPct(data.kpis.cannot_determine_rate)}
              hint="Requirements lacking evidence"
              accent="slate"
              icon={icons.question}
            />
            <StatCard
              label="Framework coverage"
              value={ratioPct(data.kpis.framework_coverage)}
              hint={`${data.framework_coverage_detail.covered} of ${data.framework_coverage_detail.total} assessed`}
              accent="emerald"
              icon={icons.layers}
            />
            <StatCard
              label="Audit turnaround"
              value={duration(data.kpis.audit_turnaround_seconds)}
              hint="Avg. time to complete"
              accent="brand"
              icon={icons.clock}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <ChartCard title="Risk distribution" subtitle="Across assessments">
              <RiskPie distribution={data.risk_distribution} />
            </ChartCard>
            <div className="lg:col-span-2">
              <ChartCard
                title="Requirement outcomes"
                subtitle="Evaluated requirement statuses"
              >
                <StatusBar distribution={data.requirement_status_distribution} />
              </ChartCard>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 card card-pad">
              <h3 className="mb-4 text-sm font-semibold text-slate-700">
                Totals
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {TOTAL_LABELS.map((t) => (
                  <div key={t.key} className="rounded-lg bg-slate-50 px-4 py-3">
                    <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                      {data.totals[t.key]}
                    </p>
                    <p className="text-xs text-slate-500">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <ChartCard title="Framework coverage">
              <CoverageBar
                covered={data.framework_coverage_detail.covered}
                total={data.framework_coverage_detail.total}
              />
              <div className="mt-4 space-y-2">
                {(
                  Object.entries(data.assessment_status_distribution) as [
                    string,
                    number
                  ][]
                ).map(([status, count]) => (
                  <div
                    key={status}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-500">{status}</span>
                    <span className="font-medium tabular-nums text-slate-700">
                      {count}
                    </span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Recent activity" subtitle="Latest audit events">
            {audit.loading ? (
              <Spinner label="Loading activity…" />
            ) : audit.error ? (
              <ErrorBanner message={audit.error} onRetry={audit.reload} />
            ) : (
              <Timeline logs={audit.data ?? []} />
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
