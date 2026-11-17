import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Spinner } from "reactstrap";
import { Link } from "react-router-dom";
import { getSupplierPayments, voidSupplierPayment } from "services/supplierPaymentService";
import { printSupplierCheques } from "utils/supplierChequePrintFlow";
import { showError, showSuccess } from "utils/notificationHelper";
import "./SupplierPayments.css";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const STATUS_LABEL = { POR_IMPRIMIR: "Por imprimir", IMPRESO: "Impreso", PAGADO: "Pagado", ANULADO: "Anulado" };
const FILTERS = [
  { key: "", label: "Todos" },
  { key: "POR_IMPRIMIR", label: "Por imprimir" },
  { key: "IMPRESO", label: "Impresos" },
  { key: "PAGADO", label: "Pagados" },
  { key: "ANULADO", label: "Anulados" },
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtMoney = (n) =>
  `Q ${Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SupplierPaymentsList() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await getSupplierPayments());
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (data?.rows || []).filter((r) => {
      if (filter && r.status !== filter) return false;
      return !text || [r.number, r.supplierName, r.reference, ...(r.orderCodes || [])]
        .some((v) => String(v || "").toLowerCase().includes(text));
    });
  }, [data, filter, query]);

  const printable = (r) => r.printsCheque && r.status !== "ANULADO";
  const selectedRows = (data?.rows || []).filter((r) => selected.includes(r.id));

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const print = async (list) => {
    const reprints = list.filter((r) => r.printCount > 0);
    if (reprints.length > 0
      && !window.confirm(`${reprints.map((r) => r.number).join(", ")} ya se ${reprints.length > 1 ? "imprimieron" : "imprimió"}. ¿Imprimir de nuevo?`)) {
      return;
    }
    setBusy(true);
    try {
      setData(await printSupplierCheques(list.map((r) => r.id)));
      setSelected([]);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const voidPayment = async (row) => {
    const reason = window.prompt(
      `Anular ${row.number} por ${fmtMoney(row.amount)}.\nEl número de cheque no se reutiliza y las órdenes recuperan su saldo.\n\nMotivo de la anulación:`);
    if (reason === null) return;
    if (!reason.trim()) return showError("Indique el motivo de la anulación.");
    setBusy(true);
    try {
      await voidSupplierPayment(row.id, reason.trim());
      showSuccess(`Pago ${row.number} anulado.`);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="content"><div className="spy-empty"><Spinner size="sm" /> Cargando pagos…</div></div>;
  }
  if (!data) {
    return <div className="content"><div className="spy-empty">No se pudieron cargar los pagos.</div></div>;
  }

  const counts = (data.rows || []).reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});

  return (
    <div className="content">
      <div className="spy">
        <div className="spy-head">
          <div>
            <h4>Pagos a proveedores</h4>
            <p>Cada pago con su forma, cuenta y número de cheque. Desde aquí se imprimen los cheques, solos o varios a la vez, y se anulan si hace falta.</p>
          </div>
          <div className="spy-head-actions">
            <Link to="/admin/accounting/payables" className="spy-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Cuentas por pagar
            </Link>
            {data.canPay && (
              <button type="button" className="spy-btn primary" disabled={busy || selectedRows.length === 0} onClick={() => print(selectedRows)}>
                {selectedRows.length > 0 ? `Imprimir ${selectedRows.length} ${selectedRows.length === 1 ? "cheque" : "cheques"}` : "Imprimir cheques"}
              </button>
            )}
          </div>
        </div>

        <div className="spy-panel">
          <div className="spy-tools">
            <div className="spy-chips" role="group" aria-label="Filtrar por estado">
              {FILTERS.map((f) => (
                <button type="button" key={f.key} className={`spy-chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>
                  {f.label} ({f.key ? counts[f.key] || 0 : data.rows.length})
                </button>
              ))}
            </div>
            <input type="search" className="spy-search" placeholder="Buscar pago, proveedor o cheque" aria-label="Buscar pago, proveedor o cheque"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="spy-scroll">
            <table className="spy-table" style={{ minWidth: 1040 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}><span className="sr-only">Seleccionar</span></th>
                  <th>PAGO</th>
                  <th>FECHA</th>
                  <th>PROVEEDOR</th>
                  <th>FORMA</th>
                  <th>CUENTA</th>
                  <th>CHEQUE / REF.</th>
                  <th className="spy-num">MONTO</th>
                  <th style={{ textAlign: "left" }}>ESTADO</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={selected.includes(r.id) ? "spy-row-on" : ""}>
                    <td>
                      {data.canPay && printable(r) && (
                        <input type="checkbox" className="spy-check" aria-label={`Seleccionar ${r.number}`}
                          checked={selected.includes(r.id)} onChange={() => toggle(r.id)} />
                      )}
                    </td>
                    <td>
                      <div className="spy-name">{r.number}</div>
                      <div className="spy-sub">{(r.orderCodes || []).join(", ")}</div>
                    </td>
                    <td>{fmtDate(r.payDate)}</td>
                    <td>{r.supplierName}</td>
                    <td>{r.methodName}</td>
                    <td className="spy-sub" style={{ fontSize: "0.88rem" }}>{r.bankName || "—"}</td>
                    <td style={{ fontVariantNumeric: "tabular-nums" }}>{r.reference || "—"}</td>
                    <td className="spy-num">{fmtMoney(r.amount)}</td>
                    <td style={{ textAlign: "left" }}>
                      <span className={`spy-badge spy-s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {r.status === "ANULADO" && r.voidReason && <div className="spy-sub">{r.voidReason}</div>}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {data.canPay && printable(r) && (
                        <button type="button" className="spy-btn plain" disabled={busy} onClick={() => print([r])}>
                          {r.printCount > 0 ? "Reimprimir" : "Imprimir cheque"}
                        </button>
                      )}{" "}
                      {data.canPay && r.status !== "ANULADO" && (
                        <button type="button" className="spy-btn plain" disabled={busy} onClick={() => voidPayment(r)}>Anular</button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={10} className="spy-empty">No hay pagos con ese filtro.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
