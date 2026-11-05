// Checked in this order: Edge and Opera also say Chrome, Chrome also says Safari, Android also says Linux.
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(e|A|iOS)?\//, 'Edge'],
  [/\bOPR\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(Chrome|CriOS)\//, 'Chrome'],
  [/\b(Firefox|FxiOS)\//, 'Firefox'],
  [/\bSafari\//, 'Safari'],
];
const SYSTEMS: [RegExp, string][] = [
  [/\bWindows\b/, 'Windows'],
  [/\bAndroid\b/, 'Android'],
  [/\b(iPhone|iPad)\b/, 'iOS'],
  [/\bMac OS X\b/, 'macOS'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bLinux\b/, 'Linux'],
];

function firstMatch(userAgent: string, names: [RegExp, string][]): string | undefined {
  return names.find(([pattern]) => pattern.test(userAgent))?.[1];
}

/** A session's browser as a person says it ("Chrome · Windows"); null when the server has nothing recognisable. */
export function browserOf(userAgent: string | null): string | null {
  if (userAgent === null) return null;
  const parts = [firstMatch(userAgent, BROWSERS), firstMatch(userAgent, SYSTEMS)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}
