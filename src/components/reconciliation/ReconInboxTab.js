import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Input, Spinner, Table } from "reactstrap";
import { bulkReconcile, getCases, reconcileCase } from "services/reconciliationService";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import {
  CARRIER_LABELS, METHOD_LABELS, bulkSummary, canBulkReconcile, describeDifference, differenceColor, formatQ, labelOf, shortcutAction,
} from "utils/reconciliationHelper";
import ReconStatusBadge from "./ReconStatusBadge";

const COLUMNS = [
  { key: "saleDate", label: "Fecha" },
  { key: "saleNumber", label: "Pedido", hide: true },
  { key: "shipmentNumber", label: "ENVL" },
  { key: null, label: "Cliente" },
  { key: "guideNumber", label: "Guía", hide: true },
  { key: "carrier", label: "Transportista", hide: true },
  { key: "paymentMethod", label: "Método" },
  { key: null, label: "Referencia", hide: true },
  { key: "expected", label: "Esperado", num: true },
  { key: "received", label: "Recibido", num: true },
  { key: "difference", label: "Diferencia", num: true },
  { key: null, label: "Comisión", num: true, hide: true },
  { key: "seller", label: "Vendedor", hide: true },
  { key: "status", label: "Estado" },
];

const PAGE_SIZE = 50;

