'use client';

import { LoaderCircle } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from './button';

export type DataTableSortDirection = 'ascending' | 'descending';

export type DataTableSort = {
  columnId: string;
  direction: DataTableSortDirection;
};

export type DataTableSortValue = string | number | Date | null | undefined;

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Provide a value to enable sorting. Omit for columns that should not sort. */
  sortValue?: (row: T) => DataTableSortValue;
  className?: string;
};

export type DataTablePagination = {
  /** One-based page number. */
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
};

export type DataTableProps<T> = {
  caption: string;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowKey: (row: T) => string;
  loading?: boolean;
  emptyMessage?: string;
  /** Defaults to 10 for local pagination. Ignored when controlled pagination is supplied. */
  pageSize?: number;
  pagination?: DataTablePagination;
  /** Supplying onSortChange makes sorting controlled and delegates sorting to the caller. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort) => void;
};

function compareValues(a: DataTableSortValue, b: DataTableSortValue): number {
  if (a == null) return b == null ? 0 : 1;
  if (b == null) return -1;
  if (a instanceof Date || b instanceof Date) {
    const left = a instanceof Date ? a.getTime() : new Date(a).getTime();
    const right = b instanceof Date ? b.getTime() : new Date(b).getTime();
    return left - right;
  }
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/** C6 — typed, accessible data table with optional sorting and pagination. */
export function DataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  loading = false,
  emptyMessage = 'No records to show.',
  pageSize = 10,
  pagination,
  sort,
  onSortChange,
}: DataTableProps<T>) {
  const [localPage, setLocalPage] = useState(1);
  const [localSort, setLocalSort] = useState<DataTableSort | null>(null);
  const controlledSort = onSortChange !== undefined;
  const activeSort = controlledSort ? (sort ?? null) : localSort;
  const currentPage = pagination?.page ?? localPage;
  const currentPageSize = pagination?.pageSize ?? pageSize;
  const totalRows = pagination?.totalRows ?? rows.length;
  const pageCount = Math.max(1, Math.ceil(totalRows / currentPageSize));
  const page = Math.min(currentPage, pageCount);

  const sortedRows = [...rows];
  const sortColumn = columns.find((column) => column.id === activeSort?.columnId);
  if (!pagination && sortColumn?.sortValue && activeSort) {
    const direction = activeSort.direction === 'ascending' ? 1 : -1;
    sortedRows.sort(
      (a, b) => direction * compareValues(sortColumn.sortValue!(a), sortColumn.sortValue!(b)),
    );
  }

  const visibleRows = pagination
    ? sortedRows
    : sortedRows.slice((page - 1) * currentPageSize, page * currentPageSize);
  const firstRow = totalRows === 0 ? 0 : (page - 1) * currentPageSize + 1;
  const lastRow = Math.min(page * currentPageSize, totalRows);

  function requestSort(column: DataTableColumn<T>) {
    if (!column.sortValue) return;
    const nextSort: DataTableSort = {
      columnId: column.id,
      direction:
        activeSort?.columnId === column.id && activeSort.direction === 'ascending'
          ? 'descending'
          : 'ascending',
    };
    if (controlledSort) onSortChange?.(nextSort);
    else setLocalSort(nextSort);
  }

  function changePage(page: number) {
    if (pagination) pagination.onPageChange(page);
    else setLocalPage(page);
  }

  const previousDisabledProps =
    page <= 1
      ? { disabled: true as const, disabledReason: 'You are on the first page.' }
      : { disabled: false as const };
  const nextDisabledProps =
    page >= pageCount
      ? { disabled: true as const, disabledReason: 'You are on the last page.' }
      : { disabled: false as const };

  return (
    <section className="flex min-w-0 flex-col gap-3" aria-busy={loading}>
      <div className="overflow-x-auto rounded-card border border-sand bg-white">
        <table className="min-w-full border-collapse text-left text-body">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-cream text-charcoal">
            <tr>
              {columns.map((column) => {
                const direction =
                  activeSort?.columnId === column.id ? activeSort.direction : undefined;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={direction}
                    className={`px-4 py-3 font-semibold ${column.className ?? ''}`}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => requestSort(column)}
                        className="rounded-sm text-left outline-offset-2 focus-visible:outline-2 focus-visible:outline-brand"
                      >
                        {column.header}
                        <span className="ml-1 text-caption" aria-hidden="true">
                          {direction === 'ascending' ? '↑' : direction === 'descending' ? '↓' : '↕'}
                        </span>
                        <span className="sr-only">
                          {direction ? `, sorted ${direction}` : ', sortable'}
                        </span>
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-sand">
            {loading ? (
              <tr>
                <td colSpan={columns.length}>
                  <div
                    role="status"
                    className="flex items-center justify-center gap-2 px-4 py-10 text-stone"
                  >
                    <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
                    <span>Loading {caption.toLowerCase()}…</span>
                  </div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <p role="status" className="px-4 py-10 text-center text-stone">
                    {emptyMessage}
                  </p>
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={getRowKey(row)} className="hover:bg-cream/60">
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={`px-4 py-3 text-charcoal ${column.className ?? ''}`}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && totalRows > 0 ? (
        <nav
          aria-label={`${caption} pagination`}
          className="flex items-center justify-between gap-3"
        >
          <p className="text-caption text-stone" aria-live="polite">
            Showing {firstRow}–{lastRow} of {totalRows}
          </p>
          {pageCount > 1 ? (
            <div className="flex gap-2">
              <Button
                variant="secondary"
                onClick={() => changePage(page - 1)}
                {...previousDisabledProps}
                aria-label="Previous page"
              >
                Previous
              </Button>
              <Button
                variant="secondary"
                onClick={() => changePage(page + 1)}
                {...nextDisabledProps}
                aria-label="Next page"
              >
                Next
              </Button>
            </div>
          ) : null}
        </nav>
      ) : null}
    </section>
  );
}
