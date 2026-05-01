type DayBoundsUtc = {
  startUtc: Date;
  endUtcExclusive: Date;
};

function parseOffsetMinutes(timeZoneName: string) {
  // Examples: "GMT-7", "GMT+02:00", "UTC"
  if (timeZoneName === "UTC" || timeZoneName === "GMT") return 0;
  const match = timeZoneName.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    throw new Error(`Unsupported time zone offset format: ${timeZoneName}`);
  }
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? "0");
  return sign * (hours * 60 + minutes);
}

function getOffsetMinutesAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const name = parts.find((p) => p.type === "timeZoneName")?.value;
  if (!name) {
    throw new Error(`Could not determine offset for time zone: ${timeZone}`);
  }
  return parseOffsetMinutes(name);
}

function zonedDateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);

  const year = Number(parts.find((p) => p.type === "year")?.value);
  const month = Number(parts.find((p) => p.type === "month")?.value);
  const day = Number(parts.find((p) => p.type === "day")?.value);
  if (!year || !month || !day) {
    throw new Error(`Could not compute day parts for time zone: ${timeZone}`);
  }
  return { year, month, day };
}

function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
) {
  // Start with naive UTC midnight and refine with zone offset.
  let guessMs = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  for (let i = 0; i < 3; i += 1) {
    const offsetMinutes = getOffsetMinutesAt(new Date(guessMs), timeZone);
    const refined = Date.UTC(year, month - 1, day, 0, 0, 0, 0) - offsetMinutes * 60_000;
    if (refined === guessMs) break;
    guessMs = refined;
  }
  return new Date(guessMs);
}

export function dayBoundsUtcForDate(date: Date, timeZone: string): DayBoundsUtc {
  const { year, month, day } = zonedDateParts(date, timeZone);
  const startUtc = zonedMidnightToUtc(year, month, day, timeZone);
  const endUtcExclusive = zonedMidnightToUtc(year, month, day + 1, timeZone);
  return { startUtc, endUtcExclusive };
}

export function dayBoundsUtcForYmd(dateYmd: string, timeZone: string): DayBoundsUtc {
  const m = dateYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) {
    throw new Error("date must be YYYY-MM-DD");
  }
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const startUtc = zonedMidnightToUtc(year, month, day, timeZone);
  const endUtcExclusive = zonedMidnightToUtc(year, month, day + 1, timeZone);
  return { startUtc, endUtcExclusive };
}

export function todayBoundsUtc(timeZone: string, now = new Date()): DayBoundsUtc {
  return dayBoundsUtcForDate(now, timeZone);
}
