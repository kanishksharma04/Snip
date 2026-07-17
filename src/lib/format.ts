// Vercel's server runtime is UTC; a developer/user viewing this in a browser
// may be in any timezone (IST, in practice, for this project). Formatting a
// raw Date with toLocaleDateString() and no explicit timeZone/locale produces
// a different string on the server than in the browser, and React reports a
// hydration mismatch for it. Passing an explicit IANA timeZone and locale
// makes the output deterministic regardless of where it runs — this always
// runs server-side, and only the finished string is passed to the client.
const DISPLAY_TIMEZONE = "Asia/Kolkata";
const DISPLAY_LOCALE = "en-IN";

export function formatDateIst(date: Date): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export function formatDateTimeIst(date: Date): string {
  return new Intl.DateTimeFormat(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIMEZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function isPast(date: Date): boolean {
  return date.getTime() <= Date.now();
}
