// The ways the Records pages write a figure (OPERATOR-CONSOLE-DESIGN v7 §10e to §10g), as the sketch writes each.

/** Taka in a report: two places only when there are paisa, a true minus sign, and never ৳-0. */
export function takaSigned(value: string | number): string {
  const rounded = Math.round(Number(value) * 100) / 100;
  const shown = `৳${Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: rounded % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
  return rounded < 0 ? `−${shown}` : shown;
}

/** A size as the sketch writes one: 7.9 GB, 34 GB, 612 MB. */
export function bytesWords(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(bytes >= 1e10 ? 0 : 1)} GB`;
  return `${String(Math.round(bytes / 1e6))} MB`;
}

/** A whole count with its thousands marked: 3,912,000. */
export function countWords(value: number): string {
  return value.toLocaleString('en-US');
}

/** A Bangladeshi mobile number as the sketch prints one: 01712 345678. */
export function phoneWords(phone: string): string {
  return /^01\d{9}$/.test(phone) ? `${phone.slice(0, 5)} ${phone.slice(5)}` : phone;
}

/** Operations as millions, up to two places: 0.62, 11.3. */
export function millions(value: number): string {
  return (value / 1e6).toLocaleString('en-US', { maximumFractionDigits: 2 });
}
