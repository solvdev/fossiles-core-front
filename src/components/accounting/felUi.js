import React from "react";
import "views/accounting/fel-ui.css";

/** Piezas visuales compartidas por las pantallas de Facturas FEL. */

const STATUS_CLASS = {
  CERTIFIED: "fel-pill--ok",
  DRAFT: "fel-pill--draft",
  SKIPPED: "fel-pill--draft",
  FAILED: "fel-pill--err",
  VOID: "fel-pill--void",
};

/** Etiqueta de estado (Certificada, Sin firmar, Error FEL, Anulada). */
export function FelStatusPill({ status, label, large = false }) {
  const key = String(status || "").toUpperCase();
  const cls = STATUS_CLASS[key] || "";
  return <span className={`fel-pill ${cls} ${large ? "fel-pill--lg" : ""}`}>{label}</span>;
}

/** Etiqueta del tipo de documento; la factura común (FACT) no lleva etiqueta. */
export function FelTypeChip({ documentType, label }) {
  const key = String(documentType || "").toUpperCase();
  if (!key || key === "FACT") return null;
  const isNote = key === "NCRE" || key === "NDEB";
  return <span className={`fel-pill ${isNote ? "fel-pill--note" : ""}`}>{label}</span>;
}

const svgProps = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": "true",
};

export function IconBack() {
  return (
    <svg {...svgProps} strokeWidth={2.2}>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg {...svgProps} strokeWidth={2.2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconClose() {
  return (
    <svg {...svgProps}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconCopy() {
  return (
    <svg {...svgProps}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg {...svgProps} width={13} height={13} strokeWidth={2.2}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function IconInfo() {
  return (
    <svg {...svgProps} width={18} height={18}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </svg>
  );
}

export function IconMore() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="12" cy="19" r="1.7" />
    </svg>
  );
}

export function IconSearch() {
  return (
    <svg {...svgProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

/** Fila etiqueta / valor del detalle. */
export function FelKv({ label, children }) {
  return (
    <div>
      <div className="fel-kv__label">{label}</div>
      <div className="fel-kv__value">{children}</div>
    </div>
  );
}
