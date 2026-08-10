/** Ventana de almuerzo del centro de producción (hora local del startDate). */
export const LUNCH_START_MINUTES = 13 * 60;
export const LUNCH_END_MINUTES = 14 * 60;

/**
 * Formatea duración de producción desde horas decimales.
 * ≥ 60 min → horas (`1h`, `1h 30m`); &lt; 60 min → solo minutos (`45 min`).
 */
export function formatProductionDuration(hours) {
  const totalMin = Math.round(Number(hours) * 60);
  if (!Number.isFinite(totalMin)) return "—";
  if (totalMin <= 0) return "0 min";
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Suma horas de trabajo a un inicio, saltando el almuerzo 13:00–14:00.
 * Si el cursor cae dentro del almuerzo, avanza a las 14:00 antes de seguir.
 */
export function addWorkDurationSkippingLunch(startDate, hours) {
  if (startDate == null) return null;
  const cursor = startDate instanceof Date ? new Date(startDate.getTime()) : new Date(startDate);
  if (Number.isNaN(cursor.getTime())) return null;

  const workMinutes = Math.round(Number(hours) * 60);
  if (!Number.isFinite(workMinutes) || workMinutes <= 0) return cursor;

  let remaining = workMinutes;

  while (remaining > 0) {
    const minutesOfDay = cursor.getHours() * 60 + cursor.getMinutes();

    if (minutesOfDay >= LUNCH_START_MINUTES && minutesOfDay < LUNCH_END_MINUTES) {
      cursor.setHours(14, 0, 0, 0);
      continue;
    }

    const segmentMinutes =
      minutesOfDay < LUNCH_START_MINUTES
        ? LUNCH_START_MINUTES - minutesOfDay
        : 24 * 60 - minutesOfDay + LUNCH_START_MINUTES;

    if (remaining <= segmentMinutes) {
      cursor.setTime(cursor.getTime() + remaining * 60 * 1000);
      remaining = 0;
    } else {
      remaining -= segmentMinutes;
      cursor.setTime(cursor.getTime() + segmentMinutes * 60 * 1000);
      cursor.setHours(14, 0, 0, 0);
    }
  }

  return cursor;
}
