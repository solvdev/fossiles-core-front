import React, { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Button, Col, Input, Label, Row, Spinner, Table } from "reactstrap";
import FilterableSelect from "components/distribution/FilterableSelect";
import { simulateKioskPromotion } from "services/kioskPosService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { formatCurrency } from "./posUtils";
import { PAYMENT_OPTIONS, isDraftPromotion } from "./promotionRules";

let rowSeq = 0;
const newRow = (productId = "", quantity = 1) => ({ key: `sim-${++rowSeq}`, productId, quantity, unitPrice: "" });

/**
 * Simulador de promociones: arma un carrito de prueba con productos reales y muestra
 * cuánto lleva cada pieza, sin vender ni tocar inventario. Funciona con borradores
 * y con lo que se está armando sin guardar.
 *
 * @param {object}   props.promotion        promoción guardada a simular (o null)
 * @param {function} props.buildDraftPayload devuelve el payload del formulario (cuando no hay promoción guardada)
 */
function PosPromotionSimulator({
  promotion,
  buildDraftPayload,
  kiosks,
  productOptions,
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

  // Al cambiar de promoción: su kiosco y una fecha dentro de su vigencia.
  useEffect(() => {
    setResult(null);
    setError("");
    if (!promotion) return;
    setKioskId(promotion.kioskLocationId ? String(promotion.kioskLocationId) : "");
    if (promotion.startDate && promotion.startDate > today) setDate(promotion.startDate);
    else setDate(today);
  }, [promotion, today]);

  const kioskOptions = useMemo(
    () => (kiosks || []).map((k) => ({ value: String(k.kioskId), label: k.kioskName || k.kioskCode })),
    [kiosks]
  );

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
          <div className="pr-block-title mb-0">
            Simulador {promotion ? <>· <strong>{promotion.name}</strong></> : "· lo que estás armando (sin guardar)"}
          </div>
          <small className="text-muted">
            Usa productos y precios reales de producción. No vende, no factura y no mueve inventario.
          </small>
        </div>
        {onClose && (
          <Button size="sm" color="link" onClick={onClose}>
            Cerrar
          </Button>
        )}
      </div>

      <Row className="mt-2">
        <Col md="3">
          <Label className="kiosk-pos-label small mb-1">Kiosco</Label>
          <FilterableSelect
            value={kioskId}
            onChange={(value) => setKioskId(value || "")}
            options={kioskOptions}
            emptyLabel="Sin kiosco"
            inputClassName="kiosk-pos-input-lg"
          />
        </Col>
        <Col md="3">
          <Label className="kiosk-pos-label small mb-1">Fecha</Label>
          <Input className="kiosk-pos-input-lg" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Col>
        <Col md="2">
          <Label className="kiosk-pos-label small mb-1">Hora (vacío = ahora)</Label>
          <Input className="kiosk-pos-input-lg" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </Col>
        <Col md="4">
          <Label className="kiosk-pos-label small mb-1">Paga con</Label>
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
        </Col>
      </Row>

      <Label className="kiosk-pos-label small mb-1 mt-3">Carrito de prueba</Label>
      {rows.map((row) => (
        <Row key={row.key} className="align-items-end mb-1">
          <Col md="6">
            <FilterableSelect
              value={row.productId ? String(row.productId) : ""}
              onChange={(value) => updateRow(row.key, { productId: value || "" })}
              options={productOptions}
              placeholder="Buscar producto…"
              emptyLabel="Elige producto"
              inputClassName="kiosk-pos-input-lg"
            />
          </Col>
          <Col md="2">
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="1"
              step="1"
              value={row.quantity}
              title="Cantidad"
              onChange={(e) => updateRow(row.key, { quantity: e.target.value })}
            />
          </Col>
          <Col md="2">
            <Input
              className="kiosk-pos-input-lg"
              type="number"
              min="0"
              step="0.01"
              value={row.unitPrice}
              placeholder="Precio POS"
              title="Vacío = precio POS del catálogo"
              onChange={(e) => updateRow(row.key, { unitPrice: e.target.value })}
            />
          </Col>
          <Col md="2">
            <Button
              color="danger"
              outline
              size="sm"
              disabled={rows.length <= 1}
              onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
            >
              Quitar
            </Button>
          </Col>
        </Row>
      ))}
      <div className="d-flex flex-wrap gap-2 mt-2">
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
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            {result.applies ? (
              <Badge color="success" className="pr-sim-badge">Aplica</Badge>
            ) : (
              <Badge color="secondary" className="pr-sim-badge">No aplica</Badge>
            )}
            {(result.reasons || []).map((reason, i) => (
              <span key={`r-${i}`} className="text-muted small">
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
            <thead className="text-primary">
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
                    <small className="text-muted">
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
            <div className="text-muted small">
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
