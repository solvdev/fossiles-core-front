import { carriedByOrder } from "../CinchosDayBoard";
import { cinchoDayFromApi } from "utils/cinchoDayBoardHelper";

describe("cinchos que vienen de días anteriores", () => {
  const day = {
    orders: [
      { id: 1, code: "OPCF-1", family: "OPCF", customerName: "A", lines: [{ productionOrderItemId: 10, totalQty: 3, workStatus: "PENDING" }] },
      { id: 2, code: "OPCF-2", family: "OPCF", customerName: "B", carriedFrom: "2026-10-01",
        lines: [{ productionOrderItemId: 20, totalQty: 4, workStatus: "IN_PROGRESS" }, { productionOrderItemId: 21, totalQty: 1 }] },
      { id: 3, code: "OPCF-3", family: "OPCF", customerName: "C", carriedFrom: "2026-09-20",
        lines: [{ productionOrderItemId: 30, totalQty: 2 }] },
    ],
  };

  it("las filas llevan su día de origen y el estado que trae el servidor", () => {
    const { rows, workStatusMap } = cinchoDayFromApi(day);
    expect(rows.find((r) => r.productionOrderItemId === 20).carriedFrom).toBe("2026-10-01");
    expect(rows.find((r) => r.productionOrderItemId === 10).carriedFrom).toBeNull();
    expect(workStatusMap[20]).toBe("IN_PROGRESS");
  });

  it("se agrupan por OP, la más antigua primero, y dejan fuera las del día", () => {
    const groups = carriedByOrder(cinchoDayFromApi(day).rows);
    expect(groups.map((g) => g.orderCode)).toEqual(["OPCF-3", "OPCF-2"]);
    expect(groups[1].units).toBe(5);
    expect(groups[1].rows).toHaveLength(2);
  });
});
