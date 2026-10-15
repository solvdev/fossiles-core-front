import {
  NEAR_LIMIT_HOURS,
  buildDayPlanPayload,
  capacityStatus,
  dayCapacity,
  clampTasksToRemaining,
  sortTasksBySelection,
  leftoverQuantity,
  limitStatus,
  lineHours,
  orderPrioritiesFromSelection,
  packOrderLines,
  planBlockers,
  splitOverflow,
  suggestGrouping,
  summarizePlan,
  taskBaseHours,
  taskTotalHours,
} from "../dayPlanHelper";

let n = 0;
const newId = () => `t${++n}`;
beforeEach(() => { n = 0; });

const item = (id, qty, perUnit, extra = {}) => ({
  productionOrderItemId: id,
  productCode: `P${id}`,
  productName: `Producto ${id}`,
  colorName: null,
  remainingQuantity: qty,
  prdTimePerUnit: perUnit,
  ...extra,
});
const order = (id, code, items, extra = {}) => ({
  id, code, family: code.split("-")[0], onlineSale: code.startsWith("OPL"), customerName: "Cliente", items, ...extra,
});

describe("límite de la mesa", () => {
  test("la barra pasa a ámbar desde el 80 % de las 4 h ideales", () => {
    expect(NEAR_LIMIT_HOURS).toBe(3.2);
  });

  test("verde, ámbar y rojo según la carga base", () => {
    const task = (units) => ({ onlineSale: false, lines: [{ quantity: units, prdTimePerUnit: 0.5 }] });
    expect(limitStatus(task(6)).level).toBe("ok");      // 3.0 h
    expect(limitStatus(task(7)).level).toBe("near");    // 3.5 h
    expect(limitStatus(task(10)).level).toBe("near");   // 5.0 h: permitido
    expect(limitStatus(task(10)).overIdeal).toBe(true);
    expect(limitStatus(task(11)).level).toBe("over");   // 5.5 h: bloquea
  });

  test("las OPL no cuentan contra el límite, aunque pasen de 5 h", () => {
    const t = { onlineSale: true, lines: [{ quantity: 20, prdTimePerUnit: 0.5 }] };
    expect(taskBaseHours(t)).toBe(0);
    expect(taskTotalHours(t)).toBe(10);
    expect(limitStatus(t).level).toBe("opl");
    expect(planBlockers([t])).toEqual([]);
  });

  test("producto sin tiempo configurado usa 0.1 h por unidad", () => {
    expect(lineHours(10, null)).toBe(1);
    expect(lineHours(3, 0.25)).toBe(0.75);
  });
});

