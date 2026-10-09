/**
 * Datos de prueba del 'Mapa de calor de kioscos' (respuesta de GET /dashboard/kiosks/heatmap según el Addendum 3 de
 * docs/SALES-DASHBOARD-CONTRACT.md). Solo los usan las pruebas; no se importa desde la app.
 */

const pad = (n) => String(n).padStart(2, "0");

/** ['2026-09-01', ...] desde `start` (yyyy-MM-dd) durante `count` días. */
export const rangeOf = (start, count) => {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1, d + i));
    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  });
};

/** Lunes = 0 ... domingo = 6. */
export const weekdayOf = (ymd) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
};

/** Sitio del backend con un monto por día de la semana [lun ... dom] que se repite todos los días del rango. */
export const siteByWeekday = (days, perWeekday, extra = {}) => {
  const daily = days.map((d) => perWeekday[weekdayOf(d)]);
  const total = daily.reduce((a, v) => a + v, 0);
  return {
    siteId: 1,
    name: "Kiosco",
    category: null,
    locationId: 10,
    source: "POS",
    total,
    previousTotal: 0,
    growthPercent: 0,
    daysWithSales: daily.filter((v) => v > 0).length,
    daily,
    ...extra,
  };
};

/** Septiembre de 2026: el 1 cae martes (lunes 4, martes 5, miércoles 5, jueves 4, viernes 4, sábado 4, domingo 4). */
export const SEPT = rangeOf("2026-09-01", 30);

/**
 * Cinco sitios (a propósito desordenados; el modelo los ordena A, B, C y sin clasificar):
 *  - Centro  Cat. A  Q 5,000  mejor día viernes   (periodo anterior Q 4,000: +25 %)
 *  - Norte   Cat. A  Q 2,500  mejor día viernes   (anterior Q 3,000: -16.7 %)
 *  - Sur     Cat. B  Q 1,260  mejor día viernes   (anterior Q 1,200: +5 %)
 *  - Cerrado Cat. C  Q 0      sin venta           (anterior Q 5,000: -100 %)
 *  - Plaza   sin clasificar  Q 920  mejor día sábado, sin periodo anterior (el backend manda 100 %)
 * Total de la red: Q 9,680 (anterior Q 13,200).
 */
export const septemberResponse = () => ({
  startDate: "2026-09-01",
  endDate: "2026-09-30",
  previousStartDate: "2026-08-02",
  previousEndDate: "2026-08-31",
  days: SEPT,
  sites: [
    siteByWeekday(SEPT, [20, 20, 20, 20, 20, 80, 40], { siteId: 4, name: "Plaza", category: null, previousTotal: 0, growthPercent: 100 }),
    siteByWeekday(SEPT, [50, 50, 50, 50, 250, 150, 0], { siteId: 2, name: "Norte", category: "A", previousTotal: 3000, growthPercent: -16.7 }),
    siteByWeekday(SEPT, [0, 0, 0, 0, 0, 0, 0], { siteId: 5, name: "Cerrado", category: "C", previousTotal: 5000, growthPercent: -100 }),
    siteByWeekday(SEPT, [100, 100, 100, 100, 500, 300, 0], { siteId: 1, name: "Centro", category: "A", previousTotal: 4000, growthPercent: 25 }),
    siteByWeekday(SEPT, [30, 30, 30, 30, 90, 60, 30], { siteId: 3, name: "Sur", category: "B", previousTotal: 1200, growthPercent: 5 }),
  ],
  categories: [
    { category: "A", kioskCount: 2, total: 7500, previousTotal: 7000, growthPercent: 7.1, sharePercent: 77.5 },
    { category: "B", kioskCount: 1, total: 1260, previousTotal: 1200, growthPercent: 5, sharePercent: 13 },
    { category: "C", kioskCount: 1, total: 0, previousTotal: 5000, growthPercent: -100, sharePercent: 0 },
    { category: null, kioskCount: 1, total: 920, previousTotal: 0, growthPercent: 100, sharePercent: 9.5 },
  ],
});

/** Misma red pero sin la Cat. C (para probar filtros sin kioscos). */
export const septemberWithoutC = () => {
  const response = septemberResponse();
  return {
    ...response,
    sites: response.sites.filter((s) => s.category !== "C"),
    categories: response.categories.filter((c) => c.category !== "C"),
  };
};

/** Serie diaria de /dashboard/kiosks (DailyPoint[]) del total de la red de `septemberResponse`. */
export const septemberDailySeries = () => {
  const response = septemberResponse();
  return SEPT.map((date, i) => ({
    date,
    amount: response.sites.reduce((acc, s) => acc + s.daily[i], 0),
    count: 3,
  }));
};
