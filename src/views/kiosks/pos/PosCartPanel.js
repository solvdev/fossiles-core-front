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
  canEditPrices = false,
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
          Factura electrónica obligatoria (CF por defecto o NIT al cobrar)
        </div>
        {canEditPrices ? (
          <div className="text-muted small mb-2">
            Miraflores: usa <strong>Con desc.</strong> (lleva promo/descuento) o{" "}
            <strong>Final</strong> (cobra exactamente ese precio, sin descuento).
            Puedes mezclar: uno con descuento y otro final.
          </div>
        ) : null}

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
                    {canEditPrices && (
                      <Badge
                        color={line.priceEdited ? "success" : "info"}
                        className="ml-1"
                        style={{ fontSize: 10 }}
                      >
                        {line.priceEdited ? "Final" : "Con desc."}
                      </Badge>
                    )}
                  </div>
                  <div className="kiosk-pos-item-sub">
                    {line.productCode} · {line.colorName || "Sin color"}
                    {line.hardwareLabel && line.hardwareLabel !== "—" ? ` · ${line.hardwareLabel}` : ""}
                    {line.size ? ` · Talla ${line.size}` : ""}
                  </div>
                </div>
                <div className="kiosk-pos-line-actions" style={{ flexWrap: "wrap", gap: 6 }}>
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
                  {canEditPrices ? (
                    <div style={{ display: "flex", flexDirection: "column", minWidth: 100 }}>
                      <span className="text-muted" style={{ fontSize: 11, lineHeight: 1.1 }}>
                        Precio
                      </span>
                      <Input
                        className="kiosk-pos-input-lg kiosk-pos-qty"
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.unitPrice}
                        onChange={(e) =>
                          onUpdateLine(line.key, { unitPrice: Number(e.target.value || 0) })
                        }
                        title="Precio unitario"
                        style={{
                          minWidth: 100,
                          border: line.priceEdited ? "2px solid #1D9E75" : "2px solid #5e72e4",
                          background: line.priceEdited ? "#f0faf5" : "#f5f7ff",
                        }}
                      />
                    </div>
                  ) : (
                    <div className="kiosk-pos-line-unit text-muted small">
                      {formatCurrency(line.unitPrice)}
                    </div>
                  )}
                  <div className="kiosk-pos-line-total">{formatCurrency(line.quantity * line.unitPrice)}</div>
                  {canEditPrices ? (
                    <Button
                      color={line.priceEdited ? "success" : "info"}
                      outline={!line.priceEdited}
                      className="kiosk-pos-btn-lg"
                      type="button"
                      onClick={() =>
                        onUpdateLine(line.key, { priceEdited: !line.priceEdited })
                      }
                      title={
                        line.priceEdited
                          ? "Ahora es precio final. Clic para volver a aplicar descuento"
                          : "Ahora lleva descuento. Clic para precio final sin descuento"
                      }
                    >
                      {line.priceEdited ? "Final" : "Con desc."}
                    </Button>
                  ) : null}
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
