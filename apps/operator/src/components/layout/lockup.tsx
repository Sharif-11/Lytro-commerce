import { useTranslation } from 'react-i18next';
import { Mark } from '@lytronix/ui';

/** The operator icon tile (docs/brand/icon-operator.svg): teal-900 with the marigold mark. */
export function OperatorTile({ size }: { size: number }): React.JSX.Element {
  return (
    <span
      className="inline-flex flex-none items-center justify-center rounded-[22%] bg-brand-900 text-accent-500"
      style={{ width: size, height: size }}
    >
      <Mark size={Math.round(size * 0.66)} />
    </span>
  );
}

/**
 * The wordmark, set in text as docs/brand/lytro-wordmark*.svg constructs it: `onLight` a teal-700 mark with ink letters,
 * otherwise a teal-400 mark with white ones.
 */
export function ConsoleWordmark({
  size,
  onLight = false,
}: {
  size: number;
  onLight?: boolean;
}): React.JSX.Element {
  return (
    <span
      role="img"
      aria-label="Lytro"
      className="inline-flex items-baseline font-display leading-none font-extrabold tracking-[-0.03em] whitespace-nowrap"
      style={{ fontSize: size }}
    >
      <span className={`mr-[0.07em] ${onLight ? 'text-brand-700' : 'text-brand-400'}`}>
        <Mark size={size * 0.75} cropped />
      </span>
      <span className={onLight ? 'text-ink' : 'text-white'}>ytro</span>
    </span>
  );
}

/** The word that says this is the operator's console. */
export function Eyebrow({ onLight = false }: { onLight?: boolean }): React.JSX.Element {
  const { t } = useTranslation();
  return (
    <span
      className={`font-bold tracking-[0.12em] ${
        onLight ? 'text-[11px] text-accent-text' : 'text-[10px] text-accent-300'
      }`}
    >
      {t('shell.eyebrow')}
    </span>
  );
}
