import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "reactstrap";
import {
  getOnlineSalesLedger, updateOnlineSaleLedger, bulkUpdateOnlineSaleLedger, downloadOnlineSalesLedgerExcel,
  lockOnlineSaleLedger,
} from "../../services/onlineSaleService";
import {
  num, formatQ, formatMoney, formatDay, toIso, monthRange, periodLabel, carrierOf, socialOf, statusOf, rowTone,
  netOf, effectiveSentDate, effectivePaymentForm, effectiveAuthorization, isPendingReview, isVoided, sellerLabel, computeCommissions,
  computeAccountingSummary, matchesQuery,
} from "./onlineLedgerHelper";
import DayNav, { addDays } from "./DayNav";
import "./OnlineLedger.css";

/**
 * Libro de ventas en línea: la hoja que Contabilidad llevaba en Excel.
 * - Ventas: todo hasta «Total con envío» viene de la venta y no se edita; lo demás se calcula o lo anota Contabilidad.
 * - Comisiones: cálculo por vendedor sobre todo el periodo.
 * - Moto: liquidación de lo que entrega el motorista.
 * Cada celda se guarda sola al salir de ella.
 * Bloqueo: una línea ya revisada se bloquea (una, las seleccionadas o todas las del filtro) y deja de admitir cambios;
 * el servidor también los rechaza. Desbloquear es solo de administradores.
 */

const PAGE_SIZES = [50, 100, 250, 0];
const PAYMENT_FORMS = ["Contra Entrega", "Visalink", "Depósito", "Transferencia", "Tarjeta", "Efectivo"];
const DELIVERY_NOTES = ["ENTREGADO", "PENDIENTE", "DEVOLUCIÓN", "REPROGRAMADO"];

const cellKey = (id, field) => `${id}:${field}`;

/** «Bloqueada por ana el 10/11/2026 14:05» para el título del candado. */
const lockTitle = (row) => {
  if (!row.locked) return "Bloquear esta línea: ya no se podrá modificar";
  const at = row.lockedAt ? String(row.lockedAt) : "";
  const when = at ? ` el ${formatDay(at)}${at.length >= 16 ? ` ${at.slice(11, 16)}` : ""}` : "";
  return `Bloqueada${row.lockedByName ? ` por ${row.lockedByName}` : ""}${when}`;
};

/** Mueve el foco a otra celda de la hoja (fila r, columna c entre las que se pueden enfocar). */
const focusCell = (from, r, c) => {
  const scope = from?.closest("table");
  const target = scope?.querySelector(`[data-r="${r}"][data-c="${c}"]`);
  if (!target) return false;
  target.focus();
  if (target.select) target.select();
  return true;
};

/** Teclas de hoja de cálculo comunes a celdas de texto y casillas. Devuelve true si la tecla se usó. */
const navKey = (e, el, opts = {}) => {
  const r = Number(el.dataset.r);
  const c = Number(el.dataset.c);
  const atStart = opts.atStart ?? true;
  const atEnd = opts.atEnd ?? true;
  switch (e.key) {
    case "ArrowDown": return focusCell(el, r + 1, c);
    case "ArrowUp": return focusCell(el, r - 1, c);
    case "ArrowLeft": return atStart && focusCell(el, r, c - 1);
    case "ArrowRight": return atEnd && focusCell(el, r, c + 1);
    case "Home": return (e.ctrlKey || e.metaKey) && focusCell(el, 0, 0);
    default: return false;
  }
};

/** Celda editable. Guarda al salir (o con Enter) solo si el valor cambió. */
const EditCell = React.memo(function EditCell({
  rowId, r, c, field, value, type = "text", disabled, state, onCommit, placeholder, list, system,
}) {
  const initial = value === null || value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const [focused, setFocused] = useState(false);

  useEffect(() => { setDraft(initial); }, [initial]);

  const normalized = (text) => {
    const t = String(text).trim();
    if (type === "money" && t !== "") {
      const n = parseFloat(t.replace(/,/g, "").replace(/^Q/i, ""));
      return Number.isFinite(n) ? String(n) : t;
    }
    return t;
  };

  const commit = (text = draft) => {
    if (disabled) return;
    const next = normalized(text);
    const current = type === "money" && initial !== "" ? String(parseFloat(initial)) : initial.trim();
    if (next !== current) onCommit(rowId, field, next);
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
      focusCell(el, r + (e.shiftKey ? -1 : 1), c);
      return;
    }
    if (e.key === "Escape") {
      setDraft(initial);
      el.blur();
      return;
    }
    // Ctrl+D: copia el valor de la celda de arriba (como «rellenar hacia abajo» de Excel).
    if ((e.ctrlKey || e.metaKey) && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      const above = el.closest("table")?.querySelector(`[data-r="${r - 1}"][data-c="${c}"]`);
      if (above && above.dataset.raw !== undefined) {
        setDraft(above.dataset.raw);
        commit(above.dataset.raw);
      }
      return;
    }
    // Supr / Retroceso con todo seleccionado: deja la celda vacía y guarda.
    if ((e.key === "Delete") && el.selectionStart === 0 && el.selectionEnd === String(el.value).length && type !== "date") {
      e.preventDefault();
      setDraft("");
      commit("");
      return;
    }
    if (type === "date" && (e.key === "ArrowUp" || e.key === "ArrowDown")) return; // el navegador cambia la fecha
    let atStart = true;
    let atEnd = true;
    if (type !== "date") {
      const len = String(el.value).length;
      const whole = el.selectionStart === 0 && el.selectionEnd === len;
      atStart = whole || el.selectionStart === 0;
      atEnd = whole || el.selectionEnd === len;
    }
    if (navKey(e, el, { atStart, atEnd })) e.preventDefault();
  };

  const shown = type === "money" && !focused && draft !== "" && Number.isFinite(parseFloat(draft))
    ? formatMoney(parseFloat(draft))
    : draft;

  return (
    <input
      className={`ol-cell${type === "money" ? " num" : ""}${system ? " sys" : ""}${state ? ` is-${state.status}` : ""}`}
      type={type === "date" ? "date" : "text"}
      inputMode={type === "money" ? "decimal" : undefined}
      value={shown}
      disabled={disabled}
      placeholder={disabled ? "" : placeholder}
      list={list}
      title={state?.status === "err" ? state.message : undefined}
      data-r={r}
      data-c={c}
      data-raw={initial}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => { setFocused(true); if (type !== "date") e.target.select(); }}
      onBlur={() => { setFocused(false); commit(); }}
      onKeyDown={onKeyDown}
    />
  );
});

const CarrierChip = ({ carrier }) => {
  const c = carrierOf(carrier);
  return <span className={`ol-chip ${c.key}`}>{c.label}</span>;
};

const Social = ({ value }) => {
  const s = socialOf(value);
  return s.icon ? <span className="ol-social" title={s.label} role="img" aria-label={s.label}>{s.icon}</span> : null;
};

// ───────── Columnas ─────────
// kind: lock = dato de la venta (gris, no se edita) · calc = calculado o del sistema · ed = lo anota Contabilidad.
// edit: { field, type, placeholder(row), list, systemValue(row) } — systemValue se muestra en cursiva si no hay dato propio.
// total: clave de `totals` para la fila de totales.

