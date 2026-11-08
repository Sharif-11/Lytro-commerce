/**
 * NTC-01, NTC-16, D7-53 (Phase 7 Slice 7.4, read agreed 2026-11-07): the few marks a notice's body may use --
 * `**bold**`, `[a link](https://...)`, lines starting `- ` for a list, and blank lines between paragraphs -- and nothing
 * else. A body is kept as the operator typed it and turned into HTML only here, where every character is escaped first,
 * so no markup of anyone's can get through: a `<script>` in a body shows as the text it is. Links are https only, and open
 * in a new tab without passing the referrer.
 */

const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/g;
const BOLD = /\*\*([^*\n]+)\*\*/g;
const LIST_ITEM = /^- (.*)$/;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Whether a link may go in a notice: an https address with nothing in it a browser could read as more. */
export function isNoticeLinkTarget(target: string): boolean {
  if (!target.startsWith('https://')) return false;
  try {
    const url = new URL(target);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** Every link a body names, for the request to refuse one that isn't https. */
export function noticeLinksIn(body: string): string[] {
  return Array.from(body.matchAll(LINK), (match) => match[2] ?? '');
}

/** A line's inline marks, on text already escaped. A link that isn't https is left as its text. */
function inline(escaped: string): string {
  return escaped
    .replace(LINK, (whole, text: string, target: string) => {
      // The target was escaped with the line; read it back to check it, and write it escaped.
      const raw = target.replace(/&amp;/g, '&');
      if (!isNoticeLinkTarget(raw)) return text;
      return `<a href="${escapeHtml(raw)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
    })
    .replace(BOLD, '<strong>$1</strong>');
}

/** NTC-01, NTC-16: a body as safe HTML -- paragraphs, lists, bold and https links only. */
export function renderNoticeMarkdown(body: string): string {
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push(`<p>${paragraph.join('<br>')}</p>`);
    if (list.length > 0) blocks.push(`<ul>${list.map((item) => `<li>${item}</li>`).join('')}</ul>`);
    paragraph = [];
    list = [];
  };
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      continue;
    }
    const item = LIST_ITEM.exec(trimmed);
    if (item) {
      if (paragraph.length > 0) {
        blocks.push(`<p>${paragraph.join('<br>')}</p>`);
        paragraph = [];
      }
      list.push(inline(escapeHtml(item[1] ?? '')));
    } else {
      if (list.length > 0) {
        blocks.push(`<ul>${list.map((each) => `<li>${each}</li>`).join('')}</ul>`);
        list = [];
      }
      paragraph.push(inline(escapeHtml(trimmed)));
    }
  }
  flush();
  return blocks.join('');
}

/** A body as plain text, for an email or a push: the marks gone, a link written as its text and address. */
export function noticePlainText(body: string): string {
  return body
    .replace(/\r\n?/g, '\n')
    .replace(LINK, (_whole, text: string, target: string) => `${text} (${target})`)
    .replace(BOLD, '$1')
    .replace(/^- /gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
