import { Button, Select } from './Controls';
import { formatNumber } from './format';

interface PaginationProps {
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  hasNext: boolean;
  /** Singular noun for the rows, used to make the count read as a sentence. */
  noun: string;
  onPageChange: (page: number) => void;
  onSizeChange: (size: number) => void;
}

const PAGE_SIZES = [25, 50, 100, 200];

export function Pagination({
  page,
  size,
  totalElements,
  totalPages,
  hasNext,
  noun,
  onPageChange,
  onSizeChange,
}: PaginationProps) {
  const firstRow = totalElements === 0 ? 0 : page * size + 1;
  const lastRow = Math.min(totalElements, (page + 1) * size);
  const plural = `${noun}s`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-space-md pt-space-lg">
      <span className="font-body-md text-body-md tabular-nums text-on-surface-variant">
        {totalElements === 0
          ? `No ${plural}`
          : totalElements <= size
            ? `${formatNumber(totalElements)} ${totalElements === 1 ? noun : plural}`
            : `Showing ${formatNumber(firstRow)}–${formatNumber(lastRow)} of ${formatNumber(totalElements)} ${plural}`}
      </span>

      <div className="flex items-center gap-space-md">
        <label className="flex items-center gap-1.5 font-body-md text-body-md text-on-surface-variant">
          Show
          <Select
            compact
            value={String(size)}
            options={PAGE_SIZES.map((option) => ({ value: String(option), label: String(option) }))}
            onChange={(value) => onSizeChange(Number(value))}
          />
          per page
        </label>

        {totalPages > 1 ? (
          <>
            <Button onClick={() => onPageChange(page - 1)} disabled={page === 0}>
              Previous
            </Button>
            <span className="font-body-md text-body-md tabular-nums text-on-surface-variant">
              Page {page + 1} of {formatNumber(totalPages)}
            </span>
            <Button onClick={() => onPageChange(page + 1)} disabled={!hasNext}>
              Next
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
