import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { normalizeSerial, SerialFormat } from '@lytronix/validators';
import { useCheckSerials } from '@/api/products';
import { Icon } from '@/components/icon';
import { Banner } from '@/components/ui/banner';
import { Button } from '@/components/ui/button';
import { AreaField, Field } from '@/components/ui/field';
import { Sheet } from '@/components/ui/sheet';
import { StatusTag } from '@/components/ui/status-tag';
import { addSerials, keptOf, markTaken, splitList, type SerialLine } from '@/lib/opening';
import { SerialScanner } from './serial-scanner';

type Tab = 'scan' | 'paste' | 'type';

const TABS: { tab: Tab; icon: 'scan' | 'list' | 'pencil'; label: string }[] = [
  { tab: 'scan', icon: 'scan', label: 'scan' },
  { tab: 'paste', icon: 'list', label: 'pasteList' },
  { tab: 'type', icon: 'pencil', label: 'typeTab' },
];

/**
 * Opening serials (Part 15's `pf-sh-serials`, Part 16; INV-14, INV-23): the serials of a new serial-numbered product's
 * units on the shelf, by Scan, Paste a list or Type -- a USB or Bluetooth scanner types there too. Each line is checked
 * as it comes, by its format and against the list and the product's other variants, then against what the shop holds;
 * a flagged line has × and is left out. The list stops at the opening stock. Done keeps the lines; the product saves
 * the ones nothing is wrong with, the rest can come later. Part 18 enters stock arriving's serials and the units held
 * with none the same way: `entry` words those.
 */
