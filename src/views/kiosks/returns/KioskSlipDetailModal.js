import React, { useEffect, useMemo, useState } from "react";
import { Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { formatCurrency, formatQty } from "../pos/posUtils";

const TONES = {
  ok: { fg: "#1f7a46", bg: "#e6f6ec", border: "#b6e2c6" },
  danger: { fg: "#b42323", bg: "#fdeaea", border: "#f4bcbc" },
  warn: { fg: "#9a6200", bg: "#fff4dc", border: "#f2d9a0" },
  info: { fg: "#2f5d9e", bg: "#e8f0fb", border: "#bcd1ef" },
  muted: { fg: "#6b7280", bg: "#f1f2f4", border: "#dcdfe4" },
};

export const SLIP_STATUS_LABELS = {
  PENDING_AUTHORIZATION: "Pendiente autorización",
  PENDING_REINTEGRO: "Pendiente reintegro",
  REINTEGRATED: "Reintegrado a bodega",
  COMPLETED: "Completado",
  REJECTED: "Rechazado",
};

const STATUS_BANNER = {
  PENDING_AUTHORIZATION: {
    tone: "warn",
    title: "Pendiente de autorización",
    body:
      "Este cambio no genera cobro. Al autorizarlo se actualiza el inventario del kiosko: "
      + "ingresan los productos devueltos y salen los entregados.",
  },
  PENDING_REINTEGRO: {
    tone: "info",
    title: "Pendiente de reintegro a bodega",
    body: "Confirme el reintegro para registrar la salida del producto desde el kiosko hacia bodega.",
  },
  REINTEGRATED: { tone: "ok", title: "Reintegrado a bodega", body: "" },
  COMPLETED: { tone: "ok", title: "Completado", body: "" },
  REJECTED: { tone: "danger", title: "Rechazado", body: "" },
};

/** Línea a entregar: true si el stock informado del kiosko no alcanza. */
const lineIsShort = (line) =>
  line?.availableStock != null && Number(line.availableStock) < Number(line.quantity || 0);

/** Resume el stock de las líneas que salen: DISPONIBLE, FALTA o null (sin dato). */
export function summarizeGivenStock(slip) {
  const lines = (slip?.givenItems || []).filter((line) => line?.availableStock != null);
  if (!lines.length) return null;
  return lines.some(lineIsShort) ? "FALTA" : "DISPONIBLE";
}

/** Pastilla "Hay stock / Falta stock" para las listas y el modal. */
export function SlipStockPill({ slip }) {
  const summary = summarizeGivenStock(slip);
  if (!summary) return <span className="text-muted">—</span>;
  const tone = summary === "FALTA" ? TONES.danger : TONES.ok;
  return (
    <span
      title={
        summary === "FALTA"
          ? "Al menos un producto a entregar no alcanza en el kiosko."
          : "Todos los productos a entregar alcanzan en el kiosko."
      }
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        color: tone.fg,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {summary === "FALTA" ? "Falta stock" : "Hay stock"}
    </span>
  );
}

const variantLabel = (line) =>
  [line.colorName, line.size ? `Talla ${line.size}` : null, line.hardwareCondition && line.hardwareCondition !== "NUEVO"
    ? line.hardwareCondition
    : null]
    .filter(Boolean)
    .join(" · ");

function Field({ label, children }) {
  if (children == null || children === "" || children === false) return null;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: "#8a8f98" }}>{label}</div>
      <div style={{ fontSize: 14, color: "#2c2c2c", overflowWrap: "anywhere" }}>{children}</div>
    </div>
  );
}

