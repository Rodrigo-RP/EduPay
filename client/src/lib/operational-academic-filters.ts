export function matchesAcademicContext(
  row: { ciclo_escolar?: string | null; nivel_escolar?: string | null },
  ciclo: string,
  nivel: string,
) {
  return row.ciclo_escolar === ciclo &&
    (nivel === "all" || row.nivel_escolar?.trim().toUpperCase() === nivel.trim().toUpperCase());
}

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** Rangos inclusivos, con semana de lunes a domingo y ciclo de agosto a julio. */
export function paymentPeriodRange(periodo: string, ciclo: string, now = new Date()) {
  if (periodo === "ciclo") {
    const year = Number(ciclo.split("-")[0]);
    return { from: `${year}-08-01`, to: `${year + 1}-07-31` };
  }
  if (periodo === "hoy") return { from: dateKey(now), to: dateKey(now) };
  if (periodo === "semana") {
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: dateKey(monday), to: dateKey(sunday) };
  }
  return {
    from: dateKey(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateKey(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

/** Usa la fecha original, nunca la cadena localizada que se presenta en la tabla. */
export function matchesPaymentDate(
  fecha: string | null | undefined,
  range: { from: string; to: string },
  dateFrom = "",
  dateTo = "",
) {
  if (!fecha) return false;
  const date = new Date(fecha);
  if (Number.isNaN(date.getTime())) return false;
  const key = dateKey(date);
  return key >= range.from && key <= range.to &&
    (!dateFrom || key >= dateFrom) && (!dateTo || key <= dateTo);
}
