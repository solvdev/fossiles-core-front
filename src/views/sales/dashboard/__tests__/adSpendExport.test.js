import * as XLSX from "xlsx-js-style";
import { buildAdSpendSheetLayout, buildAdSpendWorkbook, exportFileName, HEADERS, SHEET_NAME } from "../adSpendExport";
import { deriveDay, normalizeReport } from "../adSpendHelpers";

const day = (date, salesAmount, adSpend, extra = {}) => ({
  date,
  salesAmount,
  ordersCount: 2,
  ...deriveDay(salesAmount, adSpend),
  notes: null,
  ...extra,
});

const REPORT = normalizeReport({
  startDate: "2026-09-01",
  endDate: "2026-09-05",
  days: [
    day("2026-09-01", 3000, 1000),
    day("2026-09-02", 400, 900, { notes: "Meta ads" }),
    day("2026-09-03", 500, 500),
    day("2026-09-04", 1200, null),
    day("2026-09-05", 800, 200),
  ],
});

const cell = (ws, r, c) => ws[XLSX.utils.encode_cell({ r, c })];

describe("adSpendExport", () => {
  test("nombre de archivo con el periodo", () => {
    expect(exportFileName(REPORT)).toBe("publicidad-vs-ventas-online_2026-09-01_2026-09-05.xlsx");
    expect(buildAdSpendSheetLayout(REPORT).fileName).toBe("publicidad-vs-ventas-online_2026-09-01_2026-09-05.xlsx");
  });

  test("layout: título, periodo, nota, resumen, encabezado, un renglón por día y totales", () => {
    const layout = buildAdSpendSheetLayout(REPORT);
    const { aoa, rows } = layout;
    expect(aoa[0][0]).toBe("PUBLICIDAD VS VENTAS ONLINE");
    expect(aoa[1][0]).toBe("Periodo: 01/09/2026 – 05/09/2026");
    expect(aoa[2][0]).toMatch(/No incluye costo de producción/);
    const kinds = rows.map((r) => r.kind);
    expect(kinds.filter((k) => k === "day")).toHaveLength(5);
    expect(aoa[layout.headerRow]).toEqual(HEADERS);
    expect(HEADERS).toEqual(["Fecha", "Día", "Pedidos", "Venta (Q)", "Inversión (Q)", "Resultado (Q)", "ROAS", "Estado", "Notas"]);

    const summary = Object.fromEntries(
      rows.map((r, i) => [r.kind === "kv" ? aoa[i][0] : null, aoa[i][3]]).filter(([k]) => k)
    );
    expect(summary["Inversión en publicidad"]).toBe(2600);
    expect(summary["Venta de los días con inversión"]).toBe(4700);
    expect(summary["Resultado (venta − inversión)"]).toBe(2100);
    expect(summary["Días en ganancia"]).toBe(2);
    expect(summary["Días en pérdida"]).toBe(1);
    expect(summary["Días en equilibrio"]).toBe(1);
    expect(summary["Días sin inversión capturada (no entran al resultado)"]).toBe(1);
    expect(summary["Venta total online del periodo (todos los días)"]).toBe(5900);

    const first = aoa[layout.firstDayRow];
    expect(first[1]).toBe("Martes");
    expect(first.slice(2)).toEqual([2, 3000, 1000, 2000, 3, "Ganancia", ""]);
    const loss = aoa[layout.firstDayRow + 1];
    expect(loss.slice(3)).toEqual([400, 900, -500, 400 / 900, "Pérdida", "Meta ads"]);
    const noSpend = aoa[layout.firstDayRow + 3];
    expect(noSpend.slice(3)).toEqual([1200, null, null, null, "Sin inversión capturada", ""]);
    const total = aoa[layout.totalRow];
    expect(total[0]).toBe("Total");
    expect(total.slice(2, 8)).toEqual([10, 5900, 2600, 2100, 4700 / 2600, "Ganancia"]);
    expect(total[8]).toMatch(/solo 4 días con inversión/);
  });

  test("libro: una hoja con estilos verde/rojo en resultado y formatos", () => {
    const { wb, layout } = buildAdSpendWorkbook(REPORT);
    expect(wb.SheetNames).toEqual([SHEET_NAME]);
    const ws = wb.Sheets[SHEET_NAME];
    const r0 = layout.firstDayRow;

    const win = cell(ws, r0, 5);
    expect(win.v).toBe(2000);
    expect(win.z).toBe('"Q"#,##0.00;-"Q"#,##0.00');
    expect(win.s.fill.fgColor.rgb).toBe("C6EFCE");
    expect(win.s.font.color.rgb).toBe("006100");
    expect(cell(ws, r0, 7).s.fill.fgColor.rgb).toBe("C6EFCE");

    const loss = cell(ws, r0 + 1, 5);
    expect(loss.v).toBe(-500);
    expect(loss.s.fill.fgColor.rgb).toBe("FFC7CE");
    expect(loss.s.font.color.rgb).toBe("9C0006");

    expect(cell(ws, r0 + 2, 5).s.fill.fgColor.rgb).toBe("EDEDED");

    const none = cell(ws, r0 + 3, 7);
    expect(none.v).toBe("Sin inversión capturada");
    expect(none.s.fill).toBeUndefined();
    expect(cell(ws, r0, 0).z).toBe("dd/mm/yyyy");
    expect(cell(ws, r0, 6).z).toBe("0.00");

    const header = cell(ws, layout.headerRow, 0);
    expect(header.s.font.bold).toBe(true);
    expect(header.s.fill.fgColor.rgb).toBe("D9D9D9");

    const total = cell(ws, layout.totalRow, 5);
    expect(total.v).toBe(2100);
    expect(total.s.fill.fgColor.rgb).toBe("C6EFCE");
    expect(ws["!autofilter"].ref).toBe(`A${layout.headerRow + 1}:I${layout.lastDayRow + 1}`);
    expect(ws["!merges"].length).toBeGreaterThan(0);
  });

  test("sin inversión en todo el periodo: resultado y estado del total en blanco", () => {
    const empty = normalizeReport({ days: [day("2026-09-01", 100, null), day("2026-09-02", 50, null)] });
    const layout = buildAdSpendSheetLayout(empty);
    const total = layout.aoa[layout.totalRow];
    expect(total.slice(2, 8)).toEqual([4, 150, 0, null, null, ""]);
    const wb = buildAdSpendWorkbook(empty).wb;
    expect(wb.SheetNames).toHaveLength(1);
  });

  test("el libro se serializa a .xlsx válido", () => {
    const { wb } = buildAdSpendWorkbook(REPORT);
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    expect(out.byteLength || out.length).toBeGreaterThan(1000);
    const back = XLSX.read(out, { type: "array" });
    expect(back.SheetNames).toEqual([SHEET_NAME]);
  });
});
