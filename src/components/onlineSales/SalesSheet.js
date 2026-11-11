import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { PAYMENT_METHODS, SHIPPING_CARRIERS } from "../../services/onlineSaleService";
import { carrierOf, fold, num, socialOf, statusOf } from "../onlineLedger/onlineLedgerHelper";
import "./SalesSheet.css";

/**
 * Hoja de «Ventas Online» con forma de Excel.
 * - Encabezado: clic ordena, ▾ abre el autofiltro (ordenar, buscar, regla de texto o número y marcar valores), se
 *   arrastra el borde para el ancho.
 * - Celdas: clic selecciona, Shift amplía, Ctrl suma celdas sueltas, arrastrar marca un rango. Flechas, Tab, Enter,
 *   F2 o escribir encima para editar, Supr vacía (solo campos opcionales), Ctrl+C / Ctrl+V con Excel.
 * - Formato (colores de celda y reglas condicionales), columnas visibles y vistas guardadas quedan en este navegador.
 *
 * Columna: { id, label, width, type: text|money|num|select|bool, get(sale), text(sale), render?(sale), field?,
 *   options?, clearable?, tone?, wrap?, center? }
 */

const LS_LAYOUT = "os.sheet.layout.v1";
const LS_FORMATS = "os.sheet.formats.v1";
const LS_RULES = "os.sheet.rules.v1";
const LS_VIEWS = "os.sheet.views.v1";
const EMPTY_KEY = "\u0000vacio";
const PAGE_SIZES = [25, 50, 100, 200, 0];
const MIN_W = 48;
const MAX_W = 640;

const readLs = (key, fallback) => {
  try {
    const v = JSON.parse(window.localStorage.getItem(key));
    return v === null || v === undefined ? fallback : v;
  } catch (_e) {
    return fallback;
  }
};
const writeLs = (key, value) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (_e) { /* sin almacenamiento */ }
};

