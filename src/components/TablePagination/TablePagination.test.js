import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import TablePagination, { usePagination } from "./TablePagination";

function List({ items, initialPageSize = 10, focusId }) {
  const pagination = usePagination(items, initialPageSize);
  return (
    <>
      <ul>
        {pagination.pageItems.map((item) => <li key={item}>Fila {item}</li>)}
      </ul>
      <button type="button" onClick={() => pagination.showItem((item) => item === focusId)}>Mostrar elegido</button>
      <TablePagination pagination={pagination} />
    </>
  );
}

const range = (count) => Array.from({ length: count }, (_, index) => index + 1);

afterEach(cleanup);

test("divide la lista y navega entre páginas", () => {
  render(<List items={range(25)} />);
  expect(screen.getByText("Página")).toHaveTextContent("Página 1 de 3");
  expect(screen.getAllByRole("listitem")).toHaveLength(10);
  expect(screen.getByText(/25 en total/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Página anterior" })).toBeDisabled();

  fireEvent.click(screen.getByRole("button", { name: "Última página" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(5);
  expect(screen.getByText("Fila 21")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Página siguiente" })).toBeDisabled();

  fireEvent.change(screen.getByLabelText("Registros por página"), { target: { value: "50" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
  expect(screen.getByText("Página")).toHaveTextContent("Página 1 de 1");
});

test("vuelve a una página existente si la lista se achica y lleva a la página de un elemento", () => {
  const { rerender } = render(<List items={range(25)} focusId={18} />);
  fireEvent.click(screen.getByRole("button", { name: "Mostrar elegido" }));
  expect(screen.getByText("Fila 18")).toBeInTheDocument();
  expect(screen.getByText("Página")).toHaveTextContent("Página 2 de 3");

  fireEvent.click(screen.getByRole("button", { name: "Última página" }));
  rerender(<List items={range(12)} focusId={18} />);
  expect(screen.getByText("Página")).toHaveTextContent("Página 2 de 2");
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

test("sin elementos no muestra el control", () => {
  render(<List items={[]} />);
  expect(screen.queryByText(/registros por página/)).not.toBeInTheDocument();
});
