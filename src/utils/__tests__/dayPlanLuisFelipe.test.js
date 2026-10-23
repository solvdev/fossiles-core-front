import {
  buildDayPlanPayload,
  isConsolidatedTask,
  parseConsolidated,
  suggestGrouping,
  taskOrderCodes,
} from "../dayPlanHelper";
import { productionOrderGroupSheetHtml, sizesText } from "../productionOrderGroupPrintHtml";
import { splitGroupRows } from "../../views/production/CinchosDayBoard";

let n = 0;
const newId = () => `t${++n}`;
beforeEach(() => { n = 0; });

const item = (id, qty, perUnit) => ({
  productionOrderItemId: id,
  productCode: `P${id}`,
  productName: `Producto ${id}`,
  colorName: null,
  remainingQuantity: qty,
  prdTimePerUnit: perUnit,
});
const opv = (id, items, group) => ({
  id, code: `OPV-${id}`, family: "OPV", onlineSale: false, luisFelipe: true, customerName: "Luis Felipe", items,
  ...(group ? { groupId: group.id, groupCode: group.code } : {}),
});
const G = { id: 7, code: "LF-OPV-007" };

describe("OP consolidada en «Armar el día»", () => {
  const orders = [
    opv(1, [item(11, 3, 0.5)], G),        // 1.5 h
    { id: 9, code: "OPK-9", family: "OPK", onlineSale: false, items: [item(91, 2, 1)] },
    opv(2, [item(21, 2, 0.5)], G),        // 1 h
    opv(3, [item(31, 1, 1)], G),          // 1 h
    opv(4, [item(41, 2, 0.5)]),           // de Luis Felipe, pero sin consolidar
  ];

  test("las órdenes de una consolidada se reparten juntas en una tarea", () => {
    const tasks = suggestGrouping(orders, [1, 9, 2, 3, 4], [], { newId });
    const cons = tasks.filter(isConsolidatedTask);
    expect(cons).toHaveLength(1);
    expect(cons[0].groupCode).toBe("LF-OPV-007");
    expect(cons[0].orderId).toBe(1);
    expect(taskOrderCodes(cons[0])).toEqual(["OPV-1", "OPV-2", "OPV-3"]);
    expect(cons[0].lines.map((l) => [l.productionOrderItemId, l.quantity, l.orderCode]))
      .toEqual([[11, 3, "OPV-1"], [21, 2, "OPV-2"], [31, 1, "OPV-3"]]);
    // La OPK y la OPV sin consolidar van solas; la consolidada queda donde estaba la primera.
    expect(tasks.map((t) => t.orderCode)).toEqual(["OPV-1", "OPK-9", "OPV-4"]);
  });

  test("si juntas pasan de 4 h se parten, y cada parte toma la cabecera de su primera línea", () => {
    const big = [opv(1, [item(11, 6, 0.5)], G), opv(2, [item(21, 6, 0.5)], G)]; // 3 h + 3 h
    const tasks = suggestGrouping(big, [1, 2], [], { newId });
    expect(tasks).toHaveLength(2);
    expect(isConsolidatedTask(tasks[0])).toBe(true);   // 6 de OPV-1 + 2 de OPV-2
    expect(tasks[1].orderCode).toBe("OPV-2");          // solo OPV-2
    expect(isConsolidatedTask(tasks[1])).toBe(false);
  });

  test("el cuerpo pide consolidar solo en las tareas que juntan varias órdenes", () => {
    const tasks = suggestGrouping(orders, [1, 9, 2], [], { newId });
    const body = buildDayPlanPayload(tasks, { anchorDate: "2026-10-23" });
    expect(body.tasks.map((t) => [t.productionOrderId, t.consolidateVendorOrders])).toEqual([[1, true], [9, false]]);
  });

  test("lee la consolidada y sus OPs de una tarea guardada", () => {
    expect(parseConsolidated("Consolidada LF-OPV-007: OPV-64, OPV-65 | Urgente"))
      .toEqual({ groupCode: "LF-OPV-007", codes: ["OPV-64", "OPV-65"] });
    expect(parseConsolidated("Urgente")).toBeNull();
    expect(parseConsolidated(null)).toBeNull();
  });
});

describe("cinchos de una OP consolidada", () => {
  const row = (key, orderId, orderCode) => ({ key, productionOrderId: orderId, orderCode });
  const groups = { 1: { id: 3, code: "LF-OPC-003" }, 2: { id: 3, code: "LF-OPC-003" } };

  test("las líneas de sus órdenes van en un bloque; las demás quedan sueltas", () => {
    const { blocks, rest } = splitGroupRows([row("a", 1, "OPC-1"), row("b", 2, "OPC-2"), row("c", 5, "OPC-5")], groups);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].group.code).toBe("LF-OPC-003");
    expect(blocks[0].orders).toEqual(["OPC-1", "OPC-2"]);
    expect(blocks[0].rows.map((r) => r.key)).toEqual(["a", "b"]);
    expect(rest.map((r) => r.key)).toEqual(["c"]);
  });

  test("sin consolidadas todo queda suelto", () => {
    expect(splitGroupRows([row("a", 1, "OPC-1")]).blocks).toEqual([]);
  });
});

describe("hoja de la OP consolidada", () => {
  test("muestra productos sumados, tallas y de qué OP sale cada parte", () => {
    const html = productionOrderGroupSheetHtml({
      code: "LF-OPC-003", family: "OPC", totalUnits: 6,
      orders: [{ code: "OPC-1", units: 2 }, { code: "OPC-2", units: 4 }],
      lines: [{ productCode: "C-1", productName: "Cincho", quantity: 6, sizes: { 34: 4, 32: 2 }, byOrder: { "OPC-1": 2, "OPC-2": 4 } }],
    });
    expect(html).toContain("OP consolidada LF-OPC-003");
    expect(html).toContain("32:2 · 34:4");
    expect(html).toContain("OPC-1: 2 · OPC-2: 4");
    expect(sizesText({})).toBe("");
  });
});
