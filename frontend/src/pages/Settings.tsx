import { API_BASE, get } from "../api/client";
import type { AuthMe, Health } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import { formatDate } from "../lib/format";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 py-2.5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-sm font-medium text-slate-800">{value}</span>
    </div>
  );
}

export default function Settings() {
  const health = useAsync<Health>(
    () => get<Health>("/health").then((r) => r.data),
    []
  );
  const me = useAsync<AuthMe>(
    () => get<AuthMe>("/auth/me").then((r) => r.data),
    []
  );

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Platform status, identity and configuration."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            System health
          </h3>
          {health.loading ? (
            <Spinner label="Checking health…" />
          ) : health.error ? (
            <ErrorBanner message={health.error} onRetry={health.reload} />
          ) : health.data ? (
            <div>
              <Row label="Status" value={health.data.status} />
              <Row label="Version" value={health.data.version} />
              <Row label="Phase" value={health.data.phase} />
              <Row label="Server time" value={formatDate(health.data.time)} />
            </div>
          ) : null}
        </div>

        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Current user
          </h3>
          {me.loading ? (
            <Spinner label="Loading identity…" />
          ) : me.error ? (
            <ErrorBanner message={me.error} onRetry={me.reload} />
          ) : me.data?.authenticated && me.data.user ? (
            <div>
              <Row label="Username" value={me.data.user.username} />
              <Row label="Email" value={me.data.user.email || "—"} />
              <Row label="Role" value={me.data.user.role_display} />
              <Row
                label="Organization"
                value={me.data.user.organization || "—"}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Not authenticated. Sign in on the backend to see your profile.
            </p>
          )}
        </div>

        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            Configuration
          </h3>
          <Row label="API base" value={<code>{API_BASE}</code>} />
          <Row
            label="Dev proxy"
            value={<code>/api → http://localhost:8000</code>}
          />
        </div>

        <div className="card card-pad">
          <h3 className="mb-3 text-sm font-semibold text-slate-700">
            About this platform
          </h3>
          <p className="text-sm leading-relaxed text-slate-600">
            This platform assists auditors by evaluating documents against
            compliance frameworks and surfacing evidence, scores and
            recommendations. It is decision-support tooling: the AI produces
            structured findings, but a human auditor reviews the evidence and
            owns every final compliance determination. Human overrides and audit
            events are tracked for traceability.
          </p>
        </div>
      </div>
    </div>
  );
}
