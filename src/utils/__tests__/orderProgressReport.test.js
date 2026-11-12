import * as XLSX from "xlsx-js-style";
import {
  buildProgressView,
  deliveryLabel,
  elapsedLabel,
  exportOrderProgressExcel,
  filterOrderLines,
  groupLinesByCode,
  hasRepeatedCodes,
  lineColorsIn,
  missingUnits,
  stagesText,
  timeLabel,
} from "../orderProgressReport";

jest.mock("xlsx-js-style", () => {
  const actual = jest.requireActual("xlsx-js-style");
  return { ...actual, writeFile: jest.fn() };
});

const stages = (units, done, warehouse, inProgress, pending) => ({
  units, done, warehouse, inProgress, pending, noTask: units - done - warehouse - inProgress - pending,
});

/** Fila r (0 = encabezado, en la fila 4 de Excel) de la tabla de una hoja, como valores. */
const tableRow = (ws, r, cols = 20) =>
  Array.from({ length: cols }, (_, c) => ws[XLSX.utils.encode_cell({ r: 3 + r, c })]?.v ?? "");

const data = {
  today: "2026-10-28",
  orders: [
    {
      orderId: 1, code: "OPK-1", orderType: "CLIENTE_KIOSKO", status: "IN_PROGRESS", customerName: "KIOSCOS",
      deliveryDate: "2026-10-25", daysToDelivery: -3, late: true, tasksInProgress: 1, taskCount: 2, receivedUnits: 5,
      stages: stages(120, 20, 10, 20, 30),
      lines: [{ itemId: 10, productCode: "B-7", productName: "Billetera", colorName: "NEGRO", stages: stages(120, 20, 10, 20, 30), receivedUnits: 5, extraUnits: 0 }],
      tasks: [
        { taskId: 100, code: "TK-1", status: "IN_PROGRESS", desk: 4, units: 20, paused: true, delayed: false,
          startedAt: "2026-10-28T08:15:00", pausedAt: "2026-10-28T10:00:00",
          lines: [{ productCode: "B-7", colorName: "NEGRO", quantity: 20 }] },
        { taskId: 101, code: "TK-2", status: "PENDING", units: 30, workflowStatus: "PENDING_LEATHER",
          lines: [{ productCode: "B-7", colorName: "NEGRO", quantity: 30 }] },
      ],
    },
    {
      orderId: 2, code: "OPV-9", orderType: "VENTA_EN_LINEA", status: "PENDING", customerName: "Ana López",
      deliveryDate: "2026-11-02", daysToDelivery: 5, late: false, tasksInProgress: 0, taskCount: 0, receivedUnits: 0,
      stages: stages(3, 0, 0, 0, 0),
      lines: [{ itemId: 20, productCode: "LL-1", productName: "Llavero", colorName: "CAFE", stages: stages(3, 0, 0, 0, 0) }],
      tasks: [],
    },
  ],
};

describe("buildProgressView", () => {
  it("suma las piezas por etapa de las órdenes filtradas", () => {
    const v = buildProgressView(data);
    expect(v.orders).toHaveLength(2);
    expect(v.totals.stages).toEqual({ units: 123, done: 20, warehouse: 10, inProgress: 20, pending: 30, noTask: 43 });
    expect(v.totals.lateOrders).toBe(1);
    expect(v.totals.lateUnits).toBe(100);
    expect(v.totals.tasksInProgress).toBe(1);
  });

  it("filtra por trabajo en mesa, atrasadas, tipo y búsqueda (también por producto y tarea)", () => {
    expect(buildProgressView(data, { onlyWorking: true }).orders.map((o) => o.code)).toEqual(["OPK-1"]);
    expect(buildProgressView(data, { onlyLate: true }).orders.map((o) => o.code)).toEqual(["OPK-1"]);
    expect(buildProgressView(data, { orderType: "VENTA_EN_LINEA" }).orders.map((o) => o.code)).toEqual(["OPV-9"]);
    expect(buildProgressView(data, { search: "llavero" }).orders.map((o) => o.code)).toEqual(["OPV-9"]);
    expect(buildProgressView(data, { search: "tk-2" }).orders.map((o) => o.code)).toEqual(["OPK-1"]);
    expect(buildProgressView(null).totals.stages.units).toBe(0);
  });
});

describe("textos", () => {
  it("describe las piezas por etapa sin las que están en cero", () => {
    expect(stagesText(stages(120, 20, 10, 20, 30))).toBe(
      "120 pzas: 20 terminadas · 10 en bodega/QA · 20 en mesa · 30 por iniciar · 40 sin tarea"
    );
    expect(stagesText(stages(3, 0, 0, 0, 0))).toBe("3 pzas: 3 sin tarea");
  });

  it("dice si la orden está atrasada o cuánto falta", () => {
    expect(deliveryLabel({ daysToDelivery: -3 }).text).toBe("Atrasada 3 días");
    expect(deliveryLabel({ daysToDelivery: 0 }).text).toBe("Entrega hoy");
    expect(deliveryLabel({ daysToDelivery: 1 }).text).toBe("Entrega mañana");
    expect(deliveryLabel({ daysToDelivery: 6 }).text).toBe("Faltan 6 días");
    expect(deliveryLabel({}).text).toBe("Sin fecha");
  });

  it("muestra la hora de inicio y el tiempo transcurrido en hora Guatemala", () => {
    expect(timeLabel("2026-10-28T08:15:00", "2026-10-28")).toBe("08:15");
    expect(timeLabel("2026-10-27T16:40:00", "2026-10-28")).toBe("27/10 16:40");
    // 10:25 en Guatemala = 16:25 UTC.
    expect(elapsedLabel("2026-10-28T08:15:00", new Date(Date.UTC(2026, 9, 28, 16, 25)))).toBe("2 h 10 min");
    expect(elapsedLabel("2026-10-25T08:15:00", new Date(Date.UTC(2026, 9, 28, 16, 25)))).toBe("3 días");
  });
});

