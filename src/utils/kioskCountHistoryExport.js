import * as XLSX from "xlsx-js-style";

/**
 * «Reporte de inventarios kioscos»: historial de conteos cerrados, un bloque por mes o semana, con el formato de la
 * hoja que usan las supervisoras. La pantalla y el Excel salen del mismo modelo (buildBlocks).
 */

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const MONTH_COLORS = ["00B0F0", "A9D08E"];
const NUMBER_WORDS = ["NINGUNA", "UNA", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE", "DIEZ"];
export const HISTORY_HEADERS = ["NO", "NOMBRE", "FECHA DEL", "FECHA AL", "PAPELERIA DE", "CONTABILIDAD", "FECHA DE ENTREGA", "FECHA DE LIQUIDACION", "OBSERVACIONES"];

const ymd = (value) => (value ? String(value).slice(0, 10) : "");
const utc = (value) => {
  const [y, m, d] = ymd(value).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
export const plusDays = (value, days) => {
  const date = utc(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};
export const mondayOfDate = (value) => plusDays(value, -((utc(value).getUTCDay() + 6) % 7));
export const shortDate = (value) => (value ? `${Number(ymd(value).slice(8))}/${ymd(value).slice(5, 7)}/${ymd(value).slice(0, 4)}` : "");
/* «round»: el mes va del 13 al 12 del siguiente, como en la hoja (septiembre = 13/09 al 12/10). */
export const monthKey = (value, cut) => (cut === "round" ? plusDays(value, -12) : ymd(value)).slice(0, 7);
export const monthLabel = (key, withYear) => `${MONTHS[Number(key.slice(5)) - 1]}${withYear ? ` ${key.slice(0, 4)}` : ""}`;
const colorOfMonth = (key) => MONTH_COLORS[(Number(key.slice(5)) + 1) % 2];

function accountantText(name) {
  return String(name || "")
    .split(/\s+y\s+/i)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter(Boolean)
    .join(" Y ")
    .toUpperCase();
}

function observationText(row) {
  const notes = String(row.notes || "").replace(/\s+/g, " ").trim();
  if (notes) return notes.toUpperCase();
  if (row.areasToFix == null) return "";
  const amount = NUMBER_WORDS[row.areasToFix] || String(row.areasToFix);
  return `${amount} ${row.areasToFix <= 1 ? "AREA" : "AREAS"} PARA CORREGIR`;
}

/** Conteos cerrados filtrados y agrupados por supervisora y por mes o semana (según la fecha «al»). */
export function buildBlocks(rows, filter) {
  const wanted = rows.filter((r) => {
    if (filter.supervisorId && r.supervisorUserId !== filter.supervisorId) return false;
    const to = ymd(r.periodTo);
    if (filter.mode === "month") return monthKey(to, filter.cut) === filter.month;
    if (filter.mode === "week") return mondayOfDate(to) === filter.week;
    return (!filter.from || to >= filter.from) && (!filter.until || to <= filter.until);
  });
  const groups = new Map();
  [...wanted]
    .sort((a, b) => ymd(a.periodTo).localeCompare(ymd(b.periodTo)) || a.locationName.localeCompare(b.locationName))
    .forEach((r) => {
      const week = filter.mode === "week";
      const key = week ? mondayOfDate(r.periodTo) : monthKey(r.periodTo, filter.cut);
      if (!groups.has(r.supervisorName)) groups.set(r.supervisorName, new Map());
      const blocks = groups.get(r.supervisorName);
      if (!blocks.has(key)) {
        blocks.set(key, {
          key,
          title: week ? `SEMANA DEL ${shortDate(key)} AL ${shortDate(plusDays(key, 6))}` : monthLabel(key, filter.mode === "range"),
          color: colorOfMonth(week ? key.slice(0, 7) : key),
          rows: [],
        });
      }
      const block = blocks.get(key);
      // La anotación va una sola vez por kiosco en cada bloque.
      const twice = r.twiceAMonth && !block.rows.some((x) => x.twice && x.name === r.locationName.toUpperCase());
      block.rows.push({
        name: r.locationName.toUpperCase(),
        from: ymd(r.periodFrom),
        to: ymd(r.periodTo),
        accountant: accountantText(r.accountant),
        delivery: ymd(r.deliveryDate),
        liquidation: ymd(r.liquidationDate),
        notes: observationText(r),
        twice,
      });
    });
  return [...groups.keys()]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      supervisor: name.toUpperCase(),
      blocks: [...groups.get(name).values()].sort((a, b) => a.key.localeCompare(b.key)),
    }));
}

