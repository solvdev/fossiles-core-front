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
  POS_CATALOG_VIEWS,
  POS_COLOR_SWATCHES,
  posVariantNeedsSizePick,
  posVariantStockQty,
  resolveImageUrl,
  colorLineKeyFor,
  sortPackagingInventory,
} from "./posUtils";
import { PRODUCT_AUDIENCE_OPTIONS } from "utils/productAudienceHelper";

function PosCatalogPanel({
  inventory,
  productSearch,
  onSearchChange,
  catalogView,
  onCatalogViewChange,
  categoryFilter,
  onCategoryFilterChange,
  audienceFilter,
  onAudienceFilterChange,
  colorFilter,
  onColorFilterChange,
  cartQtyByColorKey,
  onAddProduct,
  onPickSizedVariant,
}) {
  const categoryOptions = useMemo(() => buildCategoryOptions(inventory), [inventory]);
  const colorOptions = useMemo(() => buildColorOptions(inventory), [inventory]);
  const isPackagingView = catalogView === "PACKAGING";

  const filteredInventory = useMemo(
    () =>
      filterPosInventory(inventory, {
        search: productSearch,
        categoryFilter,
        audienceFilter,
        colorFilter,
        catalogView,
      }),
    [inventory, productSearch, categoryFilter, audienceFilter, colorFilter, catalogView]
  );

  const groupedProducts = useMemo(
    () => groupInventoryByProduct(filteredInventory),
    [filteredInventory]
  );

  const packagingItems = useMemo(
    () => sortPackagingInventory(filteredInventory),
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

  const handleCatalogViewChange = (nextView) => {
    onCatalogViewChange(nextView);
    if (nextView === "PACKAGING") {
      onCategoryFilterChange("");
      onAudienceFilterChange("");
      onColorFilterChange("");
    }
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
            placeholder={isPackagingView ? "Buscar empaque SUM-…" : "Buscar código, nombre o color"}
          />
        </div>

        <div className="kiosk-pos-filter-row">
          <span className="kiosk-pos-filter-label">Vista</span>
          <div className="kiosk-pos-chips">
            {POS_CATALOG_VIEWS.map((option) => (
              <button
                key={`view-${option.value}`}
                type="button"
                className={`kiosk-pos-chip ${catalogView === option.value ? "active" : ""}`}
                onClick={() => handleCatalogViewChange(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {!isPackagingView && (
          <>
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

            <div className="kiosk-pos-filter-row">
              <span className="kiosk-pos-filter-label">Línea</span>
              <div className="kiosk-pos-chips">
                <button
                  type="button"
                  className={`kiosk-pos-chip ${!audienceFilter ? "active" : ""}`}
                  onClick={() => onAudienceFilterChange("")}
                >
                  Todas
                </button>
                {PRODUCT_AUDIENCE_OPTIONS.map((option) => (
                  <button
                    key={`aud-${option.value}`}
                    type="button"
                    className={`kiosk-pos-chip ${
                      audienceFilter === option.value ? "active" : ""
                    }`}
                    onClick={() =>
                      onAudienceFilterChange(audienceFilter === option.value ? "" : option.value)
                    }
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
          </>
        )}

        {isPackagingView && (
          <Alert color="info" className="py-2 mb-3">
            Empaques <strong>SUM-</strong> con precio de catálogo. Solo se pueden vender si hay stock en el kiosko.
          </Alert>
        )}

        {filteredInventory.length === 0 && (
          <Alert color="warning" className="mb-3">
            {isPackagingView
              ? "No hay empaques SUM- configurados o visibles con los filtros actuales."
              : "No hay productos con los filtros actuales."}
          </Alert>
        )}

        {isPackagingView ? (
          <div className="kiosk-pos-packaging-grid">
            {packagingItems.map((item) => {
              const colorKey = colorLineKeyFor(item.productId, item.colorId);
              const qtyInCart = cartQtyByColorKey[colorKey] || 0;
              const stock = posVariantStockQty(item);
              const outOfStock = stock <= 0;
              const stockLow = stock > 0 && stock <= 3;
              const price = Number(item.suggestedUnitPrice || 0);

              return (
                <button
                  key={colorKey}
                  type="button"
                  className={`kiosk-pos-packaging-card ${outOfStock ? "disabled" : ""}`}
                  onClick={outOfStock ? undefined : () => onAddProduct(item)}
                  disabled={outOfStock}
                  title={
                    outOfStock
                      ? `${item.productCode} · Sin stock en kiosko`
                      : `${item.productCode} · Stock: ${formatQty(stock)} · ${formatCurrency(price)}`
                  }
                >
                  {qtyInCart > 0 && (
                    <span className="kiosk-pos-qty-badge">{formatQty(qtyInCart)}</span>
                  )}
                  <div className="kiosk-pos-packaging-code">{item.productCode}</div>
                  <div className="kiosk-pos-item-name">{item.productName}</div>
                  <div className="kiosk-pos-item-price">{formatCurrency(price)}</div>
                  <div
                    className={`kiosk-pos-packaging-stock ${
                      outOfStock ? "out" : stockLow ? "low" : ""
                    }`}
                  >
                    {outOfStock ? "Sin stock" : `Stock: ${formatQty(stock)}`}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
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
                      const colorKey = colorLineKeyFor(variant.productId, variant.colorId);
                      const needsSize = posVariantNeedsSizePick(variant);
                      const qtyInCart = cartQtyByColorKey[colorKey] || 0;
                      const stock = posVariantStockQty(variant);
                      const stockLow = stock <= 3;
                      const outOfStock = stock <= 0;
                      const colorName = String(variant.colorName || "").trim() || "Sin color";
                      const swatch = getColorSwatch(colorName);

                      return (
                        <button
                          key={colorKey}
                          type="button"
                          className={`kiosk-pos-variant-chip ${needsSize ? "needs-size" : ""} ${
                            stockLow ? "low-stock" : ""
                          } ${outOfStock ? "disabled" : ""}`}
                          onClick={
                            outOfStock
                              ? undefined
                              : () =>
                                  needsSize ? onPickSizedVariant(variant) : onAddProduct(variant)
                          }
                          disabled={outOfStock}
                          title={`${colorName} · Stock: ${formatQty(stock)}${
                            needsSize ? " · Toca para elegir talla" : ""
                          }${outOfStock ? " · Sin stock para venta" : ""}`}
                        >
                          {qtyInCart > 0 && (
                            <span className="kiosk-pos-qty-badge">{formatQty(qtyInCart)}</span>
                          )}
                          <span className="kiosk-pos-color-dot" style={{ backgroundColor: swatch }} />
                          <span className="kiosk-pos-variant-chip-label">{colorName}</span>
                          <span className="kiosk-pos-variant-chip-stock">
                            {needsSize ? "Talla" : formatQty(stock)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

export default PosCatalogPanel;