const SALES_COLUMNS = [
  { id: "address", label: "Dirección", kind: "lock", width: 220, clip: true, cell: (r) => r.address },
  { id: "phone", label: "Teléfono", kind: "lock", width: 120, cell: (r) => r.phone },
  { id: "packaging", label: "Empaque", kind: "lock", width: 72, cell: (r) => (r.packaging ? "Sí" : "No") },
  { id: "payment", label: "Forma de pago", kind: "lock", width: 130, cell: (r) => r.paymentMethodDisplay },
  { id: "invoice", label: "Factura", kind: "lock", width: 90, cell: (r) => r.invoiceTaxId },
  { id: "products", label: "Producto", kind: "lock", width: 240, clip: true, cell: (r) => r.products },
  { id: "colors", label: "Color", kind: "lock", width: 130, clip: true, cell: (r) => r.colors },
  { id: "sizes", label: "Talla", kind: "lock", width: 80, cell: (r) => r.sizes },
  { id: "total", label: "Total con envío", kind: "lock", width: 110, num: true, strong: true, total: "total", cell: (r) => formatMoney(num(r.totalAmount)) },
  { id: "shipping", label: "Envío", kind: "calc", width: 80, num: true, total: "shipping", cell: (r) => formatMoney(num(r.shippingCost)) },
  { id: "realShipping", label: "Envío real", kind: "ed", width: 96, num: true, total: "real", need: isPendingReview, edit: { field: "realShippingCost", type: "money", placeholder: () => "0.00" } },
  { id: "commission", label: "Comisión", kind: "ed", width: 96, num: true, total: "commission", edit: { field: "carrierCommission", type: "money", placeholder: () => "0.00" } },
  { id: "carrier", label: "Transporte", kind: "calc", width: 110, cell: (r) => <CarrierChip carrier={r.carrier} /> },
  { id: "date", label: "Fecha", kind: "calc", width: 92, cell: (r) => formatDay(r.saleDate) },
  { id: "social", label: "Red", kind: "calc", width: 54, center: true, cell: (r) => <Social value={r.socialNetwork} /> },
  { id: "email", label: "Correo", kind: "calc", width: 170, clip: true, cell: (r) => r.email },
  { id: "seller", label: "Vendedor", kind: "calc", width: 130, cell: (r) => r.salesperson },
  { id: "guide", label: "Guía", kind: "calc", width: 120, cell: (r) => r.guideNumber },
  {
    id: "shipment", label: "Envío", kind: "calc", width: 110,
    cell: (r) => <>{r.shipmentNumber}{r.saleNumber ? <span className="pedido">Pedido {r.saleNumber}</span> : null}</>,
  },
  { id: "auth", label: "Autorización", kind: "ed", width: 130, clip: true, edit: { field: "accountingAuthorization", type: "text", systemValue: effectiveAuthorization } },
  { id: "status", label: "Estado", kind: "calc", width: 104, cell: (r) => { const s = statusOf(r.status); return <span className={`ol-st ${s.tone}`}>{s.label}</span>; } },
  { id: "note", label: "Observación", kind: "ed", width: 220, edit: { field: "accountingNote", type: "text", placeholder: (r) => r.observations || "" } },
  { id: "net", label: "Sin envío", kind: "calc", width: 100, num: true, strong: true, total: "net", cell: (r) => formatMoney(netOf(r)) },
  { id: "shortage", label: "Faltante (+) / Sobrante (−)", kind: "ed", width: 120, num: true, total: "shortage", title: "Positivo = faltante, negativo = sobrante", edit: { field: "shortageAmount", type: "money", placeholder: () => "0.00" } },
  { id: "shortageNote", label: "Detalle", kind: "ed", width: 150, edit: { field: "shortageNote", type: "text" } },
  { id: "reviewed", label: "Revisado", kind: "ed", width: 76, center: true, check: "reviewed" },
];

const MOTO_COLUMNS = [
  { id: "sentDate", label: "Fecha de envío", kind: "ed", width: 136, edit: { field: "sentDate", type: "date", systemValue: effectiveSentDate } },
  { id: "receivedDate", label: "Fecha de recepción", kind: "ed", width: 136, edit: { field: "receivedDate", type: "date" } },
  {
    id: "shipment", label: "No. envío", kind: "lock", width: 120,
    cell: (r) => <>{r.shipmentNumber || r.guideNumber || "—"}{r.shipmentNumber && r.guideNumber ? <span className="pedido">Guía {r.guideNumber}</span> : null}</>,
  },
  { id: "products", label: "Descripción", kind: "lock", width: 240, clip: true, cell: (r) => r.products },
  { id: "net", label: "Monto sin envío", kind: "lock", width: 112, num: true, strong: true, total: "net", cell: (r) => formatMoney(netOf(r)) },
  { id: "total", label: "Total con envío", kind: "lock", width: 112, num: true, total: "total", cell: (r) => formatMoney(num(r.totalAmount)) },
  { id: "paymentForm", label: "Forma de pago", kind: "ed", width: 140, edit: { field: "paymentForm", type: "text", list: "ol-payment-forms", systemValue: effectivePaymentForm } },
  { id: "liquidationDate", label: "Fecha de liquidación", kind: "ed", width: 136, edit: { field: "liquidationDate", type: "date" } },
  { id: "slip", label: "No. de boleta", kind: "ed", width: 120, edit: { field: "depositSlipNumber", type: "text" } },
  { id: "deliveryNote", label: "Observación", kind: "ed", width: 130, edit: { field: "deliveryNote", type: "text", list: "ol-delivery-notes", placeholder: (r) => statusOf(r.status).label } },
  { id: "deposit", label: "Valor real depósito", kind: "ed", width: 120, num: true, total: "deposit", edit: { field: "realDepositAmount", type: "money", placeholder: () => "0.00" } },
  { id: "depositNote", label: "Observación", kind: "ed", width: 200, edit: { field: "depositNote", type: "text" } },
];

/** Vista «solo lo de Contabilidad»: oculta lo que no hace falta para revisar montos. */
const ACCOUNTING_PRESET = ["address", "phone", "packaging", "invoice", "colors", "sizes", "email", "social", "auth"];

