/**
 * Lee el Excel «Liquidaciones por semana» de contabilidad (hojas RUTAS ANITA / RUTAS GABY).
 *
 * Cada bloque semanal trae: No., kiosco, período del inventario (del – al), quién de contabilidad lo revisa,
 * entrega de correcciones, fecha de liquidación y «facturas verdes». Entre bloques hay encabezados y notas sueltas
 * (descansos, vacaciones, cierres) que no se cargan pero se muestran.
 *
 * Todo es función pura sobre filas ya leídas (arreglos de celdas), para poder probarlo sin navegador.
 */

const pad = (n) => String(n).padStart(2, "0");
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Fecha de celda de Excel → "AAAA-MM-DD". Tolera el desfase de zona horaria de las fechas leídas. */
export function cellDateToYmd(value) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  const shifted = new Date(value.getTime() + 12 * 3600 * 1000);
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

const validDate = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
};

/**
 * Texto de fechas escrito a mano → lista de fechas.
 * "14, 15 y 16/01/2026", "17 AL 19/11/25", "12 Y 13/02/2026", "22/06 y 23/06/2026", "2 y 3/9/2026".
 * Devuelve [] si no se entiende (p. ej. el año mal escrito "10/08/206").
 */
export function parseDateText(text) {
  const s = String(text ?? "").toUpperCase();
  const matches = [...s.matchAll(/(\d{1,2})(?:\/(\d{1,2}))?(?:\/(\d{2,5}))?/g)];
  if (!matches.length) return [];
  const last = matches[matches.length - 1];
  if (!last[2] || !last[3]) return [];
  let year = parseInt(last[3], 10);
  if (last[3].length === 2) year += 2000;
  // Error de dedo frecuente: «206» por «2026».
  if (last[3].length === 3) {
    if (!last[3].startsWith("20")) return [];
    year = 2020 + parseInt(last[3][2], 10);
  }
  const finalMonth = parseInt(last[2], 10);
  const parts = matches.map((m) => ({
    day: parseInt(m[1], 10),
    month: m[2] ? parseInt(m[2], 10) : finalMonth,
  }));
  let days = parts;
  if (/\bAL\b/.test(s) && parts.length === 2 && parts[0].month === parts[1].month) {
    days = [];
    for (let d = parts[0].day; d <= parts[1].day; d += 1) days.push({ day: d, month: parts[0].month });
  }
  const out = days
    .filter((p) => validDate(year, p.month, p.day))
    .map((p) => ymd(year, p.month, p.day));
  return [...new Set(out)];
}

const isDigitCell = (v) => /^\d+$/.test(String(v ?? "").trim());
const text = (v) => (v == null ? "" : String(v).replace(/�/g, "Ú").trim());

const addDays = (value, n) => {
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const addYear = (value) => {
  const [y, m, d] = value.split("-").map(Number);
  return ymd(y + 1, m, d);
};

/**
 * @param sheets [{ name, rows }] con rows = arreglos de celdas (fechas como Date)
 * @returns {{ rows, notes, skipped }}
 */
export function parseLiquidationSheets(sheets) {
  const rows = [];
  const notes = [];
  const skipped = [];
  (sheets || []).forEach((sheet) => {
    let supervisor = /GABY/i.test(sheet.name) ? "GABRIELA MORALES" : /ANITA/i.test(sheet.name) ? "ANA ISABEL CON" : "";
    (sheet.rows || []).forEach((cells, index) => {
      const rowNumber = index + 1;
      const [no, name, from, to, accountant, corrections, liquidation, green] = cells;
      const b = text(name);
      const c = text(from);

      // Encabezados del bloque: «ANA ISABEL CON» / «GABRIELA MORALES» en la columna C.
      if (!isDigitCell(no) && !b && /(CON|MORALES)$/i.test(c)) {
        supervisor = c;
        return;
      }
      // Es fila de datos si lleva número, o si trae kiosco y una fecha de período (algunas filas no tienen número).
      const isData = isDigitCell(no) || (b && (from instanceof Date || to instanceof Date));
      if (!isData) {
        if (b && !/^(NOMBRE|REPORTES|LIQUIDAR|LIQUIDACIONES)/i.test(b)) {
          notes.push({ sheet: sheet.name, row: rowNumber, text: [b, c].filter(Boolean).join(" · ") });
        }
        return;
      }

      const periodFrom = cellDateToYmd(from);
      let periodTo = cellDateToYmd(to);
      if (!b) return;
      if (!periodTo) {
        const parsed = parseDateText(to);
        periodTo = parsed.length ? parsed[parsed.length - 1] : null;
      }
      if (!periodTo) {
        skipped.push({ sheet: sheet.name, row: rowNumber, kiosk: b, reason: "Sin fecha de conteo (columna «al»)." });
        return;
      }

      const correctionsDue = cellDateToYmd(corrections) || parseDateText(corrections)[0] || null;
      let liquidationDates = cellDateToYmd(liquidation) ? [cellDateToYmd(liquidation)] : parseDateText(liquidation);
      let fixedYear = false;
      const fixedFirst = liquidationDates.length ? addYear(liquidationDates[0]) : null;
      if (fixedFirst && liquidationDates[0] < periodTo && fixedFirst >= periodTo && fixedFirst <= addDays(periodTo, 120)) {
        liquidationDates = liquidationDates.map(addYear);
        fixedYear = true;
      }
      rows.push({
        sheetSupervisor: supervisor,
        kioskName: b.replace(/\s+/g, " "),
        periodFrom,
        periodTo,
        accountant: text(accountant).replace(/\s+/g, " ") || null,
        correctionsDue,
        liquidationDates,
        greenNote: text(green) || null,
        sourceRow: rowNumber,
        fixedYear,
      });
    });
  });
  return { rows, notes, skipped };
}
