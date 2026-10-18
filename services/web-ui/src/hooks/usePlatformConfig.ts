import { createContext, useContext } from 'react';
import type { PlatformConfig } from '../api/types';

/**
 * The query-service's `/platform/config`, loaded once by the shell. The shell only renders pages
 * once it has arrived, so every page can read it without a loading branch or a hardcoded fallback.
 */
export const PlatformConfigContext = createContext<PlatformConfig | null>(null);

export function usePlatformConfig(): PlatformConfig {
  const config = useContext(PlatformConfigContext);
  if (!config) {
    throw new Error('usePlatformConfig must be used below a loaded PlatformConfigContext provider');
  }
  return config;
}

/** True when `iso` is within the platform's stale-after window of `now`. Unparseable times are not recent. */
export function isRecent(iso: string, config: PlatformConfig, now: number = Date.now()): boolean {
  const time = new Date(iso).getTime();
  return !Number.isNaN(time) && now - time < config.staleAfterMs;
}

/**
 * Position of `severity` in the processor's least-to-most-severe order, so higher is worse. Values the
 * platform does not list rank below all of them.
 */
export function severityRank(severity: string, config: PlatformConfig): number {
  const wanted = severity.toUpperCase();
  return config.detection.severities.findIndex((entry) => entry.toUpperCase() === wanted);
}