describe("agrupar productos", () => {
  test("parte en tareas de hasta 4 h sin mezclar OPs", () => {
    // 16 billeteras de 0.5 h = 8 h -> dos tareas de 4 h; luego 5 portatarjetas de 0.3 h
    const op = order(5, "OPV-0220", [item(51, 16, 0.5), item(52, 5, 0.3)]);
    const tasks = suggestGrouping([op], [5], [], { newId });
    expect(tasks.map((t) => taskTotalHours(t))).toEqual([4, 4, 1.5]);
    expect(tasks.every((t) => t.orderId === 5)).toBe(true);
    expect(tasks.reduce((s, t) => s + t.lines.reduce((a, l) => a + l.quantity, 0), 0)).toBe(21);
  });

  test("un producto que no cabe empieza otra tarea en vez de pasarse", () => {
    const op = order(6, "OPV-0221", [item(61, 4, 1.1)]);   // 3 caben en 3.3 h
    const tasks = suggestGrouping([op], [6], [], { newId });
    expect(tasks.map((t) => t.lines[0].quantity)).toEqual([3, 1]);
  });

  test("un producto de más de 4 h por unidad se fuerza de a una unidad", () => {
    const op = order(7, "OPV-0300", [item(71, 2, 4.5)]);
    const tasks = suggestGrouping([op], [7], [], { newId });
    expect(tasks.map((t) => t.lines[0].quantity)).toEqual([1, 1]);
  });

  test("respeta unidades por tarea cuando el producto las define", () => {
    const op = order(8, "OPK-0318", [item(81, 8, 0.4, { unitsPerTask: 3 })]);
    const tasks = suggestGrouping([op], [8], [], { newId });
    expect(tasks.map((t) => t.lines[0].quantity)).toEqual([3, 3, 2]);
  });

  test("las OPL van primero y las demás en el orden en que se marcaron", () => {
    const opl = order(1, "OPL-0042", [item(11, 6, 0.5)]);
    const a = order(2, "OPV-0220", [item(21, 2, 0.5)]);
    const b = order(3, "OPK-0318", [item(31, 2, 0.5)]);
    // se marcó primero la OPK y después la OPV; la OPL está marcada al final de la lista
    const tasks = suggestGrouping([opl, a, b], [3, 2, 1], [], { newId });
    expect(tasks.map((t) => t.orderCode)).toEqual(["OPL-0042", "OPK-0318", "OPV-0220"]);
    expect(tasks[0].onlineSale).toBe(true);
  });

  test("no vuelve a repartir lo que ya está en una tarea", () => {
    const op = order(9, "OPV-0400", [item(91, 10, 0.5)]);
    const first = suggestGrouping([op], [9], [], { newId });   // 8 u + 2 u
    expect(first.map((t) => t.lines[0].quantity)).toEqual([8, 2]);
    first[0].lines[0].quantity = 4;            // el jefe quitó 4 unidades de la primera tarea
    expect(leftoverQuantity(op.items[0], first)).toBe(4);
    const rest = suggestGrouping([op], [9], first, { newId });
    expect(rest.reduce((s, t) => s + t.lines.reduce((a, l) => a + l.quantity, 0), 0)).toBe(4);
  });

  test("las OPL se parten en tareas de hasta 4 h aunque no cuenten contra el límite", () => {
    const op = order(1, "OPL-0050", [item(11, 20, 0.5)]);   // 10 h
    const tasks = suggestGrouping([op], [1], [], { newId });
    expect(tasks.map((t) => taskTotalHours(t))).toEqual([4, 4, 2]);
    expect(tasks.every((t) => limitStatus(t).level === "opl")).toBe(true);
  });
});

describe("arreglar sola", () => {
  test("deja la tarea en 4 h y pasa el excedente a una tarea nueva", () => {
    const op = order(4, "OPCK-0107", [item(41, 14, 0.4)]);
    const task = {
      clientId: "x", orderId: 4, orderCode: "OPCK-0107", family: "OPCK", onlineSale: false,
      lines: [{ productionOrderItemId: 41, productCode: "P41", productName: "Cinturón", quantity: 14,
        prdTimePerUnit: 0.4, remainingQuantity: 14 }],
    };
    expect(limitStatus(task).level).toBe("over");           // 5.6 h
    const { task: fixed, extra } = splitOverflow(task, op, { newId });
    expect(taskBaseHours(fixed)).toBe(4);
    expect(extra).toHaveLength(1);
    expect(extra[0].lines[0].quantity).toBe(4);
    expect(fixed.lines[0].quantity + extra[0].lines[0].quantity).toBe(14);
    expect(planBlockers([fixed, ...extra])).toEqual([]);
  });

  test("una tarea de OPL no se parte", () => {
    const op = order(1, "OPL-0042", [item(11, 20, 0.5)]);
    const task = { clientId: "y", orderId: 1, onlineSale: true,
      lines: [{ productionOrderItemId: 11, quantity: 20, prdTimePerUnit: 0.5 }] };
    const { task: same, extra } = splitOverflow(task, op, { newId });
    expect(same).toBe(task);
    expect(extra).toEqual([]);
  });
});

