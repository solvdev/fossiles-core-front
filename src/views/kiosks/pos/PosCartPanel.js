import React, { useMemo } from "react";
import { Badge, Button, Card, CardBody, Input } from "reactstrap";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import {
  entrecuerosCartQuantities,
  entrecuerosVolumeKey,
  lineReceivesEntrecuerosCourtesy,
} from "utils/entrecuerosPriceLists";
import {
  formatCurrency,
  formatQty,
  parsePosQty,
  describeEntrecuerosPriceState,
} from "./posUtils";
import {
  EXTRA_APPROVED,
  EXTRA_PENDING,
  EXTRA_REJECTED,
  lineTotalWithExtra,
} from "./posExtraUtils";

const EXTRA_STATUS_LABEL = {
  [EXTRA_PENDING]: "Pendiente de autorización",
  [EXTRA_APPROVED]: "Complemento autorizado",
  [EXTRA_REJECTED]: "Complemento rechazado",
};

const EXTRA_STATUS_COLOR = {
  [EXTRA_PENDING]: "warning",
  [EXTRA_APPROVED]: "success",
  [EXTRA_REJECTED]: "danger",
};

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
  onRequestExtra,
  onRemoveExtra,
  checkoutBlockReason = null,
  heldCount = 0,
  onHoldCart,
  onOpenHeld,
}) {
  const qtyByProduct = useMemo(() => {
    const map = {};
    (cart || []).forEach((line) => {
      map[line.productId] = (map[line.productId] || 0) + Number(line.quantity || 0);
    });
    return map;
  }, [cart]);
  const entrecuerosVolume = useMemo(
    () => (entrecueros ? entrecuerosCartQuantities(cart) : null),
    [cart, entrecueros]
  );
  const wholesaleUnlocked = Boolean(entrecuerosVolume?.courtesyActive);
  return (
    <Card className="kiosk-pos-block kiosk-pos-cart-panel">
      <CardBody>
        <div className="kiosk-pos-cart-header">
          <h5 className="kiosk-pos-cart-header-title">Venta actual</h5>
          <div className="kiosk-pos-cart-header-actions">
            {onOpenHeld && (
              <button
                type="button"
                className="kiosk-pos-held-btn"
                onClick={onOpenHeld}
                title="Ventas dejadas en espera"
              >
                En espera
                {heldCount > 0 && <Badge color="warning" pill className="ml-1">{heldCount}</Badge>}
              </button>
            )}
            {cart.length > 0 && onHoldCart && (
              <button
                type="button"
                className="kiosk-pos-held-btn"
                onClick={onHoldCart}
                disabled={disabled}
                title="Guardar esta venta y atender a otro cliente"
              >
                Poner en espera
              </button>
            )}
            {cart.length > 0 && (
              <button type="button" className="kiosk-pos-cancel-sale-btn" onClick={onCancelSale}>
                <i className="nc-icon nc-simple-remove" /> Cancelar venta
              </button>
            )}
          </div>
        </div>

        {entrecueros ? (
          <div className="text-muted small mb-2" style={{ cursor: "default" }}>
            {wholesaleUnlocked
              ? "Minorista activo: 6 o más de un producto. El resto del carrito usa el precio más bajo de su lista."
              : "El volumen es por lista (Casual, Dama, Niño, sintético…). Con 6 o 12 de un producto, el resto pasa a minorista."}
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
              const volumeKey = entrecueros ? entrecuerosVolumeKey(line) : null;
              const groupedQty = entrecueros ? entrecuerosVolume?.qtyByKey[volumeKey] : undefined;
              const productQty = entrecueros
                ? (groupedQty != null ? groupedQty : Number(line.quantity || 0))
                : (qtyByProduct[line.productId] || Number(line.quantity || 0));
              const courtesy = entrecueros
                ? lineReceivesEntrecuerosCourtesy(line, groupedQty || 0, wholesaleUnlocked)
                : false;
              const priceState = entrecueros
                ? describeEntrecuerosPriceState(line, productQty, courtesy)
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
                    {onRequestExtra && !isPackaging && !line.extraRequest ? (
                      <button
                        type="button"
                        className="kiosk-pos-extra-btn"
                        onClick={() => onRequestExtra(line)}
                        disabled={disabled}
                        title="Cobrar un extra por un complemento (requiere autorización)"
                      >
                        + Complemento
                      </button>
                    ) : null}
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

                {line.extraRequest ? (
                  <div className={`kiosk-pos-extra-info is-${String(line.extraRequest.status || "").toLowerCase()}`}>
                    <div className="kiosk-pos-extra-info-head">
                      <Badge color={EXTRA_STATUS_COLOR[line.extraRequest.status] || "secondary"}>
                        {EXTRA_STATUS_LABEL[line.extraRequest.status] || line.extraRequest.status}
                      </Badge>
                      <span className="kiosk-pos-extra-info-amount">
                        +{formatCurrency(line.extraUnitAmount)} c/u
                      </span>
                      {line.extraRequest.requestNumber && (
                        <span className="text-muted small">{line.extraRequest.requestNumber}</span>
                      )}
                    </div>
                    <div className="kiosk-pos-extra-info-desc">{line.extraRequest.description}</div>
                    {line.extraRequest.status === EXTRA_REJECTED && line.extraRequest.rejectionReason ? (
                      <div className="kiosk-pos-extra-info-reason">
                        Motivo: {line.extraRequest.rejectionReason}
                      </div>
                    ) : null}
                    {onRemoveExtra && (
                      <button
                        type="button"
                        className="kiosk-pos-line-remove"
                        onClick={() => onRemoveExtra(line)}
                      >
                        Quitar complemento
                      </button>
                    )}
                  </div>
                ) : null}

                <div className={`kiosk-pos-line-actions ${showPriceControls ? "with-price" : ""}`}>
                  <Input
                    className="kiosk-pos-input-lg kiosk-pos-qty"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    disabled={Boolean(line.extraRequest)}
                    title={line.extraRequest ? "La cantidad quedó fija con el complemento" : "Cantidad"}
                    value={parsePosQty(line.quantity) || ""}
                    onChange={(e) => {
                      const qty = parsePosQty(e.target.value);
                      if (qty < 1) return;
                      onUpdateLine(line.key, { quantity: qty });
                    }}
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
                    {formatCurrency(lineTotalWithExtra(line))}
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
            {cartTotals.extra > 0 && (
              <div className="kiosk-pos-totals-row text-muted small">
                <span>Incluye complementos (sin descuento)</span>
                <span>{formatCurrency(cartTotals.extra)}</span>
              </div>
            )}
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

          {checkoutBlockReason ? (
            <div className="kiosk-pos-extra-block-note">{checkoutBlockReason}</div>
          ) : null}
          <Button
            color="success"
            block
            className="kiosk-pos-btn-main kiosk-pos-pay-btn"
            onClick={onCheckout}
            disabled={disabled || cart.length === 0 || Boolean(checkoutBlockReason)}
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
