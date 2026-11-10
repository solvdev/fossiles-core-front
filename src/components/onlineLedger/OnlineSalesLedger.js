import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "reactstrap";
import {
  getOnlineSalesLedger, updateOnlineSaleLedger, bulkUpdateOnlineSaleLedger, downloadOnlineSalesLedgerExcel,
  lockOnlineSaleLedger,
} from "../../services/onlineSaleService";
import {
  num, formatQ, formatDay, toIso, monthRange, periodLabel, carrierOf, socialOf, statusOf, rowTone,
  netOf, effectiveSentDate, effectivePaymentForm, effectiveAuthorization, isPendingReview, isVoided, sellerLabel, computeCommissions,
  computeAccountingSummary, matchesQuery, STATUS_OPTIONS, SOCIAL_OPTIONS, CARRIER_OPTIONS,
} from "./onlineLedgerHelper";
import DayNav, { addDays } from "./DayNav";
import LedgerGrid, { applyColumnFilters } from "./LedgerGrid";
import ReviewPeriodsBar from "./ReviewPeriodsBar";
import "./OnlineLedger.css";

/**
 * Libro de ventas en línea: la hoja que Contabilidad llevaba en Excel, y se usa como Excel (ver LedgerGrid).
 * - Ventas: hasta antes de «Total con envío» viene de la venta y no se edita; desde «Total con envío» todo se edita.
 *   Lo que corrige el libro no cambia la venta: si se vacía la celda, vuelve el dato de la venta (en cursiva).
 * - Comisiones: cálculo por vendedor sobre todo el periodo.
 * - Moto: liquidación de lo que entrega el motorista.
 * Cada celda se guarda sola al salir de ella.
 * Bloqueo: una línea ya revisada se bloquea (una, las seleccionadas o todas las del filtro) y deja de admitir cambios;
 * el servidor también los rechaza. Desbloquear es solo de administradores.
 */

const PAGE_SIZES = [100, 250, 500, 0];
const PAYMENT_FORMS = ["Contra Entrega", "Visalink", "Depósito", "Transferencia", "Tarjeta", "Efectivo"];
const DELIVERY_NOTES = ["ENTREGADO", "PENDIENTE", "DEVOLUCIÓN", "REPROGRAMADO"];

/** «Bloqueada por ana el 10/11/2026 14:05» para el título del candado. */
const lockTitle = (row) => {
  if (row.periodClosed) {
    return `Periodo «${row.periodLabel || ""}» cerrado${row.lockedByName ? ` por ${row.lockedByName}` : ""}: se reabre el periodo, no la línea`;
  }
  if (!row.locked) return "Bloquear esta línea: ya no se podrá modificar";
  const at = row.lockedAt ? String(row.lockedAt) : "";
  const when = at ? ` el ${formatDay(at)}${at.length >= 16 ? ` ${at.slice(11, 16)}` : ""}` : "";
  return `Bloqueada${row.lockedByName ? ` por ${row.lockedByName}` : ""}${when}`;
};
const carrierKey = (row) => carrierOf(row.carrier).key;

const CarrierChip = ({ carrier }) => {
  const c = carrierOf(carrier);
  return <span className={`ol-chip ${c.key}`}>{c.label}</span>;
};

/** Red social con su nombre: «💬 WhatsApp». */
const Social = ({ value }) => {
  const s = socialOf(value);
  if (!s.label) return null;
  return <span className="ol-social">{s.icon ? <i aria-hidden="true">{s.icon}</i> : null}{s.label}</span>;
};

const has = (v) => v !== null && v !== undefined && v !== "";
// Vacíos fijos: un [] o {} nuevo en cada render haría redibujar toda la hoja con cada tecla.
const NONE = [];
const NO_FILTERS = {};

// ───────── Columnas ─────────
// kind: lock = dato de la venta (no se edita) · ed = se edita en el libro.
// get(row) = valor de la celda (filtros, orden, copiar); field = campo que se guarda; sys(row) = se ve el dato de la venta
// (cursiva) porque el libro no lo ha corregido; orig = clave en row.saleOriginal para «En la venta: …».