describe("bloqueos y resumen", () => {
  test("una tarea vacía o sobre 5 h bloquea el paso a Revisar", () => {
    const empty = { onlineSale: false, lines: [] };
    const big = { onlineSale: false, lines: [{ quantity: 14, prdTimePerUnit: 0.4 }] };
    const ok = { onlineSale: false, lines: [{ quantity: 4, prdTimePerUnit: 0.4 }] };
    expect(planBlockers([ok, empty, big])).toEqual([
      "La tarea 2 está vacía",
      "La tarea 3 pasa de 5 h",
    ]);
  });

  test("el resumen separa horas base y horas OPL", () => {
    const opl = { onlineSale: true, lines: [{ quantity: 4, prdTimePerUnit: 0.5 }] };
    const reg = { onlineSale: false, lines: [{ quantity: 6, prdTimePerUnit: 0.5 }] };
    expect(summarizePlan([opl, reg])).toEqual({ count: 2, baseHours: 3, oplHours: 2, problems: 0 });
  });
});

describe("cuerpo para el servidor", () => {
  const orders = [
    order(1, "OPL-0042", [item(11, 6, 0.5)]),
    order(2, "OPV-0220", [item(21, 4, 0.5)]),
    order(3, "OPK-0318", [item(31, 4, 0.5)]),
  ];

  test("las líneas de OPL viajan como extra y las demás no", () => {
    const tasks = suggestGrouping(orders, [1, 3, 2], [], { newId });
    const body = buildDayPlanPayload(tasks, { anchorDate: "2026-10-15" });
    expect(body.tasks[0].items[0].daySaleExtra).toBe(true);
    expect(body.tasks[1].items[0].daySaleExtra).toBe(false);
    expect(body.horizonDays).toBe(5);
    expect(body.planFingerprint).toBeUndefined();
  });

  test("lleva el día que eligió el jefe y la huella de la vista previa al confirmar", () => {
    const tasks = suggestGrouping(orders, [2], [], { newId });
    const body = buildDayPlanPayload(tasks, {
      anchorDate: "2026-10-15",
      dates: { [tasks[0].clientId]: "2026-10-16" },
      planFingerprint: "abc",
      acceptChanges: true,
    });
    expect(body.tasks[0].scheduledDate).toBe("2026-10-16");
    expect(body.planFingerprint).toBe("abc");
    expect(body.acceptChanges).toBe(true);
  });

  test("la prioridad de las demás OPs es el orden de marcado, desde 2, y las OPL no entran", () => {
    expect(orderPrioritiesFromSelection(orders, [3, 1, 2])).toEqual({ "3": 2, "2": 3 });
  });
});

describe("orden y recorte", () => {
  test("las tareas se ordenan: OPL primero y luego por orden de marcado", () => {
    const opl = order(1, "OPL-0042", [item(11, 2, 0.5)]);
    const a = order(2, "OPV-0220", [item(21, 2, 0.5)]);
    const b = order(3, "OPK-0318", [item(31, 2, 0.5)]);
    const tasks = suggestGrouping([opl, a, b], [2, 3, 1], [], { newId });
    // el jefe cambió de idea: ahora marcó primero la OPK
    const sorted = sortTasksBySelection(tasks, [opl, a, b], [3, 2, 1]);
    expect(sorted.map((t) => t.orderCode)).toEqual(["OPL-0042", "OPK-0318", "OPV-0220"]);
  });

  test("si alguien más tomó unidades se recorta en orden y se descartan las tareas que quedan vacías", () => {
    const op = order(9, "OPV-0400", [item(91, 10, 0.5)]);
    const tasks = suggestGrouping([op], [9], [], { newId });           // 8 u + 2 u
    const after = [{ ...op, items: [{ ...op.items[0], remainingQuantity: 8 }] }];
    const { tasks: clamped, changed } = clampTasksToRemaining(tasks, after);
    expect(changed).toBe(true);
    expect(clamped).toHaveLength(1);
    expect(clamped[0].lines[0].quantity).toBe(8);
    expect(clampTasksToRemaining(clamped, after).changed).toBe(false);
  });
});