const LAYOUT_KEY = "ol.ledger.layout.v1";
const readLayout = () => {
  try {
    const raw = window.localStorage.getItem(LAYOUT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === "object") return parsed;
  } catch (e) { /* sin almacenamiento: se usa el diseño por defecto */ }
  return {};
};
const writeLayout = (layout) => {
  try { window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch (e) { /* ignorar */ }
};

const MIN_WIDTH = 48;
const MAX_WIDTH = 640;
const widthStyle = (w) => ({ width: w, minWidth: w, maxWidth: w });

/** Encabezado con asa para cambiar el ancho (arrastrar) y volver al ancho original (doble clic). */
function ResizableTh({ col, width, onResize, className, children }) {
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = width;
    const onMove = (ev) => onResize(col.id, Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("ol-resizing");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.classList.add("ol-resizing");
  };
  return (
    <th className={className} style={widthStyle(width)} title={col.title || col.label}>
      <span className="lbl">{children}</span>
      <span className="ol-resize" onMouseDown={startDrag} onDoubleClick={() => onResize(col.id, null)}
        role="separator" aria-orientation="vertical" aria-label={`Ancho de ${col.label}`} title="Arrastre para cambiar el ancho · doble clic: ancho original" />
    </th>
  );
}

/** Fila de la hoja: se dibuja desde las columnas visibles. */
const SheetRow = React.memo(function SheetRow({
  row, n, r, columns, editIndex, canEdit: canEditSheet, states, onCommit, widths,
  canLock, canUnlock, selected, onSelect, onToggleLock,
}) {
  const tone = rowTone(row);
  const locked = Boolean(row.locked);
  const canEdit = canEditSheet && !locked;
  const canToggle = locked ? canUnlock : canLock;
  return (
    <tr className={`t-${carrierOf(row.carrier).key}${tone ? ` s-${tone}` : ""}${locked ? " is-locked" : ""}${selected ? " is-selected" : ""}`}>
      <td className="stick c0 rowno">
        <span className="ol-rowtools">
          {canLock && (
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(row.id, e.target.checked)}
              aria-label={`Seleccionar línea ${n}`} />
          )}
          {(locked || canLock) && (
            <button type="button" className={`ol-lockbtn${locked ? " is-on" : ""}`} disabled={!canToggle}
              title={locked && !canUnlock ? `${lockTitle(row)} · solo un administrador puede desbloquearla` : lockTitle(row)}
              aria-label={locked ? "Línea bloqueada" : "Bloquear línea"} aria-pressed={locked}
              onClick={() => onToggleLock(row)}>🔒</button>
          )}
          <span>{n}</span>
        </span>
      </td>
      <td className="stick c1 lock strong" title={row.customerName || ""} style={widthStyle(widths.customer)}>{row.customerName || "—"}</td>
      {columns.map((col) => {
        const style = widthStyle(widths[col.id]);
        if (col.check) {
          return (
            <td key={col.id} className="ed center" style={style}>
              <input type="checkbox" checked={Boolean(row[col.check])} disabled={!canEdit} aria-label={col.label}
                data-r={r} data-c={editIndex[col.id]}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onCommit(row.id, col.check, !row[col.check]); return; }
                  if (navKey(e, e.currentTarget)) e.preventDefault();
                }}
                onChange={(e) => onCommit(row.id, col.check, e.target.checked)} />
            </td>
          );
        }
        if (col.edit) {
          const ed = col.edit;
          const own = row[ed.field];
          const hasOwn = own !== null && own !== undefined && own !== "";
          const value = ed.systemValue ? ed.systemValue(row) : own;
          return (
            <td key={col.id} className={`ed${canEdit && col.need && col.need(row) ? " empty-need" : ""}`} style={style}>
              <EditCell rowId={row.id} r={r} c={editIndex[col.id]} field={ed.field} value={value} type={ed.type}
                disabled={!canEdit} state={states?.[ed.field]} onCommit={onCommit} list={ed.list}
                placeholder={ed.placeholder ? ed.placeholder(row) : ""} system={Boolean(ed.systemValue) && !hasOwn} />
            </td>
          );
        }
        const content = col.cell(row);
        return (
          <td key={col.id} style={{ ...style, textAlign: col.center ? "center" : undefined }}
            className={`${col.kind}${col.num ? " num" : ""}${col.strong ? " strong" : ""}${col.clip ? " clip" : ""}`}
            title={col.clip && typeof content === "string" ? content : undefined}>
            {content}
          </td>
        );
      })}
    </tr>
  );
});

