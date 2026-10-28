import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SerialStatus } from '@lytronix/validators';
import { useSerials } from '@/api/stock';
import { Button } from '@/components/ui/button';
import { CheckRow } from '@/components/ui/check-row';
import { Sheet } from '@/components/ui/sheet';
import { mustName, type CountLine } from './check-lines';

/**
 * The IMEIs not found (Part 20's `sh-check-missing`; INV-14): a serial line counted short, where every unit short had
 * an IMEI, says which -- at least all but the units that never had one, at most as many as are short. They leave the
 * stock with the count.
 */
export function MissingSheet({
  line,
  counted,
  named,
  onDone,
  onClose,
}: {
  line: CountLine | null;
  counted: number | null;
  named: readonly string[];
  onDone: (serials: string[]) => void;
  onClose: () => void;
}): React.JSX.Element | null {
  if (!line || counted === null) return null;
  return (
    <Missing
      key={`${line.key}:${String(counted)}`}
      line={line}
      counted={counted}
      named={named}
      onDone={onDone}
      onClose={onClose}
    />
  );
}

function Missing({
  line,
  counted,
  named,
  onDone,
  onClose,
}: {
  line: CountLine;
  counted: number;
  named: readonly string[];
  onDone: (serials: string[]) => void;
  onClose: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('shop');
  const serials = useSerials(line.productId, line.variantId, SerialStatus.InStock);
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set(named));
  const short = line.expected - counted;
  const least = mustName(line, counted);
  return (
    <Sheet
      open
      title={t('missingT')}
      onClose={onClose}
      footer={
        <Button
          wide
          disabled={picked.size < least}
          onClick={() => {
            onDone([...picked]);
          }}
        >
          {t('done')}
        </Button>
      }
    >
      <p className="text-[14px] text-fg-muted">
        {line.name} · {t('expected')} <span className="num">{String(line.expected)}</span> ·{' '}
        {t('counted')} <span className="num">{String(counted)}</span>
      </p>
      <div
        role="group"
        aria-label={t('missingT')}
        className="flex-none overflow-hidden rounded-card border border-line"
      >
        {(serials.data?.serials ?? []).map((unit) => (
          <div key={unit.id} className="border-b border-line px-4 py-0.5 last:border-b-0">
            <CheckRow
              checked={picked.has(unit.serial)}
              disabled={!picked.has(unit.serial) && picked.size >= short}
              onChange={() => {
                setPicked((current) => {
                  const next = new Set(current);
                  if (next.has(unit.serial)) next.delete(unit.serial);
                  else next.add(unit.serial);
                  return next;
                });
              }}
              title={<span className="font-mono text-[14px] font-normal">{unit.serial}</span>}
            />
          </div>
        ))}
      </div>
      <p className="text-[14px] text-fg-muted">
        {line.missing > 0
          ? t('leavingSomeHint', { missing: line.missing })
          : t('missingHint', { count: short })}
      </p>
    </Sheet>
  );
}
