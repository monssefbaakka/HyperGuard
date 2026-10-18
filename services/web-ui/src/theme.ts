/**
 * Hex values for the few places that can't take a Tailwind class — chart SVGs (recharts renders
 * inline SVG attributes, not classNames) and the hand-drawn sparkline gradients. Kept in sync with
 * the color tokens in tailwind.config.js.
 */
export const CHART_COLORS = {
  primary: '#0284c7',
  secondary: '#10b981',
  tertiary: '#f59e0b',
  error: '#ef4444',
  outline: '#64748b',
  grid: '#e2e8f0',
  surfaceContainerLow: '#f1f5f9',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerHigh: '#e2e8f0',
  onSurface: '#0f172a',
} as const;
