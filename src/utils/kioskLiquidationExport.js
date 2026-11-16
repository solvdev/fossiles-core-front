import * as XLSX from "xlsx-js-style";
import { formatDmy } from "utils/kioskCountDateHelper";

const base = { name: "Calibri", sz: 10, color: { rgb: "000000" } };
const border = { style: "thin", color: { rgb: "CBD5E1" } };
const allBorders = { top: border, bottom: border, left: border, right: border };

const cell = (value, style = {}) => ({
  v: value ?? "",
  t: "s",
  s: { font: base, border: allBorders, alignment: { vertical: "center", wrapText: true }, ...style },
});
const head = (value) =>
  cell(value, {
    font: { ...base, bold: true, color: { rgb: "FFFFFF" } },
    fill: { fgColor: { rgb: "1E3A8A" } },
    alignment: { vertical: "center", horizontal: "center", wrapText: true },
  });
const center = { alignment: { horizontal: "center", vertical: "center", wrapText: true } };

const greenText = (row) => {
  if (row.areasToFix == null) return row.greenNote || "";
  if (row.areasToFix === 0) return "SIN ÁREAS PARA CORREGIR";
  return `${row.areasToFix} ${row.areasToFix === 1 ? "ÁREA" : "ÁREAS"} PARA CORREGIR`;
};

/** Excel «Liquidar de la semana» con el mismo orden de columnas que usa contabilidad. */
export function downloadLiquidationWeekExcel({ weekLabel, weekStart, groups }) {
  const aoa = [[{ v: `LIQUIDACIONES POR SEMANA · ${weekLabel.toUpperCase()}`, t: "s", s: { font: { ...base, bold: true, sz: 14 } } }]];
  groups.forEach((group) => {
    aoa.push([]);
    aoa.push([{ v: `LIQUIDAR DE LA SEMANA · ${group.supervisorName.toUpperCase()}`, t: "s", s: { font: { ...base, bold: true, sz: 11 } } }]);
    aoa.push(["No.", "Kiosco", "Período del", "Período al", "Contabilidad", "Entrega de correcciones", "Fecha de liquidación", "Facturas verdes", "Estado"].map(head));
    group.rows.forEach((row, i) => {
      const days = row.liquidationDays > 1 ? ` (${row.liquidationDays} días)` : "";
      aoa.push([
        cell(i + 1, center),
        cell(row.locationName, { font: { ...base, bold: true } }),
        cell(formatDmy(row.periodFrom), center),
        cell(formatDmy(row.periodTo), center),
        cell(row.accountants?.length ? row.accountants.map((a) => a.name).join(" y ") : row.accountant || ""),
        cell(formatDmy(row.correctionsDue), center),
        cell(`${formatDmy(row.liquidationDate)}${days}`, center),
        cell(greenText(row)),
        cell(row.status === "LIQUIDATED" ? "Liquidada" : "Pendiente", center),
      ]);
    });
    if (!group.rows.length) aoa.push([cell("Sin liquidaciones esta semana"), ...Array(8).fill(cell(""))]);
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [6, 28, 12, 12, 20, 16, 20, 30, 12].map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Liquidación");
  XLSX.writeFile(wb, `liquidacion-semanal-${weekStart}.xlsx`);
}
