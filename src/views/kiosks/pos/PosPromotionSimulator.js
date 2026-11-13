import React, { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Spinner, Table } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import { simulateKioskPromotion } from "services/kioskPosService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatCurrency, isEntrecuerosPosMode } from "./posUtils";
import { PAYMENT_OPTIONS, isDraftPromotion, promoKioskIds } from "./promotionRules";

let rowSeq = 0;
const newRow = (productId = "", quantity = 1) => ({ key: `sim-${++rowSeq}`, productId, quantity, unitPrice: "" });

/**
 * Simulador de promociones: arma un carrito de prueba con productos reales y muestra
 * cuánto lleva cada pieza, sin vender ni tocar inventario. Funciona con borradores
 * y con lo que se está armando sin guardar.
 *
 * @param {object}   props.promotion        promoción guardada a simular (o null)
 * @param {function} props.buildDraftPayload devuelve el payload del formulario (cuando no hay promoción guardada)
 * @param {string[]} props.draftKioskIds     kioscos marcados en el formulario (para el kiosco inicial del borrador)
 * @param {object[]} props.allProductOptions productos con `entrecuerosOnly`; los solo-Entrecueros se ocultan
 *                                           si el kiosco elegido en el simulador no es Entrecueros
 */
function PosPromotionSimulator({
  promotion,
  buildDraftPayload,
  kiosks,
  draftKioskIds,
  allProductOptions,
  onApprove,
  approving,
  onClose,
}) {
  const today = getTodayYmdGuatemala();
  const [rows, setRows] = useState(() => [newRow(), newRow()]);
  const [kioskId, setKioskId] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Al cambiar de promoción: su primer kiosco y una fecha dentro de su vigencia.
  useEffect(() => {
    setResult(null);
    setError("");
    if (!promotion) return;
    setKioskId(promoKioskIds(promotion)[0] || "");
    if (promotion.startDate && promotion.startDate > today) setDate(promotion.startDate);
    else setDate(today);
  }, [promotion, today]);

  // Lo que se arma sin guardar: empieza en el primer kiosco marcado (si no hay uno ya elegido).
  const draftFirstKiosk = (draftKioskIds || [])[0] || "";
  useEffect(() => {
    if (!promotion && draftFirstKiosk) setKioskId((prev) => prev || draftFirstKiosk);
  }, [promotion, draftFirstKiosk]);

  // Kioscos de la promoción (o los marcados en el formulario); sin restricción = todos.
  const kioskOptions = useMemo(() => {
    const scope = promotion ? promoKioskIds(promotion) : draftKioskIds || [];
    return (kiosks || [])
      .filter((k) => scope.length === 0 || scope.includes(String(k.kioskId)))
      .map((k) => ({ value: String(k.kioskId), label: k.kioskName || k.kioskCode }));
  }, [kiosks, promotion, draftKioskIds]);

  // Productos solo de Entrecueros: solo si el kiosco del simulador es Entrecueros.
  const simKioskIsEntrecueros = useMemo(
    () => (kiosks || []).some((k) => String(k.kioskId) === String(kioskId) && isEntrecuerosPosMode(k)),
    [kiosks, kioskId]
  );
  const productOptions = useMemo(() => {
    if (simKioskIsEntrecueros) return allProductOptions || [];
    const inCart = new Set(rows.map((r) => String(r.productId)).filter(Boolean));
    return (allProductOptions || []).filter((o) => !o.entrecuerosOnly || inCart.has(o.value));
  }, [allProductOptions, simKioskIsEntrecueros, rows]);

  const updateRow = (key, patch) => setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const run = async () => {
    const items = rows
      .filter((r) => r.productId)
      .map((r) => ({
        productId: Number(r.productId),
        quantity: Number(r.quantity) > 0 ? Number(r.quantity) : 1,
        unitPrice: r.unitPrice === "" ? null : Number(r.unitPrice),
      }));
    if (!items.length) {
      setError("Agrega al menos un producto al carrito de prueba.");
      return;
    }
    let draft = null;
    if (!promotion) {
      draft = buildDraftPayload?.();
      if (!draft) return;
    }
    try {
      setLoading(true);
      setError("");
      const response = await simulateKioskPromotion({
        promotionId: promotion?.id ?? null,
        promotion: draft,
        kioskLocationId: kioskId ? Number(kioskId) : null,
        date: date || null,
        time: time || null,
        paymentMethod: paymentMethod || null,
        items,
      });
      setResult(response);
    } catch (err) {
      setResult(null);
      setError(err.message || "No se pudo simular la promoción.");
    } finally {
      setLoading(false);
    }
  };

  const canApprove = Boolean(promotion?.id) && isDraftPromotion(promotion) && typeof onApprove === "function";

  return (
    <div className="pr-sim">
      <div className="pr-sim-head">
        <div>
          <div className="pr-sim-title">
            Simulador {promotion ? <>· <strong>{promotion.name}</strong></> : "· lo que estás armando (sin guardar)"}
            {promotion && (
              <span className={`pr-badge ${isDraftPromotion(promotion) ? "is-draft" : "is-approved"}`}>
                {isDraftPromotion(promotion) ? "Borrador" : "Aprobada"}
              </span>
            )}
          </div>
          <small className="pr-hint">
            Usa productos y precios reales de producción. No vende, no factura y no mueve inventario.
          </small>
        </div>
        {onClose && (
          <Button size="sm" color="link" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <div className="pr-grid mt-2">
        <div className="pr-field">
          <label className="pr-field-label">Kiosco</label>
          <FilterableSelect
            value={kioskId}
            onChange={(value) => setKioskId(value || "")}
            options={kioskOptions}
            emptyLabel="Sin kiosco"
            inputClassName="kiosk-pos-input-lg"
          />
        </div>
        <div className="pr-field">
          <label className="pr-field-label">Fecha</label>
          <Input className="kiosk-pos-input-lg" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="pr-field">
          <label className="pr-field-label">Hora (vacío = ahora)</label>
          <Input className="kiosk-pos-input-lg" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div className="pr-field">
          <label className="pr-field-label">Paga con</label>
          <Input
            type="select"
            className="kiosk-pos-input-lg"
            value={paymentMethod}
            onChange={(e) => setPaymentMethod(e.target.value)}
          >
            {PAYMENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Input>
        </div>
      </div>

      <div className="pr-field-label mt-3">Carrito de prueba</div>
      <div className="pr-cart">
        {rows.map((row) => (
          <div key={row.key} className="pr-cart-row">
            <div className="pr-cart-product">
              <FilterableSelect
                value={row.productId ? String(row.productId) : ""}
                onChange={(value) => updateRow(row.key, { productId: value || "" })}
                options={productOptions}
                placeholder="Buscar producto…"
                emptyLabel="Elige producto"
                inputClassName="kiosk-pos-input-lg"
              />
            </div>
            <Input
              className="kiosk-pos-input-lg pr-cart-qty"
              type="number"
              min="1"
              step="1"
              value={row.quantity}
              title="Cantidad"
              aria-label="Cantidad"
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
            />
            <Input
              className="kiosk-pos-input-lg pr-cart-price"
              type="number"
              min="0"
              step="0.01"
              value={row.unitPrice}
              placeholder="Precio POS"
              title="Vacío = precio POS del catálogo"
              aria-label="Precio por pieza"
              onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
            />
            <Button
              color="danger"
              outline
              size="sm"
              disabled={rows.length <= 1}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              Quitar
            </Button>
          </div>
        ))}
      </div>
      {!simKioskIsEntrecueros && (allProductOptions || []).some((o) => o.entrecuerosOnly) && (
        <small className="pr-hint d-block mt-1">
          Los productos solo de Entrecueros se ocultan: elige un kiosco Entrecueros para verlos.
        </small>
      )}
      <div className="pr-actions mt-2">
        <Button size="sm" color="secondary" outline onClick={() => setRows((prev) => [...prev, newRow()])}>
          + producto
        </Button>
        <Button color="primary" className="kiosk-pos-btn-main" onClick={run} disabled={loading}>
          {loading ? <Spinner size="sm" /> : "Simular"}
        </Button>
        {canApprove && (
          <Button
            color="success"
            className="kiosk-pos-btn-main"
            disabled={approving || !result?.applies}
            title={result?.applies ? "" : "Simula un carrito donde aplique antes de aprobar"}
            onClick={() => onApprove(promotion)}
          >
            {approving ? "Aprobando…" : "Aprobar y poner en vigencia"}
          </Button>
        )}
      </div>

      {error && (
        <Alert color="danger" className="mt-3 mb-0 py-2">
          {error}
        </Alert>
      )}

      {result && (
        <div className="mt-3">
          <div className="pr-sim-verdict">
            <span className={`pr-badge ${result.applies ? "is-approved" : "is-muted"}`}>
              {result.applies ? "Aplica" : "No aplica"}
            </span>
            {(result.reasons || []).map((reason, i) => (
              <span key={`r-${i}`} className="pr-hint">
                {reason}
              </span>
            ))}
          </div>
          {(result.warnings || []).map((warning, i) => (
            <Alert key={`w-${i}`} color="warning" className="py-1 mb-1 small">
              {warning}
            </Alert>
          ))}
          <Table responsive size="sm" className="mt-2 pr-sim-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-end">Precio</th>
                <th className="text-end">Cant.</th>
                <th className="text-end">Subtotal</th>
                <th className="text-end">Descuento</th>
                <th className="text-end">Queda</th>
                <th>Cómo</th>
              </tr>
            </thead>
            <tbody>
              {(result.lines || []).map((line) => (
                <tr key={`l-${line.index}`} className={line.discountAmount > 0 ? "pr-sim-hit" : ""}>
                  <td>
                    <div>{line.productCode} · {line.productName}</div>
                    <small className="pr-hint">
                      {[line.categoryName, line.audience, line.size ? `T.${line.size}` : null].filter(Boolean).join(" · ")}
                      {line.eligible === false ? " · empaque (sin descuento)" : ""}
                    </small>
                  </td>
                  <td className="text-end">{formatCurrency(line.unitPrice)}</td>
                  <td className="text-end">{Number(line.quantity)}</td>
                  <td className="text-end">{formatCurrency(line.lineTotal)}</td>
                  <td className="text-end text-success">
                    {line.discountAmount > 0 ? `−${formatCurrency(line.discountAmount)}` : "—"}
                  </td>
                  <td className="text-end"><strong>{formatCurrency(line.totalAmount)}</strong></td>
                  <td className="small">{line.note || ""}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="pr-sim-totals">
            <div>
              <span>Subtotal</span>
              <strong>{formatCurrency(result.subtotal)}</strong>
            </div>
            <div className="text-success">
              <span>Descuento</span>
              <strong>−{formatCurrency(result.discountAmount)}</strong>
            </div>
            <div className="pr-sim-total">
              <span>Total a cobrar</span>
              <strong>{formatCurrency(result.totalAmount)}</strong>
            </div>
            <div className="pr-hint pr-sim-note">
              Hoy el POS daría −{formatCurrency(result.currentDiscountAmount)}
              {result.currentPromotionName ? ` (${result.currentPromotionName})` : " (sin promoción)"} con las promociones
              aprobadas. Si hay varias, gana la que da más.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default PosPromotionSimulator;
