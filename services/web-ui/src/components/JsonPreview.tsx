function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Cheap syntax coloring for a JSON blob: escape first, then wrap already-escaped tokens in colored
 * spans. Safe against injection because the wrapping happens after escaping — nothing from the
 * source data can close a tag it didn't open with.
 */
function colorize(json: string): string {
  const escaped = escapeHtml(json);
  return escaped
    .replace(/"([^"]+)":/g, '<span class="text-primary">"$1"</span>:')
    .replace(/: "([^"]*)"/g, ': <span class="text-secondary">"$1"</span>')
    .replace(/: (-?\d+\.?\d*|true|false|null)/g, ': <span class="text-tertiary">$1</span>');
}

interface JsonPreviewProps {
  value: unknown;
}

export function JsonPreview({ value }: JsonPreviewProps) {
  const json = JSON.stringify(value, null, 2);
  return (
    <pre className="overflow-x-auto rounded-lg bg-on-surface p-space-sm font-mono text-body-sm leading-relaxed text-inverse-on-surface">
      <code dangerouslySetInnerHTML={{ __html: colorize(json) }} />
    </pre>
  );
}
