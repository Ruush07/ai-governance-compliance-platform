import { get } from "../api/client";
import type { Framework } from "../api/types";
import { useAsync } from "../hooks/useApi";
import PageHeader from "../components/PageHeader";
import Spinner from "../components/Spinner";
import ErrorBanner from "../components/ErrorBanner";
import EmptyState from "../components/EmptyState";
import FrameworkTable from "../components/FrameworkTable";

export default function FrameworkExplorer() {
  const { data, loading, error, reload } = useAsync<Framework[]>(
    () => get<Framework[]>("/frameworks").then((r) => r.data),
    []
  );

  return (
    <div>
      <PageHeader
        title="Frameworks"
        description="Compliance frameworks available for assessment."
      />

      {loading && <Spinner label="Loading frameworks…" />}
      {error && !loading && <ErrorBanner message={error} onRetry={reload} />}
      {!loading && !error && (data?.length ?? 0) === 0 && (
        <EmptyState
          title="No frameworks"
          description="No compliance frameworks have been synced yet."
        />
      )}
      {!loading && data && data.length > 0 && (
        <FrameworkTable frameworks={data} />
      )}
    </div>
  );
}
