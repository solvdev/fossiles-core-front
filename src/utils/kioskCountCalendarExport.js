import * as XLSX from "xlsx-js-style";

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const STATUS_LABEL = { PLANNED: "Pendiente", DONE: "Hecha", CANCELLED: "Cancelada" };

const REGION_FILL = {
  METROPOLITANA: "DBEAFE",
  CENTRAL: "EDE9FE",
  OCCIDENTE: "D1FAE5",
  SUR: "FFEDD5",
  ORIENTE: "FCE7F3",
  NORTE: "CFFAFE",
};

const base = { name: "Calibri", sz: 10, color: { rgb: "000000" } };
const border = { style: "thin", color: { rgb: "CBD5E1" } };
const allBorders = { top: border, bottom: border, left: border, right: border };

const parseYmd = (value) => {
  const [y, m, d] = String(value).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
};
const dmy = (value) => {
  if (!value) return "";
  const [y, m, d] = String(value).slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

const text = (value, style = {}) => ({
  v: value ?? "",
  t: "s",
  s: { font: base, border: allBorders, alignment: { vertical: "center", wrapText: true }, ...style },
});
const head = (value) =>
  text(value, {
    font: { ...base, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1E3A8A" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
  });

function sheetFrom(title, subtitle, header, rows, widths) {
  const aoa = [
    [{ v: title, t: "s", s: { font: { ...base, bold: true, sz: 14 } } }],
    [{ v: subtitle, t: "s", s: { font: { ...base, color: { rgb: "64748B" } } } }],
    [],
    header.map(head),
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = widths.map((wch) => ({ wch }));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: header.length - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: header.length - 1 } },
  ];
  ws["!freeze"] = { xSplit: 0, ySplit: 4 };
  ws["!views"] = [{ state: "frozen", ySplit: 4 }];
  return ws;
}

/**
 * Excel con la ruta (una fila por día de visita) y un resumen por kiosco.
 * @param periodLabel texto del período, p. ej. "Semana del 7 al 11 de diciembre 2026" o "Diciembre 2026"
 * @param fileSuffix  sufijo del archivo, p. ej. "2026-12-07" (semana) o "2026-12" (mes)
 */
export function downloadKioskCountCalendarExcel({ periodLabel, fileSuffix, visits, supervisorLabel }) {
  const monthLabel = periodLabel;
  const subtitle = `Confidencial · ${supervisorLabel || "Todas las supervisoras"}`;
  const sorted = [...visits].sort(
    (a, b) =>
      String(a.visitDate).localeCompare(String(b.visitDate)) ||
      String(a.supervisorName).localeCompare(String(b.supervisorName))
  );

  const routeRows = sorted.map((v) => {
    const fill = { fill: { fgColor: { rgb: REGION_FILL[v.region] || "F1F5F9" } } };
    const done = v.status === "DONE" || Boolean(v.countedOn);
    return [
      text(dmy(v.visitDate), { alignment: { horizontal: "center", vertical: "center" } }),
      text(DAY_NAMES[parseYmd(v.visitDate).getDay()]),
      text(v.locationName, { font: { ...base, bold: true } }),
      text(v.kind === "REVISIT" ? "Revisita" : v.dayTotal > 1 ? `Día ${v.daySeq} de ${v.dayTotal}` : ""),
      text(v.regionLabel, fill),
      text(v.supervisorName),
      text(v.lastCountDate ? dmy(v.lastCountDate) : "", { alignment: { horizontal: "center", vertical: "center" } }),
      text(v.gapDays == null ? "" : v.gapDays, { alignment: { horizontal: "center", vertical: "center" } }),
      text(done ? (v.countedOn ? `Contado ${dmy(v.countedOn)}` : "Hecha") : STATUS_LABEL[v.status] || v.status),
      text(v.note || ""),
    ];
  });
  const route = sheetFrom(
    `Ruta de conteos físicos · ${monthLabel}`,
    subtitle,
    ["Fecha", "Día", "Kiosco", "Tipo", "Región", "Supervisora", "Último conteo", "Días desde el último", "Estado", "Nota"],
    routeRows,
    [12, 12, 28, 12, 26, 20, 14, 12, 18, 36]
  );

  // Resumen: un renglón por kiosco con todas sus fechas del mes.
  const byKiosk = new Map();
  sorted.forEach((v) => {
    if (!byKiosk.has(v.locationId)) {
      byKiosk.set(v.locationId, { v, dates: [] });
    }
    byKiosk.get(v.locationId).dates.push(dmy(v.visitDate));
  });
  const summaryRows = [...byKiosk.values()]
    .sort((a, b) => a.v.locationName.localeCompare(b.v.locationName))
    .map(({ v, dates }) => [
      text(v.locationName, { font: { ...base, bold: true } }),
      text(v.supervisorName),
      text(v.regionLabel, { fill: { fgColor: { rgb: REGION_FILL[v.region] || "F1F5F9" } } }),
      text(dates.join("  ·  ")),
    ]);
  const summary = sheetFrom(`Por kiosco · ${monthLabel}`, subtitle, ["Kiosco", "Supervisora", "Región", "Fechas de visita"], summaryRows, [28, 20, 26, 40]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, route, "Ruta");
  XLSX.utils.book_append_sheet(wb, summary, "Por kiosco");
  XLSX.writeFile(wb, `calendario-conteos-${fileSuffix}.xlsx`);
}
