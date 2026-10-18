import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Operator } from './api/auth';
import { fetchFacets, fetchSummary } from './api/client';
import { Avatar } from './components/Avatar';
import { Select, Toggle, toOptions } from './components/Controls';
import { ErrorBanner, LoadingBar } from './components/Feedback';
import { formatRelative, humanizeLabel } from './components/format';
import { useAsyncData } from './hooks/useAsyncData';
import { usePlatformMetrics } from './hooks/usePlatformMetrics';
import { useStoredFlag } from './hooks/useStoredFlag';
import { ForensicsPage } from './pages/ForensicsPage';
import { HomePage, type PageId } from './pages/HomePage';
import { ProfilePage } from './pages/ProfilePage';
import { RadarPage } from './pages/RadarPage';
import { ReadingsPage } from './pages/ReadingsPage';
import { SendReadingPage } from './pages/SendReadingPage';
import { TopologyPage } from './pages/TopologyPage';
import { TrendsPage } from './pages/TrendsPage';

const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'home', label: 'Overview', icon: 'grid_view' },
  { id: 'readings', label: 'Fleet & Readings', icon: 'sensors' },
  { id: 'trends', label: 'Temporal Trends', icon: 'monitoring' },
  { id: 'radar', label: 'Anomaly Radar', icon: 'radar' },
  { id: 'forensics', label: 'Forensics & Incidents', icon: 'policy' },
  { id: 'send', label: 'Simulation Bench', icon: 'science' },
  { id: 'topology', label: 'Topology Pipeline', icon: 'hub' },
];

const AUTO_REFRESH_MS = 30_000;

type AppPage = PageId | 'profile';

interface AppProps {
  operator: Operator;
  token: string;
  onOperatorChange: (operator: Operator) => void;
  onSignOut: () => void;
}

