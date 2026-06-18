import React, { useMemo } from "react";
import { Alert, Card, CardBody, Input } from "reactstrap";
import {
  buildCategoryOptions,
  buildColorOptions,
  filterPosInventory,
  formatCurrency,
  formatQty,
  getColorSwatch,
  groupInventoryByProduct,
  lineKeyFor,
  POS_COLOR_SWATCHES,
  resolveImageUrl,
} from "./posUtils";

function PosCatalogPanel({
  inventory,
  productSearch,
  onSearchChange,
  categoryFilter,
  onCategoryFilterChange,
  colorFilter,
  onColorFilterChange,
  cartQtyByKey,
  onAddProduct,
}) {
  const categoryOptions = useMemo(() => buildCategoryOptions(inventory), [inventory]);
  const colorOptions = useMemo(() => buildColorOptions(inventory), [inventory]);

  const filteredInventory = useMemo(
    () =>
      filterPosInventory(inventory, {
        search: productSearch,
        categoryFilter,
        colorFilter,
      }),
    [inventory, productSearch, categoryFilter, colorFilter]
  );

  const groupedProducts = useMemo(
    () => groupInventoryByProduct(filteredInventory),
    [filteredInventory]
  );

  const handleCategoryClick = (option) => {
    if (option.disabled || option.id == null) return;
    const next = String(categoryFilter) === String(option.id) ? "" : String(option.id);
    onCategoryFilterChange(next);
  };

  const handleColorClick = (color, disabled) => {
    if (disabled) return;
    const next = colorFilter === color ? "" : color;
    onColorFilterChange(next);
  };

  return (
    <Card className="kiosk-pos-block kiosk-pos-catalog">
      <CardBody>
        <div className="kiosk-pos-search-wrap">
          <i className="nc-icon nc-zoom-split" />
          <Input
            className="kiosk-pos-search-input"
            value={productSearch}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar código, nombre o color"
          />
        </div>

        <div className="kiosk-pos-filter-row">
          <span className="kiosk-pos-filter-label">Categoría</span>
          <div className="kiosk-pos-chips">
            <button
              type="button"
              className={`kiosk-pos-chip ${!categoryFilter ? "active" : ""}`}
              onClick={() => onCategoryFilterChange("")}
            >
              Todas
            </button>
            {categoryOptions.map((option) => (
              <button
                key={`cat-${option.label}-${option.id || "none"}`}
                type="button"
                className={`kiosk-pos-chip ${
                  option.id != null && String(categoryFilter) === String(option.id) ? "active" : ""
                } ${option.disabled ? "disabled" : ""}`}
                onClick={() => handleCategoryClick(option)}
                disabled={option.disabled}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="kiosk-pos-filter-row mb-3">
          <span className="kiosk-pos-filter-label">Color</span>
          <div className="kiosk-pos-chips">
            <button
              type="button"
              className={`kiosk-pos-chip ${!colorFilter ? "active" : ""}`}
              onClick={() => onColorFilterChange("")}
            >
              Todos los colores
            </button>
            {colorOptions.map(({ color, disabled }) => {
              const swatch = POS_COLOR_SWATCHES[color] || "#ccc";
              return (
                <button
                  key={`color-${color}`}
                  type="button"
                  className={`kiosk-pos-chip ${colorFilter === color ? "active" : ""} ${
                    disabled ? "disabled" : ""
                  }`}
                  onClick={() => handleColorClick(color, disabled)}
                  disabled={disabled}
                >
                  <span className="kiosk-pos-color-dot" style={{ backgroundColor: swatch }} />
                  {color}
                </button>
              );
            })}
          </div>
        </div>

        {filteredInventory.length === 0 && (
          <Alert color="warning" className="mb-3">
            No hay productos con los filtros actuales.
          </Alert>
        )}

        <div className="kiosk-pos-inventory-grid">
          {groupedProducts.map((group) => {
            const imageUrl = resolveImageUrl(group.productImageUrl);

            return (
              <div key={group.productId} className="kiosk-pos-product-card">
                {imageUrl ? (
                  <img src={imageUrl} alt={group.productName} className="kiosk-pos-product-image" />
                ) : (
                  <div className="kiosk-pos-product-placeholder">
                    <i className="nc-icon nc-image" />
                  </div>
                )}
                <div className="kiosk-pos-product-code">{group.productCode}</div>
                <div className="kiosk-pos-item-name">{group.productName}</div>
                <div className="kiosk-pos-item-price">{formatCurrency(group.suggestedUnitPrice)}</div>
                <div className="kiosk-pos-variant-chips">
                  {group.variants.map((variant) => {
                    const key = lineKeyFor(variant.productId, variant.colorId);
                    const qtyInCart = cartQtyByKey[key] || 0;
                    const stock = Number(variant.quantity || 0);
                    const stockLow = stock <= 3;
                    const outOfStock = stock <= 0;
                    const colorName = String(variant.colorName || "").trim() || "Sin color";
                    const swatch = getColorSwatch(colorName);

                    return (
                      <button
                        key={key}
                        type="button"
                        className={`kiosk-pos-variant-chip ${stockLow ? "low-stock" : ""} ${
                          outOfStock ? "disabled" : ""
                        }`}
                        onClick={outOfStock ? undefined : () => onAddProduct(variant)}
                        disabled={outOfStock}
                        title={`${colorName} · Stock: ${formatQty(stock)}${
                          outOfStock ? " · Sin stock para venta" : ""
                        }`}
                      >
                        {qtyInCart > 0 && (
                          <span className="kiosk-pos-qty-badge">{formatQty(qtyInCart)}</span>
                        )}
                        <span className="kiosk-pos-color-dot" style={{ backgroundColor: swatch }} />
                        <span className="kiosk-pos-variant-chip-label">{colorName}</span>
                        <span className="kiosk-pos-variant-chip-stock">{formatQty(stock)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

export default PosCatalogPanel;
