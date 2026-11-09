import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "reactstrap";
import {
  getOnlineSalesLedger, updateOnlineSaleLedger, bulkUpdateOnlineSaleLedger, downloadOnlineSalesLedgerExcel,
} from "../../services/onlineSaleService";
import {
  num, formatQ, formatMoney, formatDay, toIso, monthRange, periodLabel, carrierOf, socialOf, statusOf, rowTone,
  netOf, effectiveSentDate, effectivePaymentForm, isPendingReview, isVoided, sellerLabel, computeCommissions,
  computeAccountingSummary, matchesQuery,
} from "./onlineLedgerHelper";
import "./OnlineLedger.css";

/**
 * Libro de ventas en línea: la hoja que Contabilidad llevaba en Excel.
 * - Ventas: todo hasta «Total con envío» viene de la venta y no se edita; lo demás se calcula o lo anota Contabilidad.
 * - Comisiones: cálculo por vendedor sobre todo el periodo.
 * - Moto: liquidación de lo que entrega el motorista.
 * Cada celda se guarda sola al salir de ella.
 */

const PAGE_SIZES = [50, 100, 250, 0];
const PAYMENT_FORMS = ["Contra Entrega", "Visalink", "Depósito", "Transferencia", "Tarjeta", "Efectivo"];
const DELIVERY_NOTES = ["ENTREGADO", "PENDIENTE", "DEVOLUCIÓN", "REPROGRAMADO"];

const cellKey = (id, field) => `${id}:${field}`;

