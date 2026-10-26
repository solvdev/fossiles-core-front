import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import TaskCapacityBar, { capacityTexts } from "../TaskCapacityBar";
import StepBuildTasks from "../StepBuildTasks";

const task = (clientId, hours, extra = {}) => ({
  clientId,
  orderId: 1,
  orderCode: `OP-${clientId}`,
  family: "Pared",
  onlineSale: false,
  lines: [{
    productionOrderItemId: Number(clientId.replace(/\D/g, "")) || 1,
    productCode: "P1",
    productName: "Producto",
    colorName: null,
    quantity: 10,
    prdTimePerUnit: hours / 10,
    remainingQuantity: 100,
  }],
  ...extra,
});

describe("TaskCapacityBar", () => {
  test("texto por nivel", () => {
    expect(capacityTexts(task("t1", 2)).right).toBe("Cabe bien");
    expect(capacityTexts(task("t2", 3.5)).right).toBe("Cerca del límite");
    expect(capacityTexts(task("t3", 4.5)).right).toBe("Permitido hasta 5 h");
    expect(capacityTexts(task("t4", 6)).right).toBe("No se puede confirmar");
    expect(capacityTexts(task("t5", 6, { onlineSale: true })).right).toBe("No cuenta contra el límite");
  });

  test("la barra expone el nivel para el estilo", () => {
    const { container } = render(<TaskCapacityBar task={task("t4", 6)} />);
    expect(container.querySelector(".dp-cap").getAttribute("data-level")).toBe("over");
  });
});

describe("StepBuildTasks", () => {
  const planner = (tasks) => ({
    tasks,
    notice: null,
    setNotice: jest.fn(),
    selectedOrders: [{ id: 1, code: "OP-1" }],
    orders: [{ id: 1, code: "OP-1", items: [] }],
    newTask: jest.fn(),
    leftovers: [],
    buildFromLeftovers: jest.fn(),
    rebuildTasks: jest.fn(),
    changeQty: jest.fn(),
    removeLine: jest.fn(),
    moveLine: jest.fn(),
    addItem: jest.fn(),
    fixTask: jest.fn(),
    itemById: jest.fn(),
  });

  const openAll = () => screen.getAllByRole("button", { name: /^Ver / }).forEach((b) => fireEvent.click(b));

  test("«Arreglar sola» aparece solo en las tareas rojas", () => {
    render(<StepBuildTasks planner={planner([
      task("t1", 2), task("t2", 4.5), task("t3", 6), task("t4", 8, { onlineSale: true }),
    ])} />);
    openAll();
    expect(screen.getAllByText("Arreglar sola")).toHaveLength(1);
  });

  test("sin tareas rojas no hay «Arreglar sola»", () => {
    render(<StepBuildTasks planner={planner([task("t1", 2), task("t2", 4.5)])} />);
    openAll();
    expect(screen.queryByText("Arreglar sola")).toBeNull();
  });
});
