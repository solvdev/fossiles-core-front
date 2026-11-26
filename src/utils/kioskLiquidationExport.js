import * as XLSX from "xlsx-js-style";

/**
 * Excel «Liquidaciones por semana» con el mismo formato del libro que usa contabilidad: una hoja por supervisora y,
 * en cada hoja, un bloque por semana (No., nombre, período del inventario, contabilidad, entrega de correcciones,
 * fecha de liquidación y facturas verdes).
 */

const BLACK = "000000";
const TITLE_RED = "FF0000";
const DARK_BLUE = "1F4E78";
const HEADER_BLUE = "9DC3E6";
const GREEN = "548235";
const COLUMNS = 8; // A..H
const NUMBER_WORDS = ["", "UNA", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ"];

const calibri = { name: "Calibri", sz: 11, color: { rgb: BLACK } };
const side = (style) => ({ style, color: { rgb: BLACK } });

const parseYmd = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const toYmd = (date) => date.toISOString().slice(0, 10);
const addDays = (value, days) => {
  const date = parseYmd(value);
  date.setUTCDate(date.getUTCDate() + days);
  return toYmd(date);
};
const monday = (value) => addDays(value, -((parseYmd(value).getUTCDay() + 6) % 7));
/** Número de serie de Excel: la celda queda como fecha de verdad (se puede ordenar y filtrar). */
const serial = (value) => (parseYmd(value).getTime() - Date.UTC(1899, 11, 30)) / 86400000;
const dd = (value) => String(value).slice(8, 10);
const mm = (value) => String(value).slice(5, 7);
const yyyy = (value) => String(value).slice(0, 4);

function weekTitle(from, to) {
  let start = dd(from);
  if (yyyy(from) !== yyyy(to)) start = `${dd(from)}/${mm(from)}/${yyyy(from)}`;
  else if (mm(from) !== mm(to)) start = `${dd(from)}/${mm(from)}`;
  return `LIQUIDAR DE LA SEMANA DEL ${start} AL ${dd(to)}/${mm(to)}/${yyyy(to)}`;
}

const firstName = (name) => String(name || "").trim().split(/\s+/)[0].toUpperCase();

function accountantText(row) {
  if (row.accountants?.length) return row.accountants.map((a) => firstName(a.name)).join(" Y ");
  if (row.accountant) return row.accountant.toUpperCase();
  return firstName(row.closedBy || row.reviewedBy);
}

function greenText(row) {
  // Manda lo que contabilidad anotó al revisar el conteo físico.
  const notes = String(row.countNotes || "").replace(/\s+/g, " ").trim();
  if (notes) return notes.toUpperCase();
  if (row.areasToFix == null) return String(row.greenNote || "").toUpperCase();
  if (row.areasToFix === 0) return "NO TIENE AREAS PARA CORREGIR";
  const amount = NUMBER_WORDS[row.areasToFix] || String(row.areasToFix);
  return `${amount} ${row.areasToFix === 1 ? "AREA" : "AREAS"} PARA CORREGIR`;
}

/** Con varios días: «14, 15 Y 16/01/2026», como lo escriben en el libro. */
function severalDays(row) {
  const days = Array.from({ length: row.liquidationDays }, (_, i) => addDays(row.liquidationDate, i));
  const last = days[days.length - 1];
  const sameMonth = days.every((d) => d.slice(0, 7) === last.slice(0, 7));
  const parts = days.slice(0, -1).map((d) => (sameMonth ? dd(d) : `${dd(d)}/${mm(d)}`));
  return `${parts.join(", ")} Y ${dd(last)}/${mm(last)}/${yyyy(last)}`;
}

function textCell(value, { bold, align, border, fill, wrap = true, font, valign = "center" } = {}) {
  return {
    v: value ?? "",
    t: "s",
    s: {
      font: font || { ...calibri, bold: Boolean(bold) },
      alignment: { vertical: valign, horizontal: align, wrapText: wrap },
      ...(border ? { border } : {}),
      ...(fill ? { fill: { patternType: "solid", fgColor: { rgb: fill } } } : {}),
    },
  };
}

function dateCell(value, options = {}) {
  const cell = textCell("", { align: "right", ...options });
  if (!value) return cell;
  cell.t = "n";
  cell.v = serial(value);
  cell.s.numFmt = "m/d/yy";
  return cell;
}

/** Bordes del bloque: doble por fuera y bajo el encabezado, fino por dentro. */
const blockBorder = (col, { top = "thin", bottom = "thin" } = {}) => ({
  left: side(col === 0 ? "double" : "thin"),
  right: side(col === COLUMNS - 1 ? "double" : "thin"),
  top: side(top),
  bottom: side(bottom),
});

function buildSheet({ year, supervisorName, rows, nonWorkingDays }) {
  const cells = [];
  const merges = [];
  const heights = [];
  const put = (r, c, cell) => {
    cells[r] = cells[r] || [];
    cells[r][c] = cell;
  };
  const merge = (r1, c1, r2, c2) => merges.push({ s: { r: r1, c: c1 }, e: { r: r2, c: c2 } });

  const titleStyle = { font: { ...calibri, sz: 24, bold: true, color: { rgb: TITLE_RED } }, align: "center", fill: BLACK, wrap: false };
  for (let c = 1; c < COLUMNS; c += 1) put(0, c, textCell(c === 1 ? `LIQUIDACIONES POR SEMANA ${year}` : "", titleStyle));
  merge(0, 1, 0, COLUMNS - 1);
  heights[0] = 32;

  const weeks = new Map();
  rows.forEach((row) => {
    const week = monday(row.liquidationDate);
    if (!weeks.has(week)) weeks.set(week, []);
    weeks.get(week).push(row);
  });

  let r = 2;
  [...weeks.keys()].sort().forEach((week) => {
    const items = weeks.get(week).map((row) => ({ date: String(row.liquidationDate).slice(0, 10), row }));
    // Los asuetos de la semana van en su propia línea, como en el libro.
    (nonWorkingDays || []).forEach((day) => {
      const date = String(day.date).slice(0, 10);
      const weekday = parseYmd(date).getUTCDay();
      if (monday(date) === week && weekday !== 0 && weekday !== 6 && !items.some((i) => i.date === date)) {
        items.push({ date, holiday: day.reason });
      }
    });
    items.sort((a, b) => a.date.localeCompare(b.date));

    let end = addDays(week, 4);
    items.forEach((item) => {
      if (item.date > end) end = item.date;
    });

    const headingFont = { name: "Arial Black", sz: 16, color: { rgb: DARK_BLUE } };
    put(r, 1, textCell("REPORTES DE INVENTARIOS KIOSCOS", { font: headingFont, wrap: false }));
    put(r + 1, 1, textCell(weekTitle(week, end), { font: headingFont, wrap: false }));
    put(r + 2, 2, textCell(supervisorName.toUpperCase(), { font: { name: "Arial Black", sz: 11, bold: true, color: { rgb: BLACK } }, wrap: false }));
    heights[r] = 24.75;
    heights[r + 1] = 24.75;
    heights[r + 2] = 19.5;
    r += 3;

    const top = ["No.", "NOMBRE", "FECHA", "", "CONTABILIDAD", "FECHA ENTREGA\nDE CORRECCIONES DE CONTABILIDAD", "FECHA DE\nLIQUIDACION: SUPERVISION DE VENTAS", "FACTURAS VERDES"];
    const bottom = ["", "", "DEL", "AL", "", "", "", ""];
    const header = { bold: true, align: "center", fill: HEADER_BLUE };
    for (let c = 0; c < COLUMNS; c += 1) {
      put(r, c, textCell(top[c], { ...header, border: blockBorder(c, { top: "double" }) }));
      put(r + 1, c, textCell(bottom[c], { ...header, border: blockBorder(c, { bottom: "double" }) }));
    }
    [0, 1, 4, 5, 6, 7].forEach((c) => merge(r, c, r + 1, c));
    merge(r, 2, r, 3);
    heights[r] = 24;
    heights[r + 1] = 24;
    r += 2;

    items.forEach((item, i) => {
      const at = (c) => ({ border: blockBorder(c, { top: i === 0 ? "double" : "thin" }) });
      put(r, 0, textCell(i + 1, { ...at(0), bold: true, align: "center" }));
      if (item.holiday) {
        for (let c = 1; c < COLUMNS; c += 1) {
          put(r, c, textCell(c === 1 ? `ASUETO ${item.holiday.toUpperCase()}` : "", { ...at(c), bold: true, align: "center" }));
        }
        merge(r, 1, r, COLUMNS - 1);
      } else {
        const { row } = item;
        const revisit = row.source === "REVISIT" ? " (REVISITA)" : "";
        put(r, 1, textCell(`${row.locationName.toUpperCase()}${revisit}`, at(1)));
        put(r, 2, dateCell(row.periodFrom, at(2)));
        put(r, 3, dateCell(row.periodTo, at(3)));
        put(r, 4, textCell(accountantText(row), { ...at(4), bold: true }));
        put(r, 5, dateCell(row.correctionsDue, { ...at(5), fill: row.correctionsDue ? GREEN : undefined }));
        put(r, 6, row.liquidationDays > 1 ? textCell(severalDays(row), { ...at(6), align: "right" }) : dateCell(row.liquidationDate, at(6)));
        put(r, 7, textCell(greenText(row), { ...at(7), bold: true, align: "center" }));
      }
      // Las notas largas del conteo ocupan varias líneas: la fila crece para que no se corten.
      const lines = item.holiday ? 1 : Math.ceil(greenText(item.row).length / 32);
      heights[r] = Math.max(20, 15 * lines + 4);
      r += 1;
    });

    // Línea en blanco que cierra el bloque.
    for (let c = 0; c < COLUMNS; c += 1) put(r, c, textCell("", { border: blockBorder(c, { bottom: "double" }) }));
    r += 3;
  });

  if (!weeks.size) put(2, 1, textCell("Sin liquidaciones registradas.", { wrap: false }));

  const aoa = Array.from({ length: cells.length }, (_, i) => Array.from({ length: COLUMNS }, (__, c) => cells[i]?.[c] || null));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [4.5, 28, 14, 13, 17, 27, 23, 34].map((wch) => ({ wch }));
  ws["!rows"] = Array.from({ length: aoa.length }, (_, i) => (heights[i] ? { hpt: heights[i] } : {}));
  ws["!merges"] = merges;
  ws["!pageSetup"] = { orientation: "landscape" };
  return ws;
}

export function buildLiquidationWorkbook({ year, groups, nonWorkingDays }) {
  const wb = XLSX.utils.book_new();
  const withRows = groups.filter((g) => g.rows.length);
  const used = new Set();
  (withRows.length ? withRows : groups).forEach((group) => {
    const base = `RUTAS ${firstName(group.supervisorName) || "SUPERVISORA"} ${year}`.replace(/[\\/?*[\]:]/g, "").slice(0, 28);
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, buildSheet({ year, supervisorName: group.supervisorName, rows: group.rows, nonWorkingDays }), name);
  });
  return wb;
}

/** Descarga el libro; con {@code fileSuffix} se nombra el archivo (año o semana). */
export function downloadLiquidationExcel({ year, groups, nonWorkingDays, fileSuffix, fileName = "liquidaciones-kioscos" }) {
  if (!groups.some((g) => g.rows.length)) {
    throw new Error("No hay liquidaciones para descargar.");
  }
  XLSX.writeFile(buildLiquidationWorkbook({ year, groups, nonWorkingDays }), `${fileName}-${fileSuffix || year}.xlsx`);
}
