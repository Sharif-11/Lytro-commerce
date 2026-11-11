// D8-4, D8-68, D8-77: Lytro's help line as every page reads it, and whether it is open now -- in `common`, which the
// website's browser code imports without the rest.

/** The hours Lytro's help line answers, of a 24-hour clock in Dhaka (`GET /help-line`). */
export interface HelpLineHours {
  opensHour: number;
  closesHour: number;
}

/** D8-4, D8-68: Lytro's help line, as `GET /help-line` answers it and every page that shows it reads it. */
export interface HelpLineView extends HelpLineHours {
  /** Bangladeshi mobile numbers in their local form (01XXXXXXXXX); null until the operator sets one or after it is cleared. */
  whatsapp: string | null;
  phone: string | null;
}

/** The hour of a 24-hour clock in Dhaka at this moment. */
export function dhakaHourOf(at: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    hour: 'numeric',
    hourCycle: 'h23',
    timeZone: 'Asia/Dhaka',
  }).format(at);
  return Number(hour) % 24;
}

/**
 * D8-68, D8-77 (Slice 8.8): whether the help line is open at this moment -- from the opening hour up to the closing hour,
 * every day, by Dhaka's clock. The console keeps closing after opening, so the hours never run past midnight.
 */
export function helpLineOpenAt(hours: HelpLineHours, at: Date): boolean {
  const hour = dhakaHourOf(at);
  return hour >= hours.opensHour && hour < hours.closesHour;
}
