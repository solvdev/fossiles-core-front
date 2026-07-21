import React, { useMemo } from "react";
import { Button, Modal, ModalBody } from "reactstrap";
import {
  formatCurrency,
  formatQty,
  getColorSwatch,
  posVariantSizeEntries,
  resolveImageUrl,
} from "./posUtils";

function PosCinchoPickModal({ isOpen, variant, cartQtyBySize, onPickSize, onClose }) {
  const sizeEntries = useMemo(() => posVariantSizeEntries(variant), [variant]);

  if (!variant) return null;

  const colorName = String(variant.colorName || "").trim() || "Sin color";
  const swatch = getColorSwatch(colorName);
  const imageUrl = resolveImageUrl(variant.productImageUrl);

  return (
    <Modal
      isOpen={isOpen}
      toggle={onClose}
      className="kiosk-pos-cincho-pick-modal"
      centered
      size="lg"
    >
      <ModalBody className="kiosk-pos-cincho-pick-body">
        <div className="kiosk-pos-cincho-pick-header">
          <div className="kiosk-pos-cincho-pick-product">
            {imageUrl ? (
              <img src={imageUrl} alt={variant.productName} className="kiosk-pos-cincho-pick-image" />
            ) : (
              <div className="kiosk-pos-cincho-pick-placeholder">
                <i className="nc-icon nc-image" />
              </div>
            )}
            <div>
              <div className="kiosk-pos-cincho-pick-code">{variant.productCode}</div>
              <div className="kiosk-pos-cincho-pick-name">{variant.productName}</div>
              <div className="kiosk-pos-cincho-pick-price">
                {formatCurrency(variant.suggestedUnitPrice)}
              </div>
              <div className="kiosk-pos-cincho-pick-color">
                <span className="kiosk-pos-color-dot" style={{ backgroundColor: swatch }} />
                {colorName}
                {variant.hardwareLabel && variant.hardwareLabel !== "—"
                  ? ` · ${variant.hardwareLabel}`
                  : ""}
              </div>
            </div>
          </div>
          <Button color="link" className="kiosk-pos-cincho-pick-close" onClick={onClose}>
            <i className="nc-icon nc-simple-remove" />
          </Button>
        </div>

        <p className="kiosk-pos-cincho-pick-hint">Toca la talla para agregar al carrito</p>

        {sizeEntries.length === 0 ? (
          <div className="kiosk-pos-cincho-pick-empty">Sin stock por talla en este color.</div>
        ) : (
          <div className="kiosk-pos-cincho-size-grid">
            {sizeEntries.map(({ size, quantity }) => {
              const inCart = Number(cartQtyBySize?.[size] || 0);
              const outOfStock = quantity <= 0;
              const lowStock = quantity > 0 && quantity <= 2;
              return (
                <button
                  key={size}
                  type="button"
                  className={`kiosk-pos-cincho-size-btn ${lowStock ? "low-stock" : ""} ${
                    outOfStock ? "disabled" : ""
                  }`}
                  disabled={outOfStock}
                  onClick={() => onPickSize(variant, size)}
                >
                  {inCart > 0 && <span className="kiosk-pos-qty-badge">{formatQty(inCart)}</span>}
                  <span className="kiosk-pos-cincho-size-label">{size}</span>
                  <span className="kiosk-pos-cincho-size-stock">{formatQty(quantity)} disp.</span>
                </button>
              );
            })}
          </div>
        )}
      </ModalBody>
    </Modal>
  );
}

export default PosCinchoPickModal;