/** Hoja (Ventas o Moto) con columnas que se pueden ocultar y ensanchar. */
function Sheet({
  columns, rows, lineNumber, canEdit, cellStates, onCommit, widths, onResize, totals, count, nameLabel, lockLabel, editLabel, wrap,
  canLock, canUnlock, selected, onSelect, onSelectAll, allSelected, onToggleLock,
}) {
  const editIndex = useMemo(() => {
    const map = {};
    let i = 0;
    columns.forEach((col) => { if (col.edit || col.check) { map[col.id] = i; i += 1; } });
    return map;
  }, [columns]);

  // Encabezado de grupos: tramos seguidos de «venta» (lock) y «contabilidad» (calc/ed).
  const groups = useMemo(() => {
    const out = [];
    columns.forEach((col) => {
      const g = col.kind === "lock" ? "lock" : "edit";
      const last = out[out.length - 1];
      if (last && last.g === g) last.span += 1; else out.push({ g, span: 1 });
    });
    return out;
  }, [columns]);

  return (
    <table className={`ol-sheet${wrap ? " is-wrap" : ""}`}>
      <thead>
        <tr className="g">
          <th className="g-lock stick c0" />
          <th className="g-lock stick c1" style={widthStyle(widths.customer)}>{nameLabel}</th>
          {groups.map((g, i) => (
            <th key={i} className={g.g === "lock" ? "g-lock" : "g-edit"} colSpan={g.span}>
              {g.span > 1 ? (g.g === "lock" ? lockLabel : editLabel) : ""}
            </th>
          ))}
        </tr>
        <tr className="h">
          <th className="stick c0 num">
            <span className="ol-rowtools">
              {canLock && (
                <input type="checkbox" checked={allSelected} onChange={(e) => onSelectAll(e.target.checked)}
                  aria-label="Seleccionar todas las ventas del filtro" title="Seleccionar todas las ventas del filtro" />
              )}
              <span>No.</span>
            </span>
          </th>
          <ResizableTh col={{ id: "customer", label: "Cliente" }} width={widths.customer} onResize={onResize} className="stick c1">
            Cliente
          </ResizableTh>
          {columns.map((col) => (
            <ResizableTh key={col.id} col={col} width={widths[col.id]} onResize={onResize}
              className={`${col.num ? "num" : ""}${col.edit || col.check ? " edit" : ""}`}>
              {col.label}
            </ResizableTh>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <SheetRow key={row.id} row={row} n={lineNumber.get(row.id)} r={i} columns={columns} editIndex={editIndex}
            canEdit={canEdit} states={cellStates[row.id]} onCommit={onCommit} widths={widths}
            canLock={canLock} canUnlock={canUnlock} selected={selected.has(row.id)} onSelect={onSelect} onToggleLock={onToggleLock} />
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td className="stick c0" />
          <td className="stick c1" style={widthStyle(widths.customer)}>Totales ({count})</td>
          {columns.map((col) => (
            <td key={col.id} className={col.num ? "num" : ""} style={widthStyle(widths[col.id])}>
              {col.total ? formatMoney(totals[col.total]) : ""}
            </td>
          ))}
        </tr>
      </tfoot>
    </table>
  );
}

/** Menú «Columnas»: casillas por columna, vistas rápidas, anchos y texto completo. */
function ColumnsMenu({ allColumns, hidden, onToggle, onShowAll, onPreset, onResetWidths, wrap, onWrap, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  useEffect(() => { ref.current?.querySelector("input, button")?.focus(); }, []);
  const groups = [
    ["Datos de la venta", allColumns.filter((c) => c.kind === "lock")],
    ["Contabilidad", allColumns.filter((c) => c.kind !== "lock")],
  ];
  return (
    <div className="ol-menu" ref={ref} role="dialog" aria-label="Columnas visibles">
      <div className="ol-menu-actions">
        <button type="button" className="ol-btn quiet sm" onClick={onShowAll}>Mostrar todas</button>
        {onPreset && <button type="button" className="ol-btn quiet sm" onClick={onPreset}>Solo contabilidad</button>}
        <button type="button" className="ol-btn quiet sm" onClick={onResetWidths}>Anchos originales</button>
      </div>
      <label className="ol-check ol-menu-wrap">
        <input type="checkbox" checked={wrap} onChange={(e) => onWrap(e.target.checked)} />
        Texto completo (las filas crecen para mostrar todo)
      </label>
      <div className="ol-menu-cols">
        {groups.map(([title, cols]) => (
          <div key={title}>
            <div className="ttl">{title}</div>
            {cols.map((c) => (
              <label key={c.id} className="ol-check">
                <input type="checkbox" checked={!hidden.includes(c.id)} onChange={() => onToggle(c.id)} />
                {c.label}
              </label>
            ))}
          </div>
        ))}
      </div>
      <p className="ol-note mb-0">Se guarda en este navegador. El Excel siempre trae todas las columnas.</p>
    </div>
  );
}

const SHORTCUTS = [
  ["↑ ↓ ← →", "Moverse entre celdas editables"],
  ["Enter / Shift+Enter", "Guardar y bajar / subir"],
  ["Tab / Shift+Tab", "Siguiente / anterior celda"],
  ["Esc", "Deshacer lo escrito en la celda"],
  ["Supr", "Vaciar la celda (con todo seleccionado)"],
  ["Ctrl+D", "Copiar el valor de la celda de arriba"],
  ["Espacio / Enter", "Marcar «Revisado»"],
  ["🔒 (primera columna)", "Bloquear la línea: ya no se modifica"],
  ["/", "Ir al buscador"],
  ["Alt+1 · Alt+2 · Alt+3", "Ventas · Comisiones · Moto"],
  ["[  ]", "Día (o rango) anterior / siguiente"],
  ["{  }", "Mes anterior / siguiente"],
  ["Re Pág / Av Pág", "Página anterior / siguiente"],
  ["?", "Mostrar u ocultar esta ayuda"],
];

function ShortcutsPanel({ onClose }) {
  return (
    <div className="ol-shortcuts" role="dialog" aria-label="Atajos de teclado">
      <div className="head">
        <b>Atajos de teclado</b>
        <button type="button" onClick={onClose} aria-label="Cerrar">×</button>
      </div>
      <table>
        <tbody>
          {SHORTCUTS.map(([k, d]) => (
            <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ───────── Comisiones ─────────

const CalcLine = ({ sign, label, hint, value, kind }) => (
  <tr className={kind || ""}>
    <td className="sg">{sign || ""}</td>
    <td>{label} {hint ? <small>{hint}</small> : null}</td>
    <td className="v">{formatQ(value)}</td>
  </tr>
);

const CommissionsView = ({ rows, commissionRate, vatRate, onShowPending }) => {
  const sellers = useMemo(() => computeCommissions(rows, commissionRate, vatRate), [rows, commissionRate, vatRate]);
  const summary = useMemo(() => computeAccountingSummary(rows, commissionRate, vatRate), [rows, commissionRate, vatRate]);
  const pct = `${Math.round(commissionRate * 10000) / 100}%`;
  const shortageRows = useMemo(() => rows.filter((r) => num(r.shortageAmount) !== 0), [rows]);
  const totalToPay = sellers.reduce((sum, s) => sum + s.totalToPay, 0);

  if (rows.length === 0) {
    return <div className="ol-card"><div className="ol-empty"><h5>Sin ventas en el periodo</h5>Cambie el periodo para calcular comisiones.</div></div>;
  }
  return (
    <>
      <div className="ol-cards">
        {sellers.map((s) => (
          <section className="ol-card" key={s.seller}>
            <header>
              <h5>{s.seller}</h5>
              <span>{s.salesCount} ventas</span>
            </header>
            <table className="ol-calc">
              <tbody>
                <CalcLine label="Ventas" hint="total con envío" value={s.sales} />
                <CalcLine sign="(−)" label="Devoluciones" hint={`${s.returnsCount}`} value={s.returns} />
                <CalcLine sign="(−)" label="Anuladas" hint={`${s.voidedCount}`} value={s.voided} />
                <CalcLine sign="(−)" label="Envío real" value={s.realShipping} />
                <CalcLine sign="(−)" label="Comisiones real" hint="transporte" value={s.carrierCommissions} />
                <CalcLine label="Subtotal" value={s.subtotal} kind="sub" />
                <CalcLine sign="(−)" label="IVA" value={s.vat} />
                <CalcLine label="Total ventas netas" value={s.netSales} kind="sub" />
                <CalcLine label={`${pct} comisiones`} value={s.commission} />
                <CalcLine sign="(−)" label="Descuento de faltantes" value={s.shortages} />
                <CalcLine label="Total comisiones a pagar" value={s.totalToPay} kind="pay" />
              </tbody>
            </table>
            {s.pending > 0 && (
              <div className="warnline">
                {s.pending} {s.pending === 1 ? "venta sin envío real anotado" : "ventas sin envío real anotado"}: la comisión
                puede bajar al completarlas.{" "}
                <button type="button" className="btn btn-link btn-sm p-0" onClick={() => onShowPending(s.seller)}>Ver cuáles</button>
              </div>
            )}
          </section>
        ))}

        <section className="ol-card">
          <header><h5>Dato de contabilidad</h5><span>todo el periodo</span></header>
          <table className="ol-calc">
            <tbody>
              <CalcLine label="Venta motorista" value={summary.byCarrier.moto} />
              <CalcLine label="Venta Guatex" value={summary.byCarrier.guatex} />
              <CalcLine label="Venta Forza" value={summary.byCarrier.forza} />
              {summary.byCarrier.none !== 0 && <CalcLine label="Venta sin transporte" value={summary.byCarrier.none} />}
              <CalcLine label="Total ventas" value={summary.total} kind="sub" />
              <CalcLine sign="(−)" label="Pago de envío real" value={summary.realShipping} />
              <CalcLine sign="(−)" label="Comisiones de transporte Forza" value={summary.commissionByCarrier.forza} />
              <CalcLine sign="(−)" label="Comisiones de transporte Guatex" value={summary.commissionByCarrier.guatex} />
              {(summary.commissionByCarrier.moto + summary.commissionByCarrier.none) !== 0 && (
                <CalcLine sign="(−)" label="Otras comisiones" value={summary.commissionByCarrier.moto + summary.commissionByCarrier.none} />
              )}
              <CalcLine sign="(−)" label="Devoluciones" hint={`${summary.returnsCount}`} value={summary.returns} />
              <CalcLine sign="(−)" label="Anuladas" hint={`${summary.voidedCount}`} value={summary.voided} />
              <CalcLine label="Subtotal" value={summary.subtotal} kind="sub" />
              <CalcLine sign="(−)" label="IVA" value={summary.vat} />
              <CalcLine label="Total ventas netas" value={summary.netSales} kind="sub" />
              <CalcLine label={`${pct} comisiones`} value={summary.commission} />
              <CalcLine sign="(−)" label="Faltante a descontar" value={summary.shortages} />
              <CalcLine label="Total a pagar comisiones" value={totalToPay} kind="pay" />
            </tbody>
          </table>
        </section>

        <section className="ol-card">
          <header><h5>Faltantes y sobrantes</h5><span>{shortageRows.length} anotados</span></header>
          {shortageRows.length === 0 ? (
            <div className="ol-empty" style={{ padding: "22px 12px" }}>
              Ninguno en el periodo. Se anotan en la hoja Ventas, columna «Faltante / Sobrante».
            </div>
          ) : (
            <table className="ol-calc">
              <tbody>
                {shortageRows.map((r) => (
                  <tr key={r.id}>
                    <td colSpan={2}>
                      <b>{r.shipmentNumber || `Pedido ${r.saleNumber || r.id}`}</b> · {sellerLabel(r)} · {carrierOf(r.carrier).label}
                      <br /><small>{formatDay(r.saleDate)} · {r.shortageNote || (num(r.shortageAmount) > 0 ? "Faltante" : "Sobrante")}</small>
                    </td>
                    <td className="v" style={{ color: num(r.shortageAmount) > 0 ? "#a12a17" : "#116a3d", fontWeight: 700 }}>
                      {num(r.shortageAmount) > 0 ? "Faltante " : "Sobrante "}{formatQ(Math.abs(num(r.shortageAmount)))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
      <p className="ol-note mt-3 mb-0">
        Comisión = ({"ventas − devoluciones − anuladas − envío real − comisiones del transporte"}) sin IVA × {pct}, menos faltantes.
        Se calcula con todas las ventas del periodo, sin importar los filtros de la hoja.
      </p>
    </>
  );
};

// ───────── Página ─────────

function OnlineSalesLedger() {
  const initial = useMemo(() => monthRange(toIso(new Date())), []);
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState({ canEdit: false, canLock: false, canUnlock: false, commissionRate: 0.02, vatRate: 0.12, truncated: false, historyQuery: "" });
  const [selected, setSelected] = useState(() => new Set());
  const [fLock, setFLock] = useState("");
  const [locking, setLocking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("ventas");
  const [query, setQuery] = useState("");
  const [fCarrier, setFCarrier] = useState("");
  const [fSeller, setFSeller] = useState("");
  const [fPayment, setFPayment] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [motoCarrier, setMotoCarrier] = useState("moto");
  const [motoPending, setMotoPending] = useState(false);
  const [pageSize, setPageSize] = useState(100);
  const [page, setPage] = useState(0);
  const [cellStates, setCellStates] = useState({});
  const [showFill, setShowFill] = useState(false);
  const [fill, setFill] = useState({ carrier: "guatex", field: "realShippingCost", value: "" });
  const [filling, setFilling] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [layout, setLayout] = useState(readLayout);
  const [showCols, setShowCols] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const searchRef = useRef(null);
  const requestRef = useRef(0);
  const chainsRef = useRef(new Map());

  const load = useCallback(async (opts = {}) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError("");
    try {
      const data = await getOnlineSalesLedger(opts.history ? { q: opts.history } : { from, to });
      if (request !== requestRef.current) return;
      setRows(data.rows || []);
      setMeta({
        canEdit: Boolean(data.canEdit),
        canLock: Boolean(data.canLock),
        canUnlock: Boolean(data.canUnlock),
        commissionRate: num(data.commissionRate) || 0.02,
        vatRate: num(data.vatRate) || 0.12,
        truncated: Boolean(data.truncated),
        historyQuery: opts.history || "",
      });
      setCellStates({});
      setSelected(new Set());
      setPage(0);
    } catch (e) {
      if (request !== requestRef.current) return;
      setError(e.message);
      setRows([]);
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
  }, [from, to]);

  useEffect(() => {
    if (from && to && from <= to) load();
  }, [from, to]); // eslint-disable-line

  const setRange = (range) => { setFrom(range.from); setTo(range.to); };
  const shiftMonth = (delta) => setRange(monthRange(from || toIso(new Date()), delta));

  // Guardado por celda. Los cambios de una misma venta van en fila para no crear dos veces su registro contable.
  const commitCell = useCallback((id, field, value) => {
    const key = cellKey(id, field);
    const setState = (state) => setCellStates((prev) => {
      const forRow = { ...(prev[id] || {}) };
      if (state) forRow[field] = state; else delete forRow[field];
      return { ...prev, [id]: forRow };
    });
    setState({ status: "saving" });
    const previous = chainsRef.current.get(id) || Promise.resolve();
    const next = previous.then(async () => {
      try {
        const updated = await updateOnlineSaleLedger(id, { [field]: value });
        setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
        setState({ status: "ok" });
        setTimeout(() => setCellStates((prev) => {
          if (prev[id]?.[field]?.status !== "ok") return prev;
          const forRow = { ...prev[id] };
          delete forRow[field];
          return { ...prev, [id]: forRow };
        }), 1200);
      } catch (e) {
        setState({ status: "err", message: e.message });
        setError(`No se guardó: ${e.message}`);
      }
    });
    chainsRef.current.set(id, next);
    return key;
  }, []);

  // Numeración del periodo (la misma «No.» / «LINEA» del Excel).
  const lineNumber = useMemo(() => {
    const map = new Map();
    rows.forEach((r, i) => map.set(r.id, i + 1));
    return map;
  }, [rows]);

  const sellers = useMemo(() => Array.from(new Set(rows.map(sellerLabel))).sort(), [rows]);
  const payments = useMemo(
    () => Array.from(new Set(rows.map((r) => r.paymentMethodDisplay).filter(Boolean))).sort(), [rows]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => r.status).filter(Boolean))), [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (fCarrier && carrierOf(r.carrier).key !== fCarrier) return false;
    if (fSeller && sellerLabel(r) !== fSeller) return false;
    if (fPayment && r.paymentMethodDisplay !== fPayment) return false;
    if (fStatus && r.status !== fStatus) return false;
    if (onlyPending && !isPendingReview(r)) return false;
    if (fLock && Boolean(r.locked) !== (fLock === "locked")) return false;
    return matchesQuery(r, query);
  }), [rows, fCarrier, fSeller, fPayment, fStatus, onlyPending, fLock, query]);

  const motoRows = useMemo(() => rows.filter((r) => {
    if (motoCarrier !== "all" && carrierOf(r.carrier).key !== motoCarrier) return false;
    if (motoPending && (r.liquidationDate || isVoided(r))) return false;
    return matchesQuery(r, query);
  }), [rows, motoCarrier, motoPending, query]);

  useEffect(() => { setPage(0); }, [fCarrier, fSeller, fPayment, fStatus, onlyPending, fLock, query, tab, motoCarrier, motoPending, pageSize]);

  const active = tab === "moto" ? motoRows : filtered;

  // ── Columnas visibles y anchos (por hoja, guardados en este navegador) ──
  const sheetKey = tab === "moto" ? "moto" : "ventas";
  const allColumns = sheetKey === "moto" ? MOTO_COLUMNS : SALES_COLUMNS;
  const sheetLayout = layout[sheetKey] || {};
  const hidden = sheetLayout.hidden || [];
  const visibleColumns = useMemo(() => allColumns.filter((c) => !hidden.includes(c.id)), [allColumns, hidden]);
  const widths = useMemo(() => {
    const w = { customer: 190 };
    allColumns.forEach((c) => { w[c.id] = c.width; });
    return { ...w, ...(sheetLayout.widths || {}) };
  }, [allColumns, sheetLayout.widths]);

  const updateLayout = useCallback((fn) => {
    setLayout((prev) => {
      const next = fn(prev);
      writeLayout(next);
      return next;
    });
  }, []);
  const patchSheet = useCallback((patch) => updateLayout((prev) => ({
    ...prev, [sheetKey]: { ...(prev[sheetKey] || {}), ...patch(prev[sheetKey] || {}) },
  })), [sheetKey, updateLayout]);
  const toggleColumn = (id) => patchSheet((cur) => {
    const h = cur.hidden || [];
    return { hidden: h.includes(id) ? h.filter((x) => x !== id) : [...h, id] };
  });
  const resizeColumn = useCallback((id, width) => patchSheet((cur) => {
    const w = { ...(cur.widths || {}) };
    if (width === null) delete w[id]; else w[id] = Math.round(width);
    return { widths: w };
  }), [patchSheet]);
  const pageCount = pageSize ? Math.max(1, Math.ceil(active.length / pageSize)) : 1;
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageSize ? active.slice(safePage * pageSize, safePage * pageSize + pageSize) : active;

  const totals = useMemo(() => {
    const t = { total: 0, shipping: 0, real: 0, commission: 0, net: 0, shortage: 0, deposit: 0 };
    active.forEach((r) => {
      t.total += num(r.totalAmount);
      t.shipping += num(r.shippingCost);
      t.real += num(r.realShippingCost);
      t.commission += num(r.carrierCommission);
      t.net += netOf(r);
      t.shortage += num(r.shortageAmount);
      t.deposit += num(r.realDepositAmount);
    });
    return t;
  }, [active]);

  const kpi = useMemo(() => {
    const k = { count: rows.length, total: 0, shipping: 0, real: 0, commission: 0, net: 0, pending: 0, carrier: { moto: 0, forza: 0, guatex: 0, none: 0 } };
    rows.forEach((r) => {
      k.total += num(r.totalAmount);
      k.shipping += num(r.shippingCost);
      k.real += num(r.realShippingCost);
      k.commission += num(r.carrierCommission);
      k.net += netOf(r);
      k.carrier[carrierOf(r.carrier).key] += 1;
      if (isPendingReview(r)) k.pending += 1;
    });
    return k;
  }, [rows]);

  const motoCount = useMemo(() => rows.filter((r) => carrierOf(r.carrier).key === "moto").length, [rows]);
  const motoUnsettled = useMemo(
    () => rows.filter((r) => carrierOf(r.carrier).key === "moto" && !r.liquidationDate && !isVoided(r)).length, [rows]);

  const fillTargets = useMemo(() => filtered.filter((r) =>
    (fill.carrier === "all" || carrierOf(r.carrier).key === fill.carrier)
    && !isVoided(r)
    && !r.locked
    && (r[fill.field] === null || r[fill.field] === undefined)), [filtered, fill.carrier, fill.field]);

  const applyFill = async () => {
    if (fill.value === "" || fillTargets.length === 0) return;
    setFilling(true);
    setError("");
    try {
      const updated = await bulkUpdateOnlineSaleLedger(fillTargets.map((r) => r.id), { [fill.field]: fill.value }, true);
      const byId = new Map(updated.map((r) => [r.id, r]));
      setRows((prev) => prev.map((r) => byId.get(r.id) || r));
      setNotice(`Listo: ${updated.length} ventas actualizadas.`);
      setFill((f) => ({ ...f, value: "" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setFilling(false);
    }
  };

  // ── Bloqueo ──
  const activeIds = useMemo(() => new Set(active.map((r) => r.id)), [active]);
  // La selección solo cuenta dentro de lo que se ve con el filtro actual.
  const selectedRows = useMemo(() => active.filter((r) => selected.has(r.id)), [active, selected]);
  const allSelected = active.length > 0 && selectedRows.length === active.length;
  const lockStats = useMemo(() => ({
    locked: active.filter((r) => r.locked).length,
    selToLock: selectedRows.filter((r) => !r.locked).length,
    selToUnlock: selectedRows.filter((r) => r.locked).length,
  }), [active, selectedRows]);

  const selectRow = useCallback((id, on) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  }), []);
  const selectAll = (on) => setSelected(on ? new Set(activeIds) : new Set());

  /** Bloquea o desbloquea las filas dadas (solo las que cambian de estado). */
  const applyLock = useCallback(async (targetRows, lock, confirmText) => {
    const ids = targetRows.filter((r) => Boolean(r.locked) !== lock).map((r) => r.id);
    if (ids.length === 0) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setLocking(true);
    setError("");
    try {
      // Antes de bloquear se espera a que terminen de guardarse las celdas de esas ventas.
      await Promise.all(ids.map((id) => chainsRef.current.get(id) || Promise.resolve()));
      const updated = await lockOnlineSaleLedger(ids, lock);
      const byId = new Map(updated.map((r) => [r.id, r]));
      setRows((prev) => prev.map((r) => byId.get(r.id) || r));
      setSelected((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setNotice(`${ids.length} ${ids.length === 1 ? "línea" : "líneas"} ${lock
        ? (ids.length === 1 ? "bloqueada" : "bloqueadas")
        : (ids.length === 1 ? "desbloqueada" : "desbloqueadas")}.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setLocking(false);
    }
  }, []);

  const toggleRowLock = useCallback((row) => {
    if (row.locked) {
      applyLock([row], false, `¿Desbloquear la línea de ${row.customerName || "esta venta"}? Se podrá volver a modificar.`);
    } else {
      // Quien no puede desbloquear confirma antes: un clic por error necesitaría a un administrador.
      applyLock([row], true, meta.canUnlock ? "" : `¿Bloquear la línea de ${row.customerName || "esta venta"}? Ya no se podrá modificar; solo un administrador puede desbloquearla.`);
    }
  }, [applyLock, meta.canUnlock]);

  const download = async () => {
    setDownloading(true);
    setError("");
    try {
      await downloadOnlineSalesLedgerExcel(from, to);
    } catch (e) {
      setError(e.message);
    } finally {
      setDownloading(false);
    }
  };

  const searchHistory = () => {
    const q = query.trim();
    if (q.length < 2) { setError("Escriba al menos 2 caracteres para buscar en todo el historial."); return; }
    load({ history: q });
  };

  const clearFilters = () => { setQuery(""); setFCarrier(""); setFSeller(""); setFPayment(""); setFStatus(""); setOnlyPending(false); setFLock(""); };
  const hasFilters = Boolean(query || fCarrier || fSeller || fPayment || fStatus || onlyPending || fLock);
  const thisMonth = monthRange(toIso(new Date()));
  const isRange = (r) => r.from === from && r.to === to && !meta.historyQuery;
  const today = toIso(new Date());
  const canEdit = meta.canEdit;
  const { canLock, canUnlock } = meta;

  // Atajos de página (fuera de las celdas). Dentro de una celda solo se usan los de la celda.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.altKey && !e.ctrlKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        setTab({ 1: "ventas", 2: "comisiones", 3: "moto" }[e.key]);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) {
        if (typing && (e.key === "PageDown" || e.key === "PageUp")) {
          // Re Pág / Av Pág también funcionan desde una celda
        } else {
          return;
        }
      }
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); }
      else if (e.key === "?") { e.preventDefault(); setShowKeys((v) => !v); }
      else if (e.key === "[" || e.key === "]") {
        if (meta.historyQuery || !from || !to) return;
        e.preventDefault();
        const dir = e.key === "]" ? 1 : -1;
        const span = Math.round((new Date(`${to}T12:00:00`) - new Date(`${from}T12:00:00`)) / 86400000) + 1;
        setRange({ from: addDays(from, dir * span), to: addDays(to, dir * span) });
      } else if (e.key === "{" || e.key === "}") {
        if (meta.historyQuery) return;
        e.preventDefault();
        shiftMonth(e.key === "}" ? 1 : -1);
      } else if (e.key === "PageDown") {
        e.preventDefault();
        setPage((pg) => Math.min(pg + 1, pageCount - 1));
      } else if (e.key === "PageUp") {
        e.preventDefault();
        setPage((pg) => Math.max(pg - 1, 0));
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }); // se vuelve a enlazar en cada render para ver el periodo y la página actuales

  const pager = (
    <div className="ol-foot">
      <div className="ol-legend">
        <span><b className="ol-c-moto" /> Motorista</span>
        <span><b className="ol-c-forza" /> Forza</span>
        <span><b className="ol-c-guatex" /> Guatex</span>
        <span><b style={{ background: "#fdeeea", border: "1px solid #f3c4ba" }} /> Anulado</span>
        <span><b style={{ background: "#f5edfb", border: "1px solid #d9c2ee" }} /> Devolución</span>
        <span><b style={{ background: "#f0efec", border: "1px solid #d9d5cc" }} /> Cambio</span>
        <span>🔒 Bloqueada (no se modifica)</span>
      </div>
      <div className="end">
        <span>{active.length} {active.length === 1 ? "venta" : "ventas"}</span>
        <select className="ol-input" style={{ height: 30 }} value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
          aria-label="Filas por página">
          {PAGE_SIZES.map((s) => <option key={s} value={s}>{s ? `${s} por página` : "Todas"}</option>)}
        </select>
        {pageCount > 1 && (
          <>
            <button type="button" className="ol-btn quiet sm" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹ Anterior</button>
            <span>{safePage + 1} de {pageCount}</span>
            <button type="button" className="ol-btn quiet sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)}>Siguiente ›</button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="ol">
      <datalist id="ol-payment-forms">{PAYMENT_FORMS.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="ol-delivery-notes">{DELIVERY_NOTES.map((p) => <option key={p} value={p} />)}</datalist>

      <div className="ol-head">
        <div>
          <h4>Libro de ventas en línea</h4>
          <div className="sub">
            {meta.historyQuery
              ? <>Resultados de «{meta.historyQuery}» en todo el historial</>
              : <>La hoja de Contabilidad · {canEdit ? "cada celda se guarda sola al salir de ella" : "solo lectura"}</>}
          </div>
        </div>
        <div className="end">
          <div className="ol-period" role="group" aria-label="Periodo">
            <button type="button" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button>
            <span className="name">{meta.historyQuery ? "Historial" : periodLabel(from, to)}</span>
            <button type="button" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">›</button>
          </div>
          <button type="button" className="ol-btn primary" onClick={download} disabled={downloading || !from || !to || meta.historyQuery !== ""}
            title="Ventas, Comisiones por vendedor, Moto y Faltantes del periodo completo">
            {downloading ? <Spinner size="sm" /> : <i className="nc-icon nc-cloud-download-93" />} Descargar Excel
          </button>
        </div>
      </div>

      {error && <div className="ol-alert err" role="alert">{error}<button type="button" onClick={() => setError("")}>Cerrar</button></div>}
      {notice && <div className="ol-alert info">{notice}<button type="button" onClick={() => setNotice("")}>Cerrar</button></div>}
      {meta.truncated && <div className="ol-alert info">Hay más ventas de las que se muestran. Acorte el periodo o afine la búsqueda.</div>}

      <div className="ol-kpis">
        <div className="k">
          <div className="t">Ventas</div>
          <div className="v">{kpi.count}</div>
          <div className="ol-split" title={`Motorista ${kpi.carrier.moto} · Forza ${kpi.carrier.forza} · Guatex ${kpi.carrier.guatex}`}>
            {["moto", "forza", "guatex", "none"].map((c) => kpi.carrier[c] > 0 && (
              <i key={c} className={`ol-c-${c}`} style={{ flex: kpi.carrier[c] }} />
            ))}
          </div>
        </div>
        <div className="k">
          <div className="t">Total con envío</div>
          <div className="v">{formatQ(kpi.total)}</div>
          <div className="s">Sin envío <b>{formatQ(kpi.net)}</b></div>
        </div>
        <div className="k">
          <div className="t">Envío cobrado / real</div>
          <div className="v">{formatQ(kpi.shipping)}</div>
          <div className="s">Real <b>{formatQ(kpi.real)}</b> · dif. <b>{formatQ(kpi.shipping - kpi.real)}</b></div>
        </div>
        <div className="k">
          <div className="t">Comisión de transporte</div>
          <div className="v">{formatQ(kpi.commission)}</div>
          <div className="s">Anotada por Contabilidad</div>
        </div>
        <button type="button" className={`k ${kpi.pending > 0 ? "warn" : "done"}`}
          onClick={() => { setTab("ventas"); setOnlyPending(kpi.pending > 0); }}
          title="Ventas a las que les falta el envío real">
          <div className="t">Por revisar</div>
          <div className="v">{kpi.pending}</div>
          <div className="s">{kpi.pending > 0 ? "Sin envío real · ver" : "Todo el periodo tiene envío real"}</div>
        </button>
      </div>

      <div className="ol-bar">
        <div className="ol-seg" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "ventas"} className={tab === "ventas" ? "is-on" : ""} onClick={() => setTab("ventas")}>
            Ventas <span className="c">{rows.length}</span>
          </button>
          <button type="button" role="tab" aria-selected={tab === "comisiones"} className={tab === "comisiones" ? "is-on" : ""} onClick={() => setTab("comisiones")}>
            Comisiones por vendedor
          </button>
          <button type="button" role="tab" aria-selected={tab === "moto"} className={tab === "moto" ? "is-on" : ""} onClick={() => setTab("moto")}>
            Moto <span className={`c${motoUnsettled > 0 ? " warn" : ""}`}>{motoUnsettled > 0 ? `${motoUnsettled} sin liquidar` : motoCount}</span>
          </button>
        </div>
        {loading && <Spinner size="sm" color="info" />}
      </div>

      {tab !== "comisiones" && (
        <div className="ol-filters">
          <div>
            <label htmlFor="ol-from">Desde</label>
            <input id="ol-from" type="date" className="form-control" value={from} max={to || undefined}
              onChange={(e) => e.target.value && setFrom(e.target.value)} />
          </div>
          <div>
            <label htmlFor="ol-to">Hasta</label>
            <input id="ol-to" type="date" className="form-control" value={to} min={from || undefined}
              onChange={(e) => e.target.value && setTo(e.target.value)} />
          </div>
          <DayNav from={from} to={to} onChange={(f, t) => setRange({ from: f, to: t })} label="Mover" />
          <div className="ol-quick" role="group" aria-label="Periodos rápidos">
            <button type="button" className={isRange({ from: today, to: today }) ? "is-on" : ""} onClick={() => setRange({ from: today, to: today })}>Hoy</button>
            <button type="button" className={isRange(thisMonth) ? "is-on" : ""} onClick={() => setRange(thisMonth)}>Este mes</button>
            <button type="button" className={isRange(monthRange(today, -1)) ? "is-on" : ""} onClick={() => setRange(monthRange(today, -1))}>Mes pasado</button>
          </div>
          <div className="grow ol-search">
            <label htmlFor="ol-q">Buscar</label>
            <input id="ol-q" ref={searchRef} type="search" className="form-control" value={query} placeholder="Cliente, teléfono, envío, guía, producto… ( / )"
              onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && active.length === 0) searchHistory(); }} />
          </div>
          {tab === "ventas" ? (
            <>
              <div>
                <label htmlFor="ol-carrier">Transporte</label>
                <select id="ol-carrier" className="form-control" value={fCarrier} onChange={(e) => setFCarrier(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="moto">Motorista</option>
                  <option value="forza">Forza</option>
                  <option value="guatex">Guatex</option>
                </select>
              </div>
              <div>
                <label htmlFor="ol-seller">Vendedor</label>
                <select id="ol-seller" className="form-control" value={fSeller} onChange={(e) => setFSeller(e.target.value)}>
                  <option value="">Todos</option>
                  {sellers.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ol-pay">Forma de pago</label>
                <select id="ol-pay" className="form-control" value={fPayment} onChange={(e) => setFPayment(e.target.value)}>
                  <option value="">Todas</option>
                  {payments.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ol-status">Estado</label>
                <select id="ol-status" className="form-control" value={fStatus} onChange={(e) => setFStatus(e.target.value)}>
                  <option value="">Todos</option>
                  {statuses.map((s) => <option key={s} value={s}>{statusOf(s).label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="ol-lock">Bloqueo</label>
                <select id="ol-lock" className="form-control" value={fLock} onChange={(e) => setFLock(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="open">Sin bloquear</option>
                  <option value="locked">Bloqueadas</option>
                </select>
              </div>
              <label className="ol-check">
                <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} /> Solo por revisar
              </label>
            </>
          ) : (
            <>
              <div>
                <label>Transporte</label>
                <div className="ol-seg sm">
                  {[["moto", "Motorista"], ["forza", "Forza"], ["guatex", "Guatex"], ["all", "Todos"]].map(([k, l]) => (
                    <button type="button" key={k} className={motoCarrier === k ? "is-on" : ""} onClick={() => setMotoCarrier(k)}>{l}</button>
                  ))}
                </div>
              </div>
              <label className="ol-check">
                <input type="checkbox" checked={motoPending} onChange={(e) => setMotoPending(e.target.checked)} /> Solo sin liquidar
              </label>
            </>
          )}
          <div className="end">
            <div className="ol-menu-anchor">
              <button type="button" className="ol-btn quiet sm" onClick={() => setShowCols((v) => !v)} aria-expanded={showCols}
                title="Ocultar, mostrar o ensanchar columnas">
                Columnas{hidden.length > 0 ? ` · ${hidden.length} ocultas` : ""}
              </button>
              {showCols && (
                <ColumnsMenu
                  allColumns={allColumns}
                  hidden={hidden}
                  onToggle={toggleColumn}
                  onShowAll={() => patchSheet(() => ({ hidden: [] }))}
                  onPreset={sheetKey === "ventas" ? () => patchSheet(() => ({ hidden: ACCOUNTING_PRESET })) : null}
                  onResetWidths={() => patchSheet(() => ({ widths: {} }))}
                  wrap={Boolean(layout.wrap)}
                  onWrap={(v) => updateLayout((prev) => ({ ...prev, wrap: v }))}
                  onClose={() => setShowCols(false)}
                />
              )}
            </div>
            <button type="button" className="ol-btn quiet sm" onClick={() => setShowKeys((v) => !v)} aria-expanded={showKeys}
              title="Atajos de teclado (?)">⌨ Atajos</button>
            {tab === "ventas" && hasFilters && <button type="button" className="ol-btn quiet sm" onClick={clearFilters}>Quitar filtros</button>}
            {tab === "ventas" && canEdit && (
              <button type="button" className="ol-btn sm" onClick={() => setShowFill((v) => !v)} aria-expanded={showFill}>Llenado rápido</button>
            )}
            {meta.historyQuery
              ? <button type="button" className="ol-btn sm" onClick={() => load()}>Volver al periodo</button>
              : query.trim().length >= 2 && (
                <button type="button" className="ol-btn quiet sm" onClick={searchHistory} title="Buscar este texto en todas las fechas">Buscar en todo el historial</button>
              )}
          </div>
        </div>
      )}

      {tab === "ventas" && showFill && canEdit && (
        <div className="ol-fill">
          <span className="ttl">Llenar lo que está vacío</span>
          <div>
            <label htmlFor="ol-fill-field">Columna</label>
            <select id="ol-fill-field" className="ol-input" value={fill.field} onChange={(e) => setFill({ ...fill, field: e.target.value })}>
              <option value="realShippingCost">Envío real</option>
              <option value="carrierCommission">Comisión</option>
            </select>
          </div>
          <div>
            <label htmlFor="ol-fill-carrier">Transporte</label>
            <select id="ol-fill-carrier" className="ol-input" value={fill.carrier} onChange={(e) => setFill({ ...fill, carrier: e.target.value })}>
              <option value="moto">Motorista</option>
              <option value="forza">Forza</option>
              <option value="guatex">Guatex</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <div>
            <label htmlFor="ol-fill-value">Monto Q</label>
            <input id="ol-fill-value" className="ol-input" style={{ width: 100, textAlign: "right" }} inputMode="decimal" value={fill.value}
              placeholder="0.00" onChange={(e) => setFill({ ...fill, value: e.target.value })} />
          </div>
          <button type="button" className="ol-btn primary sm" style={{ height: 32 }} disabled={filling || fill.value === "" || fillTargets.length === 0} onClick={applyFill}>
            {filling ? <Spinner size="sm" /> : null} Aplicar a {fillTargets.length} {fillTargets.length === 1 ? "venta" : "ventas"}
          </button>
          <span className="ol-note">Solo toca las ventas filtradas que aún no tienen ese dato; no cambia lo ya anotado ni las anuladas.</span>
        </div>
      )}

      {tab !== "comisiones" && canLock && active.length > 0 && (
        <div className="ol-lockbar">
          <span className="ttl">🔒 Bloqueo</span>
          {selectedRows.length > 0 ? (
            <>
              <span>{selectedRows.length} {selectedRows.length === 1 ? "seleccionada" : "seleccionadas"}</span>
              <button type="button" className="ol-btn sm" disabled={locking || lockStats.selToLock === 0}
                onClick={() => applyLock(selectedRows, true)}>
                Bloquear seleccionadas{lockStats.selToLock > 0 ? ` (${lockStats.selToLock})` : ""}
              </button>
              {canUnlock && lockStats.selToUnlock > 0 && (
                <button type="button" className="ol-btn quiet sm" disabled={locking}
                  onClick={() => applyLock(selectedRows, false, `¿Desbloquear ${lockStats.selToUnlock} ${lockStats.selToUnlock === 1 ? "línea" : "líneas"}? Se podrán volver a modificar.`)}>
                  Desbloquear seleccionadas ({lockStats.selToUnlock})
                </button>
              )}
              <button type="button" className="ol-btn quiet sm" onClick={() => setSelected(new Set())}>Quitar selección</button>
            </>
          ) : (
            <span>Marque líneas en la primera columna o use el candado de cada una.</span>
          )}
          <span className="sep" />
          <button type="button" className="ol-btn sm" disabled={locking || lockStats.locked === active.length}
            title="Bloquea todas las ventas que se ven con el periodo y los filtros actuales (todas las páginas)"
            onClick={() => applyLock(active, true, `¿Bloquear las ${active.length - lockStats.locked} ventas sin bloquear de ${hasFilters || tab === "moto" ? "este filtro" : "este periodo"}? Ya no se podrán modificar; solo un administrador puede desbloquearlas.`)}>
            {locking ? <Spinner size="sm" /> : null} Bloquear todas las del filtro ({active.length - lockStats.locked})
          </button>
          {canUnlock && lockStats.locked > 0 && (
            <button type="button" className="ol-btn quiet sm" disabled={locking}
              onClick={() => applyLock(active, false, `¿Desbloquear las ${lockStats.locked} ventas bloqueadas de este filtro? Se podrán volver a modificar.`)}>
              Desbloquear todas ({lockStats.locked})
            </button>
          )}
          <span className="end">{lockStats.locked} de {active.length} bloqueadas{canUnlock ? "" : " · desbloquear: solo un administrador"}</span>
        </div>
      )}

      {showKeys && <ShortcutsPanel onClose={() => setShowKeys(false)} />}

      {tab === "comisiones" && (
        <CommissionsView rows={rows} commissionRate={meta.commissionRate} vatRate={meta.vatRate}
          onShowPending={(seller) => { setFSeller(seller); setOnlyPending(true); setTab("ventas"); }} />
      )}

      {tab !== "comisiones" && (
        <>
          <div className="ol-sheet-wrap">
            {active.length === 0 ? (
              <div className="ol-empty">
                {loading ? <Spinner color="info" /> : (
                  <>
                    <h5>{rows.length === 0 ? "Sin ventas en este periodo" : "Ninguna venta coincide"}</h5>
                    {rows.length === 0 ? "Pruebe con otro mes o rango de fechas." : (
                      <>
                        Revise los filtros{query.trim().length >= 2 ? " o busque en todas las fechas." : "."}
                        <div className="mt-2">
                          {query.trim().length >= 2 && !meta.historyQuery && (
                            <button type="button" className="ol-btn sm" onClick={searchHistory}>Buscar «{query.trim()}» en todo el historial</button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            ) : (
              <Sheet
                columns={visibleColumns}
                rows={visible}
                lineNumber={lineNumber}
                canEdit={canEdit}
                cellStates={cellStates}
                onCommit={commitCell}
                widths={widths}
                onResize={resizeColumn}
                totals={totals}
                count={active.length}
                wrap={Boolean(layout.wrap)}
                canLock={canLock}
                canUnlock={canUnlock}
                selected={selected}
                onSelect={selectRow}
                onSelectAll={selectAll}
                allSelected={allSelected}
                onToggleLock={toggleRowLock}
                nameLabel={tab === "moto" ? "Venta" : "Datos de la venta"}
                lockLabel={tab === "moto" ? "🔒 De la venta" : "🔒 No se editan aquí"}
                editLabel={tab === "moto" ? "Liquidación · ✎ se edita; en cursiva: dato del sistema" : "Contabilidad · ✎ se edita, lo demás se calcula"}
              />
            )}
          </div>
          {active.length > 0 && pager}
        </>
      )}
    </div>
  );
}

export default OnlineSalesLedger;
