import { useMemo, useState } from 'react';
import { fetchAnomalies } from '../api/client';
import type { AnomalyRecord, Facets } from '../api/types';
import { Button, Field, Select, toOptions } from '../components/Controls';
import { DataTable, type Column } from '../components/DataTable';
import { EmptyState, ErrorBanner, TableSkeleton } from '../components/Feedback';
import { Pagination } from '../components/Pagination';
import {
  DEFAULT_TIME_RANGE,
  TimeRangePicker,
  describeTimeRange,
  resolveTimeRange,
  type TimeRange,
} from '../components/TimeRange';
import {
  formatInstant,
  formatMeasurement,
  formatRelative,
  humanizeConstant,
  humanizeLabel,
} from '../components/format';
import { useAsyncData } from '../hooks/useAsyncData';

interface AlertsPageProps {
  tenantId: string;
  facets: Facets | null;
  technical: boolean;
  dataVersion: number;
  title?: string;
  subtitle?: string;
}

const SEVERITY_CLASSES: Record<'critical' | 'warning' | 'info' | 'default', string> = {
  critical: 'text-error border-error/40 bg-error-container/50',
  warning: 'text-tertiary border-tertiary/40 bg-tertiary-fixed/30',
  info: 'text-primary border-primary/30 bg-primary-fixed/30',
  default: 'text-on-surface-variant border-outline-variant bg-surface-container-low',
};

function severityClass(severity: string): string {
  const normalized = severity.toLowerCase();
  const key = normalized.includes('crit')
    ? 'critical'
    : normalized.includes('warn')
      ? 'warning'
      : normalized.includes('info')
        ? 'info'
        : 'default';
  return `inline-block rounded-full border px-3 py-0.5 font-body-sm text-body-sm ${SEVERITY_CLASSES[key]}`;
}

/** Says in words which side of the limit the reading fell on. */
function describeBreach(row: AnomalyRecord): string {
  const direction = row.value > row.threshold ? 'above' : row.value < row.threshold ? 'below' : 'at';
  return `${formatMeasurement(row.value)} — ${direction} the limit of ${formatMeasurement(row.threshold)}`;
}

const PLAIN_COLUMNS: Column<AnomalyRecord>[] = [
  {
    key: 'timestamp',
    header: 'When',
    sortField: 'timestamp',
    render: (row) => <span title={formatInstant(row.timestamp)}>{formatRelative(row.timestamp)}</span>,
  },
  {
    key: 'severity',
    header: 'Severity',
    sortField: 'severity',
    render: (row) => <span className={severityClass(row.severity)}>{humanizeConstant(row.severity)}</span>,
  },
  { key: 'device', header: 'Device', sortField: 'deviceId', render: (row) => row.deviceId },
  { key: 'metric', header: 'Measurement', sortField: 'metric', render: (row) => humanizeLabel(row.metric) },
  { key: 'what', header: 'What happened', sortField: 'value', render: (row) => describeBreach(row) },
  {
    key: 'type',
    header: 'Reason',
    sortField: 'anomalyType',
    render: (row) => humanizeConstant(row.anomalyType),
  },
];

const TECHNICAL_COLUMNS: Column<AnomalyRecord>[] = [
  {
    key: 'threshold',
    header: 'Threshold',
    sortField: 'threshold',
    align: 'right',
    render: (row) => <span className="tabular-nums text-on-surface-variant">{row.threshold}</span>,
  },
  { key: 'tenant', header: 'Tenant', render: (row) => row.tenantId },
  { key: 'eventId', header: 'Event ID', render: (row) => <code>{row.eventId}</code> },
  {
    key: 'ingestedAt',
    header: 'Stored',
    sortField: 'ingestedAt',
    render: (row) => <span title={formatInstant(row.ingestedAt)}>{formatRelative(row.ingestedAt)}</span>,
  },
];

