import React, { useMemo } from "react";
import { Alert, Badge, Button, Col, FormGroup, Label, Row, Spinner, Table } from "reactstrap";
import { ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import {
  formatInventorySizesLine,
  flattenInventoryVariantsToSizeRows,
  hasInventorySizeBreakdown,
} from "utils/inventoryVariantHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import "./KioskInventory.css";

function KioskInventoryStockExplorer({
  kioskOptions,
  products,
  colors,
  stockRows,
  loading,
  selectedKiosk,
  onKioskChange,
  selectedProductId,
  onProductChange,
  selectedColorId,
  onColorChange,
  showAllRows,
  onToggleShowAll,
  packagingStockCount,
  stockViewFilter,
  onStockViewFilterChange,
  filteredStockRows,
}) {
  const productVariants = useMemo(() => {
    if (!selectedProductId) return [];
    return (stockRows || []).filter(
      (row) => Number(row.productId) === Number(selectedProductId)
    );
  }, [stockRows, selectedProductId]);

  const selectedVariant = useMemo(() => {
    if (!productVariants.length) return null;
    if (selectedColorId) {
      return (
        productVariants.find((row) => Number(row.colorId) === Number(selectedColorId)) ||
        productVariants[0]
      );
    }
    return productVariants.length === 1 ? productVariants[0] : null;
  }, [productVariants, selectedColorId]);

  const sizeRows = useMemo(
    () => flattenInventoryVariantsToSizeRows(selectedVariant ? [selectedVariant] : productVariants),
    [selectedVariant, productVariants]
  );

  const selectedProduct = useMemo(
    () => (products || []).find((p) => Number(p.id) === Number(selectedProductId)) || null,
    [products, selectedProductId]
  );

  return (
    <div className="kiosk-inv-stock-explorer mb-3">
      <Row>
        <Col md="6">
          <FormGroup className="mb-2">
            <Label className="mb-1">Kiosko</Label>
            <FilterableSelect
              value={selectedKiosk}
              onChange={onKioskChange}
              options={kioskOptions}
              placeholder="Buscar kiosko…"
              emptyLabel="Selecciona kiosko"
            />
          </FormGroup>
        </Col>
        <Col md="6">
          <FormGroup className="mb-2">
            <Label className="mb-1">Producto</Label>
            <ProductSelector
              products={products}
              value={selectedProductId}
              onChange={(product) => onProductChange(product ? String(product.id) : "")}
              placeholder="Buscar producto…"
              disabled={!selectedKiosk}
            />
          </FormGroup>
        </Col>
      </Row>

      {!selectedKiosk ? (
        <Alert color="light" className="border mb-0 py-2">
          Selecciona un kiosko para consultar stock.
        </Alert>
      ) : loading ? (
        <div className="text-center py-3 text-muted">
          <Spinner size="sm" className="mr-2" />
          Cargando stock…
        </div>
      ) : !selectedProductId ? (
        <Alert color="light" className="border mb-0 py-2">
          {stockRows.length === 0
            ? "Este kiosko no tiene filas de inventario. Use «Generar inventario» o registre entradas."
            : `Hay ${stockRows.length} fila(s) en este kiosko. Busca un producto para ver colores y tallas.`}
        </Alert>
      ) : productVariants.length === 0 ? (
        <Alert color="warning" className="mb-0 py-2">
          El producto <strong>{selectedProduct?.code || selectedProductId}</strong> no tiene stock
          registrado en este kiosko.
        </Alert>
      ) : (
        <>
          {productVariants.length > 1 ? (
            <FormGroup className="mb-2">
              <Label className="mb-1">Color / variante</Label>
              <div>
                {productVariants.map((row) => {
                  const active =
                    selectedColorId &&
                    Number(row.colorId) === Number(selectedColorId);
                  return (
                    <Badge
                      key={row.id || `${row.productId}-${row.colorId}`}
                      color={active ? "primary" : "secondary"}
                      className={`kiosk-inv-color-pill ${active ? "active" : ""}`}
                      onClick={() => onColorChange(row.colorId ? String(row.colorId) : "")}
                      style={{ cursor: "pointer" }}
                    >
                      {row.colorName || "Sin color"} · {row.currentStock}
                    </Badge>
                  );
                })}
              </div>
            </FormGroup>
          ) : null}

          {(selectedVariant || productVariants.length === 1) && (
            <div className="kiosk-inv-variant-card">
              <div className="d-flex justify-content-between align-items-start flex-wrap mb-2">
                <div>
                  <strong>
                    {selectedVariant?.productCode || selectedProduct?.code} —{" "}
                    {selectedVariant?.productName || selectedProduct?.name}
                  </strong>
                  {isPackagingProductCode(selectedVariant?.productCode) ? (
                    <Badge color="secondary" className="ml-2">Empaque</Badge>
                  ) : null}
                  <div className="text-muted small mt-1">
                    Color: {selectedVariant?.colorName || "—"}
                  </div>
                </div>
                <div className="text-right">
                  <div className="small text-muted">Stock actual</div>
                  <div className="h4 mb-0 text-primary">{selectedVariant?.currentStock ?? 0}</div>
                  <div className="small text-muted">
                    Mínimo: {selectedVariant?.minimumStock ?? 0}
                  </div>
                </div>
              </div>

              {hasInventorySizeBreakdown(selectedVariant?.sizes) ? (
                <>
                  <div className="small text-muted mb-1">Desglose por talla</div>
                  <div>
                    {Object.entries(selectedVariant.sizes || {})
                      .filter(([, qty]) => Number(qty) > 0)
                      .sort(([a], [b]) => parseFloat(a) - parseFloat(b))
                      .map(([size, qty]) => (
                        <span key={size} className="kiosk-inv-size-chip">
                          Talla <strong>{size}</strong>: {qty}
                        </span>
                      ))}
                  </div>
                </>
              ) : formatInventorySizesLine(selectedVariant?.sizes) ? (
                <div className="small text-muted">{formatInventorySizesLine(selectedVariant.sizes)}</div>
              ) : (
                <div className="small text-muted">Sin desglose por talla.</div>
              )}
            </div>
          )}

          {productVariants.length > 1 && !selectedColorId ? (
            <Alert color="info" className="py-2 mb-2">
              Este producto tiene {productVariants.length} variantes de color. Selecciona una arriba
              o revisa el resumen:
            </Alert>
          ) : null}

          {productVariants.length > 1 && !selectedColorId && sizeRows.length > 0 ? (
            <Table responsive size="sm" className="mb-0 bg-white">
              <thead>
                <tr>
                  <th>Color</th>
                  <th>Talla</th>
                  <th className="text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {sizeRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.colorName}</td>
                    <td>{row.size || "—"}</td>
                    <td className="text-right">{row.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : null}
        </>
      )}

      <div className="d-flex justify-content-between align-items-center flex-wrap mt-3 pt-2 border-top">
        <Button color="link" size="sm" className="p-0" onClick={onToggleShowAll}>
          {showAllRows ? "Ocultar tabla completa" : "Ver tabla completa del kiosko"}
        </Button>
        {showAllRows && selectedKiosk && stockRows.length > 0 ? (
          <div className="btn-group btn-group-sm">
            <Button
              color={stockViewFilter === "ALL" ? "primary" : "outline-primary"}
              size="sm"
              onClick={() => onStockViewFilterChange("ALL")}
            >
              Todo
            </Button>
            <Button
              color={stockViewFilter === "PRODUCTS" ? "primary" : "outline-primary"}
              size="sm"
              onClick={() => onStockViewFilterChange("PRODUCTS")}
            >
              Productos
            </Button>
            <Button
              color={stockViewFilter === "PACKAGING" ? "primary" : "outline-primary"}
              size="sm"
              onClick={() => onStockViewFilterChange("PACKAGING")}
            >
              Empaques {packagingStockCount > 0 ? `(${packagingStockCount})` : ""}
            </Button>
          </div>
        ) : null}
      </div>

      {showAllRows && selectedKiosk ? (
        <div className="mt-2">
          {filteredStockRows.length === 0 ? (
            <Alert color="light" className="border mb-0">Sin filas para el filtro.</Alert>
          ) : (
            <Table responsive size="sm" className="mb-0 bg-white">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Color</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Mínimo</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredStockRows.map((row) => {
                  const low = Number(row.currentStock || 0) <= Number(row.minimumStock || 0);
                  return (
                    <tr key={row.id} className={low ? "table-danger" : ""}>
                      <td>
                        {row.productCode} - {row.productName}
                        {isPackagingProductCode(row.productCode) ? (
                          <Badge color="secondary" className="ml-1">Empaque</Badge>
                        ) : null}
                      </td>
                      <td>{row.colorName || "—"}</td>
                      <td className="text-right">{row.currentStock}</td>
                      <td className="text-right">{row.minimumStock}</td>
                      <td>
                        {low ? <Badge color="danger">Bajo</Badge> : <Badge color="success">Normal</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default KioskInventoryStockExplorer;