export function OpeningSerialsSheet({
  open,
  name,
  units,
  format,
  lines,
  others,
  entry,
  busy = false,
  error = null,
  onDone,
  onClose,
}: {
  open: boolean;
  /** What the serials are of: the product and the variant ("Galaxy A16 · 128 GB · Black"). */
  name: string;
  /** The units they are for: one serial each, at most. */
  units: number;
  format: SerialFormat;
  lines: readonly SerialLine[];
  /** The serials kept in the product's other variants: one there is twice in the product. */
  others: ReadonlySet<string>;
  /** Where else they are entered from (Part 18): its title, its line under it, its words for none and for full, and
   * its button for the serials kept; a new product's opening stock when left out. */
  entry?: {
    title: string;
    sub: string;
    none: string;
    full: string;
    done?: (kept: number) => string;
  };
  /** The serials are being saved; the server's words when they were refused. */
  busy?: boolean;
  error?: string | null;
  onDone: (lines: SerialLine[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const check = useCheckSerials();
  const [tab, setTab] = useState<Tab>('scan');
  const [draft, setDraft] = useState<SerialLine[]>([...lines]);
  // The list as last changed: the camera may read two codes before the sheet draws again.
  const latest = useRef<SerialLine[]>(draft);
  const [typed, setTyped] = useState('');
  const [pasted, setPasted] = useState('');

  const commit = (next: SerialLine[]) => {
    latest.current = next;
    setDraft(next);
  };

  useEffect(() => {
    if (!open) return;
    commit([...lines]);
    setTyped('');
    setPasted('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const kept = keptOf(draft).length;
  const flagged = draft.length - kept;
  const full = units > 0 && kept >= units;

  /** Entered serials added and checked; what did not fit comes back. */
  function add(entered: string[]): string[] {
    const before = latest.current;
    const { lines: next, rest } = addSerials(before, entered, format, units, others);
    const fresh = keptOf(next).filter((code) => !keptOf(before).includes(code));
    commit(next);
    if (fresh.length > 0) {
      check.mutate(
        { serials: fresh, format },
        {
          onSuccess: ({ taken }) => {
            commit(markTaken(latest.current, taken));
          },
        },
      );
    }
    return rest;
  }

  const imei = format === SerialFormat.Imei;
  const title = entry?.title ?? t('serialsTitle');
  return (
    <Sheet
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <Button
          wide
          busy={busy}
          onClick={() => {
            onDone(latest.current);
          }}
        >
          {entry?.done ? entry.done(kept) : t('done')}
        </Button>
      }
    >
      {open ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px] text-fg-muted">
            {entry?.sub ?? t('serialsSub', { name, count: units })}
          </p>
          <div role="tablist" aria-label={title} className="flex gap-1.5">
            {TABS.map((each) => (
              <button
                key={each.tab}
                type="button"
                role="tab"
                aria-selected={tab === each.tab}
                onClick={() => {
                  setTab(each.tab);
                }}
                className={[
                  'inline-flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border px-1.5 py-[9px] text-[14px] font-medium',
                  tab === each.tab ? 'border-ink bg-ink text-white' : 'border-line-strong',
                ].join(' ')}
              >
                <Icon name={each.icon} size={16} />
                {t(each.label)}
              </button>
            ))}
          </div>
          {units === 0 ? (
            <Banner tone="info">{entry?.none ?? t('serialsNoUnits')}</Banner>
          ) : full ? (
            <Banner tone="info">{entry?.full ?? t('serialsFull', { units })}</Banner>
          ) : tab === 'scan' ? (
            <SerialScanner
              onCode={(raw) => {
                // The camera reads a code for as long as it is in view: one already in the list is ignored.
                const code = normalizeSerial(raw, format);
                if (latest.current.some((line) => line.code === code)) return false;
                add([raw]);
                return true;
              }}
            />
          ) : tab === 'paste' ? (
            <div className="flex flex-col items-start gap-2">
              <AreaField
                className="w-full"
                label={t('pasteL')}
                rows={4}
                value={pasted}
                help={t('pasteHint')}
                onChange={(event) => {
                  setPasted(event.target.value);
                }}
              />
              <Button
                tone="outline"
                size="sm"
                disabled={splitList(pasted).length === 0}
                onClick={() => {
                  setPasted(add(splitList(pasted)).join('\n'));
                }}
              >
                {t('addList')}
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (typed.trim() === '') return;
                add([typed]);
                setTyped('');
              }}
              className="flex flex-col gap-1.5"
            >
              <Field
                label={imei ? t('typeImei') : t('typeSerial')}
                value={typed}
                inputMode={imei ? 'numeric' : undefined}
                autoComplete="off"
                help={t('scannerHint')}
                suffix={
                  <Button tone="outline" size="xs" type="submit">
                    {t('addSerial')}
                  </Button>
                }
                onChange={(event) => {
                  setTyped(event.target.value);
                }}
              />
            </form>
          )}
          {draft.length > 0 ? (
            <ul
              aria-label={t('serialsTitle')}
              className="flex-none overflow-hidden rounded-[8px] border border-line"
            >
              {draft.map((line, index) => (
                <li
                  key={`${line.code}-${String(index)}`}
                  className={[
                    'flex items-center gap-2.5 border-t border-line px-3 py-2 font-mono text-[14px] first:border-t-0',
                    line.flag ? 'text-danger-text' : '',
                  ].join(' ')}
                >
                  <Icon name={line.flag ? 'alert' : 'check'} size={16} />
                  <span className="min-w-0 truncate">{line.code}</span>
                  {/* As drawn, the chip keeps the list's monospace. */}
                  <span className="ml-auto flex-none">
                    <StatusTag tone={line.flag ? 'bad' : 'ok'}>
                      {line.flag ? t(`flag_${line.flag}`) : t('serialOk')}
                    </StatusTag>
                  </span>
                  {line.flag ? (
                    <button
                      type="button"
                      aria-label={t('removeSerial', { code: line.code })}
                      className="inline-flex size-7 flex-none items-center justify-center rounded-[6px] text-primary"
                      onClick={() => {
                        commit(latest.current.filter((_, at) => at !== index));
                      }}
                    >
                      <Icon name="x" size={14} />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {units > 0 && !full ? (
            <p className="text-[14px] text-fg-muted">{t('serialsEntered', { kept, units })}</p>
          ) : null}
          {flagged > 0 ? <Banner tone="warn">{t('serialsLeftOut', { n: flagged })}</Banner> : null}
          {error ? <Banner tone="bad">{error}</Banner> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
