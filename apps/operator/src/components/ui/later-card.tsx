import { SoonTag } from './console-page';

/** A feature drawn where it will sit, with what it will hold (rule 8). */
export function LaterCard({ title, hint }: { title: string; hint: string }): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-card border border-dashed border-line p-4">
      <h3 className="mb-1 text-[16px] font-semibold text-neutral-700">
        {title} <SoonTag />
      </h3>
      <div className="text-[13px] text-fg-muted">{hint}</div>
    </section>
  );
}
