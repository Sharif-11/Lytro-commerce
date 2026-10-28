import { Fragment, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/card';
import { changeText } from './check-lines';

/** A check's line as the table names it: its own name, and the product's over its batch lines. */
export interface TableLine {
  key: string;
  name: string;
  group: string | null;
  expected: number;
}

const headClass =
  'border-b border-line bg-neutral-50 px-3 py-2.5 text-[12px] font-semibold tracking-[0.02em] text-neutral-700';
const cellClass = 'border-b border-line px-3 py-2.5 align-middle';

/** A difference in its colour: gained green, lost red, none grey (the prototype's `diff20`). */
export function Difference({ change }: { change: number }): React.JSX.Element {
  return (
    <span
      className={change > 0 ? 'text-success' : change < 0 ? 'text-danger-text' : 'text-neutral-400'}
    >
      {changeText(change)}
    </span>
  );
}

/**
 * A check's lines in a table (the prototype's `stock-check` and `stock-check-detail` `.table`): each line's name, what
 * the records expected, what was counted and the difference; a batch-kept product's name over its batch lines.
 */
export function CheckTable<L extends TableLine>({
  lines,
  counted,
  difference,
  below,
  labelled = false,
  after,
}: {
  lines: readonly L[];
  counted: (line: L) => ReactNode;
  difference: (line: L) => ReactNode;
  /** Under a line's name: a serial line's IMEIs not found. */
  below?: (line: L) => ReactNode;
  /** The difference column named, as a saved check's is; a new check's is left bare, as drawn. */
  labelled?: boolean;
  /** A last row across the table (the rest of a saved check's lines, all matched). */
  after?: ReactNode;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  return (
    <Card flush>
      <table className="w-full border-collapse text-[14px] [&_tbody_tr:last-child_td]:border-b-0">
        <thead>
          <tr>
            <th className={`${headClass} text-left`}>{t('variantCol')}</th>
            <th className={`${headClass} text-right`}>{t('expected')}</th>
            <th className={`${headClass} text-right`}>{t('counted')}</th>
            <th className={`${headClass} text-right`}>
              {labelled ? t('difference') : <span className="sr-only">{t('difference')}</span>}
            </th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, at) => (
            <Fragment key={line.key}>
              {line.group !== null && line.group !== lines[at - 1]?.group ? (
                <tr>
                  <td colSpan={4} className={`${cellClass} bg-neutral-50 font-semibold`}>
                    {line.group}
                  </td>
                </tr>
              ) : null}
              <tr>
                <td className={`${cellClass} ${line.group !== null ? 'num pl-6' : ''}`}>
                  {line.name}
                  {below?.(line)}
                </td>
                <td className={`${cellClass} num text-right`}>{String(line.expected)}</td>
                <td className={`${cellClass} num text-right`}>{counted(line)}</td>
                <td className={`${cellClass} num text-right font-semibold`}>{difference(line)}</td>
              </tr>
            </Fragment>
          ))}
          {after ? (
            <tr>
              <td colSpan={4} className={`${cellClass} text-[14px] text-fg-muted`}>
                {after}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Card>
  );
}
