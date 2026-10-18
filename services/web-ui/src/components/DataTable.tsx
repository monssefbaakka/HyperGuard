import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  /** Entity attribute the API sorts by; omit for columns the API cannot sort. */
  sortField?: string;
  align?: 'left' | 'right';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  sort?: { field: string; direction: 'asc' | 'desc' };
  onSortChange?: (field: string) => void;
}

/**
 * A plain table with header sorting.
 *
 * <p>Sortable headers are real buttons rather than click handlers on the cell, so they can be
 * reached and operated from the keyboard and announce themselves as controls. Only columns that
 * declare a {@code sortField} are sortable, which keeps the UI from asking the API for a sort it
 * would reject: the query service whitelists its sortable attributes.
 */
export function DataTable<T>({ columns, rows, rowKey, sort, onSortChange }: DataTableProps<T>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-container-high">
      <table className="w-full min-w-max border-collapse whitespace-nowrap">
        <thead>
          <tr className="border-b border-surface-container-high bg-surface-container-low">
            {columns.map((column) => {
              const sortable = Boolean(column.sortField && onSortChange);
              const active = Boolean(sort && column.sortField === sort.field);
              return (
                <th
                  key={column.key}
                  className={`p-0 font-label-md text-label-md font-semibold ${
                    active ? 'text-primary' : 'text-on-surface-variant'
                  } ${column.align === 'right' ? 'text-right' : 'text-left'}`}
                  aria-sort={
                    active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={`inline-flex w-full items-center gap-1.5 px-space-md py-space-sm font-semibold hover:text-on-surface ${
                        column.align === 'right' ? 'justify-end' : 'justify-start'
                      }`}
                      title={`Sort by ${column.header.toLowerCase()}`}
                      onClick={() => onSortChange?.(column.sortField as string)}
                    >
                      {column.header}
                      <span className="text-[12px] opacity-70" aria-hidden="true">
                        {active ? (sort?.direction === 'asc' ? '↑' : '↓') : '↕'}
                      </span>
                    </button>
                  ) : (
                    <span className="inline-block px-space-md py-space-sm">{column.header}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-t border-surface-container-high hover:bg-surface-container-low">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`px-space-md py-space-sm font-body-md text-body-md text-on-surface ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