describe("packOrderLines", () => {
  test("sin cantidades no crea tareas", () => {
    expect(packOrderLines(order(1, "OPV-1", []), [], { newId })).toEqual([]);
  });
});

describe("capacidad del día", () => {
  test("sale de las mesas activas de la fecha y resta lo ya planificado", () => {
    const c = dayCapacity({ numDesks: 8, plannedHours: 6 });
    expect(c).toMatchObject({ desks: 8, idealHours: 32, hardHours: 40, plannedHours: 6, remainingIdeal: 26, remainingHard: 34 });
    expect(dayCapacity({ numDesks: 2, plannedHours: 50 }).remainingIdeal).toBe(0);
    expect(dayCapacity({}).hardHours).toBe(0);
  });

  test("nivel del día: ok, near, over y none", () => {
    const c = dayCapacity({ numDesks: 2, plannedHours: 1 });
    expect(capacityStatus(7, c).level).toBe("ok");
    expect(capacityStatus(8, c).level).toBe("near");
    expect(capacityStatus(9.5, c).level).toBe("over");
    expect(capacityStatus(3, null).level).toBe("none");
  });

  test("una OP enorme se corta a lo que cabe en las mesas, no a 5000 tareas", () => {
    const big = order(1, "OPV-1", [item(1, 5000, 0.1)]);
    const tasks = suggestGrouping([big], [1], [], { budgetHours: 32, newId });
    expect(tasks.length).toBeLessThanOrEqual(8);
    expect(tasks.reduce((s, t) => s + taskBaseHours(t), 0)).toBeLessThanOrEqual(32);
    expect(tasks.reduce((s, t) => s + t.lines.reduce((a, l) => a + l.quantity, 0), 0)).toBe(320);
  });

  test("entran los productos que caben por tiempo, aunque otro más grande no entre", () => {
    const o = order(1, "OPV-1", [item(1, 10, 1), item(2, 3, 0.2)]);
    // Quedan 1.5 h: del primero entra 1 unidad (1 h); del segundo 2 (0.4 h).
    const tasks = suggestGrouping([o], [1], [], { budgetHours: 1.5, newId });
    const qty = (id) => tasks.flatMap((t) => t.lines).filter((l) => l.productionOrderItemId === id).reduce((s, l) => s + l.quantity, 0);
    expect(qty(1)).toBe(1);
    expect(qty(2)).toBe(2);
  });

  test("las OPL no gastan presupuesto y van primero", () => {
    const opl = order(9, "OPL-1", [item(9, 100, 1)]);
    const o = order(1, "OPV-1", [item(1, 100, 1)]);
    const tasks = suggestGrouping([o, opl], [1, 9], [], { budgetHours: 4, newId });
    expect(tasks[0].onlineSale).toBe(true);
    expect(tasks.filter((t) => t.onlineSale).flatMap((t) => t.lines).reduce((a, l) => a + l.quantity, 0)).toBe(100);
    expect(tasks.filter((t) => !t.onlineSale).reduce((s, t) => s + taskBaseHours(t), 0)).toBe(4);
  });

  test("lo que el jefe fija para hoy se respeta y se descuenta primero", () => {
    const a = order(1, "OPV-1", [item(1, 100, 1)]);
    const b = order(2, "OPV-2", [item(2, 100, 1)]);
    const tasks = suggestGrouping([a, b], [1, 2], [], { budgetHours: 6, picks: { 2: 4 }, newId });
    const qty = (oid) => tasks.filter((t) => t.orderId === oid).flatMap((t) => t.lines).reduce((s, l) => s + l.quantity, 0);
    expect(qty(2)).toBe(4);
    expect(qty(1)).toBe(2);
  });

  test("un producto en 0 se deja para otro día", () => {
    const a = order(1, "OPV-1", [item(1, 10, 0.1), item(2, 10, 0.1)]);
    const tasks = suggestGrouping([a], [1], [], { picks: { 1: 0 }, newId });
    expect(tasks.flatMap((t) => t.lines).map((l) => l.productionOrderItemId)).toEqual([2]);
  });
});
