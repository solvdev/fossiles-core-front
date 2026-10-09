import React, { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import PosCatalogPanel from "./PosCatalogPanel";

const inventory = [
  {
    productId: 20,
    productCode: "LL-20",
    productName: "Llavero metal",
    colorId: 1,
    colorName: "Azul",
    hardwareCondition: "NUEVO",
    quantity: 6,
    suggestedUnitPrice: 25,
  },
  {
    productId: 30,
    productCode: "SUM-01",
    productName: "Caja chica",
    colorId: 2,
    colorName: "Negro",
    hardwareCondition: "NUEVO",
    quantity: 4,
    suggestedUnitPrice: 15,
  },
  {
    productId: 31,
    productCode: "sum-9",
    productName: "Cinta sum",
    colorId: 3,
    colorName: "Rojo",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 8,
  },
  {
    productId: 32,
    productCode: "EMP-4",
    productName: "Bolsa tela",
    colorId: 4,
    colorName: "Café",
    hardwareCondition: "NUEVO",
    quantity: 3,
    suggestedUnitPrice: 5,
    isPackaging: true,
  },
  {
    productId: 33,
    productCode: "BOX-2",
    productName: "Sobre kraft",
    colorId: 5,
    colorName: "Tostado",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 3,
    packaging: true,
  },
];

function CatalogHarness({ posMode = "STANDARD", initialCatalogView = "PRODUCTS", onAddProduct = () => {} }) {
  const [catalogView, setCatalogView] = useState(initialCatalogView);
  const [productSearch, setProductSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");

  return (
    <PosCatalogPanel
      inventory={inventory}
      productSearch={productSearch}
      onSearchChange={setProductSearch}
      catalogView={catalogView}
      onCatalogViewChange={setCatalogView}
      categoryFilter={categoryFilter}
      onCategoryFilterChange={setCategoryFilter}
      audienceFilter={audienceFilter}
      onAudienceFilterChange={setAudienceFilter}
      colorFilter={colorFilter}
      onColorFilterChange={setColorFilter}
      cartQtyByColorKey={{}}
      onAddProduct={onAddProduct}
      onPickSizedVariant={() => {}}
      posMode={posMode}
    />
  );
}

describe("PosCatalogPanel empaques", () => {
  it("no ofrece empaques ni el filtro de empaque en Entrecueros", () => {
    const onAddProduct = jest.fn();
    render(
      <CatalogHarness posMode="ENTRECUEROS" initialCatalogView="PACKAGING" onAddProduct={onAddProduct} />
    );

    expect(screen.queryByText("Vista")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Empaques" })).not.toBeInTheDocument();
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Cinta sum")).not.toBeInTheDocument();
    expect(screen.queryByText("Bolsa tela")).not.toBeInTheDocument();
    expect(screen.queryByText("Sobre kraft")).not.toBeInTheDocument();
    expect(screen.getByText("Llavero metal")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar código, nombre o color"), {
      target: { value: "sum" },
    });
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();
    expect(screen.queryByText("Cinta sum")).not.toBeInTheDocument();
    expect(screen.queryByText("Llavero metal")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar código, nombre o color"), {
      target: { value: "bolsa" },
    });
    expect(screen.queryByText("Bolsa tela")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Buscar código, nombre o color"), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Azul\s+6/ }));
    expect(onAddProduct).toHaveBeenCalledTimes(1);
    expect(onAddProduct.mock.calls[0][0].productCode).toBe("LL-20");
  });

  it("el kiosko sigue mostrando empaques SUM al precio de catálogo", () => {
    const onAddProduct = jest.fn();
    render(<CatalogHarness posMode="STANDARD" onAddProduct={onAddProduct} />);

    expect(screen.getByText("Vista")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Empaques" })).toBeInTheDocument();
    expect(screen.getByText("Llavero metal")).toBeInTheDocument();
    expect(screen.getByText("Bolsa tela")).toBeInTheDocument();
    expect(screen.queryByText("Caja chica")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Empaques" }));

    expect(screen.getByText("Caja chica")).toBeInTheDocument();
    expect(screen.getByText("Q 15.00")).toBeInTheDocument();
    expect(screen.queryByText("Llavero metal")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /SUM-01/ }));
    expect(onAddProduct).toHaveBeenCalledTimes(1);
    expect(onAddProduct.mock.calls[0][0]).toEqual(
      expect.objectContaining({ productCode: "SUM-01", suggestedUnitPrice: 15 })
    );
  });
});