const formatMoney = (v) =>
  `Q ${num(v).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const isMoney = (col) => col.type === "money";
const isNumeric = (col) => col.type === "money" || col.type === "num";

export const BG_COLORS = ["#FEF3C7", "#DCFCE7", "#FEE2E2", "#E0F2FE", "#F3E8FF", "#FFFFFF"];
export const TEXT_COLORS = ["#202938", "#15803D", "#B91C1C", "#0369A1", "#7E22CE", "#6B7280"];

const TEXT_OPS = [
  ["contains", "Contiene"], ["notContains", "No contiene"], ["starts", "Comienza con"], ["ends", "Termina con"],
  ["eq", "Es igual a"], ["empty", "Está vacía"], ["notEmpty", "No está vacía"],
];
const NUM_OPS = [["eq", "Igual a"], ["gt", "Mayor que"], ["lt", "Menor que"], ["between", "Entre"]];
const NO_VALUE_OPS = ["empty", "notEmpty"];

// ───────── columnas ─────────

const paymentLabel = (sale) => {
  const found = PAYMENT_METHODS.find((p) => p.value === sale.paymentMethod);
  return found ? found.label : (sale.paymentMethodDisplay || String(sale.paymentMethod || "").replace(/_/g, " "));
};

const FEL_LABELS = { CERTIFIED: ["Certificada", "ok"], FAILED: ["Error", "err"], SKIPPED: ["Omitida", "warn"] };
const felOf = (sale) => {
  const [label, tone] = FEL_LABELS[sale.invoiceStatus] || ["Sin factura", "none"];
  return { label, tone };
};

const itemsOf = (sale) => (Array.isArray(sale.items) && sale.items.length > 0
  ? sale.items
  : [{ productCode: sale.productCode, productName: sale.productName, colorName: sale.colorName, size: sale.size, quantity: sale.quantity }]);

const itemText = (it) => [
  [it.productCode, it.productName].filter(Boolean).join(" "),
  it.colorName, it.size,
].filter(Boolean).join(" · ") + (Number(it.quantity) > 1 ? ` ×${it.quantity}` : "");

const firstName = (s) => (s ? String(s).trim().split(/\s+/)[0] : "");

/** Tono de la fila (de Nombre a Autorización), como el Excel: pago pendiente, contra entrega o pagado. */
const toneOf = (sale) => {
  const pm = String(sale.paymentMethod || "").toUpperCase();
  if (pm.includes("PENDIENTE") || fold(sale.paymentAuthorization).trim() === "pendiente") return "pending";
  if (pm.startsWith("CONTRA_ENTREGA")) return "cod";
  if (pm) return "paid";
  return "";
};

const statusKey = (status) => String(status || "").toLowerCase().replace(/_/g, "-");

function buildColumns(amountsOf) {
  const totals = (sale) => {
    const a = amountsOf ? amountsOf(sale) : null;
    const storedTotal = num(sale.totalAmount);
    const storedNet = num(sale.netAmount);
    const recalc = a && a.lineCount > 1;
    return {
      total: recalc && a.total > 0 && Math.abs(a.total - storedTotal) > 0.01 ? a.total : storedTotal,
      totalStored: storedTotal,
      totalMismatch: Boolean(recalc && a.total > 0 && Math.abs(a.total - storedTotal) > 0.01),
      net: recalc && a.net > 0 && Math.abs(a.net - storedNet) > 0.01 ? a.net : storedNet,
    };
  };
  return [
    { id: "no", label: "No.", width: 84, type: "num", sticky: true,
      get: (s) => num(s.saleNumber || s.id), text: (s) => String(s.saleNumber || s.id || "") },
    { id: "customerName", label: "Nombre", width: 180, type: "text", field: "customerName", sticky: true, tone: true, strong: true,
      get: (s) => s.customerName, text: (s) => s.customerName || "" },
    { id: "phone", label: "Teléfono", width: 112, type: "text", field: "phone", tone: true,
      get: (s) => s.phone, text: (s) => s.phone || "" },
    { id: "phone2", label: "Teléfono 2", width: 112, type: "text", field: "phone2", clearable: true, tone: true,
      get: (s) => s.phone2, text: (s) => s.phone2 || "" },
    { id: "address", label: "Dirección", width: 230, type: "text", field: "address", tone: true, wrap: true,
      get: (s) => s.address, text: (s) => s.address || "" },
    { id: "packaging", label: "Emp.", title: "Empaque", width: 66, type: "bool", field: "packaging", tone: true, center: true,
      get: (s) => Boolean(s.packaging), text: (s) => (s.packaging ? "Sí" : "No") },
    { id: "paymentMethod", label: "Forma de pago", width: 160, type: "select", field: "paymentMethod", tone: true,
      options: PAYMENT_METHODS.map((p) => ({ value: p.value, label: p.label })),
      get: (s) => s.paymentMethod, text: paymentLabel },
    { id: "invoiceTaxId", label: "NIT", width: 104, type: "text", field: "invoiceTaxId", clearable: true, tone: true,
      get: (s) => s.invoiceTaxId, text: (s) => s.invoiceTaxId || "" },
    { id: "fel", label: "FEL", width: 104, type: "text", tone: true,
      get: (s) => felOf(s).label, text: (s) => felOf(s).label,
      render: (s) => { const f = felOf(s); return <span className={`ss-fel ${f.tone}`} title={s.invoiceFelError || undefined}>{f.label}</span>; } },
    { id: "products", label: "Productos", width: 250, type: "text", tone: true, wrap: true,
      get: (s) => itemsOf(s).map(itemText).join(" | "), text: (s) => itemsOf(s).map(itemText).join(" | "),
      render: (s) => {
        const items = itemsOf(s);
        return (
          <div className="ss-prod" title={items.map(itemText).join("\n")}>
            {items.map((it, i) => (
              <div key={i} className="ln">
                <strong>{[it.productCode, it.productName].filter(Boolean).join(" ") || "—"}</strong>
                {(it.colorName || it.size || Number(it.quantity) > 1) && (
                  <span>
                    {[it.colorName, it.size].filter(Boolean).join(" · ")}
                    {Number(it.quantity) > 1 && <b> ×{it.quantity}</b>}
                  </span>
                )}
              </div>
            ))}
          </div>
        );
      } },
    { id: "totalAmount", label: "Total", width: 110, type: "money", tone: true, strong: true,
      get: (s) => totals(s).total, text: (s) => formatMoney(totals(s).total),
      render: (s) => {
        const t = totals(s);
        return (
          <>
            <span title={t.totalMismatch ? "Total recalculado desde productos" : undefined}>{formatMoney(t.total)}</span>
            {t.totalMismatch && <div className="ss-mismatch" title={`Guardado: ${formatMoney(t.totalStored)}`}>≠ {formatMoney(t.totalStored)}</div>}
          </>
        );
      } },
    { id: "shippingCost", label: "Envío", width: 92, type: "money", tone: true,
      get: (s) => num(s.shippingCost), text: (s) => formatMoney(s.shippingCost) },
    { id: "netAmount", label: "Sin envío", width: 110, type: "money", tone: true, strong: true,
      get: (s) => totals(s).net, text: (s) => formatMoney(totals(s).net) },
    { id: "shippingCarrier", label: "Transporte", width: 124, type: "select", field: "shippingCarrier", tone: true,
      options: SHIPPING_CARRIERS.map((c) => ({ value: c.value, label: carrierOf(c.value).label })),
      get: (s) => s.shippingCarrier, text: (s) => (s.shippingCarrier ? carrierOf(s.shippingCarrier).label : ""),
      render: (s) => (s.shippingCarrier
        ? <span className={`ss-carrier ${carrierOf(s.shippingCarrier).key}`}>{carrierOf(s.shippingCarrier).label}</span>
        : "") },
    { id: "socialNetwork", label: "Red social", width: 96, type: "text", tone: true, center: true,
      get: (s) => socialOf(s.socialNetwork).label, text: (s) => socialOf(s.socialNetwork).label,
      render: (s) => {
        const sn = socialOf(s.socialNetwork);
        if (!sn.label) return "";
        return <span className={`ss-net ${statusKey(s.socialNetwork)}`} title={sn.label} aria-label={sn.label}>{sn.icon || sn.label.charAt(0)}</span>;
      } },
    { id: "salesperson", label: "Vendedor", width: 110, type: "text", tone: true,
      get: (s) => firstName(s.salesperson), text: (s) => firstName(s.salesperson) },
    { id: "status", label: "Estado", width: 126, type: "text", tone: true,
      get: (s) => statusOf(s.status).label, text: (s) => statusOf(s.status).label,
      render: (s) => <span className={`ss-status ${statusKey(s.status)}`}><i />{statusOf(s.status).label}</span> },
    { id: "guideNumber", label: "Guía", width: 124, type: "text", field: "guideNumber", clearable: true, tone: true, mono: true,
      get: (s) => s.guideNumber, text: (s) => s.guideNumber || "" },
    { id: "paymentAuthorization", label: "Autorización", width: 132, type: "text", field: "paymentAuthorization", clearable: true, tone: true,
      get: (s) => s.paymentAuthorization, text: (s) => s.paymentAuthorization || "" },
    { id: "observations", label: "Observación", width: 220, type: "text", field: "observations", clearable: true, wrap: true,
      get: (s) => s.observations, text: (s) => s.observations || "" },
  ];
}

// ───────── filtros y reglas ─────────

const filterKey = (col, sale) => {
  const t = String(col.text(sale) || "").trim();
  return t === "" ? EMPTY_KEY : t;
};

/** true si la celda cumple la regla (texto o número). Sin regla, siempre true. */
const matchRule = (col, sale, op, q, q2) => {
  if (!op) return true;
  const text = fold(col.text(sale)).trim();
  if (op === "empty") return text === "";
  if (op === "notEmpty") return text !== "";
  if (q === undefined || q === null || String(q).trim() === "") return true;
  if (isNumeric(col)) {
    const a = num(col.get(sale));
    const b = num(String(q).replace(/[Qq,\s]/g, ""));
    if (op === "gt") return a > b;
    if (op === "lt") return a < b;
    if (op === "between") {
      const c = num(String(q2 ?? "").replace(/[Qq,\s]/g, ""));
      return a >= Math.min(b, c) && a <= Math.max(b, c);
    }
    return Math.abs(a - b) < 0.005;
  }
  const right = fold(q).trim();
  if (op === "notContains") return !text.includes(right);
  if (op === "eq") return text === right;
  if (op === "starts") return text.startsWith(right);
  if (op === "ends") return text.endsWith(right);
  return text.includes(right);
};

const passesFilter = (col, sale, f) => {
  if (!f) return true;
  if (f.values && !f.values.includes(filterKey(col, sale))) return false;
  return matchRule(col, sale, f.op, f.q, f.q2);
};

const isFilterActive = (f) => Boolean(f && (f.values || (f.op && (NO_VALUE_OPS.includes(f.op) || String(f.q ?? "").trim() !== ""))));

const sortRows = (rows, col, dir) => {
  const key = (s) => {
    const v = col.get(s);
    if (isNumeric(col)) return num(v);
    if (col.type === "bool") return v ? 1 : 0;
    return fold(col.text(s));
  };
  return [...rows].sort((a, b) => {
    const x = key(a);
    const y = key(b);
    if (x < y) return -dir;
    if (x > y) return dir;
    return 0;
  });
};

/** Texto pegado o escrito → valor que se guarda. */
const parseInput = (col, raw) => {
  const t = String(raw ?? "").replace(/\r?\n/g, " ").trim();
  if (col.type === "bool") return { value: /^(s[ií]?|x|1|true|verdadero|✓|✔)$/i.test(t) };
  if (col.type === "select") {
    if (t === "") return { error: `«${col.label}» no puede quedar vacío` };
    const f = fold(t).trim();
    const hit = col.options.find((o) => fold(o.label) === f || fold(o.value) === f)
      || col.options.find((o) => fold(o.label).startsWith(f) || fold(o.value).replace(/_/g, " ").startsWith(f));
    return hit ? { value: hit.value } : { error: `«${t}» no es una opción de ${col.label}` };
  }
  if (t === "" && !col.clearable) return { error: `«${col.label}» no puede quedar vacío` };
  return { value: t };
};

const sameValue = (col, sale, value) => {
  const cur = col.get(sale);
  if (col.type === "bool") return Boolean(cur) === Boolean(value);
  return String(cur ?? "").trim() === String(value ?? "").trim();
};

const copyCellText = (col, sale) => {
  if (isMoney(col)) return num(col.get(sale)).toFixed(2);
  const t = String(col.text(sale) ?? "");
  return /[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

// ───────── autofiltro ─────────

function FilterMenu({ col, rows, current, sort, anchor, onApply, onSort, onClose }) {
  const ref = useRef(null);
  const searchRef = useRef(null);
  const numeric = isNumeric(col);
  const ops = numeric ? NUM_OPS : TEXT_OPS;
  const [search, setSearch] = useState("");
  const [op, setOp] = useState(current?.op || "");
  const [q, setQ] = useState(current?.q || "");
  const [q2, setQ2] = useState(current?.q2 || "");
  const values = useMemo(() => {
    const map = new Map();
    rows.forEach((s) => {
      const k = filterKey(col, s);
      const e = map.get(k);
      if (e) e.count += 1;
      else map.set(k, { key: k, label: k === EMPTY_KEY ? "(Vacías)" : k, count: 1, sortKey: numeric ? num(col.get(s)) : fold(k) });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === EMPTY_KEY) return 1;
      if (b.key === EMPTY_KEY) return -1;
      return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
    });
  }, [col, rows, numeric]);
  const [checked, setChecked] = useState(() => new Set(current?.values || values.map((v) => v.key)));
  const shown = useMemo(() => {
    const f = fold(search).trim();
    return f ? values.filter((v) => fold(v.label).includes(f)) : values;
  }, [values, search]);
  const allShownOn = shown.length > 0 && shown.every((v) => checked.has(v.key));

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const toggle = (key) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleShown = () => setChecked((prev) => {
    const next = new Set(prev);
    shown.forEach((v) => (allShownOn ? next.delete(v.key) : next.add(v.key)));
    return next;
  });
  const apply = () => {
    const keys = (search.trim() ? shown : values).filter((v) => checked.has(v.key)).map((v) => v.key);
    const next = {
      values: keys.length === values.length ? null : keys,
      op: op || null, q: op ? q : "", q2: op === "between" ? q2 : "",
    };
    onApply(isFilterActive(next) ? next : null);
  };
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "Enter" && e.target.type !== "checkbox" && e.target.tagName !== "BUTTON" && e.target.tagName !== "SELECT") {
      e.preventDefault(); apply();
    }
  };

  const width = 290;
  const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
  const top = Math.max(8, Math.min(anchor.bottom + 4, window.innerHeight - 470));
  return ReactDOM.createPortal(
    <div className="ss-pop ss-filter" ref={ref} style={{ left, top, width }} role="dialog"
      aria-label={`Filtrar ${col.label}`} onKeyDown={onKeyDown}>
      <div className="ttl"><span>Filtrar por <strong>{col.label}</strong></span></div>
      <div className="ss-sortbtns">
        <button type="button" className={sort?.id === col.id && sort.dir === 1 ? "on" : ""} onClick={() => onSort(1)}>
          {numeric ? "0 → 9" : "A → Z"} <span>Ascendente</span>
        </button>
        <button type="button" className={sort?.id === col.id && sort.dir === -1 ? "on" : ""} onClick={() => onSort(-1)}>
          {numeric ? "9 → 0" : "Z → A"} <span>Descendente</span>
        </button>
      </div>
      {sort?.id === col.id && <button type="button" className="ss-link" onClick={() => onSort(0)}>Quitar orden</button>}
      <div className="ss-rule">
        <span>{numeric ? "Filtro numérico" : "Filtro de texto"}</span>
        <div>
          <select value={op} onChange={(e) => setOp(e.target.value)} aria-label="Condición">
            <option value="">(Sin condición)</option>
            {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {op && !NO_VALUE_OPS.includes(op) && (
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={numeric ? "0" : "Escribe un valor"}
              inputMode={numeric ? "decimal" : undefined} aria-label="Valor" />
          )}
          {op === "between" && (
            <input value={q2} onChange={(e) => setQ2(e.target.value)} placeholder="Hasta" inputMode="decimal" aria-label="Hasta" />
          )}
        </div>
      </div>
      <label className="ss-search">
        <span aria-hidden="true">⌕</span>
        <input ref={searchRef} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar valores..." />
      </label>
      <div className="ss-vals">
        <label className="all">
          <input type="checkbox" checked={allShownOn} onChange={toggleShown} />
          <strong>{search.trim() ? "Seleccionar resultados" : "Seleccionar todos"}</strong>
        </label>
        {shown.slice(0, 1000).map((v) => (
          <label key={v.key}>
            <input type="checkbox" checked={checked.has(v.key)} onChange={() => toggle(v.key)} />
            <span>{v.label}</span>
            <small>{v.count}</small>
          </label>
        ))}
        {shown.length > 1000 && <div className="ss-muted">… {shown.length - 1000} más: afine la búsqueda.</div>}
      </div>
      <div className="foot">
        <button type="button" className="ss-btn" onClick={() => onApply(null)}>Limpiar filtro</button>
        <button type="button" className="ss-btn primary" onClick={apply}>Aplicar</button>
      </div>
    </div>,
    document.body,
  );
}

// ───────── editor de celda ─────────

function CellEditor({ col, sale, initial, onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(false);
  const [draft, setDraft] = useState(initial);
  const finish = (value, move) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(value, move);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    if (el.setSelectionRange && typeof el.value === "string") el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); finish(null, null); return; }
    if (e.key === "Enter" && !e.altKey) { e.preventDefault(); finish(draft, e.shiftKey ? "up" : "down"); return; }
    if (e.key === "Tab") { e.preventDefault(); finish(draft, e.shiftKey ? "left" : "right"); return; }
    e.stopPropagation();
  };
  if (col.type === "select") {
    return (
      <select ref={ref} className="ss-editor" value={draft}
        onChange={(e) => { setDraft(e.target.value); finish(e.target.value, null); }}
        onKeyDown={onKeyDown} onBlur={() => finish(draft, "blur")} aria-label={col.label}>
        {!col.options.some((o) => o.value === draft) && <option value={draft}>{col.text(sale) || "—"}</option>}
        {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <input ref={ref} className="ss-editor" value={draft} onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown} onBlur={() => finish(draft, "blur")} aria-label={col.label} />
  );
}

// ───────── fila ─────────

const widthStyle = (w) => ({ width: w, minWidth: w, maxWidth: w });

const SheetRow = React.memo(function SheetRow({
  sale, r, cols, widths, stickyLeft, selC1, selC2, ac, extraCols, editing, onEditDone, formats, ruleStyle,
  checked, onCheck, onToggleBool, renderActions, wrap,
}) {
  const tone = toneOf(sale);
  const rowRule = ruleStyle(sale, null);
  return (
    <tr className={`${checked ? "is-checked" : ""}${wrap ? " is-wrap" : ""}`}>
      {cols.map((col, c) => {
        const key = `${sale.id}:${col.id}`;
        const manual = formats[key];
        const rule = ruleStyle(sale, col.id) || rowRule;
        const style = { ...widthStyle(widths[col.id]) };
        const bg = manual?.bg || rule?.bg;
        const fg = manual?.fg || rule?.fg;
        if (bg) style.backgroundColor = bg;
        if (fg) style.color = fg;
        if (col.sticky && stickyLeft[col.id] !== undefined) style.left = stickyLeft[col.id];
        const selected = (c >= selC1 && c <= selC2) || (extraCols && extraCols.includes(c));
        const cls = [
          col.sticky ? "stick" : "",
          col.tone && tone ? `tone-${tone}` : "",
          isMoney(col) || col.type === "num" ? "num" : "",
          col.strong ? "strong" : "",
          col.center || col.type === "bool" ? "center" : "",
          col.mono ? "mono" : "",
          col.wrap ? "clamp" : "",
          col.field ? "ed" : "",
          selected ? "in-sel" : "",
          ac === c ? "is-active" : "",
        ].filter(Boolean).join(" ");
        let content;
        if (editing && editing.c === c) {
          content = <CellEditor col={col} sale={sale} initial={editing.initial} onDone={onEditDone} />;
        } else if (col.id === "no") {
          content = (
            <span className="ss-no">
              <input type="checkbox" tabIndex={-1} checked={checked} onChange={(e) => onCheck(sale.id, e.target.checked)}
                onMouseDown={(e) => e.stopPropagation()} aria-label={`Seleccionar venta ${col.text(sale)}`} />
              <strong>{col.text(sale)}</strong>
            </span>
          );
        } else if (col.type === "bool") {
          content = (
            <button type="button" tabIndex={-1} className={`ss-bool${col.get(sale) ? " on" : ""}`}
              onMouseDown={(e) => e.stopPropagation()} onClick={() => onToggleBool(sale, col)}
              title="Clic para cambiar">{col.get(sale) ? "Sí" : "No"}</button>
          );
        } else if (col.render) {
          content = col.render(sale);
        } else {
          const t = col.text(sale);
          content = col.wrap ? <span className="txt" title={t}>{t}</span> : t;
        }
        return (
          <td key={col.id} data-r={r} data-c={c} className={cls} style={style}>
            {content}
          </td>
        );
      })}
      {renderActions && <td className="ss-actions">{renderActions(sale)}</td>}
    </tr>
  );
});

/** Botón de icono para la columna Acciones. tone: info | ok | warn | danger | dark */
export function SheetAction({ title, icon, tone, onClick, disabled, busy }) {
  return (
    <button type="button" className={`ss-ib${tone ? ` ${tone}` : ""}`} title={title} aria-label={title}
      onClick={onClick} disabled={disabled}>
      {busy ? <span className="ss-spin" /> : <i className={`nc-icon ${icon}`} />}
    </button>
  );
}

// ───────── menús de la barra ─────────

function Popover({ onClose, className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target) && !e.target.closest("[data-ss-trigger]")) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return <div ref={ref} className={`ss-pop ss-drop ${className || ""}`}>{children}</div>;
}

function Palette({ colors, onPick, current }) {
  return (
    <div className="ss-palette">
      {colors.map((c) => (
        <button key={c} type="button" className={current === c ? "on" : ""} style={{ background: c }}
          onClick={() => onPick(c)} aria-label={`Color ${c}`} title={c} />
      ))}
    </div>
  );
}

function RuleForm({ cols, onAdd }) {
  const ruleCols = cols.filter((c) => c.id !== "no");
  const [colId, setColId] = useState(() => (ruleCols.find((c) => c.id === "observations") || ruleCols[0])?.id || "");
  const col = ruleCols.find((c) => c.id === colId) || ruleCols[0];
  const ops = col && isNumeric(col) ? NUM_OPS : TEXT_OPS;
  const [op, setOp] = useState("contains");
  const [q, setQ] = useState("");
  const [q2, setQ2] = useState("");
  const [bg, setBg] = useState(BG_COLORS[0]);
  const [scope, setScope] = useState("cell");
  if (!col) return null;
  const opOk = ops.some(([v]) => v === op) ? op : ops[0][0];
  const needsValue = !NO_VALUE_OPS.includes(opOk);
  return (
    <div className="ss-ruleform">
      <label>Columna
        <select value={col.id} onChange={(e) => setColId(e.target.value)}>
          {ruleCols.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
      </label>
      <div className="row2">
        <label>Condición
          <select value={opOk} onChange={(e) => setOp(e.target.value)}>
            {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        {needsValue && (
          <label>Valor
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={isNumeric(col) ? "0" : "texto"} />
          </label>
        )}
        {opOk === "between" && (
          <label>Hasta<input value={q2} onChange={(e) => setQ2(e.target.value)} /></label>
        )}
      </div>
      <label>Pintar
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="cell">Solo la celda</option>
          <option value="row">Toda la fila</option>
        </select>
      </label>
      <label>Color
        <Palette colors={BG_COLORS.slice(0, 5)} current={bg} onPick={setBg} />
      </label>
      <button type="button" className="ss-btn primary block" disabled={needsValue && q.trim() === ""}
        onClick={() => { onAdd({ id: `r${Date.now()}`, col: col.id, op: opOk, q, q2, bg, scope }); setQ(""); setQ2(""); }}>
        Agregar regla
      </button>
    </div>
  );
}

const describeRule = (rule, cols) => {
  const col = cols.find((c) => c.id === rule.col);
  const ops = col && isNumeric(col) ? NUM_OPS : TEXT_OPS;
  const opLabel = (ops.find(([v]) => v === rule.op) || [null, rule.op])[1];
  const value = NO_VALUE_OPS.includes(rule.op) ? "" : ` «${rule.q}»${rule.op === "between" ? ` y «${rule.q2}»` : ""}`;
  return `${col ? col.label : rule.col}: ${String(opLabel).toLowerCase()}${value}${rule.scope === "row" ? " · fila" : ""}`;
};

// ───────── hoja ─────────

/**
 * Props: sales (ya filtradas por fecha, búsqueda y filtros de arriba), loading, onSaveCells([{sale, field, value}]) →
 * Promise, renderActions(sale), onPrint(sales[]), onMessage(text), amountsOf(sale), emptyText.
 */
export default function SalesSheet({ sales, loading, onSaveCells, renderActions, onPrint, onMessage, amountsOf, emptyText }) {
  const allCols = useMemo(() => buildColumns(amountsOf), [amountsOf]);
  const defaultWidths = useMemo(() => Object.fromEntries(allCols.map((c) => [c.id, c.width])), [allCols]);

  const [layout, setLayout] = useState(() => {
    const saved = readLs(LS_LAYOUT, {});
    return {
      widths: saved.widths || {},
      hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
      pageSize: PAGE_SIZES.includes(saved.pageSize) ? saved.pageSize : 50,
      wrap: Boolean(saved.wrap),
    };
  });
  useEffect(() => writeLs(LS_LAYOUT, layout), [layout]);
  const [formats, setFormats] = useState(() => readLs(LS_FORMATS, {}));
  useEffect(() => writeLs(LS_FORMATS, formats), [formats]);
  const [rules, setRules] = useState(() => readLs(LS_RULES, []));
  useEffect(() => writeLs(LS_RULES, rules), [rules]);
  const [views, setViews] = useState(() => readLs(LS_VIEWS, []));
  useEffect(() => writeLs(LS_VIEWS, views), [views]);

  const [colFilters, setColFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  const [checked, setChecked] = useState(() => new Set());
  const [menu, setMenu] = useState(null);
  const [filterOpen, setFilterOpen] = useState(null);
  const [saveState, setSaveState] = useState("saved");
  const [viewName, setViewName] = useState("");

  const widths = useMemo(() => ({ ...defaultWidths, ...layout.widths }), [defaultWidths, layout.widths]);
  const cols = useMemo(() => allCols.filter((c) => !layout.hidden.includes(c.id)), [allCols, layout.hidden]);
  const colById = useMemo(() => Object.fromEntries(allCols.map((c) => [c.id, c])), [allCols]);

  const stickyLeft = useMemo(() => {
    const out = {};
    let left = 0;
    cols.forEach((c) => {
      if (!c.sticky) return;
      out[c.id] = left;
      left += widths[c.id];
    });
    return out;
  }, [cols, widths]);

  // ── filas: filtros de columna → orden → página ──
  const applyFilters = useCallback((rows, exceptId) => {
    const active = Object.entries(colFilters).filter(([id, f]) => id !== exceptId && colById[id] && isFilterActive(f));
    if (!active.length) return rows;
    return rows.filter((s) => active.every(([id, f]) => passesFilter(colById[id], s, f)));
  }, [colFilters, colById]);

  const filtered = useMemo(() => {
    const out = applyFilters(sales || []);
    const col = sort && colById[sort.id];
    return col ? sortRows(out, col, sort.dir) : out;
  }, [sales, applyFilters, sort, colById]);

  const pageSize = layout.pageSize || filtered.length || 1;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = useMemo(
    () => (layout.pageSize ? filtered.slice(safePage * pageSize, safePage * pageSize + pageSize) : filtered),
    [filtered, layout.pageSize, safePage, pageSize],
  );
  useEffect(() => { if (page !== safePage) setPage(safePage); }, [page, safePage]);

  const activeFilterCount = Object.values(colFilters).filter(isFilterActive).length;

  // ── selección ──
  const wrapRef = useRef(null);
  const [active, setActive] = useState({ r: 0, c: 1 });
  const [anchor, setAnchor] = useState({ r: 0, c: 1 });
  const [extra, setExtra] = useState(() => new Set());
  const [editing, setEditing] = useState(null);
  const dragRef = useRef(false);
  const maxR = rows.length - 1;
  const maxC = cols.length - 1;

  useEffect(() => {
    setActive((a) => ({ r: Math.max(0, Math.min(a.r, maxR)), c: Math.max(0, Math.min(a.c, maxC)) }));
    setAnchor((a) => ({ r: Math.max(0, Math.min(a.r, maxR)), c: Math.max(0, Math.min(a.c, maxC)) }));
    setExtra(new Set());
    setEditing(null);
  }, [maxR, maxC, safePage, colFilters, sort]);

  const range = useMemo(() => ({
    r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r),
    c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c),
  }), [active, anchor]);

  /** Celdas seleccionadas (rango + sueltas con Ctrl), en orden de lectura. */
  const selectedCells = useMemo(() => {
    const seen = new Set();
    const out = [];
    if (maxR < 0) return out;
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) { seen.add(`${r}:${c}`); out.push({ r, c }); }
    }
    extra.forEach((k) => {
      if (seen.has(k)) return;
      const [r, c] = k.split(":").map(Number);
      if (r <= maxR && c <= maxC) out.push({ r, c });
    });
    return out.sort((a, b) => a.r - b.r || a.c - b.c);
  }, [range, extra, maxR, maxC]);

  const extraByRow = useMemo(() => {
    const m = {};
    extra.forEach((k) => {
      const [r, c] = k.split(":").map(Number);
      (m[r] = m[r] || []).push(c);
    });
    return m;
  }, [extra]);

  const focusGrid = useCallback(() => wrapRef.current?.focus({ preventScroll: true }), []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !wrap.contains(document.activeElement)) return;
    const td = wrap.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
    if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const move = useCallback((r, c, extend) => {
    const nr = Math.max(0, Math.min(r, maxR));
    const nc = Math.max(0, Math.min(c, maxC));
    setActive({ r: nr, c: nc });
    if (!extend) { setAnchor({ r: nr, c: nc }); setExtra(new Set()); }
  }, [maxR, maxC]);

  // ── avisos ──
  const [toast, setToast] = useState("");
  const toastTimer = useRef(null);
  const message = useCallback((t) => {
    if (onMessage) { onMessage(t); return; }
    setToast(t);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  }, [onMessage]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  // ── guardar ──

  const save = useCallback(async (changes) => {
    if (!changes.length) return;
    setSaveState("saving");
    try {
      await onSaveCells(changes);
      setSaveState("saved");
    } catch (e) {
      setSaveState("error");
      message(e?.message || "No se pudo guardar el cambio.");
    }
  }, [onSaveCells, message]);

  /** Arma los cambios válidos (solo celdas editables que de verdad cambian). */
  const collect = useCallback((cells) => {
    const out = [];
    let skipped = 0;
    let bad = "";
    cells.forEach(({ r, c, raw, parsed }) => {
      const sale = rows[r];
      const col = cols[c];
      if (!sale || !col) return;
      if (!col.field) { skipped += 1; return; }
      const p = parsed || parseInput(col, raw);
      if (p.error) { bad = bad || p.error; return; }
      if (sameValue(col, sale, p.value)) return;
      out.push({ sale, field: col.field, value: p.value });
    });
    if (bad) message(bad);
    else if (skipped > 0 && out.length === 0) message("Esas celdas vienen del sistema y no se editan aquí.");
    return out;
  }, [rows, cols, message]);

  const startEdit = useCallback((text) => {
    const { r, c } = active;
    const col = cols[c];
    const sale = rows[r];
    if (!col || !sale) return;
    if (!col.field) { message(`«${col.label}» no se edita en la hoja: use Editar en la fila.`); return; }
    if (col.type === "bool") return;
    const initial = text !== undefined ? text : (col.type === "select" ? (col.get(sale) || "") : String(col.text(sale) ?? ""));
    setEditing({ r, c, initial });
  }, [active, cols, rows, message]);

  const onEditDone = useCallback((draft, where) => {
    const ed = editing;
    setEditing(null);
    if (!ed) return;
    if (draft !== null) {
      const col = cols[ed.c];
      const parsed = parseInput(col, col.type === "select" ? (col.options.find((o) => o.value === draft)?.label ?? draft) : draft);
      if (parsed.error) message(parsed.error);
      else save(collect([{ r: ed.r, c: ed.c, raw: "", parsed }]));
    }
    const d = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] }[where];
    if (d) move(ed.r + d[0], ed.c + d[1], false);
    if (where !== "blur") focusGrid();
  }, [editing, cols, collect, save, move, focusGrid, message]);

  const toggleBool = useCallback((sale, col) => {
    save([{ sale, field: col.field, value: !col.get(sale) }]);
  }, [save]);

  // ── portapapeles ──
  useEffect(() => {
    const inGrid = () => wrapRef.current && wrapRef.current === document.activeElement;
    const onCopy = (e) => {
      if (!inGrid() || editing || !selectedCells.length) return;
      const byRow = new Map();
      selectedCells.forEach(({ r, c }) => {
        if (!byRow.has(r)) byRow.set(r, []);
        byRow.get(r).push(copyCellText(cols[c], rows[r]));
      });
      e.clipboardData.setData("text/plain", Array.from(byRow.values()).map((cells) => cells.join("\t")).join("\r\n"));
      e.preventDefault();
      message(`${selectedCells.length} ${selectedCells.length === 1 ? "celda copiada" : "celdas copiadas"}.`);
    };
    const onPaste = (e) => {
      if (!inGrid() || editing) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
      const unq = (v) => v.replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"');
      let cells;
      if (lines.length === 1 && lines[0].length === 1) {
        cells = selectedCells.map(({ r, c }) => ({ r, c, raw: unq(lines[0][0]) }));
      } else {
        cells = [];
        lines.forEach((vals, i) => vals.forEach((v, j) => {
          const r = range.r1 + i;
          const c = range.c1 + j;
          if (r <= maxR && c <= maxC) cells.push({ r, c, raw: unq(v) });
        }));
        setAnchor({ r: range.r1, c: range.c1 });
        setActive({ r: Math.min(maxR, range.r1 + lines.length - 1), c: Math.min(maxC, range.c1 + Math.max(...lines.map((l) => l.length)) - 1) });
      }
      const changes = collect(cells);
      if (changes.length) {
        save(changes);
        message(`${changes.length} ${changes.length === 1 ? "celda pegada" : "celdas pegadas"}.`);
      }
    };
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
    };
  }, [editing, selectedCells, cols, rows, range, maxR, maxC, collect, save, message]);

  // ── teclado ──
  const onKeyDown = (e) => {
    if (editing || e.target !== wrapRef.current || maxR < 0) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const { r, c } = active;
    const k = e.key;
    const done = () => { e.preventDefault(); e.stopPropagation(); };
    const pageRows = Math.max(1, Math.floor((wrapRef.current.clientHeight || 400) / 44) - 2);

    if (e.altKey && k === "ArrowDown") {
      done();
      const btn = wrapRef.current.querySelector(`thead th[data-hc="${c}"] .ss-fbtn`);
      if (btn) setFilterOpen({ id: cols[c].id, rect: btn.getBoundingClientRect() });
      return;
    }
    switch (k) {
      case "ArrowDown": done(); move(ctrl ? maxR : r + 1, c, e.shiftKey); return;
      case "ArrowUp": done(); move(ctrl ? 0 : r - 1, c, e.shiftKey); return;
      case "ArrowRight": done(); move(r, ctrl ? maxC : c + 1, e.shiftKey); return;
      case "ArrowLeft": done(); move(r, ctrl ? 0 : c - 1, e.shiftKey); return;
      case "Home": done(); move(ctrl ? 0 : r, 0, e.shiftKey); return;
      case "End": done(); move(ctrl ? maxR : r, maxC, e.shiftKey); return;
      case "PageDown": done(); if (ctrl) setPage((p) => Math.min(pageCount - 1, p + 1)); else move(r + pageRows, c, e.shiftKey); return;
      case "PageUp": done(); if (ctrl) setPage((p) => Math.max(0, p - 1)); else move(r - pageRows, c, e.shiftKey); return;
      case "Tab": done(); move(r, c + (e.shiftKey ? -1 : 1), false); return;
      case "Enter": done(); move(r + (e.shiftKey ? -1 : 1), c, false); return;
      case "F2": done(); startEdit(); return;
      case "Escape": done(); setAnchor(active); setExtra(new Set()); return;
      case "Delete": {
        done();
        const cells = selectedCells.filter(({ c: cc }) => cols[cc]?.clearable);
        if (!cells.length) { message("Supr solo vacía teléfono 2, NIT, guía, autorización y observación."); return; }
        save(collect(cells.map((x) => ({ ...x, raw: "" }))));
        return;
      }
      case "Backspace":
        done();
        if (cols[c]?.type === "select") startEdit();
        else if (cols[c]?.type !== "bool") startEdit("");
        return;
      default: break;
    }
    if (ctrl) {
      if (k.toLowerCase() === "a") { done(); setAnchor({ r: 0, c: 0 }); setActive({ r: maxR, c: maxC }); setExtra(new Set()); }
      return; // Ctrl+C / Ctrl+V van por los eventos del portapapeles
    }
    if (k === " " && cols[c]?.type === "bool") { done(); toggleBool(rows[r], cols[c]); return; }
    if (k.length === 1 && !e.altKey) {
      done();
      const col = cols[c];
      if (col?.type === "bool") { toggleBool(rows[r], col); return; }
      if (col?.type === "select") { startEdit(); return; }
      startEdit(k);
    }
  };

  // ── ratón ──
  const cellFromEvent = (e) => {
    const td = e.target.closest("td[data-r]");
    return td ? { r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const cell = cellFromEvent(e);
    if (!cell || e.target.closest(".ss-editor")) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+clic: suma o quita celdas sueltas, como Excel.
      const key = `${cell.r}:${cell.c}`;
      setExtra((prev) => {
        const next = new Set(prev);
        next.add(`${active.r}:${active.c}`);
        if (next.has(key) && prev.has(key)) next.delete(key); else next.add(key);
        return next;
      });
      setActive(cell);
      setAnchor(cell);
    } else {
      move(cell.r, cell.c, e.shiftKey);
      dragRef.current = true;
    }
    focusGrid();
  };
  const onMouseOver = (e) => {
    if (!dragRef.current) return;
    const cell = cellFromEvent(e);
    if (cell) setActive(cell);
  };
  useEffect(() => {
    const up = () => { dragRef.current = false; };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);
  const onDoubleClick = (e) => {
    const cell = cellFromEvent(e);
    if (!cell || cols[cell.c]?.type === "bool" || e.target.closest("input, button")) return;
    startEdit();
  };

  // ── columnas ──
  const resizeCol = (id, w) => setLayout((l) => {
    const next = { ...l.widths };
    if (w === null) delete next[id]; else next[id] = w;
    return { ...l, widths: next };
  });
  const startResize = (e, col) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = widths[col.id];
    const onMove = (ev) => resizeCol(col.id, Math.min(MAX_W, Math.max(MIN_W, startW + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("ss-resizing");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.classList.add("ss-resizing");
  };
  const toggleSort = (id) => setSort((s) => {
    if (!s || s.id !== id) return { id, dir: 1 };
    if (s.dir === 1) return { id, dir: -1 };
    return null;
  });
  const toggleHidden = (id) => setLayout((l) => ({
    ...l, hidden: l.hidden.includes(id) ? l.hidden.filter((x) => x !== id) : [...l.hidden, id],
  }));

  // ── selección de filas (casillas) ──
  const onCheck = useCallback((id, on) => setChecked((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  }), []);
  const pageAllChecked = rows.length > 0 && rows.every((s) => checked.has(s.id));
  const checkPage = (on) => setChecked((prev) => {
    const next = new Set(prev);
    rows.forEach((s) => (on ? next.add(s.id) : next.delete(s.id)));
    return next;
  });
  const checkedSales = useMemo(() => (sales || []).filter((s) => checked.has(s.id)), [sales, checked]);

  // ── formato ──
  const ruleStyle = useCallback((sale, colId) => {
    for (let i = rules.length - 1; i >= 0; i -= 1) {
      const rule = rules[i];
      const isRowRule = rule.scope === "row";
      if (colId === null ? !isRowRule : (isRowRule || rule.col !== colId)) continue;
      const col = colById[rule.col];
      if (col && matchRule(col, sale, rule.op, rule.q, rule.q2)) return { bg: rule.bg, fg: rule.fg };
    }
    return null;
  }, [rules, colById]);

  const applyFormat = (patch) => {
    if (!selectedCells.length || maxR < 0) { message("Seleccione una o varias celdas primero."); return; }
    setFormats((prev) => {
      const next = { ...prev };
      selectedCells.forEach(({ r, c }) => {
        const key = `${rows[r].id}:${cols[c].id}`;
        if (patch === null) delete next[key];
        else next[key] = { ...next[key], ...patch };
      });
      return next;
    });
  };

  // ── vistas ──
  const applyView = (v) => {
    setColFilters(v.filters || {});
    setSort(v.sort || null);
    if (v.hidden || v.pageSize !== undefined) {
      setLayout((l) => ({ ...l, hidden: v.hidden || l.hidden, pageSize: v.pageSize !== undefined ? v.pageSize : l.pageSize }));
    }
    setPage(0);
    setMenu(null);
    if (v.name) message(`Vista «${v.name}» aplicada.`);
  };
  const quickViews = [
    { label: "Todas las ventas", filters: {} },
    { label: "Pago pendiente", filters: { paymentMethod: { values: null, op: "contains", q: "pendiente" } } },
    { label: "Contra entrega", filters: { paymentMethod: { values: null, op: "contains", q: "contra entrega" } } },
    { label: "Sin guía", filters: { guideNumber: { values: null, op: "empty", q: "" } } },
    { label: "Sin factura FEL", filters: { fel: { values: null, op: "notContains", q: "certificada" } } },
  ];
  const saveView = () => {
    const name = viewName.trim() || `Vista ${views.length + 1}`;
    const view = { name, filters: colFilters, sort, hidden: layout.hidden, pageSize: layout.pageSize };
    setViews((prev) => [...prev.filter((v) => v.name !== name), view]);
    setViewName("");
    message(`Vista «${name}» guardada en este navegador.`);
  };

  // ── totales y barra de estado ──
  const totals = useMemo(() => {
    const t = { total: 0, ship: 0, net: 0 };
    filtered.forEach((s) => {
      t.total += num(colById.totalAmount.get(s));
      t.ship += num(s.shippingCost);
      t.net += num(colById.netAmount.get(s));
    });
    return t;
  }, [filtered, colById]);

  const stats = useMemo(() => {
    let sum = 0;
    let numeric = 0;
    let filled = 0;
    selectedCells.forEach(({ r, c }) => {
      const col = cols[c];
      const sale = rows[r];
      if (!col || !sale) return;
      if (isMoney(col)) { sum += num(col.get(sale)); numeric += 1; filled += 1; }
      else if (String(col.text(sale) ?? "").trim() !== "") filled += 1;
    });
    return { sum, numeric, filled, cells: selectedCells.length };
  }, [selectedCells, cols, rows]);

  const activeCol = cols[active.c];
  const activeSale = rows[active.r];

  const pages = useMemo(() => {
    const out = [];
    const add = (p) => { if (p >= 0 && p < pageCount && !out.includes(p)) out.push(p); };
    add(0);
    for (let p = safePage - 1; p <= safePage + 1; p += 1) add(p);
    add(pageCount - 1);
    return out.sort((a, b) => a - b);
  }, [pageCount, safePage]);

  const filterCol = filterOpen ? colById[filterOpen.id] : null;
  const from = filtered.length ? safePage * pageSize + 1 : 0;
  const to = Math.min(filtered.length, (safePage + 1) * pageSize);

  return (
    <div className="ss">
      {/* Barra de herramientas */}
      <div className="ss-toolbar">
        <div className="left">
          <span className="ss-results"><strong>{filtered.length}</strong> {filtered.length === 1 ? "resultado" : "resultados"}
            {filtered.length !== (sales || []).length && <> de {(sales || []).length}</>}
          </span>
          {checked.size > 0 && (
            <div className="ss-bulk">
              <strong>✓ {checked.size} {checked.size === 1 ? "seleccionada" : "seleccionadas"}</strong>
              {onPrint && (
                <button type="button" onClick={() => onPrint(checkedSales)} disabled={!checkedSales.length}>
                  <i className="nc-icon nc-paper" /> Imprimir hojas de envío
                </button>
              )}
              <button type="button" onClick={() => setChecked(new Set())}>Cancelar</button>
            </div>
          )}
        </div>
        <div className="right">
          <button type="button" className={`ss-tb${activeFilterCount ? " on" : ""}`} disabled={!activeFilterCount}
            onClick={() => { setColFilters({}); message("Filtros de columna quitados."); }}
            title={activeFilterCount ? "Quitar todos los filtros de columna" : "Use ▾ en cada encabezado para filtrar"}>
            ⧩ Filtros <span className="ss-count">{activeFilterCount}</span>
          </button>

          <div className="ss-menuwrap">
            <button type="button" data-ss-trigger className={`ss-tb${menu === "views" ? " on" : ""}`} onClick={() => setMenu(menu === "views" ? null : "views")}>
              ▤ Vistas ▾
            </button>
            {menu === "views" && (
              <Popover onClose={() => setMenu(null)} className="ss-views">
                <strong>Vistas personalizadas</strong>
                <p>Guarde filtros, orden y columnas para volver a usarlos.</p>
                <span className="sec">Vistas rápidas</span>
                {quickViews.map((v) => (
                  <button key={v.label} type="button" className="it" onClick={() => applyView({ filters: v.filters, sort: null })}>{v.label}</button>
                ))}
                <span className="sec">Guardadas</span>
                {views.length === 0 && <span className="ss-muted">No hay vistas guardadas.</span>}
                {views.map((v) => (
                  <div key={v.name} className="it-row">
                    <button type="button" className="it" onClick={() => applyView(v)}>{v.name}</button>
                    <button type="button" className="x" title="Borrar vista" aria-label={`Borrar vista ${v.name}`}
                      onClick={() => setViews((prev) => prev.filter((x) => x.name !== v.name))}>×</button>
                  </div>
                ))}
                <div className="save">
                  <input value={viewName} onChange={(e) => setViewName(e.target.value)} placeholder="Nombre de la vista"
                    onKeyDown={(e) => { if (e.key === "Enter") saveView(); }} />
                  <button type="button" className="ss-btn primary" onClick={saveView}>Guardar vista actual</button>
                </div>
              </Popover>
            )}
          </div>

          <div className="ss-menuwrap">
            <button type="button" data-ss-trigger className={`ss-tb${menu === "cols" ? " on" : ""}`} onClick={() => setMenu(menu === "cols" ? null : "cols")}>
              ▥ Columnas ▾
            </button>
            {menu === "cols" && (
              <Popover onClose={() => setMenu(null)} className="ss-cols">
                <strong>Mostrar columnas</strong>
                <p>{cols.length} de {allCols.length} visibles</p>
                <div className="list">
                  {allCols.map((c) => (
                    <label key={c.id}>
                      <input type="checkbox" checked={!layout.hidden.includes(c.id)} disabled={c.id === "no"} onChange={() => toggleHidden(c.id)} />
                      <span>{c.title || c.label}</span>
                    </label>
                  ))}
                </div>
                <label className="wrapopt">
                  <input type="checkbox" checked={layout.wrap} onChange={(e) => setLayout((l) => ({ ...l, wrap: e.target.checked }))} />
                  <span>Ajustar texto (mostrar todo el contenido)</span>
                </label>
                <button type="button" className="ss-btn block" onClick={() => setLayout((l) => ({ ...l, hidden: [], widths: {} }))}>
                  Restablecer columnas y anchos
                </button>
              </Popover>
            )}
          </div>

          <div className="ss-menuwrap">
            <button type="button" data-ss-trigger className={`ss-tb${menu === "format" ? " on" : ""}`} onClick={() => setMenu(menu === "format" ? null : "format")}>
              🎨 Formato
            </button>
            {menu === "format" && (
              <Popover onClose={() => setMenu(null)} className="ss-format">
                <strong>Formato de celdas</strong>
                <p>{stats.cells > 0 && maxR >= 0 ? `${stats.cells} ${stats.cells === 1 ? "celda seleccionada" : "celdas seleccionadas"}` : "Seleccione una o varias celdas"}</p>
                <label>Color de fondo<Palette colors={BG_COLORS} onPick={(bg) => applyFormat({ bg })} /></label>
                <label>Color de texto<Palette colors={TEXT_COLORS} onPick={(fg) => applyFormat({ fg })} /></label>
                <button type="button" className="ss-btn block" onClick={() => applyFormat(null)}>Quitar formato</button>
                <span className="sec">Formato condicional</span>
                {rules.length === 0 && <span className="ss-muted">Sin reglas: pinte celdas o filas solas cuando cumplan una condición.</span>}
                {rules.map((rule) => (
                  <div key={rule.id} className="ss-rulerow">
                    <b style={{ background: rule.bg }} />
                    <span>{describeRule(rule, allCols)}</span>
                    <button type="button" className="x" aria-label="Quitar regla" title="Quitar regla"
                      onClick={() => setRules((prev) => prev.filter((x) => x.id !== rule.id))}>×</button>
                  </div>
                ))}
                <RuleForm cols={allCols} onAdd={(rule) => setRules((prev) => [...prev, rule])} />
                <p className="ss-muted">El formato se guarda en este navegador.</p>
              </Popover>
            )}
          </div>

          <span className={`ss-save ${saveState}`} aria-live="polite">
            <i />{saveState === "saving" ? "Guardando…" : saveState === "error" ? "Error al guardar" : "Guardado"}
          </span>
        </div>
      </div>

      {/* Barra de fórmulas */}
      <div className="ss-fx">
        <span className="ref">{activeCol && activeSale ? `${activeCol.label} · No. ${colById.no.text(activeSale)}` : "—"}</span>
        <span className="fx">fx</span>
        <span className="val" title={activeCol && activeSale ? String(activeCol.text(activeSale) ?? "") : ""}>
          {activeCol && activeSale ? String(activeCol.text(activeSale) ?? "") : ""}
        </span>
        {activeCol && !activeCol.field && activeSale && <span className="tag">solo lectura</span>}
      </div>

      {/* Hoja */}
      {loading ? (
        <div className="ss-empty"><span className="ss-spin lg" /> Cargando ventas…</div>
      ) : (
        <div className="ss-wrap" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} onMouseDown={onMouseDown}
          onMouseOver={onMouseOver} onDoubleClick={onDoubleClick} role="grid" aria-rowcount={rows.length}
          aria-colcount={cols.length} aria-label="Hoja de ventas: flechas para moverse, escriba para editar">
          <table className="ss-table">
            <thead>
              <tr>
                {cols.map((col, c) => {
                  const f = colFilters[col.id];
                  const filteredCol = isFilterActive(f);
                  const sorted = sort?.id === col.id ? sort.dir : 0;
                  const style = widthStyle(widths[col.id]);
                  if (col.sticky && stickyLeft[col.id] !== undefined) style.left = stickyLeft[col.id];
                  return (
                    <th key={col.id} data-hc={c} style={style} title={col.title || col.label}
                      className={`${col.sticky ? "stick " : ""}${filteredCol ? "is-filtered " : ""}${isNumeric(col) ? "num " : ""}${c >= range.c1 && c <= range.c2 && maxR >= 0 ? "hl" : ""}`}>
                      <div className="th">
                        {col.id === "no" && (
                          <input type="checkbox" checked={pageAllChecked} onChange={(e) => checkPage(e.target.checked)}
                            aria-label="Seleccionar todas las ventas de la página" title="Seleccionar todas las de esta página" />
                        )}
                        <button type="button" tabIndex={-1} className="lbl" onClick={() => toggleSort(col.id)} title="Clic para ordenar">
                          {col.label}
                          <span className={`ss-sort${sorted ? " on" : ""}`}>{sorted === 1 ? "↑" : sorted === -1 ? "↓" : "↕"}</span>
                        </button>
                      </div>
                      <button type="button" tabIndex={-1} className={`ss-fbtn${filteredCol ? " on" : ""}`}
                        onClick={(e) => setFilterOpen({ id: col.id, rect: e.currentTarget.getBoundingClientRect() })}
                        title={`Filtrar «${col.label}» (Alt+↓)`} aria-label={`Filtrar ${col.label}`}>
                        {filteredCol ? "⧩" : "▾"}
                      </button>
                      <span className="ss-resize" onMouseDown={(e) => startResize(e, col)} onDoubleClick={() => resizeCol(col.id, null)}
                        role="separator" aria-orientation="vertical" title="Arrastre para cambiar el ancho · doble clic: ancho original" />
                    </th>
                  );
                })}
                {renderActions && <th className="ss-actions-h">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((sale, r) => {
                const inRows = r >= range.r1 && r <= range.r2;
                return (
                  <SheetRow key={sale.id} sale={sale} r={r} cols={cols} widths={widths} stickyLeft={stickyLeft}
                    selC1={inRows ? range.c1 : -1} selC2={inRows ? range.c2 : -2} ac={r === active.r ? active.c : -1}
                    extraCols={extraByRow[r]} editing={editing && editing.r === r ? editing : null}
                    onEditDone={editing && editing.r === r ? onEditDone : null} formats={formats} ruleStyle={ruleStyle}
                    checked={checked.has(sale.id)} onCheck={onCheck} onToggleBool={toggleBool}
                    renderActions={renderActions} wrap={layout.wrap} />
                );
              })}
              {rows.length === 0 && (
                <tr><td className="ss-none" colSpan={cols.length + (renderActions ? 1 : 0)}>
                  {(sales || []).length === 0 ? (emptyText || "No hay ventas con estas fechas y filtros.") : "Ninguna venta cumple los filtros de columna."}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Barra de estado y paginación */}
      <div className="ss-statusbar">
        <span>{stats.cells > 1 ? `${range.r2 - range.r1 + 1} F × ${range.c2 - range.c1 + 1} C${extra.size ? ` + ${extra.size}` : ""}` : "Listo"}</span>
        <span className="end">
          {stats.numeric > 0 && <>Promedio: <b>{formatMoney(stats.sum / stats.numeric)}</b></>}
          {stats.cells > 1 && <>Recuento: <b>{stats.filled}</b></>}
          {stats.numeric > 0 && <>Suma: <b>{formatMoney(stats.sum)}</b></>}
        </span>
      </div>
      <div className="ss-foot">
        <div className="ss-pagesize">
          Mostrar
          <select value={layout.pageSize} onChange={(e) => { setLayout((l) => ({ ...l, pageSize: Number(e.target.value) })); setPage(0); }}>
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n || "Todas"}</option>)}
          </select>
          registros
        </div>
        <span className="ss-range">Mostrando <strong>{from}–{to}</strong> de <strong>{filtered.length}</strong></span>
        <span className="ss-sum">
          Total <strong>{formatMoney(totals.total)}</strong> · Envío <strong>{formatMoney(totals.ship)}</strong> · Sin envío <strong>{formatMoney(totals.net)}</strong>
        </span>
        {pageCount > 1 && (
          <div className="ss-pages">
            <button type="button" disabled={safePage === 0} onClick={() => setPage(safePage - 1)} aria-label="Página anterior">‹</button>
            {pages.map((p, i) => (
              <React.Fragment key={p}>
                {i > 0 && p - pages[i - 1] > 1 && <span>…</span>}
                <button type="button" className={p === safePage ? "on" : ""} onClick={() => setPage(p)}>{p + 1}</button>
              </React.Fragment>
            ))}
            <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} aria-label="Página siguiente">›</button>
          </div>
        )}
      </div>

      {toast && <div className="ss-toast" role="status">{toast}</div>}

      {filterCol && (
        <FilterMenu col={filterCol} rows={applyFilters(sales || [], filterCol.id)} current={colFilters[filterCol.id]} sort={sort}
          anchor={filterOpen.rect}
          onApply={(f) => {
            setColFilters((prev) => {
              const next = { ...prev };
              if (f) next[filterCol.id] = f; else delete next[filterCol.id];
              return next;
            });
            setPage(0);
            setFilterOpen(null);
            focusGrid();
          }}
          onSort={(dir) => { setSort(dir ? { id: filterCol.id, dir } : null); setFilterOpen(null); focusGrid(); }}
          onClose={() => { setFilterOpen(null); focusGrid(); }} />
      )}
    </div>
  );
}
