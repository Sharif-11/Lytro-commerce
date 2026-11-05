import type { ReactNode } from 'react';
import { figureBox } from './figure-box';

/** The stat strip: two across on a phone, four from 640 px. */
export function Figures({ children }: { children: ReactNode }): React.JSX.Element {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>;
}

export function FigureBody({
  label,
  value,
  detail,
  flagged = false,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  flagged?: boolean;
}): React.JSX.Element {
  return (
    <>
      <span className="text-[13px] font-medium text-fg-muted">{label}</span>
      <span
        className={`font-display text-[24px] leading-[1.1] font-extrabold tracking-[-0.02em] tabular-nums ${
          flagged ? 'text-warning' : ''
        }`}
      >
        {value}
      </span>
      <span className="text-[13px] text-fg-muted">{detail}</span>
    </>
  );
}

export function Figure(props: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  flagged?: boolean;
}): React.JSX.Element {
  return (
    <div className={figureBox(props.flagged ?? false)}>
      <FigureBody {...props} />
    </div>
  );
}
