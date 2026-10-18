import type { ReactNode } from 'react';
import { ApiError } from '../api/client';

/**
 * Turns a failure into something a reader can act on.
 *
 * <p>The raw message is written for whoever operates the platform ("Telemetry store is currently
 * unavailable"), so it is kept but demoted: the headline says what it means for the person looking
 * at the screen and what to do about it.
 */
function explain(error: Error | ApiError): { headline: string; advice: string } {
  if (!(error instanceof ApiError)) {
    return {
      headline: "Can't reach HyperGuard Sentinel",
      advice:
        'The console could not contact the service. It may still be starting up — wait a moment and try again.',
    };
  }

  if (error.status === 503) {
    return {
      headline: 'The readings database is not responding',
      advice: 'Nothing was lost. Try again in a moment; if it keeps happening, the database may be down.',
    };
  }
  if (error.status === 400) {
    return {
      headline: 'That request could not be understood',
      advice: 'Adjust the filters below and try again.',
    };
  }
  if (error.status >= 500) {
    return {
      headline: 'Something went wrong on the server',
      advice: 'This is not something you did. Try again, and report it if it continues.',
    };
  }
  return {
    headline: 'The request did not go through',
    advice: 'Try again in a moment.',
  };
}

interface ErrorBannerProps {
  error: Error | ApiError | null;
  onRetry?: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (!error) {
    return null;
  }

  const { headline, advice } = explain(error);
  const fieldMessages = error instanceof ApiError ? error.fieldMessages() : [];
  const status = error instanceof ApiError ? error.status : null;

  return (
    <div
      className="mb-space-md flex items-start justify-between gap-space-md rounded-xl border border-error-container bg-error-container/40 p-space-md"
      role="alert"
    >
      <div className="min-w-0">
        <p className="font-label-md text-label-md font-semibold text-on-error-container">{headline}</p>
        <p className="mt-1 font-body-md text-body-md text-on-error-container">{advice}</p>
        {fieldMessages.length > 0 ? (
          <ul className="mt-2 list-disc pl-5 font-body-md text-body-md text-on-error-container">
            {fieldMessages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        <details className="mt-2.5 font-body-sm text-body-sm">
          <summary className="cursor-pointer text-on-error-container/80">Technical details</summary>
          <code className="mt-2 inline-block whitespace-pre-wrap">
            {status ? `HTTP ${status} — ` : ''}
            {error.message}
          </code>
        </details>
      </div>
      {onRetry ? (
        <button
          className="flex-none rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-2 font-label-md text-label-md font-semibold text-on-surface shadow-sm hover:border-outline"
          type="button"
          onClick={onRetry}
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  detail?: string;
  /** Optional next step, so an empty screen is never a dead end. */
  action?: ReactNode;
  icon?: string;
}

export function EmptyState({ title, detail, action, icon = '◌' }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-outline-variant px-space-lg py-space-3xl text-center">
      <span className="mb-3 block text-[32px] text-on-surface-variant" aria-hidden="true">
        {icon}
      </span>
      <p className="font-headline-sm text-headline-sm font-semibold text-on-surface">{title}</p>
      {detail ? (
        <p className="mx-auto mt-2 max-w-[58ch] font-body-md text-body-md text-on-surface-variant">{detail}</p>
      ) : null}
      {action ? <div className="mt-space-lg">{action}</div> : null}
    </div>
  );
}

export function LoadingBar({ active }: { active: boolean }) {
  return (
    <div
      className={`loading-bar fixed inset-x-0 top-0 z-50 h-[3px] bg-transparent ${active ? 'is-active' : ''}`}
      aria-hidden="true"
    />
  );
}

/** Placeholder rows shown while a table loads for the first time. */
export function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-container-high" aria-hidden="true">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className={`flex gap-space-md p-space-md ${rowIndex > 0 ? 'border-t border-surface-container-high' : ''}`}
        >
          {Array.from({ length: columns }).map((__, columnIndex) => (
            <span
              key={columnIndex}
              className="h-3 flex-1 animate-pulse rounded-full bg-surface-container-high"
            />
          ))}
        </div>
      ))}
    </div>
  );
}