export function AlertsPage({
  tenantId,
  facets,
  technical,
  dataVersion,
  title = 'Alerts',
  subtitle = 'Readings that fell outside the range expected for their device.',
}: AlertsPageProps) {
  const [deviceId, setDeviceId] = useState('');
  const [metric, setMetric] = useState('');
  const [severity, setSeverity] = useState('');
  const [anomalyType, setAnomalyType] = useState('');
  const [range, setRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(50);
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' }>({
    field: 'timestamp',
    direction: 'desc',
  });

  const columns = useMemo(
    () => (technical ? [...PLAIN_COLUMNS, ...TECHNICAL_COLUMNS] : PLAIN_COLUMNS),
    [technical],
  );

  const state = useAsyncData(
    (signal) => {
      const { from, to } = resolveTimeRange(range);
      return fetchAnomalies(
        {
          tenantId: tenantId || undefined,
          deviceId: deviceId || undefined,
          metric: metric || undefined,
          severity: severity || undefined,
          anomalyType: anomalyType || undefined,
          from,
          to,
          page,
          size,
          sort: sort.field,
          direction: sort.direction,
        },
        signal,
      );
    },
    [
      tenantId,
      deviceId,
      metric,
      severity,
      anomalyType,
      range.preset,
      range.fromInput,
      range.toInput,
      page,
      size,
      sort.field,
      sort.direction,
      dataVersion,
    ],
  );

  const rows = state.data?.content ?? [];
  const filtersActive = Boolean(deviceId || metric || severity || anomalyType || range.preset !== 'all');

  const resetFilters = () => {
    setDeviceId('');
    setMetric('');
    setSeverity('');
    setAnomalyType('');
    setRange(DEFAULT_TIME_RANGE);
    setPage(0);
  };

  const changeSort = (field: string) => {
    setPage(0);
    setSort((current) =>
      current.field === field
        ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { field, direction: 'desc' },
    );
  };

  // Nothing is written to the anomalies table yet, so an empty list here does not mean the readings
  // were all fine. Saying so is the difference between an honest screen and a misleading one.
  const recordingUnavailable = !state.loading && !state.error && (state.data?.totalElements ?? 0) === 0;

  return (
    <section className="rounded-xl border border-surface-container-high bg-surface-container-lowest p-space-lg shadow-sm">
      <div className="mb-space-lg flex flex-wrap items-start justify-between gap-space-md">
        <div>
          <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">{title}</h2>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">{subtitle}</p>
        </div>
        <Button onClick={state.reload}>Refresh</Button>
      </div>

      <div className="mb-space-md flex flex-wrap items-end gap-space-md">
        <Field label="Severity">
          <Select
            value={severity}
            options={toOptions(facets?.anomalySeverities ?? [], humanizeConstant)}
            anyLabel="Any severity"
            onChange={(value) => {
              setSeverity(value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="Reason">
          <Select
            value={anomalyType}
            options={toOptions(facets?.anomalyTypes ?? [], humanizeConstant)}
            anyLabel="Any reason"
            onChange={(value) => {
              setAnomalyType(value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="Device">
          <Select
            value={deviceId}
            options={toOptions(facets?.devices ?? [])}
            anyLabel="All devices"
            onChange={(value) => {
              setDeviceId(value);
              setPage(0);
            }}
          />
        </Field>
        <Field label="Measurement">
          <Select
            value={metric}
            options={toOptions(facets?.metrics ?? [], humanizeLabel)}
            anyLabel="All measurements"
            onChange={(value) => {
              setMetric(value);
              setPage(0);
            }}
          />
        </Field>
        {filtersActive ? (
          <div className="flex gap-2 self-end">
            <Button onClick={resetFilters}>Clear filters</Button>
          </div>
        ) : null}
      </div>

      <TimeRangePicker
        value={range}
        onChange={(next) => {
          setRange(next);
          setPage(0);
        }}
      />

      <div className="mt-space-md">
        <ErrorBanner error={state.error} onRetry={state.reload} />
      </div>

      {recordingUnavailable && !filtersActive ? (
        <div className="mb-space-md rounded-xl bg-surface-container-low p-space-md">
          <p className="font-label-md text-label-md font-semibold text-on-surface">
            Alerts are not being recorded yet
          </p>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">
            The platform already spots unusual readings, but saving them for review is still being built. Until
            that is finished this list stays empty — an empty list here does not mean every reading was normal.
          </p>
          <details className="mt-2.5 font-body-sm text-body-sm">
            <summary className="cursor-pointer text-on-surface-variant">Technical details</summary>
            <code className="mt-2 inline-block whitespace-pre-wrap">
              telemetry-processor publishes to telemetry.events.anomalies but does not yet write
              platform.anomalies (open Phase 3 gap).
            </code>
          </details>
        </div>
      ) : null}

      {state.loading && rows.length === 0 ? (
        <TableSkeleton rows={6} columns={columns.length} />
      ) : rows.length === 0 && !state.error ? (
        <EmptyState
          title={filtersActive ? 'No alerts match these filters' : 'No alerts to show'}
          detail={
            filtersActive
              ? `Nothing was flagged in ${describeTimeRange(range)} for this selection.`
              : undefined
          }
          icon="✓"
          action={
            filtersActive ? (
              <Button variant="primary" onClick={resetFilters}>
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.eventId}
            sort={sort}
            onSortChange={changeSort}
          />
          <Pagination
            page={state.data?.page ?? page}
            size={state.data?.size ?? size}
            totalElements={state.data?.totalElements ?? 0}
            totalPages={state.data?.totalPages ?? 0}
            hasNext={state.data?.hasNext ?? false}
            noun="alert"
            onPageChange={setPage}
            onSizeChange={(value) => {
              setSize(value);
              setPage(0);
            }}
          />
        </>
      )}
    </section>
  );
}
