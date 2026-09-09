import React, { useMemo } from "react";
import { Badge, Button, Card, CardBody, Input } from "reactstrap";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import {
  formatCurrency,
  formatQty,
  describeEntrecuerosPriceState,
} from "./posUtils";

function PosCartPanel({
  cart,
  cartTotals,
  estimatedTotal,
  onUpdateLine,
  onRemoveLine,
  onCheckout,
  onCancelSale,
  onApplyPromotion,
  disabled,
  canEditPrices = false,
  entrecueros = false,
}) {
  const qtyByProduct = useMemo(() => {
    const map = {};
    (cart || []).forEach((line) => {
      map[line.productId] = (map[line.productId] || 0) + Number(line.quantity || 0);
    });
    return map;
  }, [cart]);
  return (
    <Card className="kiosk-pos-block kiosk-pos-cart-panel">
      <CardBody>
        <div className="kiosk-pos-cart-header">
          <h5 className="kiosk-pos-cart-header-title">Venta actual</h5>
          {cart.length > 0 && (
            <button type="button" className="kiosk-pos-cancel-sale-btn" onClick={onCancelSale}>
              <i className="nc-icon nc-simple-remove" /> Cancelar venta
            </button>
          )}
        </div>

        {entrecueros ? (
          <div className="text-muted small mb-2" style={{ cursor: "default" }}>
            Precio por cantidad del mismo código: 1, desde 3, desde 6 y desde 12. 4 piezas cobran el precio de 3+.
          </div>
        ) : (
          <div className="kiosk-pos-customer-btn text-muted small mb-2" style={{ cursor: "default" }}>
            <i className="nc-icon nc-paper" />
            Factura electrónica obligatoria (CF por defecto o NIT al cobrar)
          </div>
        )}
        {canEditPrices ? (
          <div className="text-muted small mb-2">
            Miraflores: toca la etiqueta <strong>Con desc.</strong> / <strong>Final</strong> en cada
            producto (no aplica a empaques). Final = cobra ese precio sin descuento.
          </div>
        ) : null}

        <div className="kiosk-pos-cart-wrap">
          {cart.length === 0 ? (
            <div className="kiosk-pos-cart-empty">
              <i className="nc-icon nc-cart-simple" />
              <p>Toca un producto para agregarlo</p>
            </div>
          ) : (
            cart.map((line) => {
              const isPackaging = Boolean(line.isPackaging) || isPackagingProductCode(line.productCode);
              const showPriceControls = canEditPrices && !isPackaging;
              const productQty = qtyByProduct[line.productId] || Number(line.quantity || 0);
              const priceState = entrecueros
                ? describeEntrecuerosPriceState(line, productQty)
                : null;
              return (
              <div key={line.key} className="kiosk-pos-cart-line">
                <div className="kiosk-pos-line-top">
                  <div className="kiosk-pos-line-title">
                    <div className="kiosk-pos-item-name">
                      {line.productName}
                      {isPackaging && (
                        <Badge color="secondary" className="ml-1">Empaque</Badge>
                      )}
                    </div>
                    <div className="kiosk-pos-item-sub">
                      {line.productCode} · {line.colorName || "Sin color"}
                      {line.hardwareLabel && line.hardwareLabel !== "—" ? ` · ${line.hardwareLabel}` : ""}
                      {line.size ? ` · Talla ${line.size}` : ""}
                    </div>
                  </div>
                  <div className="kiosk-pos-line-top-actions">
                    {showPriceControls ? (
                      <button
                        type="button"
                        className={`kiosk-pos-price-mode-chip ${line.priceEdited ? "is-final" : "is-discount"}`}
                        onClick={() =>
                          onUpdateLine(line.key, { priceEdited: !line.priceEdited })
                        }
                        title={
                          line.priceEdited
                            ? "Precio final (sin descuento). Clic para aplicar descuento"
                            : "Con descuento. Clic para precio final"
                        }
                      >
                        {line.priceEdited ? "Final" : "Con desc."}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="kiosk-pos-line-remove"
                      onClick={() => onRemoveLine(line.key)}
                      title="Quitar"
                    >
                      Quitar
                    </button>
                  </div>
                </div>

                <div className={`kiosk-pos-line-actions ${showPriceControls ? "with-price" : ""}`}>
                  <Input
                    className="kiosk-pos-input-lg kiosk-pos-qty"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) =>
                      onUpdateLine(line.key, { quantity: Number(e.target.value || 0) })
                    }
                    title="Cantidad"
                  />
                  {showPriceControls ? (
                    <Input
                      className={`kiosk-pos-input-lg kiosk-pos-price-input ${line.priceEdited ? "is-final" : "is-discount"}`}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) =>
                        onUpdateLine(line.key, { unitPrice: Number(e.target.value || 0) })
                      }
                      title="Precio unitario"
                    />
                  ) : null}
                  <div className="kiosk-pos-line-total">
                    {formatCurrency(line.quantity * line.unitPrice)}
                  </div>
                </div>
                {priceState && priceState.tiers.length > 0 && (
                  <div className="kiosk-pos-tier-block">
                    <div className="kiosk-pos-tier-row">
                      {priceState.tiers.map((tier) => (
                        <button
                          key={`${line.key}-tier-${tier.minQty}`}
                          type="button"
                          className={`kiosk-pos-tier-chip ${
                            priceState.active.minQty === tier.minQty ? "active" : ""
                          }`}
                          onClick={() => {
                            const current = Number(line.quantity || 0);
                            if (tier.minQty <= current) return;
                            const nextQty = Math.min(tier.minQty, Number(line.availableQty || 0));
                            if (nextQty > current) onUpdateLine(line.key, { quantity: nextQty });
                          }}
                          title={`${tier.label}: ${formatCurrency(tier.unitPrice)} c/u`}
                        >
                          {tier.label} {formatCurrency(tier.unitPrice)}
                        </button>
                      ))}
                    </div>
                    <div className="kiosk-pos-tier-hint">
                      {formatQty(productQty)} pzas al precio {priceState.active.label}
                      {" "}({formatCurrency(priceState.active.unitPrice)} c/u)
                      {priceState.next
                        ? `. Faltan ${formatQty(priceState.missing)} para ${priceState.next.label} a ${formatCurrency(priceState.next.unitPrice)}.`
                        : "."}
                    </div>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>

        <div className="kiosk-pos-cart-footer">
          {!entrecueros && (
            <button type="button" className="kiosk-pos-promo-link" onClick={onApplyPromotion}>
              ¿Hay promoción? Aplicar descuento
            </button>
          )}

          <div className="kiosk-pos-totals-rows">
            <div className="kiosk-pos-totals-row">
              <span>Ítems</span>
              <span>{formatQty(cartTotals.items)}</span>
            </div>
            <div className="kiosk-pos-totals-row">
              <span>Subtotal</span>
              <span>{formatCurrency(cartTotals.total)}</span>
            </div>
            {cartTotals.discount > 0 && (
              <div className="kiosk-pos-totals-row">
                <span>
                  Descuento
                  {cartTotals.autoApplied && cartTotals.promotionName && (
                    <span className="text-muted small d-block">{cartTotals.promotionName}</span>
                  )}
                </span>
                <span style={{ color: "#1D9E75" }}>-{formatCurrency(cartTotals.discount)}</span>
              </div>
            )}
            <hr className="kiosk-pos-totals-divider" />
            <div className="kiosk-pos-totals-row total">
              <span>Total</span>
              <span>{formatCurrency(estimatedTotal)}</span>
            </div>
          </div>

          <Button
            color="success"
            block
            className="kiosk-pos-btn-main kiosk-pos-pay-btn"
            onClick={onCheckout}
            disabled={disabled || cart.length === 0}
          >
            <i className="nc-icon nc-money-coins" />
            Cobrar {formatCurrency(estimatedTotal)}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

export default PosCartPanel;
