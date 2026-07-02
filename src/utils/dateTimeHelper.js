const GT_LOCALE = "es-GT";
const GT_TIME_ZONE = "America/Guatemala";
/** America/Guatemala no tiene horario de verano: siempre UTC-6. */
const GT_UTC_OFFSET_HOURS = 6;

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
/** LocalDateTime de Java serializado por Jackson (sin offset), ej. "2026-07-01T11:26:00.123". */
const DATE_TIME_NO_ZONE_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/;

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  if (DATE_ONLY_REGEX.test(text)) {
    const [year, month, day] = text.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  }
  // El backend envía LocalDateTime sin offset, ya en hora Guatemala. Sin esto, el navegador
  // lo interpretaría como su propia hora local, dando resultados incorrectos si el dispositivo
  // no está configurado en zona Guatemala.
  const noZoneMatch = DATE_TIME_NO_ZONE_REGEX.exec(text);
  if (noZoneMatch) {
    const [, year, month, day, hour, minute, second] = noZoneMatch;
    return new Date(Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour) + GT_UTC_OFFSET_HOURS,
      Number(minute),
      Math.trunc(Number(second || 0))
    ));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatDateTimeGt = (value, options = {}) => {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(GT_LOCALE, {
    timeZone: GT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  }).format(date);
};

export const formatDateGt = (value, options = {}) => {
  const date = toDate(value);
  if (!date) return "-";
  return new Intl.DateTimeFormat(GT_LOCALE, {
    timeZone: GT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...options,
  }).format(date);
};

/** dd-mm-yy en zona América/Guatemala; cadena vacía si no hay fecha válida */
export const formatDateDdMmYyGt = (value) => {
  const date = toDate(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat(GT_LOCALE, {
    timeZone: GT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const year = parts.find((p) => p.type === "year")?.value;
  if (!day || !month || !year) return "";
  return `${day}-${month}-${year}`;
};

export const formatNowGt = () => formatDateTimeGt(new Date());

/** Fecha local de trabajo en Guatemala (YYYY-MM-DD), alineada a `scheduledDate` del API. */
export const getTodayYmdGuatemala = () =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: GT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** Primer día del mes actual en Guatemala (YYYY-MM-DD). */
export const getMonthStartYmdGuatemala = () => {
  const today = getTodayYmdGuatemala();
  return `${today.slice(0, 7)}-01`;
};
