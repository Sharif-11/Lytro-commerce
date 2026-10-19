const DHAKA = 'Asia/Dhaka';

function locale(language: string): string {
  return language === 'bn' ? 'bn-BD' : 'en-GB';
}

/** Date and time in the visitor's language, Dhaka time. */
export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(locale(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: DHAKA,
  }).format(new Date(iso));
}

export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(locale(language), { dateStyle: 'medium', timeZone: DHAKA }).format(
    new Date(iso),
  );
}
