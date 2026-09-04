import {
  getOrganizerDayDeskTasks,
  getOrganizerDayBoletaTasks,
  projectOrdersToOrganizerDay,
} from "../organizerDayTasks";
import { buildProductionTasksSheetPrintModel } from "../productionTasksSheetPrintData";

const DAY = "2026-08-09";

function task(overrides = {}) {
  return {
    id: 1,
    productionOrderId: 10,
    productionOrderCode: "OPK-1",
    scheduledDate: DAY,
    desk: 3,
    status: "PENDING",
    productCode: "ART-1",
    productName: "Cartera",
    colorName: "Negro",
    quantity: 2,
    ...overrides,
  };
}

describe("getOrganizerDayDeskTasks (hoja / descarga del día)", () => {
  test("incluye OP sin mesa asignada", () => {
    const tasks = [task({ id: 1, desk: null, productionOrderCode: "OPK-40" })];
    const result = getOrganizerDayDeskTasks(tasks, DAY);
    expect(result).toHaveLength(1);
    expect(result[0].productionOrderCode).toBe("OPK-40");
  });

  test("incluye OPL del día", () => {
    const tasks = [
      task({
        id: 2,
        desk: null,
        productionOrderId: 20,
        productionOrderCode: "OPL-12",
        status: "PENDING",
      }),
    ];
    const result = getOrganizerDayDeskTasks(tasks, DAY);
    expect(result).toHaveLength(1);
    expect(result[0].productionOrderCode).toBe("OPL-12");
  });

  test("incluye AWAITING_WAREHOUSE", () => {
    const tasks = [task({ id: 3, status: "AWAITING_WAREHOUSE", desk: 1 })];
    expect(getOrganizerDayDeskTasks(tasks, DAY)).toHaveLength(1);
  });

  test("excluye CANCELLED y COMPLETED", () => {
    const tasks = [
      task({ id: 4, status: "CANCELLED", desk: 1 }),
      task({ id: 5, status: "COMPLETED", desk: 2 }),
      task({ id: 6, status: "IN_PROGRESS", desk: null }),
    ];
    const result = getOrganizerDayDeskTasks(tasks, DAY);
    expect(result.map((t) => t.id)).toEqual([6]);
  });

  test("solo tareas con scheduledDate del día", () => {
    const tasks = [
      task({ id: 7, scheduledDate: "2026-08-08" }),
      task({ id: 8, scheduledDate: DAY }),
    ];
    expect(getOrganizerDayDeskTasks(tasks, DAY).map((t) => t.id)).toEqual([8]);
  });
});

describe("getOrganizerDayBoletaTasks", () => {
  test("sigue exigiendo mesa y solo PENDING/IN_PROGRESS", () => {
    const tasks = [
      task({ id: 1, desk: null, status: "PENDING" }),
      task({ id: 2, desk: 4, status: "AWAITING_WAREHOUSE" }),
      task({ id: 3, desk: 5, status: "PENDING" }),
    ];
    expect(getOrganizerDayBoletaTasks(tasks, DAY).map((t) => t.id)).toEqual([3]);
  });
});

describe("projectOrdersToOrganizerDay", () => {
  test("proyecta OP sin mesa y OPL; omite cancelada", () => {
    const dayTasks = getOrganizerDayDeskTasks(
      [
        task({
          id: 1,
          desk: null,
          productionOrderId: 10,
          productionOrderCode: "OPK-1",
          items: [{ productCode: "A", colorName: "Negro", quantity: 3 }],
        }),
        task({
          id: 2,
          desk: null,
          productionOrderId: 20,
          productionOrderCode: "OPL-9",
          status: "PENDING",
          items: [{ productCode: "B", colorName: "Café", quantity: 1 }],
        }),
        task({
          id: 3,
          desk: 1,
          productionOrderId: 30,
          productionOrderCode: "OPK-99",
          status: "CANCELLED",
          items: [{ productCode: "C", colorName: "Negro", quantity: 9 }],
        }),
        task({
          id: 4,
          desk: 2,
          productionOrderId: 40,
          productionOrderCode: "OPK-50",
          status: "AWAITING_WAREHOUSE",
          items: [{ productCode: "D", colorName: "Negro", quantity: 4 }],
        }),
      ],
      DAY
    );

    const orders = [
      { id: 10, code: "OPK-1", items: [] },
      { id: 20, code: "OPL-9", items: [] },
      { id: 30, code: "OPK-99", items: [] },
      { id: 40, code: "OPK-50", items: [] },
    ];

    const projected = projectOrdersToOrganizerDay(orders, dayTasks);
    const codes = projected.map((o) => o.code).sort();
    expect(codes).toEqual(["OPK-1", "OPK-50", "OPL-9"]);
    expect(projected.find((o) => o.code === "OPK-1").items[0].quantity).toBe(3);
    expect(projected.find((o) => o.code === "OPL-9").items[0].quantity).toBe(1);
  });

  test("conserva observaciones de la OP y de cada línea", () => {
    const dayTasks = getOrganizerDayDeskTasks(
      [
        task({
          id: 1,
          productionOrderId: 10,
          productionOrderCode: "OPK-1",
          items: [{ productionOrderItemId: 101, productCode: "A", colorName: "Negro", quantity: 2 }],
        }),
      ],
      DAY
    );
    const orders = [
      {
        id: 10,
        code: "OPK-1",
        observations: "Prioridad kiosko 12",
        items: [
          { id: 101, productCode: "A", colorName: "Negro", quantity: 2, observations: "Sin herraje" },
        ],
      },
    ];
    const projected = projectOrdersToOrganizerDay(orders, dayTasks);
    expect(projected[0].observations).toBe("Prioridad kiosko 12");
    expect(projected[0].items[0].observations).toBe("Sin herraje");
  });
});

describe("buildProductionTasksSheetPrintModel", () => {
  test("incluye sin mesa, OPL y AWAITING_WAREHOUSE; excluye COMPLETED", () => {
    const tasks = [
      task({ id: 1, desk: null, productionOrderCode: "OPK-1", productCode: "X1" }),
      task({
        id: 2,
        desk: null,
        productionOrderId: 20,
        productionOrderCode: "OPL-3",
        productCode: "X2",
        status: "PENDING",
      }),
      task({
        id: 3,
        desk: 1,
        productionOrderId: 30,
        productionOrderCode: "OPK-2",
        productCode: "X3",
        status: "AWAITING_WAREHOUSE",
      }),
      task({
        id: 4,
        desk: 2,
        productionOrderId: 40,
        productionOrderCode: "OPK-3",
        productCode: "X4",
        status: "COMPLETED",
      }),
    ];
    const orders = [
      { id: 10, code: "OPK-1", orderType: "NORMAL" },
      { id: 20, code: "OPL-3", orderType: "VENTA_EN_LINEA" },
      { id: 30, code: "OPK-2", orderType: "NORMAL" },
      { id: 40, code: "OPK-3", orderType: "NORMAL" },
    ];
    const model = buildProductionTasksSheetPrintModel(tasks, orders, { workDateYmd: DAY });
    expect(model.emptyMessage).toBeNull();
    const opsJoined = model.rows.map((r) => r.ops).join(" ");
    expect(opsJoined).toContain("OPK-1");
    expect(opsJoined).toContain("OPL-3");
    expect(opsJoined).toContain("OPK-2");
    expect(opsJoined).not.toContain("OPK-3");
  });
});
