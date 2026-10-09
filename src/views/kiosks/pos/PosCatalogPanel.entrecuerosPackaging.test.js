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
  {
    productId: 40,
    productCode: "CIN-1",
    productName: "Cincho verde",
    colorId: 8,
    colorName: "Verde",
    hardwareCondition: "NUEVO",
    quantity: 4,
    suggestedUnitPrice: 100,
    sizes: { "34": 2, "36": 2 },
  },
  {
    productId: 41,
    productCode: "SUM-T",
    productName: "Funda talla",
    colorId: 9,
    colorName: "Gris",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 11,
    sizes: { "34": 2 },
  },
  {
    productId: 42,
    productCode: "EMP-T",
    productName: "Bolsa talla",
    colorId: 10,
    colorName: "Marfil",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 6,
    isPackaging: true,
    sizes: { U: 2 },
  },
  {
    productId: 43,
    productCode: "BOX-T",
    productName: "Sobre talla",
    colorId: 11,
    colorName: "Crema",
    hardwareCondition: "NUEVO",
    quantity: 2,
    suggestedUnitPrice: 4,
    packaging: true,
    sizes: { U: 2 },
  },
];

function CatalogHarness({
  posMode = "STANDARD",
  initialCatalogView = "PRODUCTS",
  onAddProduct = () => {},
  onPickSizedVariant = () => {},
}) {
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
      onPickSizedVariant={onPickSizedVariant}
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

  it("no abre la talla de un empaque en Entrecueros aunque la vista haya quedado en Empaques", () => {
    const onPickSizedVariant = jest.fn();
    const onAddProduct = jest.fn();
    render(
      <CatalogHarness
        posMode="ENTRECUEROS"
        initialCatalogView="PACKAGING"
        onAddProduct={onAddProduct}
        onPickSizedVariant={onPickSizedVariant}
      />
    );

    expect(screen.queryByRole("button", { name: "Empaques" })).not.toBeInTheDocument();
    expect(screen.queryByText("Funda talla")).not.toBeInTheDocument();
    expect(screen.queryByText("Bolsa talla")).not.toBeInTheDocument();
    expect(screen.queryByText("Sobre talla")).not.toBeInTheDocument();
    expect(screen.queryByText("SUM-T")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Verde\s+Talla/ }));
    expect(onPickSizedVariant).toHaveBeenCalledTimes(1);
    expect(onPickSizedVariant.mock.calls[0][0].productCode).toBe("CIN-1");
    expect(onAddProduct).not.toHaveBeenCalled();
  });
});
