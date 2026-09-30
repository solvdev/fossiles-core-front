import * as XLSX from "xlsx-js-style";
import {
  TEMPLATE_LAYOUT,
  buildKioskTemplateSheet,
  buildKioskTemplateWorkbook,
  kioskTemplateFileName,
  DEFAULT_COST_CATEGORIES,
} from "utils/kioskFinancialsTemplate";

const cellValue = (ws, ref) => (ws[ref] ? ws[ref].v : undefined);

describe("kioskFinancialsTemplate layout", () => {
  const siteNames = ["MIRAFLORES", "ESKALA", "PLAZA CEMACO"];
  const build = () => buildKioskTemplateSheet({ year: 2025, month: 8, siteNames });

  it("respeta B = etiquetas, fila 8 = encabezado, C = primer kiosco", () => {
    const { ws, layout } = build();
    expect(layout.labelCol).toBe(1);
    expect(layout.headerRow).toBe(7);
    expect(layout.firstSiteCol).toBe(2);
    expect(cellValue(ws, "B8")).toBe("Fecha");
    expect(cellValue(ws, "C8")).toBe("MIRAFLORES");
    expect(cellValue(ws, "D8")).toBe("ESKALA");
    expect(cellValue(ws, "E8")).toBe("PLAZA CEMACO");
    expect(cellValue(ws, "F8")).toBe("Total por dia");
  });

  it("tiene 31 filas de fecha desde la fila 9 y luego Total", () => {
    const { ws, rows } = build();
    expect(rows.firstDay).toBe(8);
    expect(rows.lastDay).toBe(38);
    expect(rows.total).toBe(39);
    expect(cellValue(ws, "B40")).toBe("Total");
    // 1 de agosto de 2025 = serial 45870
    expect(cellValue(ws, "B9")).toBe(45870);
    expect(ws.B9.z).toBe("dd/mm/yyyy");
    expect(cellValue(ws, "B39")).toBe(45870 + 30);
  });

  it("los días del mes vienen en 0 con formato Q; los que desbordan al mes siguiente quedan vacíos", () => {
    const { ws } = buildKioskTemplateSheet({ year: 2025, month: 9, siteNames }); // septiembre: 30 días
    expect(cellValue(ws, "C9")).toBe(0);            // 1 de septiembre
    expect(cellValue(ws, "E38")).toBe(0);           // 30 de septiembre
    expect(ws.C9.z).toBe('"Q"#,##0.00;-"Q"#,##0.00');
    expect(cellValue(ws, "C39")).toBeUndefined();   // 1 de octubre: fuera del mes
  });

  it("desborda al mes siguiente en meses de 30 días (igual que los originales)", () => {
    const { ws, layout } = buildKioskTemplateSheet({ year: 2025, month: 9, siteNames });
    expect(layout.daysInMonth).toBe(30);
    // fila 39 = 1 de octubre (serial 45931), sin captura (relleno gris)
    expect(cellValue(ws, "B39")).toBe(45931);
  });

  it("incluye bloques de metas, tasas y 10 costos fijos con etiquetas reconocibles", () => {
    const { ws, rows } = build();
    const labelAt = (r) => cellValue(ws, `B${r + 1}`);
    expect(labelAt(rows.participation)).toBe("% Participacion");
    expect(labelAt(rows.goals)).toBe("METAS");
    expect(labelAt(rows.goalPct)).toBe("% DE META");
    expect(labelAt(rows.costsTitle)).toBe("COSTOS");
    expect(labelAt(rows.variableTitle)).toBe("Costos Variables");
    expect(labelAt(rows.rates.product)).toBe("Costo del Pdcto");
    expect(labelAt(rows.rates.sales)).toBe("Comision de venta");
    expect(labelAt(rows.rates.card)).toBe("Comision tarjeta");
    expect(labelAt(rows.rates.tax)).toBe("IVA");
    // fila calculada justo debajo de cada tasa, sin etiqueta
    expect(rows.rateCalc.product).toBe(rows.rates.product + 1);
    expect(labelAt(rows.rateCalc.product)).toBe("");
    expect(labelAt(rows.fixedTitle)).toBe("Costos Fijos");
    expect(Object.keys(rows.costs)).toHaveLength(10);
    expect(labelAt(rows.costs.ALQUILER)).toBe("Alquiler");
    expect(labelAt(rows.costs.SALARIOS_MO_DIRECTA)).toBe("Salarios M.O. directa");
    expect(labelAt(rows.fixedTotal)).toBe("Total CI");
    expect(labelAt(rows.operating)).toBe("Total Cto Oper.");
    expect(labelAt(rows.difference)).toBe("Diferencia Vta");
    expect(labelAt(rows.margin)).toBe("MARGEN");
    expect(labelAt(rows.breakEven)).toBe("Punto de Equilibrio");
    expect(labelAt(rows.breakEvenDaily)).toBe("PE DIARIO");
  });

  it("los códigos de costo siguen el orden del contrato", () => {
    expect(DEFAULT_COST_CATEGORIES.map((c) => c.code)).toEqual([
      "ALQUILER",
      "LUZ",
      "TELEFONO_INTERNET_PROG",
      "MANTENIMIENTO",
      "SALARIOS_MO_INDIRECTA",
      "BONIFICACION",
      "INDEMNIZACION_VACACIONES",
      "BONO_14",
      "AGUINALDO",
      "SALARIOS_MO_DIRECTA",
    ]);
  });

  it("prellena metas, tasas y costos desde la configuración", () => {
    const { ws, rows } = buildKioskTemplateSheet({
      year: 2025,
      month: 8,
      siteNames,
      siteConfigs: [
        {
          goal: 100000,
          productCostPct: 0.18,
          salesCommissionPct: 0.04,
          cardCommissionPct: 0.02,
          taxPct: 0.025,
          costs: { ALQUILER: 7652.51, LUZ: null },
        },
      ],
    });
    expect(cellValue(ws, `C${rows.goals + 1}`)).toBe(100000);
    expect(cellValue(ws, `C${rows.rates.product + 1}`)).toBe(0.18);
    expect(cellValue(ws, `C${rows.costs.ALQUILER + 1}`)).toBe(7652.51);
    expect(cellValue(ws, `C${rows.costs.LUZ + 1}`)).toBeUndefined();
    expect(cellValue(ws, `D${rows.goals + 1}`)).toBeUndefined();
  });

  it("genera fórmulas de total y un libro escribible", () => {
    const { ws, rows } = build();
    expect(ws[`C${rows.total + 1}`].f).toBe("SUM(C9:C39)");
    const wb = buildKioskTemplateWorkbook({ year: 2025, month: 8, siteNames });
    expect(wb.SheetNames).toEqual(["Reporte de Vtas"]);
    const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    expect(out.byteLength || out.length).toBeGreaterThan(1000);
    const back = XLSX.read(out, { type: "array" });
    expect(back.Sheets["Reporte de Vtas"].B8.v).toBe("Fecha");
  });

  it("nombre de archivo con mes y año", () => {
    expect(kioskTemplateFileName(2025, 8)).toBe("VENTAS AGOSTO 2025.xlsx");
    expect(TEMPLATE_LAYOUT.dayRows).toBe(31);
  });
});
