import type { TFunction } from 'i18next';
import { NoticeCategory, NoticeSeverity, NoticeStatus } from '@lytronix/validators';
import { formatSessionTime } from '@/lib/session-time';
import type { OperatorNotice } from '@/types/notices';

/** NTC-01: the categories in the order the chips and the editor list them. */
export const CATEGORIES: readonly NoticeCategory[] = Object.values(NoticeCategory);
export const SEVERITIES: readonly NoticeSeverity[] = Object.values(NoticeSeverity);

type Words = Pick<OperatorNotice, 'titleBn' | 'titleEn' | 'bodyBn' | 'bodyEn'>;

/** NTC-15: a notice's title in this language, or in the other when it has none in this one. */
export function titleIn(notice: Words, language: string): string {
  return (
    (language === 'bn' ? notice.titleBn || notice.titleEn : notice.titleEn || notice.titleBn) ?? ''
  );
}

export function bodyIn(notice: Words, language: string): string {
  return (
    (language === 'bn' ? notice.bodyBn || notice.bodyEn : notice.bodyEn || notice.bodyBn) ?? ''
  );
}

/** "English only" or "Bangla only", when one language is all it has. */
export function onlyLanguage(notice: Words, t: TFunction): string | null {
  if (!notice.titleBn) return t('notices.onlyEn');
  if (!notice.titleEn) return t('notices.onlyBn');
  return null;
}

/** Where a notice stands, as a line under its state: "goes live 8 Nov, 10:00". */
export function whenWords(notice: OperatorNotice, t: TFunction): string {
  const at = (iso: string | null): string => (iso ? formatSessionTime(iso) : '');
  switch (notice.status) {
    case NoticeStatus.Draft:
      return t('notices.statusWhen.draft');
    case NoticeStatus.Scheduled:
      return t('notices.statusWhen.scheduled', { d: at(notice.publishAt) });
    case NoticeStatus.Live:
      return t('notices.statusWhen.live', { d: at(notice.publishAt) });
    case NoticeStatus.Ended:
      return t('notices.statusWhen.ended', { d: at(notice.endsAt) });
    case NoticeStatus.Withdrawn:
      return t('notices.statusWhen.withdrawn', { d: at(notice.withdrawnAt) });
  }
}