/** Pantalla de trabajo: tabla de casos con búsqueda rápida, orden, selección segura y atajos de teclado. */
const ReconInboxTab = ({ filters, onFilters, version, openId, onOpen, perms, onChanged, onRowsLoaded }) => {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState({ key: "saleDate", dir: "desc" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [text, setText] = useState(filters.q || "");
  const [observation, setObservation] = useState("");
  const [cursor, setCursor] = useState(-1);
  const searchRef = useRef(null);

  useEffect(() => { setText(filters.q || ""); }, [filters.q]);
  useEffect(() => {
    const t = setTimeout(() => { if ((filters.q || "") !== text) { setPage(0); onFilters({ ...filters, q: text }); } }, 350);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => { setPage(0); }, [filters.from, filters.to, filters.method, filters.carrier, filters.sellerId, filters.status, filters.batch]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    getCases(filters, { page, size: PAGE_SIZE, sort: sort.key, dir: sort.dir })
      .then((d) => { if (alive) { setRows(d.rows); setTotal(d.total); setSelected(new Set()); setCursor(-1); if (onRowsLoaded) onRowsLoaded(d.rows.map((r) => r.id)); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [filters, page, sort, version]);

  const toggleSort = (key) => {
    if (!key) return;
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  };

  const toggleRow = (id) => setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const togglePage = (checked) => setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set());
  const summary = bulkSummary(rows, selected);

  const runBulk = async () => {
    const ids = rows.filter((r) => selected.has(r.id) && canBulkReconcile(r)).map((r) => r.id);
    try {
      const r = await bulkReconcile(ids, observation);
      const skipped = r.skipped.length + summary.skipped;
      (skipped ? showWarning : showSuccess)(`${r.done} casos conciliados${skipped ? `. Omitidos ${skipped}: tienen diferencia de monto, ya estaban conciliados o no son seguros en bloque.` : "."}`);
      setObservation("");
      onChanged();
    } catch (e) {
      showError(e.message);
    }
  };

  const reconcileCurrent = useCallback(async () => {
    const row = rows[cursor] || rows.find((r) => r.id === openId);
    if (!row) return;
    if (row.status !== "PENDIENTE_REVISION") { showWarning(`Este caso no se concilia con un clic: está «${row.status}».`); return; }
    try { await reconcileCase(row.id, "Conciliado con el atajo C"); showSuccess(`Caso ${row.shipmentNumber} conciliado`); onChanged(); } catch (e) { showError(e.message); }
  }, [rows, cursor, openId, onChanged]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || "").toLowerCase();
      const action = shortcutAction(e.key, { typing: ["input", "textarea", "select"].includes(tag), hasOpen: openId != null });
      if (!action) return;
      if (action === "search") { e.preventDefault(); if (searchRef.current) searchRef.current.focus(); }
      else if (action === "next" || action === "prev") {
        const next = Math.max(0, Math.min(rows.length - 1, cursor + (action === "next" ? 1 : -1)));
        setCursor(next);
        if (rows[next]) onOpen(rows[next].id);
      } else if (action === "open") { if (rows[cursor]) onOpen(rows[cursor].id); }
      else if (action === "reconcile") reconcileCurrent();
      else if (action === "close") onOpen(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [rows, cursor, openId, onOpen, reconcileCurrent]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="d-flex align-items-center mb-2" style={{ gap: 12 }}>
        <Input innerRef={searchRef} id="recon-search" type="search" bsSize="sm" style={{ maxWidth: 360 }} placeholder="Buscar ENVL, guía, referencia o pedido  ( / )"
          value={text} onChange={(e) => setText(e.target.value)} aria-label="Búsqueda rápida" />
        <small className="text-muted">{total} casos · <kbd>J</kbd>/<kbd>K</kbd> moverse · <kbd>Enter</kbd> abrir · <kbd>C</kbd> conciliar · <kbd>Esc</kbd> cerrar</small>
      </div>
      {selected.size > 0 && (
        <Alert color="info" className="py-2">
          <div className="d-flex align-items-center flex-wrap" style={{ gap: 10 }}>
            <strong>{summary.selected} seleccionados</strong>
            <span>{summary.safe} se pueden conciliar en bloque{summary.skipped ? `, ${summary.skipped} se omitirán (diferencia de monto, ya conciliados o con lote)` : ""}.</span>
            <Input type="text" bsSize="sm" style={{ maxWidth: 240 }} placeholder="Observación (opcional)" value={observation} onChange={(e) => setObservation(e.target.value)} aria-label="Observación de la conciliación en bloque" />
            <Button size="sm" color="primary" disabled={!perms.reconcile || summary.safe === 0} onClick={runBulk}>Conciliar los seguros</Button>
            <Button size="sm" color="link" onClick={() => setSelected(new Set())}>Quitar selección</Button>
          </div>
        </Alert>
      )}
      {error && <Alert color="danger">{error}</Alert>}
      <div className="table-responsive">
        <Table hover size="sm" className="recon-table">
          <thead>
            <tr>
              <th><input type="checkbox" aria-label="Seleccionar la página" checked={rows.length > 0 && selected.size === rows.length} onChange={(e) => togglePage(e.target.checked)} /></th>
              {COLUMNS.map((c) => (
                <th key={c.label} className={`${c.num ? "num" : ""} ${c.hide ? "hide-sm" : ""}`} aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
                  {c.key ? <button type="button" className="recon-sort" onClick={() => toggleSort(c.key)}>{c.label}{sort.key === c.key ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}</button> : c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && rows.length === 0 && (
              <tr><td colSpan={COLUMNS.length + 1} className="text-center p-4"><Spinner size="sm" /> Cargando casos…</td></tr>
            )}
            {!loading && rows.length === 0 && !error && (
              <tr><td colSpan={COLUMNS.length + 1}>
                <div className="recon-empty">
                  <h5>Ningún caso coincide</h5>
                  <p>Pruebe con otro ENVL, guía o referencia, o limpie los filtros. Para empezar un período: 1) generar casos, 2) importar fondos, 3) revisar aquí.</p>
                </div>
              </td></tr>
            )}
            {rows.map((r, i) => {
              const d = describeDifference(r);
              return (
                <tr key={r.id} className={`recon-row ${openId === r.id ? "is-open" : ""} ${selected.has(r.id) ? "is-selected" : ""} ${cursor === i ? "table-active" : ""}`} onClick={() => { setCursor(i); onOpen(r.id); }}>
                  <td onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${r.shipmentNumber}`} checked={selected.has(r.id)} onChange={() => toggleRow(r.id)} /></td>
                  <td>{(r.saleDate || "").slice(5)}</td>
                  <td className="hide-sm">{r.saleNumber}</td>
                  <td><strong>{r.shipmentNumber}</strong></td>
                  <td style={{ whiteSpace: "normal", minWidth: 120 }}>{r.customerName || <span className="text-muted">—</span>}</td>
                  <td className="hide-sm">{r.guideNumber || (r.carrier === "MOTORISTA" ? <span className="text-muted">n/a</span> : <span className="text-danger">— falta</span>)}</td>
                  <td className="hide-sm">{labelOf(CARRIER_LABELS, r.carrier)}</td>
                  <td>{labelOf(METHOD_LABELS, r.paymentMethod)}</td>
                  <td className="hide-sm">{r.reference || <span className="text-muted">—</span>}</td>
                  <td className="num">{formatQ(r.expected)}</td>
                  <td className="num">{r.hasReceipts ? formatQ(r.received) : <span className="text-muted">—</span>}</td>
                  <td className={`num ${differenceColor(d.tone)}`}><strong>{d.symbol} {d.text}</strong></td>
                  <td className="num hide-sm">{formatQ(r.commission)}</td>
                  <td className="hide-sm">{r.seller}</td>
                  <td><ReconStatusBadge status={r.status} />{r.batchCode && <span className="badge badge-light ml-1" title={`Lote cerrado ${r.batchCode}`}>{r.batchCode.slice(-6)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </div>
      <div className="d-flex justify-content-between align-items-center">
        <small className="text-muted">Página {page + 1} de {pages} · {PAGE_SIZE} por página</small>
        <div>
          <Button size="sm" outline disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>{" "}
          <Button size="sm" outline disabled={page + 1 >= pages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
        </div>
      </div>
    </>
  );
};

export default ReconInboxTab;
