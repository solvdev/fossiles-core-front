import {
  getTaskBaseHours,
  getTaskExtraHours,
  isOnlineSaleOrder,
  lineCountsAgainstCupo,
  MAX_HOURS_PER_TASK_HARD_CAP,
} from "../taskHoursHelper";

describe("taskHoursHelper OPL cupo", () => {
  test("isOnlineSaleOrder by type and code", () => {
    expect(isOnlineSaleOrder("VENTA_EN_LINEA", "OPL-1")).toBe(true);
    expect(isOnlineSaleOrder(null, "OPL-9")).toBe(true);
    expect(isOnlineSaleOrder("NORMAL", "OPK-1")).toBe(false);
  });

  test("pure OPL task contributes zero base hours", () => {
    const task = {
      productionOrderCode: "OPL-12",
      estimatedHours: 3.5,
      items: [{ estimatedHours: 3.5, daySaleExtra: false }],
    };
    expect(getTaskBaseHours(task)).toBe(0);
    expect(getTaskExtraHours(task)).toBe(3.5);
  });

  test("mixed OP + OPL: only OP hours count toward cupo", () => {
    const task = {
      productionOrderCode: "OPK-40",
      estimatedHours: 3.2 + 2.5,
      items: [
        { estimatedHours: 3.2, daySaleExtra: false },
        { estimatedHours: 2.5, daySaleExtra: true, productionOrderCode: "OPL-8" },
      ],
    };
    expect(getTaskBaseHours(task)).toBeCloseTo(3.2, 5);
    expect(getTaskBaseHours(task)).toBeLessThanOrEqual(MAX_HOURS_PER_TASK_HARD_CAP);
  });

  test("draft lines: OPL never counts against cupo", () => {
    const opLine = { onlineSale: false, daySaleExtra: false, productionOrderCode: "OPK-1", hours: 4 };
    const oplLine = { onlineSale: true, daySaleExtra: true, productionOrderCode: "OPL-2", hours: 9 };
    expect(lineCountsAgainstCupo(opLine)).toBe(true);
    expect(lineCountsAgainstCupo(oplLine)).toBe(false);
    const baseHours = [opLine, oplLine]
      .filter(lineCountsAgainstCupo)
      .reduce((s, l) => s + l.hours, 0);
    expect(baseHours).toBe(4);
  });
});
