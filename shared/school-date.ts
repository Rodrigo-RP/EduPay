/**
 * Business calendar of the school. Keep the zone here so campus configuration
 * can replace it later without changing financial callers or SQL expressions.
 * A date-only string is already a calendar date, not an instant.
 */
export const SCHOOL_TIME_ZONE = "America/Mexico_City";

export function schoolDate(value: Date | string | number = new Date()): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** SQL fragments accept trusted SQL expressions only, never request input. */
export function schoolTodaySQL(clock = "NOW()"): string {
  return `(${clock} AT TIME ZONE '${SCHOOL_TIME_ZONE}')::date`;
}

/** Legacy timestamp WITHOUT time zone columns contain UTC instants. */
export function schoolDateSQL(utcTimestamp: string): string {
  return `(${utcTimestamp} AT TIME ZONE 'UTC' AT TIME ZONE '${SCHOOL_TIME_ZONE}')::date`;
}

export const SCHOOL_TODAY_SQL = schoolTodaySQL();
