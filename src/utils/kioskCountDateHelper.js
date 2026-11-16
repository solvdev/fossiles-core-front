/** Fechas «AAAA-MM-DD» del calendario de conteos, sin depender de la zona horaria del navegador. */

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
export const key = (value) => String(value).slice(0, 10);

export const parseYmd = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
export const toYmd = (date) => ymd(date.getFullYear(), date.getMonth() + 1, date.getDate());
export const addDays = (value, n) => {
  const date = parseYmd(value);
  date.setDate(date.getDate() + n);
  return toYmd(date);
};
export const mondayOf = (value) => addDays(value, -((parseYmd(value).getDay() + 6) % 7));
/** El mes de una semana es el de su jueves (así cada semana pertenece a un solo mes). */
export const monthOfWeek = (weekStart) => addDays(weekStart, 3).slice(0, 7);
export const monthTitle = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
};
export const formatShort = (value) =>
  value ? parseYmd(value).toLocaleDateString("es-GT", { day: "numeric", month: "short" }) : "—";
export const formatLong = (value) =>
  value
    ? parseYmd(value).toLocaleDateString("es-GT", { weekday: "long", day: "numeric", month: "long" })
    : "—";
export const formatDmy = (value) => {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};
/** «7 al 11 de diciembre» (o «28 de diciembre al 1 de enero»). */
export const weekRange = (weekStart, lastDay = 4) => {
  const a = parseYmd(weekStart);
  const b = parseYmd(addDays(weekStart, lastDay));
  const mb = b.toLocaleDateString("es-GT", { month: "long" });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()} al ${b.getDate()} de ${mb}`
    : `${a.getDate()} de ${a.toLocaleDateString("es-GT", { month: "long" })} al ${b.getDate()} de ${mb}`;
};