/** Celda editable. Guarda al salir (o con Enter) solo si el valor cambió. */
const EditCell = React.memo(function EditCell({
  rowId, rowIndex, field, value, type = "text", disabled, state, onCommit, placeholder, list, system, width,
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

  const commit = () => {
    if (disabled) return;
    const next = normalized(draft);
    const current = type === "money" && initial !== "" ? String(parseFloat(initial)) : initial.trim();
    if (next !== current) onCommit(rowId, field, next);
  };

  const move = (delta) => {
    const scope = document.activeElement?.closest("table");
    const target = scope?.querySelector(`[data-nav="${field}"][data-rowi="${rowIndex + delta}"]`);
    if (target) { target.focus(); if (target.select) target.select(); }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter") { e.preventDefault(); commit(); move(e.shiftKey ? -1 : 1); }
    else if (e.key === "Escape") { setDraft(initial); e.currentTarget.blur(); }
    else if (type !== "date" && e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (type !== "date" && e.key === "ArrowUp") { e.preventDefault(); move(-1); }
  };

  const shown = type === "money" && !focused && draft !== "" && Number.isFinite(parseFloat(draft))
    ? formatMoney(parseFloat(draft))
    : draft;

  return (
    <input
      className={`ol-cell w-${width || type}${type === "money" ? " num" : ""}${system ? " sys" : ""}${state ? ` is-${state.status}` : ""}`}
      type={type === "date" ? "date" : "text"}
      inputMode={type === "money" ? "decimal" : undefined}
      value={shown}
      disabled={disabled}
      placeholder={disabled ? "" : placeholder}
      list={list}
      title={state?.status === "err" ? state.message : undefined}
      data-nav={field}
      data-rowi={rowIndex}
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

// ───────── Fila de la hoja principal ─────────

const SalesRow = React.memo(function SalesRow({ row, n, index, canEdit, states, onCommit }) {
  const tone = rowTone(row);
  const status = statusOf(row.status);
  const ed = (field, type, extra = {}) => (
    <EditCell rowId={row.id} rowIndex={index} field={field} value={row[field]} type={type} disabled={!canEdit}
      state={states?.[field]} onCommit={onCommit} {...extra} />
  );
  const needsShipping = canEdit && isPendingReview(row);
  return (
    <tr className={`t-${carrierOf(row.carrier).key}${tone ? ` s-${tone}` : ""}`}>
      <td className="stick c0 rowno">{n}</td>
      <td className="stick c1 lock strong" title={row.customerName || ""}>{row.customerName || "—"}</td>
      <td className="lock clip" title={row.address || ""}>{row.address}</td>
      <td className="lock">{row.phone}</td>
      <td className="lock">{row.packaging ? "Sí" : "No"}</td>
      <td className="lock">{row.paymentMethodDisplay}</td>
      <td className="lock">{row.invoiceTaxId}</td>
      <td className="lock clip wide" title={row.products || ""}>{row.products}</td>
      <td className="lock clip" title={row.colors || ""}>{row.colors}</td>
      <td className="lock">{row.sizes}</td>
      <td className="lock num strong">{formatMoney(num(row.totalAmount))}</td>

      <td className="calc num">{formatMoney(num(row.shippingCost))}</td>
      <td className={`ed${needsShipping ? " empty-need" : ""}`}>{ed("realShippingCost", "money", { placeholder: "0.00" })}</td>
      <td className="ed">{ed("carrierCommission", "money", { placeholder: "0.00" })}</td>
      <td className="calc"><CarrierChip carrier={row.carrier} /></td>
      <td className="calc">{formatDay(row.saleDate)}</td>
      <td className="calc" style={{ textAlign: "center" }}><Social value={row.socialNetwork} /></td>
      <td className="calc clip" title={row.email || ""}>{row.email}</td>
      <td className="calc">{row.salesperson}</td>
      <td className="calc">{row.guideNumber}</td>
      <td className="calc">
        {row.shipmentNumber}
        {row.saleNumber ? <span className="pedido">Pedido {row.saleNumber}</span> : null}
      </td>
      <td className="calc clip" title={row.paymentAuthorization || ""}>{row.paymentAuthorization}</td>
      <td className="calc"><span className={`ol-st ${status.tone}`}>{status.label}</span></td>
      <td className="ed">{ed("accountingNote", "text", { placeholder: row.observations || "" })}</td>
      <td className="calc num strong">{formatMoney(netOf(row))}</td>
      <td className="ed">{ed("shortageAmount", "money", { placeholder: "0.00" })}</td>
      <td className="ed">{ed("shortageNote", "text", { width: "short" })}</td>
      <td className="ed center">
        <input type="checkbox" checked={Boolean(row.reviewed)} disabled={!canEdit}
          aria-label="Revisado" onChange={(e) => onCommit(row.id, "reviewed", e.target.checked)} />
      </td>
    </tr>
  );
});

// ───────── Fila de la hoja Moto ─────────

const MotoRow = React.memo(function MotoRow({ row, n, index, canEdit, states, onCommit }) {
  const tone = rowTone(row);
  const ed = (field, type, extra = {}) => (
    <EditCell rowId={row.id} rowIndex={index} field={field} value={row[field]} type={type} disabled={!canEdit}
      state={states?.[field]} onCommit={onCommit} {...extra} />
  );
  return (
    <tr className={`t-${carrierOf(row.carrier).key}${tone ? ` s-${tone}` : ""}`}>
      <td className="stick c0 rowno">{n}</td>
      <td className="stick c1 lock strong" title={row.customerName || ""}>{row.customerName || "—"}</td>
      <td className="ed">
        <EditCell rowId={row.id} rowIndex={index} field="sentDate" value={effectiveSentDate(row)} type="date"
          disabled={!canEdit} state={states?.sentDate} onCommit={onCommit} system={!row.sentDate} />
      </td>
      <td className="ed">{ed("receivedDate", "date")}</td>
      <td className="lock">
        {row.shipmentNumber || row.guideNumber || "—"}
        {row.shipmentNumber && row.guideNumber ? <span className="pedido">Guía {row.guideNumber}</span> : null}
      </td>
      <td className="lock clip wide" title={row.products || ""}>{row.products}</td>
      <td className="lock num strong">{formatMoney(netOf(row))}</td>
      <td className="lock num">{formatMoney(num(row.totalAmount))}</td>
      <td className="ed">
        <EditCell rowId={row.id} rowIndex={index} field="paymentForm" value={effectivePaymentForm(row)} type="text"
          width="short" disabled={!canEdit} state={states?.paymentForm} onCommit={onCommit} system={!row.paymentForm}
          list="ol-payment-forms" />
      </td>
      <td className="ed">{ed("liquidationDate", "date")}</td>
      <td className="ed">{ed("depositSlipNumber", "text", { width: "short" })}</td>
      <td className="ed">{ed("deliveryNote", "text", { width: "short", list: "ol-delivery-notes", placeholder: statusOf(row.status).label })}</td>
      <td className="ed">{ed("realDepositAmount", "money", { placeholder: "0.00" })}</td>
      <td className="ed">{ed("depositNote", "text")}</td>
    </tr>
  );
});

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
  const [meta, setMeta] = useState({ canEdit: false, commissionRate: 0.02, vatRate: 0.12, truncated: false, historyQuery: "" });
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
        commissionRate: num(data.commissionRate) || 0.02,
        vatRate: num(data.vatRate) || 0.12,
        truncated: Boolean(data.truncated),
        historyQuery: opts.history || "",
      });
      setCellStates({});
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
    return matchesQuery(r, query);
  }), [rows, fCarrier, fSeller, fPayment, fStatus, onlyPending, query]);

  const motoRows = useMemo(() => rows.filter((r) => {
    if (motoCarrier !== "all" && carrierOf(r.carrier).key !== motoCarrier) return false;
    if (motoPending && (r.liquidationDate || isVoided(r))) return false;
    return matchesQuery(r, query);
  }), [rows, motoCarrier, motoPending, query]);

  useEffect(() => { setPage(0); }, [fCarrier, fSeller, fPayment, fStatus, onlyPending, query, tab, motoCarrier, motoPending, pageSize]);

  const active = tab === "moto" ? motoRows : filtered;
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

  const clearFilters = () => { setQuery(""); setFCarrier(""); setFSeller(""); setFPayment(""); setFStatus(""); setOnlyPending(false); };
  const hasFilters = Boolean(query || fCarrier || fSeller || fPayment || fStatus || onlyPending);
  const thisMonth = monthRange(toIso(new Date()));
  const isRange = (r) => r.from === from && r.to === to && !meta.historyQuery;
  const today = toIso(new Date());
  const canEdit = meta.canEdit;

  const pager = (
    <div className="ol-foot">
      <div className="ol-legend">
        <span><b className="ol-c-moto" /> Motorista</span>
        <span><b className="ol-c-forza" /> Forza</span>
        <span><b className="ol-c-guatex" /> Guatex</span>
        <span><b style={{ background: "#fdeeea", border: "1px solid #f3c4ba" }} /> Anulado</span>
        <span><b style={{ background: "#f5edfb", border: "1px solid #d9c2ee" }} /> Devolución</span>
        <span><b style={{ background: "#f0efec", border: "1px solid #d9d5cc" }} /> Cambio</span>
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
          <div className="ol-quick" role="group" aria-label="Periodos rápidos">
            <button type="button" className={isRange({ from: today, to: today }) ? "is-on" : ""} onClick={() => setRange({ from: today, to: today })}>Hoy</button>
            <button type="button" className={isRange(thisMonth) ? "is-on" : ""} onClick={() => setRange(thisMonth)}>Este mes</button>
            <button type="button" className={isRange(monthRange(today, -1)) ? "is-on" : ""} onClick={() => setRange(monthRange(today, -1))}>Mes pasado</button>
          </div>
          <div className="grow ol-search">
            <label htmlFor="ol-q">Buscar</label>
            <input id="ol-q" type="search" className="form-control" value={query} placeholder="Cliente, teléfono, envío, guía, producto…"
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
            ) : tab === "ventas" ? (
              <table className="ol-sheet">
                <thead>
                  <tr className="g">
                    <th className="g-lock stick c0" />
                    <th className="g-lock stick c1">Datos de la venta</th>
                    <th className="g-lock" colSpan={9}>🔒 No se editan aquí</th>
                    <th className="g-edit" colSpan={17}>Contabilidad · lo marcado con ✎ se edita, lo demás se calcula</th>
                  </tr>
                  <tr className="h">
                    <th className="stick c0 num">No.</th>
                    <th className="stick c1">Nombre</th>
                    <th>Dirección</th><th>Teléfono</th><th>Empaque</th><th>Forma de pago</th><th>Factura</th>
                    <th>Producto</th><th>Color</th><th>Talla</th><th className="num">Total con envío</th>
                    <th className="num">Envío</th><th className="num edit">Envío real</th><th className="num edit">Comisión</th>
                    <th>Transporte</th><th>Fecha</th><th>Red</th><th>Correo</th><th>Vendedor</th><th>Guía</th><th>Envío</th>
                    <th>Autorización</th><th>Estado</th><th className="edit">Observación</th><th className="num">Sin envío</th>
                    <th className="num edit" title="Positivo = faltante, negativo = sobrante">Faltante (+) / Sobrante (−)</th>
                    <th className="edit">Detalle</th><th className="edit">Revisado</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <SalesRow key={r.id} row={r} n={lineNumber.get(r.id)} index={i} canEdit={canEdit}
                      states={cellStates[r.id]} onCommit={commitCell} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="stick c0" />
                    <td className="stick c1">Totales ({active.length})</td>
                    <td colSpan={8} />
                    <td className="num">{formatMoney(totals.total)}</td>
                    <td className="num">{formatMoney(totals.shipping)}</td>
                    <td className="num">{formatMoney(totals.real)}</td>
                    <td className="num">{formatMoney(totals.commission)}</td>
                    <td colSpan={10} />
                    <td className="num">{formatMoney(totals.net)}</td>
                    <td className="num">{formatMoney(totals.shortage)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            ) : (
              <table className="ol-sheet">
                <thead>
                  <tr className="g">
                    <th className="g-lock stick c0" />
                    <th className="g-lock stick c1">Venta</th>
                    <th className="g-edit" colSpan={12}>Liquidación · lo marcado con ✎ se edita. En cursiva: dato del sistema, se puede corregir</th>
                  </tr>
                  <tr className="h">
                    <th className="stick c0 num">Línea</th>
                    <th className="stick c1">Cliente</th>
                    <th className="edit">Fecha de envío</th><th className="edit">Fecha de recepción</th><th>No. envío</th>
                    <th>Descripción</th><th className="num">Monto sin envío</th><th className="num">Total con envío</th>
                    <th className="edit">Forma de pago</th><th className="edit">Fecha de liquidación</th><th className="edit">No. de boleta</th>
                    <th className="edit">Observación</th><th className="num edit">Valor real depósito</th><th className="edit">Observación</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r, i) => (
                    <MotoRow key={r.id} row={r} n={lineNumber.get(r.id)} index={i} canEdit={canEdit}
                      states={cellStates[r.id]} onCommit={commitCell} />
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="stick c0" />
                    <td className="stick c1">Totales ({active.length})</td>
                    <td colSpan={4} />
                    <td className="num">{formatMoney(totals.net)}</td>
                    <td className="num">{formatMoney(totals.total)}</td>
                    <td colSpan={4} />
                    <td className="num">{formatMoney(totals.deposit)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
          {active.length > 0 && pager}
        </>
      )}
    </div>
  );
}

export default OnlineSalesLedger;
