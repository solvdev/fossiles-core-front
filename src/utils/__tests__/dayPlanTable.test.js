import { suggestGrouping } from "../dayPlanHelper";
import { buildTaskTable, NO_COLOR } from "../dayPlanTable";

let n = 0;
const newId = () => `t${++n}`;
beforeEach(() => { n = 0; });

const item = (id, code, color, qty, perUnit) => ({
  productionOrderItemId: id, productCode: code, productName: `Producto ${code}`, colorName: color,
  remainingQuantity: qty, prdTimePerUnit: perUnit,
});
const order = (id, code, items, extra = {}) => ({ id, code, family: code.split("-")[0], onlineSale: false, items, ...extra });

describe("Armar tareas en tabla", () => {
  const opv64 = order(64, "OPV-64", [
    item(1, "B-27", "Café", 4, 0.25),
    item(2, "B-27", "Negro", 6, 0.25),
    item(3, "B-22", "Rojo", 2, 0.3),
    item(4, "B-22", "Negro", 5, 0.3),
    item(5, "B-22", "Whisky", 3, 0.3),
    item(6, "BD-24", "Coñac", 2, 0.45),
  ]);

  test("columnas: Negro, Café, Tostado, Whisky primero (si están) y luego los demás", () => {
    const tasks = suggestGrouping([opv64], [64], [], { newId });
    const t = buildTaskTable(tasks, [opv64]);
    expect(t.colors).toEqual(["Negro", "Café", "Whisky", "Coñac", "Rojo"]);
  });

  test("una fila por tarea × producto con las unidades de cada color", () => {
    const tasks = suggestGrouping([opv64], [64], [], { newId });
    const t = buildTaskTable(tasks, [opv64]);
    const first = t.groups[0];
    const b27 = first.rows.find((r) => r.productCode === "B-27");
    expect(b27.cells.Negro.qty).toBe(6);
    expect(b27.cells["Café"].qty).toBe(4);
    expect(b27.units).toBe(10);
    expect(b27.hours).toBe(2.5);
    // Productos ordenados por código.
    expect(first.rows.map((r) => r.productCode)).toEqual([...first.rows.map((r) => r.productCode)].sort());
  });

  test("el pie suma lo repartido y lo compara con lo que piden las órdenes", () => {
    const tasks = suggestGrouping([opv64], [64], [], { newId, picks: { 6: 1 } });
    const t = buildTaskTable(tasks, [opv64]);
    expect(t.askedTotal).toBe(22);
    expect(t.placedTotal).toBe(21);
    expect(t.asked["Coñac"] - t.placed["Coñac"]).toBe(1);
  });

  test("en una consolidada el mismo producto de dos OP va en filas distintas", () => {
    const g = { groupId: 7, groupCode: "LF-OPV-007" };
    const a = order(1, "OPV-1", [item(11, "B-27", "Negro", 2, 0.5)], g);
    const b = order(2, "OPV-2", [item(21, "B-27", "Negro", 3, 0.5)], g);
    const tasks = suggestGrouping([a, b], [1, 2], [], { newId });
    const t = buildTaskTable(tasks, [a, b]);
    expect(t.groups).toHaveLength(1);
    expect(t.groups[0].consolidated).toBe(true);
    expect(t.groups[0].rows.map((r) => [r.productCode, r.orderCode, r.cells.Negro.qty]))
      .toEqual([["B-27", "OPV-1", 2], ["B-27", "OPV-2", 3]]);
  });

  test("las líneas sin color van en «Sin color»", () => {
    const o = order(9, "OPK-9", [item(91, "X-1", "", 2, 1)]);
    const t = buildTaskTable(suggestGrouping([o], [9], [], { newId }), [o]);
    expect(t.colors).toEqual([NO_COLOR]);
  });
});