export default function App({ operator, token, onOperatorChange, onSignOut }: AppProps) {
  const [page, setPage] = useState<AppPage>('home');
  const [tenantId, setTenantId] = useState('');

  // Off by default: the console is read mostly by people who do not work on the pipeline, and the
  // raw identifiers are noise to them. The preference is remembered per browser.
  const [technical, setTechnical] = useStoredFlag('pulsestream.technicalDetails', false);
  const [autoRefresh, setAutoRefresh] = useStoredFlag('pulsestream.autoRefresh', true);

  // Bumped after a send, on the Sync button, and on each auto-refresh tick; every view keys its
  // loader on it.
  const [dataVersion, setDataVersion] = useState(0);
  const [refreshedAt, setRefreshedAt] = useState(() => new Date().toISOString());
  const refreshAll = useCallback(() => {
    setDataVersion((value) => value + 1);
    setRefreshedAt(new Date().toISOString());
  }, []);

  // Chosen from the Devices list on the overview (or "Spectral Radar" on Fleet & Readings) and
  // handed to the target page once.
  const [focusDevice, setFocusDevice] = useState<string | null>(null);
  const focusOnDevice = useCallback((deviceId: string, target: PageId = 'trends') => {
    setFocusDevice(deviceId);
    setPage(target);
  }, []);

  /*
   * Auto-refresh pauses while the tab is hidden. A background tab would otherwise keep polling all
   * day for nobody, and would come back showing a "last updated" time that predates the tab being
   * looked at again.
   */
  useEffect(() => {
    if (!autoRefresh) {
      return;
    }

    const tick = () => {
      if (!document.hidden) {
        refreshAll();
      }
    };

    const timer = window.setInterval(tick, AUTO_REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) {
        refreshAll();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [autoRefresh, refreshAll]);

  const facetsState = useAsyncData(
    (signal) => fetchFacets(tenantId || undefined, signal),
    [tenantId, dataVersion],
  );
  const summaryState = useAsyncData(
    (signal) => fetchSummary(tenantId || undefined, signal),
    [tenantId, dataVersion],
  );
  const metricsState = usePlatformMetrics(dataVersion);

  const facets = facetsState.data;
  const tenants = useMemo(() => facets?.tenants ?? [], [facets]);
  const busy = facetsState.loading || summaryState.loading;

  // The query-service connection is the one thing this shell can honestly call "online" — Kafka
  // broker state has no browser-reachable admin API in this deployment.
  const pipelineOnline = !facetsState.error;
  const metrics = metricsState.data;
  const eps = metrics?.eventsPerSecond ?? null;
  const deployment = tenantId ? humanizeLabel(tenantId) : tenants.length === 1 ? humanizeLabel(tenants[0]) : 'All tenants';

  return (
    <div className="min-h-screen bg-background">
      <LoadingBar active={busy} />

      <header className="fixed inset-x-0 top-0 z-40 h-16 bg-surface-container-lowest px-grid-gutter shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex h-16 items-center justify-between gap-space-md">
          <div className="flex min-w-0 items-center gap-space-sm">
            <button type="button" className="flex flex-none items-center gap-space-xs" onClick={() => setPage('home')}>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-inverse-surface text-secondary"
              >
                <span className="material-symbols-outlined text-[20px]">monitor_heart</span>
              </span>
              <span className="flex items-center gap-space-2xs">
                <span className="text-headline-sm font-semibold tracking-tight text-on-surface">
                  HyperGuard Sentinel
                </span>
                <span className="rounded bg-surface-container px-space-2xs py-0.5 font-mono text-code-sm text-on-surface-variant">
                  v3.2
                </span>
              </span>
            </button>

            <span className="mx-space-2xs hidden h-4 w-px bg-outline-variant lg:block" aria-hidden="true" />

            <span className="hidden rounded-full bg-surface-container px-space-xs py-0.5 font-label-sm text-label-sm text-on-surface-variant lg:inline">
              Local · Docker Compose
            </span>
            <span className="hidden min-w-0 truncate rounded-full bg-surface-container px-space-xs py-0.5 font-label-sm text-label-sm text-on-surface xl:inline">
              {deployment}
            </span>
            <span
              className="hidden items-center gap-space-2xs rounded-full bg-primary-container px-space-xs py-0.5 font-mono text-code-sm text-on-primary-container lg:inline-flex"
              title="Accepted events per second on ingestion-service, scraped from Prometheus"
            >
              <span className={`h-2 w-2 rounded-full bg-primary ${autoRefresh ? 'animate-pulse' : ''}`} aria-hidden="true" />
              {eps != null ? `${eps >= 10 ? Math.round(eps) : eps.toFixed(3)} eps` : '— eps'}
            </span>
          </div>

          <div className="flex flex-none items-center gap-space-sm">
            {tenants.length > 1 ? (
              <Select
                value={tenantId}
                options={toOptions(tenants)}
                anyLabel="All organisations"
                onChange={setTenantId}
                compact
              />
            ) : null}

            <span
              className={`hidden items-center gap-space-2xs rounded-full px-space-xs py-1 font-label-sm text-label-sm font-semibold sm:inline-flex ${
                pipelineOnline
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-error-container text-on-error-container'
              }`}
              title={pipelineOnline ? 'query-service is reachable' : 'query-service could not be reached'}
            >
              <span className="material-symbols-outlined text-[16px]" aria-hidden="true">verified_user</span>
              {pipelineOnline ? 'L3 SENTINEL ACTIVE' : 'CONNECTION LOST'}
            </span>

            <button
              type="button"
              className={`inline-flex items-center gap-space-2xs rounded-full px-space-xs py-1 font-label-md text-label-md ${
                autoRefresh
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
              aria-pressed={autoRefresh}
              title={autoRefresh ? 'Updating every 30 seconds. Click to pause.' : 'Updates are paused. Click to resume.'}
              onClick={() => setAutoRefresh(!autoRefresh)}
            >
              <span
                className={`h-2 w-2 rounded-full bg-current ${autoRefresh ? 'animate-pulse' : ''}`}
                aria-hidden="true"
              />
              {autoRefresh ? 'Live' : 'Paused'}
            </button>

            <button
              className="inline-flex h-9 items-center gap-space-2xs rounded-lg bg-surface-container-low px-space-md font-label-md text-label-md font-semibold text-on-surface shadow-sm hover:bg-surface-container"
              type="button"
              onClick={refreshAll}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">sync</span>
              Sync Pipeline
            </button>

            <button
              type="button"
              className="flex items-center gap-space-xs rounded-full pl-space-2xs text-left hover:bg-surface-container-low"
              aria-label={`Ouvrir le profil de ${operator.displayName}`}
              onClick={() => setPage('profile')}
            >
              <Avatar operator={operator} token={token} />
              <span className="hidden flex-col text-left lg:flex">
                <span className="font-label-md text-label-md leading-none text-on-surface">{operator.displayName}</span>
                <span className="font-label-sm text-label-sm leading-tight text-on-surface-variant">
                  @{operator.username}
                </span>
              </span>
            </button>
          </div>
        </div>
      </header>

      <aside className="fixed bottom-0 left-0 top-16 z-30 flex w-64 flex-col justify-between bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-space-xs p-space-md">
          <div className="px-space-xs pt-space-2xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
            Telemetry Intelligence
          </div>
          <nav className="flex flex-col gap-space-2xs" aria-label="Sections">
            {NAV.map((entry) => (
              <button
                key={entry.id}
                aria-current={page === entry.id ? 'page' : undefined}
                className={`flex items-center gap-space-xs rounded-lg px-space-xs py-space-2xs text-left transition-colors ${
                  page === entry.id
                    ? 'bg-primary-container text-headline-sm font-semibold text-on-primary-container'
                    : 'text-body-sm text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
                type="button"
                onClick={() => setPage(entry.id)}
              >
                <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{entry.icon}</span>
                {entry.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex flex-col gap-space-sm p-space-md">
          <div className="px-space-xs">
            <Toggle
              checked={technical}
              label="Technical details"
              hint="Adds the raw identifiers, event types and service endpoints"
              onChange={setTechnical}
            />
          </div>

          <div className="rounded-lg bg-surface-container-low p-space-md">
            <div className="mb-space-2xs flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                Kafka Producer
              </span>
              <span
                className={`flex items-center gap-space-2xs font-mono text-code-sm ${
                  metrics?.kafkaPublishSeconds != null ? 'text-secondary' : 'text-outline'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    metrics?.kafkaPublishSeconds != null ? 'bg-secondary' : 'bg-outline'
                  }`}
                />
                {metrics?.kafkaPublishSeconds != null ? 'Publishing' : 'Idle'}
              </span>
            </div>
            <div className="flex flex-col gap-space-2xs font-mono text-code-sm text-on-surface-variant">
              <div className="flex justify-between gap-space-xs">
                <span>Publish</span>
                <span className="font-medium text-on-surface">
                  {metrics?.kafkaPublishSeconds != null
                    ? `${(metrics.kafkaPublishSeconds * 1000).toFixed(1)}ms`
                    : '—'}
                </span>
              </div>
              <div className="flex justify-between gap-space-xs">
                <span>Topic</span>
                <span className="max-w-[110px] truncate font-medium text-on-surface">telemetry.events</span>
              </div>
              <div className="flex justify-between gap-space-xs">
                <span>Scrape</span>
                <span className="font-medium text-on-surface">15s</span>
              </div>
            </div>
          </div>

          <span className="px-space-xs font-body-sm text-body-sm text-on-surface-variant">
            {autoRefresh ? 'Updates every 30s · ' : 'Updates paused · '}
            last checked {formatRelative(refreshedAt)}
            {technical ? (
              <>
                {' · reads '}
                <code>query-service :8083</code>
                {' · writes '}
                <code>ingestion-service :8081</code>
              </>
            ) : null}
          </span>
        </div>
      </aside>

      <main className="min-h-screen bg-background py-grid-gutter pl-[calc(16rem+1.5rem)] pr-grid-gutter pt-[calc(4rem+1.5rem)]">
        <div className="flex flex-col gap-space-xl">
          {facetsState.error ? (
            <ErrorBanner error={facetsState.error} onRetry={facetsState.reload} />
          ) : null}

          {page === 'profile' ? (
            <ProfilePage
              operator={operator}
              token={token}
              onOperatorChange={onOperatorChange}
              onSignOut={onSignOut}
            />
          ) : null}
          {page === 'home' ? (
            <HomePage
              tenantId={tenantId}
              summary={summaryState.data}
              summaryLoading={summaryState.loading}
              dataVersion={dataVersion}
              autoRefresh={autoRefresh}
              metricsState={metricsState}
              onNavigate={(nextPage) => setPage(nextPage)}
              onSelectDevice={focusOnDevice}
            />
          ) : null}
          {page === 'readings' ? (
            <ReadingsPage
              tenantId={tenantId}
              facets={facets}
              technical={technical}
              dataVersion={dataVersion}
              onNavigate={(nextPage) => setPage(nextPage)}
              onInspectRadar={(deviceId) => focusOnDevice(deviceId, 'radar')}
            />
          ) : null}
          {page === 'trends' ? (
            <TrendsPage
              tenantId={tenantId}
              facets={facets}
              technical={technical}
              dataVersion={dataVersion}
              focusDeviceId={focusDevice}
              onFocusConsumed={() => setFocusDevice(null)}
              onNavigate={(nextPage) => setPage(nextPage)}
            />
          ) : null}
          {page === 'radar' ? (
            <RadarPage
              tenantId={tenantId}
              facets={facets}
              technical={technical}
              dataVersion={dataVersion}
              focusDeviceId={focusDevice}
              onFocusConsumed={() => setFocusDevice(null)}
            />
          ) : null}
          {page === 'forensics' ? (
            <ForensicsPage
              tenantId={tenantId}
              facets={facets}
              dataVersion={dataVersion}
              onInspectDevice={(deviceId) => focusOnDevice(deviceId, 'trends')}
            />
          ) : null}
          {page === 'send' ? (
            <SendReadingPage
              tenantId={tenantId}
              facets={facets}
              technical={technical}
              onPublished={refreshAll}
              onNavigate={(nextPage) => setPage(nextPage)}
            />
          ) : null}
          {page === 'topology' ? (
            <TopologyPage
              dataVersion={dataVersion}
              summary={summaryState.data}
              metricsState={metricsState}
              onNavigate={setPage}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
}