describe("exportOrderProgressExcel", () => {
  it("arma la hoja resumen por OP, la de tareas y la de productos", () => {
    exportOrderProgressExcel(buildProgressView(data), "Solo atrasadas");
    const [wb, name] = XLSX.writeFile.mock.calls[0];
    expect(name).toMatch(/^avance_por_orden_\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(wb.SheetNames).toEqual(["Resumen por OP", "Tareas", "Por producto"]);

    const ws = wb.Sheets["Resumen por OP"];
    const resumen = [0, 1, 2, 3].map((r) => tableRow(ws, r));
    expect(resumen[0].slice(0, 13)).toEqual([
      "OP", "Cliente", "Tipo", "Estado", "Entrega", "Situación", "Piezas pedidas",
      "Sin tarea", "Por iniciar", "En mesa", "En bodega/QA", "Terminadas", "% terminado",
    ]);
    expect(resumen[1].slice(0, 12)).toEqual(["OPK-1", "KIOSCOS", "Kiosko", "En proceso", "2026-10-25", "Atrasada 3 días", 120, 40, 30, 20, 10, 20]);
    expect(resumen[1][16]).toContain("Mesa 4: TK-1 (B-7 NEGRO ×20) PAUSADA");
    expect(resumen[3].slice(0, 7)).toEqual(["TOTAL", "2 OP", "", "", "", "1 atrasadas", 123]);

    const tareas = [0, 1, 2, 3].map((r) => tableRow(wb.Sheets.Tareas, r));
    expect(tareas[0][3]).toBe("Tarea");
    expect(tareas[3][0]).toBe("");
    expect(tareas[2].slice(3, 8)).toEqual(["TK-2", "Por iniciar", "Falta cuero", "", 30]);
  });
});

describe("filterOrderLines", () => {
  const order = {
    lines: [
      { itemId: 1, productCode: "B-7", productName: "Billetera", colorName: "NEGRO", stages: stages(10, 10, 0, 0, 0) },
      { itemId: 2, productCode: "B-7", productName: "Billetera", colorName: "CAFE", stages: stages(8, 2, 0, 3, 3) },
      { itemId: 3, productCode: "TT-4", productName: "Tarjetero", colorName: "NEGRO", brandName: "Fossiles", stages: stages(5, 0, 0, 0, 0) },
    ],
    tasks: [
      { taskId: 1, code: "TK-9", lines: [{ productCode: "B-7", colorName: "CAFE", quantity: 6 }] },
      { taskId: 2, code: "TK-10", lines: [{ productCode: "TT-4", colorName: "NEGRO", quantity: 5 }] },
    ],
  };

  it("sin filtros devuelve todo", () => {
    const r = filterOrderLines(order);
    expect(r.lines).toHaveLength(3);
    expect(r.tasks).toHaveLength(2);
    expect(r.active).toBe(false);
    expect(r.stages.units).toBe(23);
  });

  it("filtra por texto, color y etapa y suma solo lo filtrado", () => {
    expect(filterOrderLines(order, { search: "tarj" }).lines.map((l) => l.itemId)).toEqual([3]);
    expect(filterOrderLines(order, { search: "fossiles" }).lines.map((l) => l.itemId)).toEqual([3]);
    const negro = filterOrderLines(order, { color: "NEGRO" });
    expect(negro.lines.map((l) => l.itemId)).toEqual([1, 3]);
    expect(negro.tasks.map((t) => t.code)).toEqual(["TK-10"]);
    expect(filterOrderLines(order, { stage: "OPEN" }).lines.map((l) => l.itemId)).toEqual([2, 3]);
    const enMesa = filterOrderLines(order, { stage: "inProgress" });
    expect(enMesa.lines.map((l) => l.itemId)).toEqual([2]);
    expect(enMesa.tasks).toHaveLength(2);
    expect(filterOrderLines(order, { search: "b-7", color: "CAFE" }).stages.units).toBe(8);
  });

  it("la búsqueda también encuentra tareas por código", () => {
    const r = filterOrderLines(order, { search: "tk-10" });
    expect(r.lines).toHaveLength(0);
    expect(r.tasks.map((t) => t.code)).toEqual(["TK-10"]);
  });

  it("lista los colores sin repetir", () => {
    expect(lineColorsIn(order.lines)).toEqual(["CAFE", "NEGRO"]);
  });

  it("une las líneas del mismo código sumando etapas y colores", () => {
    expect(hasRepeatedCodes(order.lines)).toBe(true);
    expect(hasRepeatedCodes([order.lines[0], order.lines[2]])).toBe(false);
    const g = groupLinesByCode(order.lines);
    expect(g.map((x) => x.productCode)).toEqual(["B-7", "TT-4"]);
    expect(g[0].colors).toEqual(["CAFE", "NEGRO"]);
    expect(g[0].lineCount).toBe(2);
    expect(g[0].stages.units).toBe(18);
    expect(g[0].stages.done).toBe(12);
    expect(missingUnits(g[0].stages)).toBe(6);
  });
});
