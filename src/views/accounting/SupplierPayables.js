import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { Link } from "react-router-dom";
import { createSupplierPayment, getPayables, getPaymentConfig } from "services/supplierPaymentService";
import { amountInWordsQ } from "utils/amountInWords";
import { printSupplierCheques } from "utils/supplierChequePrintFlow";
import { showError, showSuccess } from "utils/notificationHelper";
import "./SupplierPayments.css";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const STATUS_LABEL = { VENCIDA: "Vencida", POR_VENCER: "Por vencer", PARCIAL: "Pago parcial", AL_DIA: "Al día" };
const FILTERS = [
  { key: "", label: "Todas" },
  { key: "VENCIDA", label: "Vencidas" },
  { key: "POR_VENCER", label: "Por vencer" },
  { key: "PARCIAL", label: "Pago parcial" },
  { key: "AL_DIA", label: "Al día" },
];

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtMoney = (n) =>
  `Q ${Number(n || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toNumber = (text) => {
  const value = Number(String(text).replace(/,/g, "").trim());
  return Number.isFinite(value) ? value : NaN;
};
const dueText = (days) => {
  if (days === null || days === undefined) return "";
  if (days < 0) return days === -1 ? "Venció ayer" : `Venció hace ${-days} días`;
  if (days === 0) return "Vence hoy";
  return days === 1 ? "Vence mañana" : `Vence en ${days} días`;
};

export default function SupplierPayables() {
  const [data, setData] = useState(null);
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState([]);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [payables, cfg] = await Promise.all([getPayables(), getPaymentConfig()]);
      setData(payables);
      setConfig(cfg);
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
      return !text || [r.supplierName, r.code].some((v) => String(v || "").toLowerCase().includes(text));
    });
  }, [data, filter, query]);

  const selectedRows = useMemo(() => (data?.rows || []).filter((r) => selected.includes(r.orderId)), [data, selected]);
  const selectedSupplier = selectedRows[0];
  const selectedTotal = selectedRows.reduce((sum, r) => sum + Number(r.balance), 0);

  const toggle = (row) => {
    if (selected.includes(row.orderId)) {
      setSelected(selected.filter((id) => id !== row.orderId));
    } else if (selectedSupplier && selectedSupplier.supplierId !== row.supplierId) {
      showError("Solo se pueden juntar órdenes de un mismo proveedor en un pago.");
    } else {
      setSelected([...selected, row.orderId]);
    }
  };

  const activeMethods = (config?.methods || []).filter((m) => m.active);
  const activeAccounts = (config?.accounts || []).filter((a) => a.active);

  const suggestedReference = (methodId, accountId) => {
    const method = activeMethods.find((m) => m.id === Number(methodId));
    const account = activeAccounts.find((a) => a.id === Number(accountId));
    return method?.printsCheque && account?.nextChequeNumber ? account.nextChequeNumber : "";
  };

  const openPayment = () => {
    const method = activeMethods[0];
    const account = activeAccounts[0];
    setForm({
      methodId: method ? String(method.id) : "",
      accountId: account ? String(account.id) : "",
      payDate: data.today,
      payee: String(selectedSupplier.payeeName || selectedSupplier.supplierName || "").toUpperCase(),
      reference: suggestedReference(method?.id, account?.id),
      concept: `Pago de ${selectedRows.map((r) => r.code).join(", ")}`,
      amounts: Object.fromEntries(selectedRows.map((r) => [r.orderId, Number(r.balance).toFixed(2)])),
    });
  };

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const changeMethod = (methodId) =>
    setForm((f) => ({ ...f, methodId, reference: suggestedReference(methodId, f.accountId) }));
  const changeAccount = (accountId) =>
    setForm((f) => ({ ...f, accountId, reference: suggestedReference(f.methodId, accountId) }));

  const method = form ? activeMethods.find((m) => m.id === Number(form.methodId)) : null;
  const paying = form ? selectedRows.map((r) => ({ row: r, amount: toNumber(form.amounts[r.orderId]) })) : [];
  const payTotal = paying.reduce((sum, p) => sum + (Number.isFinite(p.amount) ? p.amount : 0), 0);

  const submit = async (print) => {
    for (const p of paying) {
      if (!Number.isFinite(p.amount) || p.amount <= 0) return showError(`Indique el monto de ${p.row.code}.`);
      if (p.amount - Number(p.row.balance) > 0.001) return showError(`${p.row.code} solo debe ${fmtMoney(p.row.balance)}.`);
    }
    if (!method) return showError("Elija la forma de pago.");
    if (method.requiresBank && !form.accountId) return showError("Elija la cuenta bancaria.");
    if (method.requiresReference && !form.reference.trim()) {
      return showError(method.printsCheque ? "Indique el número de cheque." : "Indique el número de boleta o la referencia.");
    }
    setSaving(true);
    try {
      const payment = await createSupplierPayment({
        supplierId: selectedSupplier.supplierId,
        paymentMethodId: Number(form.methodId),
        bankAccountId: form.accountId ? Number(form.accountId) : null,
        payDate: form.payDate,
        payeeName: form.payee.trim() || null,
        reference: form.reference.trim() || null,
        concept: form.concept.trim() || null,
        allocations: paying.map((p) => ({ purchaseOrderId: p.row.orderId, amount: Number(p.amount.toFixed(2)) })),
      });
      showSuccess(`Pago ${payment.number} registrado.`);
      setForm(null);
      setSelected([]);
      await load();
      if (print && payment.printsCheque) {
        try {
          await printSupplierCheques([payment.id]);
        } catch (e) {
          showError(`El pago se guardó, pero el cheque no se imprimió: ${e.message}`);
        }
      }
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="content"><div className="spy-empty"><Spinner size="sm" /> Cargando cuentas por pagar…</div></div>;
  }
  if (!data || !config) {
    return <div className="content"><div className="spy-empty">No se pudieron cargar las cuentas por pagar.</div></div>;
  }

  const { summary } = data;
  const counts = (data.rows || []).reduce((acc, r) => ({ ...acc, [r.status]: (acc[r.status] || 0) + 1 }), {});
  const cards = [
    { label: "Por pagar en total", value: fmtMoney(summary.totalBalance), hint: `${summary.orderCount} órdenes de ${summary.supplierCount} proveedores` },
    { label: "Vencido", value: fmtMoney(summary.overdueAmount), hint: `${summary.overdueCount} órdenes pasadas de su fecha`, color: "#9a3414" },
    { label: "Vence en 7 días", value: fmtMoney(summary.dueIn7DaysAmount), hint: `${summary.dueIn7DaysCount} órdenes`, color: "#6b4700" },
    { label: "Pagado este mes", value: fmtMoney(summary.paidThisMonth), hint: `${summary.paymentsThisMonth} pagos emitidos`, color: "#1b6b3a" },
  ];

  return (
    <div className="content">
      <div className="spy">
        <div className="spy-head">
          <div>
            <h4>Cuentas por pagar</h4>
            <p>
              Lo que se le debe a cada proveedor por las órdenes de compra ya recibidas (desde el {fmtDate(config.payablesStartDate)}).
              Marque las órdenes de un mismo proveedor y págueles juntas con un solo cheque o transferencia.
            </p>
          </div>
          <div className="spy-head-actions">
            <Link to="/admin/accounting/supplier-payments" className="spy-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Ver pagos hechos
            </Link>
          </div>
        </div>

        <div className="spy-cards">
          {cards.map((c) => (
            <div className="spy-card" key={c.label}>
              <div className="spy-card-label">{c.label}</div>
              <div className="spy-card-value" style={c.color ? { color: c.color } : undefined}>{c.value}</div>
              <div className="spy-card-hint">{c.hint}</div>
            </div>
          ))}
        </div>

        <div className="spy-panel">
          <div className="spy-tools">
            <div className="spy-chips" role="group" aria-label="Filtrar">
              {FILTERS.map((f) => (
                <button type="button" key={f.key} className={`spy-chip ${filter === f.key ? "on" : ""}`} onClick={() => setFilter(f.key)}>
                  {f.label} ({f.key ? counts[f.key] || 0 : summary.orderCount})
                </button>
              ))}
            </div>
            <input type="search" className="spy-search" placeholder="Buscar proveedor u orden" aria-label="Buscar proveedor u orden"
              value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>

          <div className="spy-scroll">
            <table className="spy-table" style={{ minWidth: 980 }}>
              <thead>
                <tr>
                  <th style={{ width: 44 }}><span className="sr-only">Seleccionar</span></th>
                  <th>ORDEN</th>
                  <th>PROVEEDOR</th>
                  <th>RECIBIDA</th>
                  <th>VENCE</th>
                  <th className="spy-num">TOTAL</th>
                  <th className="spy-num">PAGADO</th>
                  <th className="spy-num">SALDO</th>
                  <th style={{ textAlign: "left" }}>ESTADO</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.orderId} className={selected.includes(r.orderId) ? "spy-row-on" : ""}>
                    <td>
                      {data.canPay && (
                        <input type="checkbox" className="spy-check" aria-label={`Seleccionar ${r.code}`}
                          checked={selected.includes(r.orderId)} onChange={() => toggle(r)} />
                      )}
                    </td>
                    <td className="spy-name">{r.code}</td>
                    <td>{r.supplierName}</td>
                    <td className="spy-sub" style={{ fontSize: "0.88rem" }}>{fmtDate(r.receivedDate)}</td>
                    <td>{fmtDate(r.dueDate)}<div className="spy-sub">{dueText(r.daysToDue)}</div></td>
                    <td className="spy-num" style={{ fontWeight: 400 }}>{fmtMoney(r.total)}</td>
                    <td className="spy-num" style={{ fontWeight: 400 }}>{fmtMoney(r.paid)}</td>
                    <td className="spy-num" style={{ fontWeight: 700 }}>{fmtMoney(r.balance)}</td>
                    <td style={{ textAlign: "left" }}><span className={`spy-badge spy-s-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                  </tr>
                ))}
                {rows.length === 0 && <tr><td colSpan={9} className="spy-empty">No hay órdenes por pagar con ese filtro.</td></tr>}
              </tbody>
            </table>
          </div>

          {selectedRows.length > 0 && (
            <div className="spy-paybar">
              <div>
                <div style={{ fontWeight: 700 }}>
                  {selectedRows.length} {selectedRows.length === 1 ? "orden" : "órdenes"} de {selectedSupplier.supplierName}
                </div>
                <div className="spy-sub">
                  Total a pagar si se saldan completas: <b style={{ color: "#252422" }}>{fmtMoney(selectedTotal)}</b>.
                  Solo se pueden juntar órdenes de un mismo proveedor.
                </div>
              </div>
              <button type="button" className="spy-btn primary" onClick={openPayment}>Pagar estas órdenes</button>
            </div>
          )}
        </div>
      </div>

      <Modal isOpen={!!form} toggle={() => !saving && setForm(null)} modalClassName="spy-drawer" fade={false}>
        <ModalHeader toggle={() => !saving && setForm(null)}>
          Pago a {selectedSupplier?.supplierName}
        </ModalHeader>
        <ModalBody>
          {form && (
            <div className="spy-form">
              <div>
                <div className="spy-subtitle">Qué se paga</div>
                <div className="spy-orders">
                  {paying.map(({ row }) => (
                    <div className="spy-order" key={row.orderId}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.code}</div>
                        <div className="spy-sub">Recibida el {fmtDate(row.receivedDate)}{row.paid > 0 ? ` · ya se pagaron ${fmtMoney(row.paid)}` : ""}</div>
                      </div>
                      <div className="spy-sub" style={{ textAlign: "right" }}>Saldo<br /><b style={{ color: "#252422" }}>{fmtMoney(row.balance)}</b></div>
                      <Input type="text" inputMode="decimal" aria-label={`Monto a pagar de ${row.code}`} style={{ textAlign: "right" }}
                        value={form.amounts[row.orderId]}
                        onChange={(e) => setForm((f) => ({ ...f, amounts: { ...f.amounts, [row.orderId]: e.target.value } }))} />
                    </div>
                  ))}
                </div>
                <small className="spy-sub">Se puede pagar menos que el saldo: la orden queda con pago parcial.</small>
              </div>

              <div>
                <div className="spy-subtitle">Forma de pago</div>
                <div className="spy-methods" role="group" aria-label="Forma de pago">
                  {activeMethods.map((m) => (
                    <button type="button" key={m.id} className={`spy-chip ${Number(form.methodId) === m.id ? "on" : ""}`}
                      onClick={() => changeMethod(String(m.id))}>{m.name}</button>
                  ))}
                </div>
              </div>

              <div className="spy-grid2">
                {method?.requiresBank && (
                  <div className="spy-field">
                    <label htmlFor="spy-account">Cuenta bancaria</label>
                    <Input id="spy-account" type="select" value={form.accountId} onChange={(e) => changeAccount(e.target.value)}>
                      <option value="">Elija una cuenta</option>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}{a.accountNumber ? ` · ${a.accountNumber}` : ""}</option>
                      ))}
                    </Input>
                  </div>
                )}
                <div className="spy-field">
                  <label htmlFor="spy-date">Fecha del pago</label>
                  <Input id="spy-date" type="date" value={form.payDate} onChange={(e) => setField("payDate", e.target.value)} />
                </div>
                {method?.printsCheque && (
                  <div className="spy-field full">
                    <label htmlFor="spy-payee">Pagar a nombre de <span className="spy-sub">(sale en el cheque)</span></label>
                    <Input id="spy-payee" type="text" maxLength={200} value={form.payee} onChange={(e) => setField("payee", e.target.value)} />
                  </div>
                )}
                {method?.requiresReference && (
                  <div className="spy-field">
                    <label htmlFor="spy-ref">{method.printsCheque ? "Número de cheque" : "Número de boleta o referencia"}</label>
                    <Input id="spy-ref" type="text" maxLength={60} value={form.reference} onChange={(e) => setField("reference", e.target.value)} />
                    {method.printsCheque && <small>Sugerido: sigue el último cheque usado de esa cuenta.</small>}
                  </div>
                )}
                <div className="spy-field">
                  <label htmlFor="spy-concept">Concepto <span className="spy-sub">(opcional)</span></label>
                  <Input id="spy-concept" type="text" maxLength={300} value={form.concept} onChange={(e) => setField("concept", e.target.value)} />
                </div>
              </div>

              <div className="spy-preview">
                <div className="spy-preview-title">ASÍ SALE</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700 }}>{fmtMoney(payTotal)}</div>
                {payTotal > 0 && <div style={{ fontSize: "0.84rem" }}>{amountInWordsQ(payTotal)}</div>}
                <div className="spy-sub">Asiento contable: Debe cuentas por pagar · Haber la cuenta elegida.</div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="spy-foot" style={{ justifyContent: "flex-end" }}>
            <button type="button" className="spy-btn plain" disabled={saving} onClick={() => setForm(null)}>Cancelar</button>
            <button type="button" className="spy-btn" disabled={saving} onClick={() => submit(false)}>Guardar pago</button>
            {method?.printsCheque && (
              <button type="button" className="spy-btn primary" disabled={saving} onClick={() => submit(true)}>
                {saving ? "Guardando…" : "Guardar e imprimir cheque"}
              </button>
            )}
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
