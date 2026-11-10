import type { CSSProperties, ReactNode } from 'react';
import { ConsoleIcon, type ConsoleIconName } from './console-icon';
import { TABLE_HEADER_WORD } from './sizes';

export interface Column<Row> {
  key: string;
  label: string;
  /** Its grid track from 640 px. */
  width: string;
  /** The row's name: full width on a phone, with no label of its own. */
  main?: boolean;
  /** A figure, right-aligned from 640 px. */
  right?: boolean;
  /** The row's buttons. */
  actions?: boolean;
  cell: (row: Row) => ReactNode;
}

function cellClass(column: { main?: boolean; right?: boolean; actions?: boolean }): string {
  if (column.main)
    return 'col-span-full min-w-0 text-[15px] font-semibold sm:col-auto sm:text-[14px] sm:font-medium';
  if (column.actions)
    return 'col-span-full flex min-w-0 flex-wrap gap-2 pt-1 text-[14px] sm:col-auto sm:flex-nowrap sm:justify-end sm:pt-0';
  return `min-w-0 text-[14px] ${column.right ? 'sm:text-right' : ''}`;
}

/** What a list says when it holds nothing: one sentence on what fills it. */
export function EmptyBox({
  icon,
  title,
  hint,
}: {
  icon: ConsoleIconName;
  title: string;
  hint: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-fg-muted">
      <ConsoleIcon name={icon} size={32} className="text-neutral-300" />
      <b className="text-[15px] font-semibold text-ink">{title}</b>
      <span>{hint}</span>
    </div>
  );
}

/**
 * OPERATOR-CONSOLE-DESIGN rule 5: one column list drives a table from 640 px and stacked cards below it, each cell
 * carrying its own label there. A row's main cell should hold a link, so a keyboard can open what a click on the row does.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  onOpen,
  faded,
  rowClass,
  loading = false,
  empty,
}: {
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  onOpen?: (row: Row) => void;
  /** A row kept for the record, greyed by its colour: opacity would take its words under the contrast rule. */
  faded?: (row: Row) => boolean;
  /** A row of its own kind, such as a report's bold total. */
  rowClass?: (row: Row) => string;
  loading?: boolean;
  empty: ReactNode;
}): React.JSX.Element {
  const tracks = { '--cols': columns.map((column) => column.width).join(' ') } as CSSProperties;
  if (loading) {
    return (
      <section
        aria-busy="true"
        className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
      >
        {[80, 60, 70].map((width) => (
          <span key={width} className="skel" style={{ width: `${String(width)}%` }} />
        ))}
      </section>
    );
  }
  if (rows.length === 0) {
    return (
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        {empty}
      </section>
    );
  }
  return (
    <section
      className="overflow-hidden rounded-card border border-line bg-surface sm:overflow-auto"
      style={tracks}
    >
      <div className="hidden items-center gap-3 border-b border-line bg-neutral-50 px-4 py-2.5 sm:grid sm:grid-cols-[var(--cols)]">
        {columns.map((column) => (
          <span key={column.key} className={TABLE_HEADER_WORD}>
            {column.label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={rowKey(row)}
          onClick={
            onOpen
              ? () => {
                  onOpen(row);
                }
              : undefined
          }
          className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 border-t border-line px-4 py-3 first:border-t-0 sm:min-h-[52px] sm:grid-cols-[var(--cols)] sm:gap-3 sm:py-2.5 [.hidden+&]:border-t-0 ${
            onOpen ? 'cursor-pointer' : ''
          } ${faded?.(row) ? 'text-fg-muted' : ''} ${rowClass?.(row) ?? ''}`}
        >
          {columns.map((column) => (
            <div key={column.key} className={cellClass(column)}>
              {column.main || column.actions || !column.label ? null : (
                <span className="block text-[11px] font-semibold tracking-[0.04em] text-fg-muted uppercase sm:hidden bn:text-[12px] bn:tracking-normal bn:normal-case">
                  {column.label}
                </span>
              )}
              {column.cell(row)}
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
