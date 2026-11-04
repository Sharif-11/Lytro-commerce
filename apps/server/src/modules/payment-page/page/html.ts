/** Text already safe to put in a page. Only `html` makes one, so anything a shop or shopper typed passes through it. */
export class SafeHtml {
  constructor(readonly text: string) {}
}

export type HtmlPart = SafeHtml | string | number | null | undefined | false | readonly HtmlPart[];

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function textOf(part: HtmlPart): string {
  if (part === null || part === undefined || part === false) return '';
  if (part instanceof SafeHtml) return part.text;
  if (typeof part === 'string') return escapeHtml(part);
  if (typeof part === 'number') return String(part);
  return part.map(textOf).join('');
}

/**
 * PAY-23: every page is written with this tag, which escapes whatever goes in unless it is itself already `html`. A
 * shop's name, an account's note or a staff member's words can't become markup on a page that takes people's money.
 */
export function html(strings: TemplateStringsArray, ...parts: HtmlPart[]): SafeHtml {
  return new SafeHtml(
    strings.reduce((text, piece, index) => `${text}${piece}${textOf(parts[index])}`, ''),
  );
}
