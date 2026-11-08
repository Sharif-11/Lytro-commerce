import { createFileRoute } from '@tanstack/react-router';
import { NoticeTemplate } from '@lytronix/validators';
import { NewNotice } from '@/views/notices/editor-pages';

/** What the editor starts from: a template and its variables, or a rate change (NTC-12, NTC-13). */
export interface NewNoticeSearch {
  template?: NoticeTemplate;
  rateChange?: number;
  from?: string;
  to?: string;
}

function isTemplate(value: unknown): value is NoticeTemplate {
  return typeof value === 'string' && (Object.values(NoticeTemplate) as string[]).includes(value);
}

export const Route = createFileRoute('/_console/notices/new')({
  validateSearch: (search: Record<string, unknown>): NewNoticeSearch => {
    const rateChange = Number(search.rateChange);
    return {
      ...(isTemplate(search.template) ? { template: search.template } : {}),
      ...(Number.isInteger(rateChange) && rateChange > 0 ? { rateChange } : {}),
      ...(typeof search.from === 'string' ? { from: search.from } : {}),
      ...(typeof search.to === 'string' ? { to: search.to } : {}),
    };
  },
  component: NewNotice,
});
