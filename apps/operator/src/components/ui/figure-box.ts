/** The box a figure sits in, for a Link that opens its screen as much as a plain one. Marigold when it needs a person. */
export function figureBox(flagged: boolean): string {
  return `flex min-w-0 flex-col gap-1 rounded-card border px-4 py-3.5 text-left ${
    flagged ? 'border-accent-300 bg-[#fffaf0]' : 'border-line bg-surface'
  }`;
}