const font = { name: "Calibri", sz: 11, color: { rgb: "000000" } };
const side = (style) => ({ style, color: { rgb: "000000" } });

function cell(value, o = {}) {
  const s = {
    font: { ...font, bold: Boolean(o.bold), ...(o.font || {}) },
    alignment: { horizontal: o.align, vertical: "center", wrapText: Boolean(o.wrap) },
  };
  if (o.fill) s.fill = { patternType: "solid", fgColor: { rgb: o.fill } };
  if (o.border) s.border = o.border;
  return { v: value ?? "", t: "s", s };
}

function dateCell(value, o) {
  const c = cell("", { ...o, align: "right" });
  if (value) {
    c.t = "n";
    c.v = (utc(value).getTime() - Date.UTC(1899, 11, 30)) / 86400000;
    c.s.numFmt = "d/mm/yyyy";
  }
  return c;
}

const edge = (col, top = "thin", bottom = "thin") => ({
  left: side(col === 0 ? "medium" : "thin"),
  right: side(col === HISTORY_HEADERS.length - 1 ? "medium" : "thin"),
  top: side(top),
  bottom: side(bottom),
});

function buildSheet(group) {
  const cells = [];
  const merges = [];
  const heights = [];
  const put = (r, c, value) => {
    cells[r] = cells[r] || [];
    cells[r][c] = value;
  };
  let r = 0;
  group.blocks.forEach((block) => {
    put(r, 1, cell("REPORTES DE INVENTARIOS KIOSCOS", { bold: true, font: { sz: 15, color: { rgb: "1F4E78" } } }));
    put(r, 8, cell(block.title, { bold: true, align: "center", fill: block.color }));
    heights[r] = 24;
    put(r + 1, 0, cell("SUPERVISORA:"));
    put(r + 1, 2, cell(group.supervisor, { bold: true }));
    r += 2;
    HISTORY_HEADERS.forEach((header, c) =>
      put(r, c, cell(header, { bold: true, align: "center", wrap: true, fill: "9BC2E6", border: edge(c, "medium", "double") }))
    );
    heights[r] = 32;
    r += 1;
    block.rows.forEach((row, i) => {
      const at = (c, extra) => ({ border: edge(c), fill: block.color, ...extra });
      put(r, 0, cell(String(i + 1), at(0, { align: "center" })));
      put(r, 1, cell(row.name, at(1)));
      put(r, 2, dateCell(row.from, at(2)));
      put(r, 3, dateCell(row.to, at(3)));
      put(r, 4, cell("", at(4)));
      put(r, 5, cell(row.accountant, at(5, { bold: true })));
      put(r, 6, dateCell(row.delivery, at(6)));
      put(r, 7, dateCell(row.liquidation, at(7)));
      put(r, 8, cell(row.notes, at(8, { bold: true, align: "center", wrap: true })));
      if (row.twice) put(r, 9, cell("CADA 15 DIAS"));
      heights[r] = Math.max(16, 15 * Math.ceil((row.notes || " ").length / 40) + 1);
      r += 1;
    });
    for (let c = 0; c < HISTORY_HEADERS.length; c += 1) put(r, c, cell("", { border: edge(c, "thin", "medium") }));
    r += 3;
  });
  const aoa = Array.from({ length: cells.length }, (_, i) => Array.from({ length: 10 }, (__, c) => cells[i]?.[c] || null));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [4, 27, 12, 11, 12, 15, 14, 14, 43, 15].map((wch) => ({ wch }));
  ws["!rows"] = aoa.map((_, i) => (heights[i] ? { hpt: heights[i] } : {}));
  ws["!merges"] = merges;
  return ws;
}

/** Descarga lo que se ve en pantalla: una hoja por supervisora. */
export function downloadCountHistoryExcel(model, fileSuffix) {
  const wb = XLSX.utils.book_new();
  const used = new Set();
  model.forEach((group) => {
    const base = `HISTORIAL ${group.supervisor.split(" ")[0]}`.replace(/[\\/?*[\]:]/g, "").slice(0, 28);
    let name = base;
    for (let n = 2; used.has(name); n += 1) name = `${base} ${n}`;
    used.add(name);
    XLSX.utils.book_append_sheet(wb, buildSheet(group), name);
  });
  if (!used.size) throw new Error("No hay conteos cerrados para descargar.");
  XLSX.writeFile(wb, `historial-conteos-${fileSuffix}.xlsx`);
}
