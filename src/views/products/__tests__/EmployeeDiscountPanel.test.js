import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmployeeDiscountPanel from "../EmployeeDiscountPanel";
import { setProductEmployeeDiscounts } from "services/productService";

jest.mock("services/productService");
jest.mock("utils/notificationHelper");

const products = [
  { id: 1, code: "CIN-1", name: "Cincho", salePrice: 200, employeeDiscountPercent: null },
  { id: 2, code: "BIL-1", name: "Billetera", salePrice: 100, employeeDiscountPercent: 30 },
  { id: 3, code: "SIN-PRECIO", name: "Sin precio", salePrice: 0, employeeDiscountPercent: null },
];

const open = () => fireEvent.click(screen.getByRole("button", { name: /Descuento a colaboradores/ }));
const rowOf = (code) => screen.getByText(new RegExp(code)).closest("tr");
afterEach(cleanup);

test("muestra lo que paga el colaborador con el descuento propio o el 50 % general", () => {
  render(<EmployeeDiscountPanel products={products} />);
  open();
  expect(within(rowOf("CIN-1")).getByText("Q100.00")).toBeInTheDocument();
  expect(within(rowOf("BIL-1")).getByText("Q70.00")).toBeInTheDocument();
  expect(screen.queryByText(/SIN-PRECIO/)).not.toBeInTheDocument();
});

test("guarda solo lo que cambió y manda vacío como volver al general", async () => {
  setProductEmployeeDiscounts.mockResolvedValue("ok");
  const onSaved = jest.fn();
  render(<EmployeeDiscountPanel products={products} onSaved={onSaved} />);
  open();
  fireEvent.change(screen.getByLabelText("Descuento de colaborador de CIN-1"), { target: { value: "20" } });
  fireEvent.change(screen.getByLabelText("Descuento de colaborador de BIL-1"), { target: { value: "" } });
  expect(within(rowOf("CIN-1")).getByText("Q160.00")).toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Guardar 2 cambios" })); });
  await waitFor(() => expect(setProductEmployeeDiscounts).toHaveBeenCalledWith([
    { productId: 1, discountPercent: 20 },
    { productId: 2, discountPercent: null },
  ]));
  expect(onSaved).toHaveBeenCalled();
});

test("un descuento fuera de 0 a 100 no deja guardar", () => {
  render(<EmployeeDiscountPanel products={products} />);
  open();
  fireEvent.change(screen.getByLabelText("Descuento de colaborador de CIN-1"), { target: { value: "120" } });
  expect(screen.getByRole("button", { name: "Guardar 1 cambio" })).toBeDisabled();
});

test("poner el mismo descuento a todos los mostrados", () => {
  render(<EmployeeDiscountPanel products={products} />);
  open();
  fireEvent.change(screen.getByLabelText("Descuento para todos los productos mostrados"), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: /Poner a los 2 mostrados/ }));
  expect(within(rowOf("CIN-1")).getByText("Q120.00")).toBeInTheDocument();
  expect(within(rowOf("BIL-1")).getByText("Q60.00")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Guardar 2 cambios" })).toBeEnabled();
});
