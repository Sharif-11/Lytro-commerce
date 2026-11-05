/** A date and time as the sketch writes one ("4 Nov, 09:12"), in Dhaka time, in both languages. */
export function formatSessionTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Dhaka',
  }).format(new Date(iso));
}
