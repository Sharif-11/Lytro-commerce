/** A billing term's name in the page's language. */
export function termLabel(term: { labelEn: string; labelBn: string }, language: string): string {
  return language === 'bn' ? term.labelBn : term.labelEn;
}
