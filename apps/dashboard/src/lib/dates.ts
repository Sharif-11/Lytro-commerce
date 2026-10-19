/** Date and time in the visitor's language, Dhaka time. */
export function formatDateTime(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}

export function formatDate(iso: string, language: string): string {
  return new Intl.DateTimeFormat(language === 'bn' ? 'bn-BD' : 'en-GB', {
    dateStyle: 'medium',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}
