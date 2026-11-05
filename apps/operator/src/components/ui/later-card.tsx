import { SoonTag } from './console-page';

/** A feature drawn where it will sit, with what it will hold (rule 8). */
export function LaterCard({
  title,
  hint,
  heading: Heading = 'h3',
}: {
  title: string;
  hint: string;
  /** `h2` on a screen with no heading above it but its title. */
  heading?: 'h2' | 'h3';
}): React.JSX.Element {
  return (
    <section className="min-w-0 rounded-card border border-dashed border-line p-4">
      <Heading className="mb-1 text-[16px] font-semibold text-neutral-700">
        {title} <SoonTag />
      </Heading>
      <div className="text-[13px] text-fg-muted">{hint}</div>
    </section>
  );
}
