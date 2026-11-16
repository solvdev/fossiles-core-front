import { cellDateToYmd, parseDateText, parseLiquidationSheets } from "./kioskLiquidationSheetParser";

describe("parseDateText", () => {
  it("entiende los formatos que escribe contabilidad", () => {
    expect(parseDateText("14, 15 y 16/01/2026")).toEqual(["2026-01-14", "2026-01-15", "2026-01-16"]);
    expect(parseDateText("12 Y 13/02/2026")).toEqual(["2026-02-12", "2026-02-13"]);
    expect(parseDateText("17 AL 19/11/25")).toEqual(["2025-11-17", "2025-11-18", "2025-11-19"]);
    expect(parseDateText("22/06 y 23/06/2026")).toEqual(["2026-06-22", "2026-06-23"]);
    expect(parseDateText("2 y 3/9/2026")).toEqual(["2026-09-02", "2026-09-03"]);
    expect(parseDateText("10 Y11/09/2026")).toEqual(["2026-09-10", "2026-09-11"]);
  });

  it("corrige errores de dedo del año y descarta lo que no se entiende", () => {
    expect(parseDateText("10/08/206")).toEqual(["2026-08-10"]);
    expect(parseDateText("04/06/02026")).toEqual(["2026-06-04"]);
    expect(parseDateText("PENDIENTE")).toEqual([]);
    expect(parseDateText(null)).toEqual([]);
    expect(parseDateText("31/02/2026")).toEqual([]);
  });
});

describe("cellDateToYmd", () => {
  it("no se corre de día por la zona horaria", () => {
    expect(cellDateToYmd(new Date(Date.UTC(2026, 0, 5, 0, 0, 4)))).toBe("2026-01-05");
    expect(cellDateToYmd(new Date(2026, 0, 5, 0, 0, 4))).toBe("2026-01-05");
    expect(cellDateToYmd("2026-01-05")).toBeNull();
  });
});

describe("parseLiquidationSheets", () => {
  const d = (y, m, day) => new Date(Date.UTC(y, m - 1, day, 0, 0, 4));
  const sheet = {
    name: "RUTAS ANITA 2026",
    rows: [
      [null, "LIQUIDAR DE LA SEMANA DEL 05 AL 09/01/2026"],
      [null, null, "ANA ISABEL CON"],
      ["No.", "NOMBRE", "FECHA"],
      ["1", "MIRAFLORES 2", d(2025, 12, 1), d(2025, 12, 29), "GUSTAVO", d(2026, 1, 5), d(2026, 1, 5), "NO TIENE AREAS PARA CORREGIR"],
      ["3", "ENTRECUEROS", d(2025, 10, 14), d(2025, 11, 12), "GUSTAVO", "17 AL 19/11/25", "14, 15 y 16/01/2026", "5 AREAS PARA CORREGIR"],
      [null, "NARANJO", d(2026, 1, 20), d(2026, 2, 22), "FATIMA", d(2026, 2, 24), null, "UNA AREA PARA CORREGIR"],
      ["2", "PRADERA CONCEPCION", d(2025, 11, 25), d(2026, 1, 6), "GUSTAVO", d(2026, 1, 7), d(2025, 2, 3), "NINGUNA AREA PARA CORREGIR"],
      [null, "DESCANSO DE SEMANA SANTA DEL JUEVES 02 Y VIERNES 03 DE ABRIL DE 2026"],
      ["4", "CEJALES QUICHE", "PRIMER INVENTARIO DE CELAJES QUICHE JUEVES 22"],
    ],
  };

  it("lee filas con y sin número, fechas escritas a mano y notas", () => {
    const { rows, notes, skipped } = parseLiquidationSheets([sheet]);
    expect(rows.map((r) => r.kioskName)).toEqual(["MIRAFLORES 2", "ENTRECUEROS", "NARANJO", "PRADERA CONCEPCION"]);
    expect(rows[0]).toMatchObject({
      sheetSupervisor: "ANA ISABEL CON",
      periodFrom: "2025-12-01",
      periodTo: "2025-12-29",
      accountant: "GUSTAVO",
      liquidationDates: ["2026-01-05"],
    });
    expect(rows[1].liquidationDates).toEqual(["2026-01-14", "2026-01-15", "2026-01-16"]);
    expect(rows[1].correctionsDue).toBe("2025-11-17");
    expect(rows[2].liquidationDates).toEqual([]);
    expect(notes).toHaveLength(1);
    expect(skipped.map((s) => s.kiosk)).toEqual(["CEJALES QUICHE"]);
  });

  it("corrige el año de una liquidación escrita un año antes del conteo", () => {
    const { rows } = parseLiquidationSheets([sheet]);
    const r = rows.find((x) => x.kioskName === "PRADERA CONCEPCION");
    expect(r.liquidationDates).toEqual(["2026-02-03"]);
    expect(r.fixedYear).toBe(true);
  });
});
