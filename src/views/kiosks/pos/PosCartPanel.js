import React from "react";
import { Badge, Button, Card, CardBody, Input } from "reactstrap";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { formatCurrency, formatQty } from "./posUtils";

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
}) {
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

        <div className="kiosk-pos-customer-btn text-muted small mb-2" style={{ cursor: "default" }}>
          <i className="nc-icon nc-paper" />
          Factura: se define al cobrar (NIT / CF)
        </div>

        <div className="kiosk-pos-cart-wrap">
          {cart.length === 0 ? (
            <div className="kiosk-pos-cart-empty">
              <i className="nc-icon nc-cart-simple" />
              <p>Toca un producto para agregarlo</p>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.key} className="kiosk-pos-cart-line">
                <div>
                  <div className="kiosk-pos-item-name">
                    {line.productName}
                    {isPackagingProductCode(line.productCode) && (
                      <Badge color="secondary" className="ml-1">Empaque</Badge>
                    )}
                  </div>
                  <div className="kiosk-pos-item-sub">
                    {line.productCode} · {line.colorName || "Sin color"}
                    {line.size ? ` · Talla ${line.size}` : ""}
                  </div>
                </div>
                <div className="kiosk-pos-line-actions">
                  <Input
                    className="kiosk-pos-input-lg kiosk-pos-qty"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity}
                    onChange={(e) =>
                      onUpdateLine(line.key, { quantity: Number(e.target.value || 0) })
                    }
                  />
                  <div className="kiosk-pos-line-total">{formatCurrency(line.quantity * line.unitPrice)}</div>
                  <Button color="danger" className="kiosk-pos-btn-lg" onClick={() => onRemoveLine(line.key)}>
                    Quitar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="kiosk-pos-cart-footer">
          <button type="button" className="kiosk-pos-promo-link" onClick={onApplyPromotion}>
            ¿Hay promoción? Aplicar descuento
          </button>

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
