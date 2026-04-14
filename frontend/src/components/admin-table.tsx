"use client";

import type { ReactNode } from "react";

/**
 * Reusable admin table.
 *
 * Usage:
 *
 *   <AdminTable<Goal>
 *     columns={[
 *       { key: "id", label: "ID", width: "w-14", sortable: true, render: g => g.id },
 *       ...
 *     ]}
 *     rows={goals}
 *     rowKey={(g) => g.id}
 *     sort={{ key, dir }}
 *     onSortChange={(k, d) => { setKey(k); setDir(d); }}
 *     sortDescDefaults={["id", "deadline", "created_at"]}
 *     pagination={{ page, pageSize, total, onPageChange: setPage }}
 *     onRowClick={openEdit}
 *   />
 */

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export interface AdminColumn<T> {
  /** Sort key; must match backend SORT_KEYS if sortable. */
  key: string;
  label: string;
  /** Tailwind width class like `w-14`. */
  width?: string;
  sortable?: boolean;
  /** Additional td className. */
  cellClass?: string;
  render: (row: T) => ReactNode;
}

export interface PaginationState {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface AdminTableProps<T> {
  columns: AdminColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  emptyLabel?: string;
  sort?: SortState;
  onSortChange?: (key: string, dir: SortDir) => void;
  /** Keys whose first-click defaults to desc (numeric / date columns). */
  sortDescDefaults?: string[];
  pagination?: PaginationState;
  onRowClick?: (row: T) => void;
}

export function AdminTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  emptyLabel = "No rows",
  sort,
  onSortChange,
  sortDescDefaults = [],
  pagination,
  onRowClick,
}: AdminTableProps<T>) {
  const handleSortClick = (key: string) => {
    if (!onSortChange) return;
    if (sort?.key === key) {
      onSortChange(key, sort.dir === "asc" ? "desc" : "asc");
    } else {
      onSortChange(key, sortDescDefaults.includes(key) ? "desc" : "asc");
    }
  };

  return (
    <div className="panel flex-1 min-h-0 overflow-hidden flex flex-col">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-panel z-10 shadow-[0_1px_0_0_var(--color-border)]">
            <tr className="text-[11px] text-text-muted uppercase tracking-wider">
              {columns.map((col) => (
                <HeaderCell
                  key={col.key}
                  column={col}
                  active={sort?.key === col.key}
                  dir={sort?.dir ?? "asc"}
                  onSort={handleSortClick}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-12 text-center text-text-muted"
                >
                  {emptyLabel}
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-t border-border/50 transition ${
                  onRowClick ? "hover:bg-panel-hover/40 cursor-pointer" : ""
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-3 py-2 align-top ${col.cellClass ?? ""}`}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pagination && <Pagination {...pagination} />}
    </div>
  );
}

function HeaderCell<T>({
  column,
  active,
  dir,
  onSort,
}: {
  column: AdminColumn<T>;
  active: boolean;
  dir: SortDir;
  onSort: (key: string) => void;
}) {
  const base = `text-left font-medium px-3 py-2 ${column.width ?? ""}`;
  if (!column.sortable) {
    return <th className={base}>{column.label}</th>;
  }
  return (
    <th className={base}>
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`flex items-center gap-1 transition hover:text-text ${active ? "text-text" : ""}`}
      >
        {column.label}
        <span className={`text-[9px] ${active ? "opacity-100" : "opacity-25"}`}>
          {active ? (dir === "desc" ? "▼" : "▲") : "⇅"}
        </span>
      </button>
    </th>
  );
}

function Pagination({ page, pageSize, total, onPageChange }: PaginationState) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const canPrev = page > 1;
  const canNext = page < totalPages;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border shrink-0 text-xs text-text-muted">
      <span className="tabular-nums">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-3">
        <button
          onClick={() => canPrev && onPageChange(1)}
          disabled={!canPrev}
          className="px-2 disabled:opacity-30 disabled:cursor-not-allowed hover:text-text transition"
          aria-label="First"
        >
          «
        </button>
        <button
          onClick={() => canPrev && onPageChange(page - 1)}
          disabled={!canPrev}
          className="px-2 disabled:opacity-30 disabled:cursor-not-allowed hover:text-text transition"
          aria-label="Previous"
        >
          ‹
        </button>
        <span className="tabular-nums">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => canNext && onPageChange(page + 1)}
          disabled={!canNext}
          className="px-2 disabled:opacity-30 disabled:cursor-not-allowed hover:text-text transition"
          aria-label="Next"
        >
          ›
        </button>
        <button
          onClick={() => canNext && onPageChange(totalPages)}
          disabled={!canNext}
          className="px-2 disabled:opacity-30 disabled:cursor-not-allowed hover:text-text transition"
          aria-label="Last"
        >
          »
        </button>
      </div>
    </div>
  );
}
