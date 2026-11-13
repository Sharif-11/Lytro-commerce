/** Today's date in Dhaka as a version-shaped string (`2026-11-20`), for choosing the version in force without the
    server: a version is named by the day it takes effect. */
export function dhakaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