function LinesTable({ title, accent, lines, showStock }) {
  return (
    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          color: accent,
          borderBottom: `2px solid ${accent}`,
          paddingBottom: 4,
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", fontSize: 13 }}>
          <thead>
            <tr style={{ color: "#8a8f98", fontSize: 11, textTransform: "uppercase" }}>
              <th style={{ fontWeight: 600, paddingBottom: 4 }}>Producto</th>
              <th className="text-right" style={{ fontWeight: 600 }}>Cant.</th>
              {showStock && <th className="text-right" style={{ fontWeight: 600 }}>En kiosko</th>}
              <th className="text-right" style={{ fontWeight: 600 }}>P. unit.</th>
              <th className="text-right" style={{ fontWeight: 600 }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 && (
              <tr><td colSpan={showStock ? 5 : 4} className="text-muted py-2">Sin líneas.</td></tr>
            )}
            {lines.map((line, index) => {
              const short = showStock && lineIsShort(line);
              const unit = line.unitPrice != null ? Number(line.unitPrice) : null;
              const total = line.lineTotal != null
                ? Number(line.lineTotal)
                : unit != null ? unit * Number(line.quantity || 0) : null;
              return (
                <tr
                  key={`${line.productId}-${line.colorId}-${line.size}-${index}`}
                  style={{ borderTop: "1px solid #eee", background: short ? "#fff5f5" : undefined }}
                >
                  <td style={{ padding: "6px 6px 6px 0" }}>
                    <div style={{ fontWeight: 600 }}>{line.productName || `Producto #${line.productId}`}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {[line.productCode, variantLabel(line)].filter(Boolean).join(" · ")}
                    </div>
                  </td>
                  <td className="text-right">{formatQty(line.quantity)}</td>
                  {showStock && (
                    <td
                      className="text-right"
                      style={{ fontWeight: 600, color: line.availableStock == null ? "#8a8f98" : short ? "#b42323" : "#1f7a46" }}
                    >
                      {line.availableStock == null ? "—" : formatQty(line.availableStock)}
                      {short && <div style={{ fontSize: 11 }}>faltan {formatQty(Number(line.quantity) - Number(line.availableStock))}</div>}
                    </td>
                  )}
                  <td className="text-right">{unit != null ? formatCurrency(unit) : "—"}</td>
                  <td className="text-right">{total != null ? formatCurrency(total) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryBox({ label, value, tone }) {
  const t = TONES[tone] || TONES.muted;
  return (
    <div
      style={{
        flex: "1 1 140px",
        padding: "10px 14px",
        borderRadius: 8,
        background: t.bg,
        border: `1px solid ${t.border}`,
      }}
    >
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, color: t.fg }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: t.fg }}>{value}</div>
    </div>
  );
}

/**
 * Detalle de una boleta de cambio o devolución del kiosko, con las acciones de revisión
 * (autorizar / rechazar con motivo / reintegrar) para que se decida con toda la información a la vista.
 * Las acciones devuelven true si se completaron; entonces el modal se cierra.
 */
function KioskSlipDetailModal({
  isOpen,
  slip,
  onClose,
  canAuthorize,
  canReintegrate,
  onAuthorize,
  onReject,
  onReintegrate,
  onPrint,
}) {
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    setRejecting(false);
    setRejectReason("");
    setBusy(false);
  }, [slip?.id, isOpen]);

  const status = String(slip?.status || "").toUpperCase();
  const isExchange = String(slip?.slipType || "EXCHANGE").toUpperCase() === "EXCHANGE";
  const banner = STATUS_BANNER[status];
  const bannerTone = TONES[banner?.tone] || TONES.muted;

  const returnedLines = useMemo(() => slip?.returnedItems || [], [slip]);
  const givenLines = useMemo(() => slip?.givenItems || [], [slip]);
  const stockSummary = useMemo(() => summarizeGivenStock(slip), [slip]);
  const showStock = status === "PENDING_AUTHORIZATION" && stockSummary != null;

  const difference = Number(slip?.differenceAmount || 0);
  const differenceLabel = difference > 0.009
    ? "Diferencia cobrada"
    : difference < -0.009
      ? "Saldo a favor del cliente"
      : "Sin diferencia";
  const differenceTone = difference > 0.009 ? "info" : difference < -0.009 ? "warn" : "ok";

  const run = async (action) => {
    setBusy(true);
    try {
      const done = await action();
      if (done) onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleAuthorize = () => {
    const warning = stockSummary === "FALTA"
      ? "\n\nATENCIÓN: el kiosko no tiene stock suficiente de algún producto a entregar; la autorización puede fallar."
      : "";
    if (!window.confirm(
      `¿Autorizar el cambio ${slip.slipNumber}? Se moverá el inventario del kiosko.${warning}`
    )) return;
    void run(() => onAuthorize(slip));
  };

  const handleConfirmReject = () => {
    if (!rejectReason.trim()) return;
    void run(() => onReject(slip, rejectReason.trim()));
  };

  const handleReintegrate = () => {
    if (!window.confirm(`¿Reintegrar la devolución ${slip.slipNumber} a bodega?`)) return;
    void run(() => onReintegrate(slip));
  };

  return (
    <Modal isOpen={isOpen} toggle={busy ? undefined : onClose} size="lg" scrollable>
      <ModalHeader toggle={busy ? undefined : onClose}>
        {isExchange ? "Boleta de cambio" : "Devolución"} {slip?.slipNumber || ""}
        {slip && (
          <Badge color="light" className="ml-2" style={{ color: bannerTone.fg, fontSize: 12 }}>
            {SLIP_STATUS_LABELS[status] || slip.status}
          </Badge>
        )}
      </ModalHeader>
      <ModalBody>
        {!slip ? (
          <div className="text-center py-4"><Spinner /></div>
        ) : (
          <>
            {banner && (
              <div
                className="mb-3 d-flex align-items-start justify-content-between flex-wrap"
                style={{
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: bannerTone.bg,
                  border: `1px solid ${bannerTone.border}`,
                  borderLeft: `4px solid ${bannerTone.fg}`,
                }}
              >
                <div style={{ flex: "1 1 280px" }}>
                  <div style={{ color: bannerTone.fg, fontWeight: 700 }}>{banner.title}</div>
                  {banner.body && <div style={{ fontSize: 12.5, color: "#444", marginTop: 2 }}>{banner.body}</div>}
                  {status === "REJECTED" && (
                    <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>
                      <strong>Motivo:</strong> {slip.rejectionReason || "—"}
                      {slip.authorizedByName && (
                        <> · por {slip.authorizedByName}{slip.authorizedAt ? ` (${formatDateTimeGt(slip.authorizedAt)})` : ""}</>
                      )}
                    </div>
                  )}
                  {status === "COMPLETED" && slip.authorizedByName && (
                    <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>
                      Autorizado por {slip.authorizedByName}
                      {slip.authorizedAt ? ` · ${formatDateTimeGt(slip.authorizedAt)}` : ""}
                    </div>
                  )}
                  {status === "REINTEGRATED" && slip.reintegratedByName && (
                    <div style={{ fontSize: 13, color: "#444", marginTop: 2 }}>
                      Reintegrado por {slip.reintegratedByName}
                      {slip.reintegratedAt ? ` · ${formatDateTimeGt(slip.reintegratedAt)}` : ""}
                    </div>
                  )}
                </div>
                {status === "PENDING_AUTHORIZATION" && <SlipStockPill slip={slip} />}
              </div>
            )}

            <div
              className="mb-3"
              style={{ display: "grid", gap: "12px 20px", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
            >
              <Field label="Kiosko">
                {[slip.kioskCode, slip.kioskName].filter(Boolean).join(" · ") || "—"}
              </Field>
              <Field label="Venta original">{slip.originalSaleNumber || "—"}</Field>
              <Field label="Solicitado por">{slip.createdByName || "—"}</Field>
              <Field label="Fecha">{slip.createdAt ? formatDateTimeGt(slip.createdAt) : "—"}</Field>
              {slip.newSaleNumber && <Field label="Venta nueva">{slip.newSaleNumber}</Field>}
              {!isExchange && <Field label="Apto para reventa">{slip.apto ? "Sí" : "No"}</Field>}
            </div>

            {(slip.reason || slip.observations) && (
              <div
                className="mb-3"
                style={{ padding: "10px 12px", background: "#f7f8fa", borderRadius: 8, fontSize: 13 }}
              >
                {slip.reason && <div><strong>Motivo:</strong> {slip.reason}</div>}
                {slip.observations && <div className="mt-1"><strong>Observaciones:</strong> {slip.observations}</div>}
              </div>
            )}

            <div className="d-flex flex-wrap mb-3" style={{ gap: 20 }}>
              <LinesTable
                title={isExchange ? "Ingresa al kiosko (devuelve el cliente)" : "Producto devuelto"}
                accent="#2f5d9e"
                lines={returnedLines}
                showStock={false}
              />
              {isExchange && (
                <LinesTable
                  title="Sale del kiosko (se entrega)"
                  accent="#1f7a46"
                  lines={givenLines}
                  showStock={showStock}
                />
              )}
            </div>

            {isExchange && (
              <div className="d-flex flex-wrap" style={{ gap: 10 }}>
                <SummaryBox label="Valor que ingresa" value={formatCurrency(slip.returnedAmount)} tone="info" />
                <SummaryBox label="Valor que sale" value={formatCurrency(slip.givenAmount)} tone="ok" />
                <SummaryBox
                  label={differenceLabel}
                  value={formatCurrency(Math.abs(difference))}
                  tone={differenceTone}
                />
              </div>
            )}
            {isExchange && difference < -0.009 && status === "PENDING_AUTHORIZATION" && (
              <div className="small text-muted mt-2">
                El cliente devuelve más valor del que se lleva; el saldo a favor no se reembolsa.
              </div>
            )}

            {rejecting && (
              <div className="mt-3" style={{ padding: 12, borderRadius: 8, background: "#fdeaea", border: "1px solid #f4bcbc" }}>
                <div style={{ fontWeight: 700, color: "#b42323", marginBottom: 6 }}>Motivo del rechazo *</div>
                <Input
                  type="textarea"
                  rows={3}
                  autoFocus
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Indica por qué se rechaza el cambio"
                />
              </div>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {slip && (
          <Button color="default" outline className="mr-auto" onClick={() => onPrint(slip)} disabled={busy}>
            Imprimir
          </Button>
        )}
        {slip && status === "PENDING_AUTHORIZATION" && canAuthorize && !rejecting && (
          <>
            <Button color="danger" outline onClick={() => setRejecting(true)} disabled={busy}>
              Rechazar
            </Button>
            <Button color="success" onClick={handleAuthorize} disabled={busy}>
              {busy ? <Spinner size="sm" /> : "Autorizar cambio"}
            </Button>
          </>
        )}
        {slip && status === "PENDING_AUTHORIZATION" && canAuthorize && rejecting && (
          <>
            <Button color="secondary" outline onClick={() => setRejecting(false)} disabled={busy}>
              Volver
            </Button>
            <Button color="danger" onClick={handleConfirmReject} disabled={busy || !rejectReason.trim()}>
              {busy ? <Spinner size="sm" /> : "Confirmar rechazo"}
            </Button>
          </>
        )}
        {slip && status === "PENDING_REINTEGRO" && canReintegrate && (
          <Button color="success" onClick={handleReintegrate} disabled={busy}>
            {busy ? <Spinner size="sm" /> : "Reintegrar a bodega"}
          </Button>
        )}
        {!rejecting && (
          <Button color="secondary" onClick={onClose} disabled={busy}>Cerrar</Button>
        )}
      </ModalFooter>
    </Modal>
  );
}

export default KioskSlipDetailModal;
