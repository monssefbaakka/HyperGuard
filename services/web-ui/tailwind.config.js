/**
 * Design tokens for HyperGuard Sentinel (v3.2) — a rebrand of the PulseStream console onto the
 * "industrial SOC" palette from the HyperGuard blueprint (services/web-ui/design/). Key names are
 * kept from the console's previous Material-You-flavoured token set on purpose: every component
 * already keys its classNames off these names, so re-pointing the hex values here recolors the
 * whole app without having to touch every file. The mapping is documented inline; see
 * https://www.figma.com (n/a) — source is the blueprint markdown pasted into the session.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        // Telemetry identifiers, offsets, JSON payloads and timestamps — never body text.
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        // Level 0 app canvas (Slate 50) / card surface / inset well / hairline border
        background: '#f8fafc',
        surface: '#f8fafc',
        'on-background': '#0f172a',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f1f5f9',
        'surface-container': '#f1f5f9',
        'surface-container-high': '#e2e8f0',
        'surface-container-highest': '#cbd5e1',
        'surface-dim': '#cbd5e1',
        'surface-bright': '#f8fafc',
        'surface-variant': '#e2e8f0',
        'inverse-surface': '#0f172a',
        'inverse-on-surface': '#f8fafc',

        // Typography neutrals: high emphasis / medium emphasis (field labels) / low emphasis (metadata)
        'on-surface': '#0f172a',
        'on-surface-variant': '#334155',
        outline: '#64748b',
        'outline-variant': '#e2e8f0',

        // brand-cyan (primary interactive/data color)
        primary: '#0284c7',
        'on-primary': '#ffffff',
        'primary-container': '#e0f2fe',
        'on-primary-container': '#075985',
        'primary-fixed': '#e0f2fe',
        'primary-fixed-dim': '#bae6fd',
        'on-primary-fixed': '#075985',
        'on-primary-fixed-variant': '#0369a1',
        'surface-tint': '#0284c7',
        'inverse-primary': '#7dd3fc',

        // Success / Healthy — chip: #ecfdf5 bg, #047857 text, #10b981 dot
        secondary: '#10b981',
        'on-secondary': '#ffffff',
        'secondary-container': '#ecfdf5',
        'on-secondary-container': '#047857',
        'secondary-fixed': '#ecfdf5',
        'secondary-fixed-dim': '#6ee7b7',
        'on-secondary-fixed': '#047857',
        'on-secondary-fixed-variant': '#059669',

        // Warning / Degraded — chip: #fffbeb bg, #b45309 text, #f59e0b dot
        tertiary: '#f59e0b',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#fffbeb',
        'on-tertiary-container': '#b45309',
        'tertiary-fixed': '#fffbeb',
        'tertiary-fixed-dim': '#fcd34d',
        'on-tertiary-fixed': '#b45309',
        'on-tertiary-fixed-variant': '#b45309',

        // Critical / Error — chip: #fef2f2 bg, #b91c1c text, #ef4444 dot
        error: '#ef4444',
        'on-error': '#ffffff',
        'error-container': '#fef2f2',
        'on-error-container': '#b91c1c',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      },
      spacing: {
        'space-2xs': '0.25rem',
        'space-xs': '0.5rem',
        'space-sm': '0.75rem',
        'space-md': '1rem',
        'space-lg': '1.5rem',
        'space-xl': '2rem',
        'space-2xl': '3rem',
        'space-3xl': '4rem',
        'grid-gutter': '1.5rem',
        'grid-margin-desktop': '2.5rem',
        'grid-margin-mobile': '1rem',
      },
      fontSize: {
        'display-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em' }],
        'display-lg-mobile': ['26px', { lineHeight: '34px', letterSpacing: '-0.015em' }],
        // Not part of this design's own scale (it stops at display-lg / headline-md); kept as an
        // intermediate step so older callers between the two don't lose their size entirely.
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em' }],
        'headline-sm': ['16px', { lineHeight: '24px', letterSpacing: '-0.005em' }],
        'body-lg': ['15px', { lineHeight: '24px', letterSpacing: '0em' }],
        'body-md': ['14px', { lineHeight: '20px', letterSpacing: '0em' }],
        'body-sm': ['13px', { lineHeight: '18px', letterSpacing: '0em' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.01em' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        // Tabular telemetry readouts (JetBrains Mono, paired with font-mono).
        'metric-xl': ['28px', { lineHeight: '32px', letterSpacing: '-0.02em' }],
        'metric-md': ['18px', { lineHeight: '24px', letterSpacing: '-0.01em' }],
        'code-sm': ['12px', { lineHeight: '16px', letterSpacing: '0em' }],
      },
    },
  },
  plugins: [],
};