const CUSTOMER_COLUMN = { id: "customer", label: "Cliente", kind: "lock", width: 190, strong: true, get: (r) => r.customerName || "" };

const SALES_COLUMNS = [
  { id: "address", label: "Dirección", kind: "lock", width: 220, get: (r) => r.address || "" },
  { id: "phone", label: "Teléfono", kind: "lock", width: 120, get: (r) => r.phone || "" },
  { id: "packaging", label: "Empaque", kind: "lock", width: 72, get: (r) => (r.packaging ? "Sí" : "No") },
  { id: "payment", label: "Forma de pago", kind: "lock", width: 130, get: (r) => r.paymentMethodDisplay || "" },
  { id: "invoice", label: "Factura", kind: "lock", width: 90, get: (r) => r.invoiceTaxId || "" },
  { id: "products", label: "Producto", kind: "lock", width: 240, get: (r) => r.products || "" },
  { id: "colors", label: "Color", kind: "lock", width: 130, get: (r) => r.colors || "" },
  { id: "sizes", label: "Talla", kind: "lock", width: 80, get: (r) => r.sizes || "" },
  // ── desde aquí todo se edita ──
  { id: "total", label: "Total con envío", kind: "ed", type: "money", width: 110, strong: true, total: "total",
    field: "accountingTotal", orig: "totalAmount", get: (r) => r.totalAmount, sys: (r) => !has(r.accountingTotal) },
  { id: "shipping", label: "Envío", kind: "ed", type: "money", width: 84, total: "shipping",
    field: "accountingShipping", orig: "shippingCost", get: (r) => r.shippingCost, sys: (r) => !has(r.accountingShipping) },
  { id: "realShipping", label: "Envío real", kind: "ed", type: "money", width: 96, total: "real", need: isPendingReview,
    field: "realShippingCost", get: (r) => r.realShippingCost },
  { id: "commission", label: "Comisión", kind: "ed", type: "money", width: 96, total: "commission",
    field: "carrierCommission", get: (r) => r.carrierCommission },
  { id: "carrier", label: "Transporte", kind: "ed", width: 110, list: "ol-carriers",
    field: "accountingCarrier", orig: "carrier", get: (r) => r.carrier || "", fmt: (v) => carrierOf(v).label,
    sys: (r) => !has(r.accountingCarrier), render: (r) => <CarrierChip carrier={r.carrier} /> },
  { id: "date", label: "Fecha", kind: "ed", type: "date", width: 96,
    field: "accountingSaleDate", orig: "saleDate", get: (r) => r.saleDate || "", sys: (r) => !has(r.accountingSaleDate) },
  { id: "social", label: "Red social", kind: "ed", width: 120, list: "ol-socials",
    field: "accountingSocialNetwork", orig: "socialNetwork", get: (r) => r.socialNetwork || "", fmt: (v) => socialOf(v).label,
    sys: (r) => !has(r.accountingSocialNetwork), render: (r) => <Social value={r.socialNetwork} /> },
  { id: "email", label: "Correo", kind: "ed", width: 170,
    field: "accountingEmail", orig: "email", get: (r) => r.email || "", sys: (r) => !has(r.accountingEmail) },
  { id: "seller", label: "Vendedor", kind: "ed", width: 130, list: "ol-sellers",
    field: "accountingSalesperson", orig: "salesperson", get: (r) => r.salesperson || "", sys: (r) => !has(r.accountingSalesperson) },
  { id: "guide", label: "Guía", kind: "ed", width: 120,
    field: "accountingGuideNumber", orig: "guideNumber", get: (r) => r.guideNumber || "", sys: (r) => !has(r.accountingGuideNumber) },
  { id: "shipment", label: "Envío No.", kind: "ed", width: 112,
    field: "accountingShipmentNumber", orig: "shipmentNumber", get: (r) => r.shipmentNumber || "", sys: (r) => !has(r.accountingShipmentNumber),
    render: (r) => <>{r.shipmentNumber}{r.saleNumber ? <span className="pedido">Pedido {r.saleNumber}</span> : null}</> },
  { id: "auth", label: "Autorización", kind: "ed", width: 130,
    field: "accountingAuthorization", get: effectiveAuthorization, sys: (r) => !has(r.accountingAuthorization) && has(r.paymentAuthorization) },
  { id: "status", label: "Estado", kind: "ed", width: 110, list: "ol-statuses",
    field: "accountingStatus", orig: "status", get: (r) => r.status || "", fmt: (v) => statusOf(v).label, sys: (r) => !has(r.accountingStatus),
    render: (r) => { const st = statusOf(r.status); return <span className={`ol-st ${st.tone}`}>{st.label}</span>; } },
  { id: "note", label: "Observación", kind: "ed", width: 220,
    field: "accountingNote", get: (r) => r.accountingNote || r.observations || "", sys: (r) => !has(r.accountingNote) && has(r.observations) },
  { id: "net", label: "Sin envío", kind: "ed", type: "money", width: 100, strong: true, total: "net",
    title: "Total − envío. Si se escribe un monto, manda ese; Supr vuelve a la fórmula.",
    field: "accountingNet", orig: "netAmount", get: (r) => netOf(r), sys: (r) => !has(r.accountingNet) },
  { id: "shortage", label: "Faltante (+) / Sobrante (−)", kind: "ed", type: "money", width: 120, total: "shortage",
    title: "Positivo = faltante, negativo = sobrante", field: "shortageAmount", get: (r) => r.shortageAmount },
  { id: "shortageNote", label: "Detalle", kind: "ed", width: 150, field: "shortageNote", get: (r) => r.shortageNote || "" },
  { id: "reviewed", label: "Revisado", kind: "ed", type: "bool", width: 80, field: "reviewed", get: (r) => Boolean(r.reviewed) },
];

