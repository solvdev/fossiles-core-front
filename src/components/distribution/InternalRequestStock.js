import React from "react";
import { Button, Spinner } from "reactstrap";
import {
  NEXT_ACTION,
  formatQty,
  needsOpiProductionAuthorization,
  resolveNextAction,
} from "utils/standaloneInternalShipmentHelper";

const TONES = {
  ok: { fg: "#1f7a46", bg: "#e6f6ec", border: "#b6e2c6" },
  danger: { fg: "#b42323", bg: "#fdeaea", border: "#f4bcbc" },
  warn: { fg: "#9a6200", bg: "#fff4dc", border: "#f2d9a0" },
  info: { fg: "#2f5d9e", bg: "#e8f0fb", border: "#bcd1ef" },
  muted: { fg: "#6b7280", bg: "#f1f2f4", border: "#dcdfe4" },
};

/** Describe el estado de stock/producción de una solicitud para pintarlo. */
export function describeStock(request) {
  const opi = request?.productionOrderCode || null;
  const authorized = Boolean(request?.opiAuthorizedAt)
    || (opi && !needsOpiProductionAuthorization(request));
  const shortage = formatQty(request?.stockShortageTotal);

  switch (request?.stockStatus) {
    case "DISPONIBLE":
      return {
        tone: "ok",
        icon: "✓",
        label: "Hay stock",
        hint: "Alcanza en Devoluciones / Bodega PT. Se puede autorizar el envío.",
      };
    case "SIN_STOCK":
      return {
        tone: "danger",
        icon: "!",
        label: `Sin stock · faltan ${shortage}`,
        hint: "No alcanza en Devoluciones / Bodega PT. Autorice la producción del faltante.",
      };
    case "EN_PRODUCCION":
      return {
        tone: "warn",
        icon: "⟳",
        label: `En producción · faltan ${shortage}`,
        sub: opi,
        hint: `${opi || "La OPI"} ya está autorizada. El envío se habilita cuando el producto entre a Bodega PT.`,
      };
    default:
      break;
  }
  if (opi) {
    return authorized
      ? { tone: "ok", icon: "✓", label: "Producción autorizada", sub: opi }
      : { tone: "info", icon: "◔", label: "OPI en borrador", sub: opi };
  }
  return null;
}

/** Pastilla de estado de stock (con OPI cuando aplica). */
export function StockIndicator({ request }) {
  const info = describeStock(request);
  if (!info) return <span className="text-muted">—</span>;
  const tone = TONES[info.tone] || TONES.muted;
  return (
    <div title={info.hint || ""} style={{ lineHeight: 1.2 }}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px 3px 4px",
          borderRadius: 999,
          fontSize: 12,
          fontWeight: 600,
          color: tone.fg,
          background: tone.bg,
          border: `1px solid ${tone.border}`,
          whiteSpace: "nowrap",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: tone.fg,
            color: "#fff",
            fontSize: 11,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {info.icon}
        </span>
        {info.label}
      </span>
      {info.sub && (
        <div className="small text-muted mt-1" style={{ paddingLeft: 4 }}>{info.sub}</div>
      )}
    </div>
  );
}

/**
 * Botonera de una solicitud PENDIENTE: una sola acción principal según el stock
 * (autorizar envío / autorizar producción / esperar producción) + Denegar.
 */
export function RequestActionButtons({
  request,
  busy,
  size = "sm",
  onAuthorizeShipment,
  onAuthorizeProduction,
  onReject,
}) {
  const action = resolveNextAction(request);
  const spinner = <Spinner size="sm" />;
  return (
    <>
      {action === NEXT_ACTION.SHIP && (
        <Button
          color="success"
          size={size}
          className="btn-round mr-1"
          disabled={busy}
          onClick={() => onAuthorizeShipment(request)}
        >
          {busy ? spinner : "Autorizar envío"}
        </Button>
      )}
      {action === NEXT_ACTION.PRODUCE && (
        <Button
          color="primary"
          size={size}
          className="btn-round mr-1"
          disabled={busy}
          onClick={() => onAuthorizeProduction(request)}
        >
          {busy ? spinner : "Autorizar producción"}
        </Button>
      )}
      {action === NEXT_ACTION.WAIT && (
        <Button
          color="warning"
          outline
          size={size}
          className="btn-round mr-1"
          disabled
          title="La producción ya está autorizada; el envío se habilita al ingresar el producto a Bodega PT."
        >
          Esperando producción
        </Button>
      )}
      <Button
        color="danger"
        size={size}
        outline
        className="btn-round mr-1"
        disabled={busy}
        onClick={() => onReject(request.id)}
      >
        Denegar
      </Button>
    </>
  );
}
