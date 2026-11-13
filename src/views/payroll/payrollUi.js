import React from "react";
import { Link, useInRouterContext } from "react-router-dom";
import { formatAmount } from "utils/payrollPrintHtml";

export const GROUP_LABELS = {
  PLANTA: "Planta (5 y 20)",
  ADMINISTRACION: "Administración y kioscos (15 y fin de mes)",
};
export const GROUP_SHORT = { PLANTA: "Planta", ADMINISTRACION: "Administración y kioscos" };
export const STATUS_LABELS = { BORRADOR: "Borrador", APROBADA: "Aprobada", PAGADA: "Pagada", ANULADA: "Anulada" };

/** Formas de pago tal como las manda el servidor, con su nombre corto, icono y color de gráfica. */
export const METHODS = {
  CHEQUE: { label: "Cheque", icon: "nc-icon nc-single-copy-04", color: "var(--pl-m1, #1a7f9c)" },
  "TRANSFERENCIA BANCARIA": { label: "Transferencia", icon: "nc-icon nc-bank", color: "var(--pl-m2, #5b7fc0)" },
  EFECTIVO: { label: "Efectivo", icon: "nc-icon nc-money-coins", color: "var(--pl-m3, #d9a441)" },
};

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

const parts = (iso) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return y && m && d ? { y, m, d } : null;
};

/** 13/11/2026 */
export const fmtDate = (iso) => {
  const p = parts(iso);
  return p ? `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}` : "—";
};
/** 13 nov */
export const fmtShort = (iso) => {
  const p = parts(iso);
  return p ? `${p.d} ${MONTHS[p.m - 1]}` : "—";
};
/** vie 13 nov 2026 (el día de la semana se calcula en UTC, sin pasar por la zona horaria del navegador) */
export const fmtLong = (iso) => {
  const p = parts(iso);
  if (!p) return "—";
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${weekday} ${p.d} ${MONTHS[p.m - 1]} ${p.y}`;
};

export const todayIso = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Días que faltan desde hoy hasta la fecha (negativo si ya pasó). */
export const daysUntil = (iso) => {
  const p = parts(iso);
  const t = parts(todayIso());
  if (!p || !t) return 0;
  return Math.round((Date.UTC(p.y, p.m - 1, p.d) - Date.UTC(t.y, t.m - 1, t.d)) / 86400000);
};

export const q = (value) => `Q ${formatAmount(value)}`;
export const sum = (lines, key) => lines.reduce((total, line) => total + (Number(line[key]) || 0), 0);
export const people = (count) => (count === 1 ? "1 colaborador" : `${count} colaboradores`);
export const initials = (name) =>
  String(name || "").split(" ").filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase();

/** Cantidad con dos decimales; el cero se ve como guion para que la tabla se lea rápido. */
export const amountOrDash = (value) => (Number(value) === 0 ? "—" : formatAmount(value));

export function StatusPill({ status }) {
  return <span className={`pl-pill pl-pill--${String(status || "").toLowerCase()}`}>{STATUS_LABELS[status] || status}</span>;
}

export function Avatar({ name }) {
  return <span className="pl-av" aria-hidden="true">{initials(name)}</span>;
}

/** Enlace a otra pantalla del módulo; fuera de un router (pruebas) no se pinta. */
export function ModuleLink({ to, state, children }) {
  const inRouter = useInRouterContext();
  if (!inRouter) return null;
  return <Link to={to} state={state} className="pl-linkbtn ml-2">{children}</Link>;
}