const MOTO_COLUMNS = [
  { id: "sentDate", label: "Fecha de envío", kind: "ed", type: "date", width: 116,
    field: "sentDate", get: effectiveSentDate, sys: (r) => !has(r.sentDate) && has(r.dispatchedDate) },
  { id: "receivedDate", label: "Fecha de recepción", kind: "ed", type: "date", width: 116, field: "receivedDate", get: (r) => r.receivedDate || "" },
  { id: "shipment", label: "No. envío", kind: "ed", width: 120,
    field: "accountingShipmentNumber", orig: "shipmentNumber", get: (r) => r.shipmentNumber || r.guideNumber || "",
    sys: (r) => !has(r.accountingShipmentNumber),
    render: (r) => <>{r.shipmentNumber || r.guideNumber || "—"}{r.shipmentNumber && r.guideNumber ? <span className="pedido">Guía {r.guideNumber}</span> : null}</> },
  { id: "products", label: "Descripción", kind: "lock", width: 240, get: (r) => r.products || "" },
  { id: "net", label: "Monto sin envío", kind: "ed", type: "money", width: 112, strong: true, total: "net",
    field: "accountingNet", orig: "netAmount", get: (r) => netOf(r), sys: (r) => !has(r.accountingNet) },
  { id: "total", label: "Total con envío", kind: "ed", type: "money", width: 112, total: "total",
    field: "accountingTotal", orig: "totalAmount", get: (r) => r.totalAmount, sys: (r) => !has(r.accountingTotal) },
  { id: "paymentForm", label: "Forma de pago", kind: "ed", width: 140, list: "ol-payment-forms",
    field: "paymentForm", get: effectivePaymentForm, sys: (r) => !has(r.paymentForm) },
  { id: "liquidationDate", label: "Fecha de liquidación", kind: "ed", type: "date", width: 116, field: "liquidationDate", get: (r) => r.liquidationDate || "" },
  { id: "slip", label: "No. de boleta", kind: "ed", width: 120, field: "depositSlipNumber", get: (r) => r.depositSlipNumber || "" },
  { id: "deliveryNote", label: "Observación", kind: "ed", width: 130, list: "ol-delivery-notes",
    field: "deliveryNote", get: (r) => r.deliveryNote || statusOf(r.status).label, sys: (r) => !has(r.deliveryNote) },
  { id: "deposit", label: "Valor real depósito", kind: "ed", type: "money", width: 120, total: "deposit",
    field: "realDepositAmount", get: (r) => r.realDepositAmount },
  { id: "depositNote", label: "Observación del depósito", kind: "ed", width: 200, field: "depositNote", get: (r) => r.depositNote || "" },
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

/** Corre tareas con un máximo de `limit` a la vez (pegar 300 filas no abre 300 conexiones). */
const runLimited = async (tasks, limit = 6) => {
  let i = 0;
  const worker = async () => {
    while (i < tasks.length) {
      const t = tasks[i];
      i += 1;
      // eslint-disable-next-line no-await-in-loop
      await t();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
};

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
  ["Hoja", ""],
  ["↑ ↓ ← → · Tab · Enter", "Moverse (Shift+Tab / Shift+Enter: al revés)"],
  ["Ctrl+flechas · Ctrl+Inicio / Fin", "Ir al borde de la hoja"],
  ["Shift+flechas · Shift+clic · arrastrar", "Seleccionar un rango"],
  ["Ctrl+Espacio · Shift+Espacio · Ctrl+A", "Seleccionar columna · fila · todo"],
  ["Re Pág / Av Pág", "Bajar o subir una pantalla"],
  ["Editar", ""],
  ["Escribir", "Reemplaza el contenido de la celda"],
  ["F2 · doble clic", "Corregir el contenido (flechas mueven el cursor)"],
  ["Enter · Tab · Esc", "Guardar y bajar · guardar y a la derecha · cancelar"],
  ["Supr", "Vaciar el rango (en cursiva: vuelve el dato de la venta)"],
  ["Ctrl+C · Ctrl+X · Ctrl+V", "Copiar · cortar · pegar (también desde y hacia Excel)"],
  ["Ctrl+D", "Rellenar hacia abajo"],
  ["Ctrl+Enter", "Escribir lo mismo en todo el rango"],
  ["Ctrl+;", "Fecha de hoy"],
  ["Espacio", "Marcar o desmarcar «Revisado»"],
  ["Ctrl+Z · Ctrl+Y", "Deshacer · rehacer"],
  ["Filtros", ""],
  ["Alt+↓", "Filtro y orden de la columna activa (▾)"],
  ["Ctrl+Shift+L", "Quitar todos los filtros de columna"],
  ["Ctrl+B", "Buscar"],
  ["Página", ""],
  ["Ctrl+Re Pág / Av Pág · Alt+1 2 3", "Hoja: Ventas · Comisiones · Moto"],
  ["Alt+Re Pág / Av Pág", "Página anterior / siguiente"],
  ["[  ]  ·  {  }", "Día / mes anterior o siguiente (fuera de la hoja)"],
  ["F1 · ?", "Mostrar u ocultar esta ayuda"],
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
          {SHORTCUTS.map(([k, d]) => (d === ""
            ? <tr key={k} className="grp"><td colSpan={2}>{k}</td></tr>
            : <tr key={k}><td><kbd>{k}</kbd></td><td>{d}</td></tr>))}
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
  const [meta, setMeta] = useState({
    canEdit: false, canLock: false, canUnlock: false, commissionRate: 0.02, vatRate: 0.12, truncated: false, historyQuery: "",
    periods: [], canManagePeriods: false, canReopenPeriods: false,
  });
  const [selected, setSelected] = useState(() => new Set());
  const [fLock, setFLock] = useState("");
  const [locking, setLocking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("ventas");
  const [query, setQuery] = useState("");
  const [colFilters, setColFilters] = useState({ ventas: {}, moto: {} });
  const [sorts, setSorts] = useState({ ventas: null, moto: null });
  const [onlyPending, setOnlyPending] = useState(false);
  const [motoCarrier, setMotoCarrier] = useState("moto");
  const [motoPending, setMotoPending] = useState(false);
  const [pageSize, setPageSize] = useState(250);
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
  const historyRef = useRef({ undo: [], redo: [] });

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
        periods: data.periods || [],
        canManagePeriods: Boolean(data.canManagePeriods),
        canReopenPeriods: Boolean(data.canReopenPeriods),
      });
      setCellStates({});
      setSelected(new Set());
      setPage(0);
      historyRef.current = { undo: [], redo: [] };
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

  const setFieldState = useCallback((id, field, state) => setCellStates((prev) => {
    const forRow = { ...(prev[id] || {}) };
    if (state) forRow[field] = state; else delete forRow[field];
    return { ...prev, [id]: forRow };
  }), []);

  /** Guarda una venta con varios campos. Los cambios de una misma venta van en fila (no crea dos veces su registro). */
  const saveRow = useCallback((id, changes) => {
    const fields = Object.keys(changes);
    fields.forEach((f) => setFieldState(id, f, { status: "saving" }));
    const previous = chainsRef.current.get(id) || Promise.resolve();
    const next = previous.then(async () => {
      try {
        const updated = await updateOnlineSaleLedger(id, changes);
        setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
        fields.forEach((f) => setFieldState(id, f, { status: "ok" }));
        setTimeout(() => setCellStates((prev) => {
          const forRow = { ...(prev[id] || {}) };
          fields.forEach((f) => { if (forRow[f]?.status === "ok") delete forRow[f]; });
          return { ...prev, [id]: forRow };
        }), 1200);
        return true;
      } catch (e) {
        fields.forEach((f) => setFieldState(id, f, { status: "err", message: e.message }));
        setError(`No se guardó: ${e.message}`);
        return false;
      }
    });
    chainsRef.current.set(id, next);
    return next;
  }, [setFieldState]);

  /**
   * Guarda cambios de la hoja: [{ row, col, value }]. Lo mismo en muchas ventas (Ctrl+Enter, Supr, pegar un valor) va
   * en un solo pedido; lo demás, una petición por venta. Se anota para Ctrl+Z.
   */
  const applyChanges = useCallback(async (changes, opts = {}) => {
    const list = changes.map(({ row, col, value }) => ({ id: row.id, field: col.field, value, before: row[col.field] }));
    if (list.length === 0) return;
    if (opts.record !== false) {
      historyRef.current.undo.push(list);
      if (historyRef.current.undo.length > 100) historyRef.current.undo.shift();
      if (!opts.keepRedo) historyRef.current.redo = [];
    }
    const sameField = list.every((c) => c.field === list[0].field && String(c.value) === String(list[0].value));
    if (list.length >= 5 && sameField) {
      const { field, value } = list[0];
      const ids = list.map((c) => c.id);
      ids.forEach((id) => setFieldState(id, field, { status: "saving" }));
      try {
        await Promise.all(ids.map((id) => chainsRef.current.get(id) || Promise.resolve()));
        const updated = await bulkUpdateOnlineSaleLedger(ids, { [field]: value }, false);
        const byId = new Map(updated.map((r) => [r.id, r]));
        setRows((prev) => prev.map((r) => byId.get(r.id) || r));
        ids.forEach((id) => setFieldState(id, field, null));
        setNotice(`${updated.length} celdas guardadas.`);
      } catch (e) {
        ids.forEach((id) => setFieldState(id, field, { status: "err", message: e.message }));
        setError(`No se guardó: ${e.message}`);
      }
      return;
    }
    const byRow = new Map();
    list.forEach((c) => {
      if (!byRow.has(c.id)) byRow.set(c.id, {});
      byRow.get(c.id)[c.field] = c.value;
    });
    await runLimited(Array.from(byRow.entries()).map(([id, ch]) => () => saveRow(id, ch)));
    if (byRow.size > 1) setNotice(`${list.length} celdas en ${byRow.size} ventas guardadas.`);
  }, [saveRow, setFieldState]);

  const undoRedo = useCallback((fromKey) => {
    const h = historyRef.current;
    const entry = h[fromKey].pop();
    if (!entry) { setNotice(fromKey === "undo" ? "No hay nada que deshacer." : "No hay nada que rehacer."); return; }
    const toKey = fromKey === "undo" ? "redo" : "undo";
    const byId = new Map(rows.map((r) => [r.id, r]));
    const lockedCount = entry.filter((c) => byId.get(c.id)?.locked).length;
    const back = entry
      .filter((c) => byId.has(c.id) && !byId.get(c.id).locked)
      .map((c) => ({ id: c.id, field: c.field, value: fromKey === "undo" ? c.before : c.value, other: fromKey === "undo" ? c.value : c.before }));
    if (back.length === 0) { setNotice("Esas líneas ya están bloqueadas: no se deshizo nada."); return; }
    h[toKey].push(entry);
    const changes = back.map((c) => ({
      row: byId.get(c.id),
      col: { field: c.field },
      value: c.value === null || c.value === undefined ? (c.field === "reviewed" ? false : "") : c.value,
    }));
    applyChanges(changes, { record: false });
    setNotice(`${fromKey === "undo" ? "Deshecho" : "Rehecho"}: ${back.length} ${back.length === 1 ? "celda" : "celdas"}${lockedCount ? ` (${lockedCount} bloqueadas se quedaron igual)` : ""}.`);
  }, [rows, applyChanges]);

  // Numeración del periodo (la misma «No.» / «LINEA» del Excel).
  const lineNumber = useMemo(() => {
    const map = new Map();
    rows.forEach((r, i) => map.set(r.id, i + 1));
    return map;
  }, [rows]);

  const sellers = useMemo(() => Array.from(new Set(rows.map((r) => String(r.salesperson || "").trim()).filter(Boolean))).sort(), [rows]);

  // Filtros generales (búsqueda, bloqueo, por revisar); los de cada columna van en el encabezado, como Excel.
  const baseVentas = useMemo(() => rows.filter((r) => {
    if (onlyPending && !isPendingReview(r)) return false;
    if (fLock && Boolean(r.locked) !== (fLock === "locked")) return false;
    return matchesQuery(r, query);
  }), [rows, onlyPending, fLock, query]);

  const baseMoto = useMemo(() => rows.filter((r) => {
    if (motoCarrier !== "all" && carrierOf(r.carrier).key !== motoCarrier) return false;
    if (motoPending && (r.liquidationDate || isVoided(r))) return false;
    return matchesQuery(r, query);
  }), [rows, motoCarrier, motoPending, query]);

  // ── Columnas visibles y anchos (por hoja, guardados en este navegador) ──
  const sheetKey = tab === "moto" ? "moto" : "ventas";
  const allColumns = sheetKey === "moto" ? MOTO_COLUMNS : SALES_COLUMNS;
  const sheetLayout = layout[sheetKey] || {};
  const hidden = sheetLayout.hidden || NONE;
  const visibleColumns = useMemo(() => allColumns.filter((c) => !hidden.includes(c.id)), [allColumns, hidden]);
  const gridColumns = useMemo(() => [CUSTOMER_COLUMN, ...visibleColumns], [visibleColumns]);
  const widths = useMemo(() => {
    const w = { customer: 190 };
    allColumns.forEach((c) => { w[c.id] = c.width; });
    return { ...w, ...(sheetLayout.widths || {}) };
  }, [allColumns, sheetLayout.widths]);

  const sheetFilters = colFilters[sheetKey] || NO_FILTERS;
  const sheetSort = sorts[sheetKey] || null;
  // Todas las columnas de la hoja (también las ocultas) para que un filtro no se pierda al ocultar su columna.
  const filterableColumns = useMemo(() => [CUSTOMER_COLUMN, ...allColumns], [allColumns]);
  const baseRows = sheetKey === "moto" ? baseMoto : baseVentas;
  const active = useMemo(
    () => applyColumnFilters(baseRows, filterableColumns, sheetFilters, sheetSort),
    [baseRows, filterableColumns, sheetFilters, sheetSort]);
  const filtered = sheetKey === "ventas" ? active : applyColumnFilters(baseVentas, [CUSTOMER_COLUMN, ...SALES_COLUMNS], colFilters.ventas || {}, null);
  const columnFilterCount = Object.keys(sheetFilters).length;

  const setColumnFilter = useCallback((colId, keys) => setColFilters((prev) => {
    if (colId === null) return { ...prev, [sheetKey]: {} };
    const cur = { ...(prev[sheetKey] || {}) };
    if (keys) cur[colId] = keys; else delete cur[colId];
    return { ...prev, [sheetKey]: cur };
  }), [sheetKey]);
  const setSheetSort = useCallback((sort) => setSorts((prev) => ({ ...prev, [sheetKey]: sort })), [sheetKey]);
  /** Filas para la lista de un filtro: las que dejan los demás filtros (como el autofiltro de Excel). */
  const filterRowsFor = useCallback((colId) => {
    const others = { ...sheetFilters };
    delete others[colId];
    return applyColumnFilters(baseRows, filterableColumns, others, null);
  }, [baseRows, filterableColumns, sheetFilters]);

  useEffect(() => { setPage(0); }, [onlyPending, fLock, query, tab, motoCarrier, motoPending, pageSize, colFilters, sorts]);

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
    selToUnlock: selectedRows.filter((r) => r.locked && !r.periodClosed).length,
    unlockable: active.filter((r) => r.locked && !r.periodClosed).length,
  }), [active, selectedRows]);

  const selectRow = useCallback((id, on) => setSelected((prev) => {
    const next = new Set(prev);
    if (on) next.add(id); else next.delete(id);
    return next;
  }), []);
  const selectAll = (on) => setSelected(on ? new Set(activeIds) : new Set());

  /** Bloquea o desbloquea las filas dadas (solo las que cambian de estado). */
  const applyLock = useCallback(async (targetRows, lock, confirmText) => {
    const ids = targetRows.filter((r) => Boolean(r.locked) !== lock && !(r.periodClosed && !lock)).map((r) => r.id);
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

  const clearFilters = () => {
    setQuery(""); setOnlyPending(false); setFLock("");
    setColFilters((prev) => ({ ...prev, [sheetKey]: {} }));
    setSorts((prev) => ({ ...prev, [sheetKey]: null }));
  };
  const hasFilters = Boolean(query || onlyPending || fLock || columnFilterCount || sheetSort);
  const thisMonth = monthRange(toIso(new Date()));
  const isRange = (r) => r.from === from && r.to === to && !meta.historyQuery;
  const today = toIso(new Date());
  const canEdit = meta.canEdit;
  const { canLock, canUnlock } = meta;

  const SHEETS = ["ventas", "comisiones", "moto"];
  const switchSheet = (dir) => setTab((t) => SHEETS[(SHEETS.indexOf(t) + dir + SHEETS.length) % SHEETS.length]);

  // Atajos de página (fuera de la hoja). Dentro de la hoja manda LedgerGrid.
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const inGrid = Boolean(t && t.closest && t.closest(".ol-grid, .ol-fmenu"));
      const typing = inGrid || (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable));
      if (e.altKey && !e.ctrlKey && ["1", "2", "3"].includes(e.key)) {
        e.preventDefault();
        setTab({ 1: "ventas", 2: "comisiones", 3: "moto" }[e.key]);
        return;
      }
      if (e.key === "F1") { e.preventDefault(); setShowKeys((v) => !v); return; }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === "b" || e.key === "B")) {
        e.preventDefault(); searchRef.current?.focus(); searchRef.current?.select(); return;
      }
      if (e.altKey && !e.ctrlKey && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        setPage((pg) => (e.key === "PageDown" ? Math.min(pg + 1, pageCount - 1) : Math.max(pg - 1, 0)));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !inGrid && (e.key === "PageDown" || e.key === "PageUp")) {
        e.preventDefault();
        switchSheet(e.key === "PageDown" ? 1 : -1);
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
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
      <datalist id="ol-carriers">{CARRIER_OPTIONS.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="ol-socials">{SOCIAL_OPTIONS.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="ol-statuses">{STATUS_OPTIONS.map((p) => <option key={p} value={p} />)}</datalist>
      <datalist id="ol-sellers">{sellers.map((p) => <option key={p} value={p} />)}</datalist>

      <div className="ol-head">
        <div>
          <h4>Libro de ventas en línea</h4>
          <div className="sub">
            {meta.historyQuery
              ? <>Resultados de «{meta.historyQuery}» en todo el historial</>
              : <>La hoja de Contabilidad · {canEdit ? "se usa como Excel: escriba encima, Enter guarda · F1 atajos" : "solo lectura"}</>}
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

      <ReviewPeriodsBar
        from={from}
        to={to}
        rows={rows}
        periods={meta.periods}
        canManage={meta.canManagePeriods}
        canReopen={meta.canReopenPeriods}
        historyMode={Boolean(meta.historyQuery)}
        onChanged={() => load()}
        onGoTo={(p) => { if (p.from === from && p.to === to) load(); else setRange({ from: p.from, to: p.to }); }}
        onError={setError}
        onNotice={setNotice}
      />

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
            {hasFilters && (
              <button type="button" className="ol-btn quiet sm" onClick={clearFilters} title="Quita búsqueda, filtros de columna y orden (Ctrl+Shift+L: solo los de columna)">
                Quitar filtros{columnFilterCount ? ` · ${columnFilterCount} de columna` : ""}
              </button>
            )}
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
          {canUnlock && lockStats.unlockable > 0 && (
            <button type="button" className="ol-btn quiet sm" disabled={locking}
              onClick={() => applyLock(active, false, `¿Desbloquear las ${lockStats.unlockable} ventas bloqueadas de este filtro? Se podrán volver a modificar.`)}>
              Desbloquear todas ({lockStats.unlockable})
            </button>
          )}
          <span className="end">{lockStats.locked} de {active.length} bloqueadas{canUnlock ? "" : " · desbloquear: solo un administrador"}</span>
        </div>
      )}

      {showKeys && <ShortcutsPanel onClose={() => setShowKeys(false)} />}

      {tab === "comisiones" && (
        <CommissionsView rows={rows} commissionRate={meta.commissionRate} vatRate={meta.vatRate}
          onShowPending={(seller) => {
            setColFilters((prev) => ({ ...prev, ventas: { ...(prev.ventas || {}), seller: [seller === "Sin vendedor" ? "\u0000vacio" : seller] } }));
            setOnlyPending(true);
            setTab("ventas");
          }} />
      )}

      {tab !== "comisiones" && (
        <>
          <div className="ol-sheet-wrap">
            {active.length === 0 ? (
              <div className="ol-empty">
                {loading ? <Spinner color="info" /> : (
                  <>
                    <h5>{rows.length === 0 ? "Sin ventas en este periodo" : "Ninguna venta coincide"}</h5>
                    {columnFilterCount > 0 && (
                      <div className="mb-2"><button type="button" className="ol-btn sm" onClick={() => setColumnFilter(null, null)}>Quitar los {columnFilterCount} filtros de columna</button></div>
                    )}
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
              <LedgerGrid
                key={sheetKey}
                columns={gridColumns}
                rows={visible}
                lineNumber={lineNumber}
                widths={widths}
                onResize={resizeColumn}
                canEdit={canEdit}
                cellStates={cellStates}
                totals={totals}
                count={active.length}
                wrap={Boolean(layout.wrap)}
                filters={sheetFilters}
                sort={sheetSort}
                onFilter={setColumnFilter}
                onSort={setSheetSort}
                filterRows={filterRowsFor}
                onChanges={applyChanges}
                onUndo={() => undoRedo("undo")}
                onRedo={() => undoRedo("redo")}
                onMessage={setNotice}
                onSheetKey={switchSheet}
                canLock={canLock}
                canUnlock={canUnlock}
                checkedIds={selected}
                onCheck={selectRow}
                onCheckAll={selectAll}
                allChecked={allSelected}
                onToggleLock={toggleRowLock}
                lockTitle={lockTitle}
                rowTone={rowTone}
                carrierKey={carrierKey}
                groupLabels={tab === "moto"
                  ? { name: "Venta", lock: "🔒 De la venta", edit: "Liquidación · ✎ se edita · en cursiva: dato de la venta" }
                  : { name: "Datos de la venta", lock: "🔒 No se editan aquí", edit: "Contabilidad · ✎ todo se edita · en cursiva: dato de la venta (escriba encima para corregirlo)" }}
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
