import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { Link } from "react-router-dom";
import {
  createPayableDocument,
  createSupplierPayment,
  downloadPayablesTemplate,
  generateRentPayables,
  getPayables,
  getPaymentConfig,
  importPayablesTemplate,
  voidPayableDocument,
} from "services/supplierPaymentService";
import { getSuppliers } from "services/supplierService";
import { amountInWordsQ } from "utils/amountInWords";
import { printSupplierCheques } from "utils/supplierChequePrintFlow";
import { showError, showSuccess } from "utils/notificationHelper";
import "./SupplierPayments.css";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const KIND_LABEL = { ORDEN: "Orden de compra", DOCUMENTO: "Documento", SALDO_INICIAL: "Saldo inicial", RENTA: "Renta" };
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
  const [suppliers, setSuppliers] = useState([]);
  const [docForm, setDocForm] = useState(null);
  const [rentForm, setRentForm] = useState(null);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [payables, cfg] = await Promise.all([getPayables(), getPaymentConfig()]);
      setData(payables);
      setConfig(cfg);
      getSuppliers().then((list) => setSuppliers(Array.isArray(list) ? list : [])).catch(() => setSuppliers([]));
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

  const selectedRows = useMemo(() => (data?.rows || []).filter((r) => selected.includes(r.rowKey)), [data, selected]);
  const selectedSupplier = selectedRows[0];
  const selectedTotal = selectedRows.reduce((sum, r) => sum + Number(r.balance), 0);

  const toggle = (row) => {
    if (selected.includes(row.rowKey)) {
      setSelected(selected.filter((id) => id !== row.rowKey));
    } else if (selectedSupplier && selectedSupplier.payeeKey !== row.payeeKey) {
      showError("Solo se pueden juntar órdenes de un mismo proveedor en un pago.");
    } else {
      setSelected([...selected, row.rowKey]);
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
      amounts: Object.fromEntries(selectedRows.map((r) => [r.rowKey, Number(r.balance).toFixed(2)])),
    });
  };

  const setField = (name, value) => setForm((f) => ({ ...f, [name]: value }));
  const changeMethod = (methodId) =>
    setForm((f) => ({ ...f, methodId, reference: suggestedReference(methodId, f.accountId) }));
  const changeAccount = (accountId) =>
    setForm((f) => ({ ...f, accountId, reference: suggestedReference(f.methodId, accountId) }));

  const method = form ? activeMethods.find((m) => m.id === Number(form.methodId)) : null;
  const paying = form ? selectedRows.map((r) => ({ row: r, amount: toNumber(form.amounts[r.rowKey]) })) : [];
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
        paymentMethodId: Number(form.methodId),
        bankAccountId: form.accountId ? Number(form.accountId) : null,
        payDate: form.payDate,
        payeeName: form.payee.trim() || null,
        reference: form.reference.trim() || null,
        concept: form.concept.trim() || null,
        allocations: paying.map((p) => ({
          purchaseOrderId: p.row.orderId,
          payableDocumentId: p.row.documentId,
          amount: Number(p.amount.toFixed(2)),
        })),
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

  const openDocument = () => setDocForm({ payee: "", concept: "", number: "", issueDate: data.today, dueDate: data.today, amount: "" });
  const setDoc = (name, value) => setDocForm((f) => ({ ...f, [name]: value }));

  const submitDocument = async () => {
    const amount = toNumber(docForm.amount);
    if (!docForm.payee.trim()) return showError("Indique a quién se le debe.");
    if (!docForm.concept.trim()) return showError("Indique el concepto.");
    if (!Number.isFinite(amount) || amount <= 0) return showError("Indique el monto.");
    if (!docForm.issueDate || !docForm.dueDate) return showError("Indique la fecha y cuándo vence.");
    if (docForm.dueDate < docForm.issueDate) return showError("«Vence» no puede ser anterior a la fecha.");
    const supplier = suppliers.find((x) => String(x.name || "").trim().toLowerCase() === docForm.payee.trim().toLowerCase());
    setBusy(true);
    try {
      setData(await createPayableDocument({
        supplierId: supplier ? supplier.id : null,
        payeeName: docForm.payee.trim(),
        concept: docForm.concept.trim(),
        documentNumber: docForm.number.trim() || null,
        issueDate: docForm.issueDate,
        dueDate: docForm.dueDate,
        amount: Number(amount.toFixed(2)),
      }));
      showSuccess("Documento por pagar guardado.");
      setDocForm(null);
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const voidDocument = async (row) => {
    const reason = window.prompt(`Anular «${row.concept || row.code}» por ${fmtMoney(row.total)}.\n\nMotivo de la anulación:`);
    if (reason === null) return;
    if (!reason.trim()) return showError("Indique el motivo de la anulación.");
    setBusy(true);
    try {
      setData(await voidPayableDocument(row.documentId, reason.trim()));
      setSelected((cur) => cur.filter((key) => key !== row.rowKey));
      showSuccess("Documento anulado.");
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const submitRents = async () => {
    if (!/^\d{4}-\d{2}$/.test(rentForm.month)) return showError("Elija el mes.");
    setBusy(true);
    try {
      const result = await generateRentPayables(rentForm.month);
      setRentForm({ ...rentForm, result });
      setData(await getPayables());
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setReview({ file, result: await importPayablesTemplate(file) });
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const applyImport = async () => {
    setBusy(true);
    try {
      const result = await importPayablesTemplate(review.file, { apply: true });
      if (!result.applied) {
        setReview({ file: review.file, result });
        return;
      }
      showSuccess(`Se cargaron ${result.changes.length} saldos por ${fmtMoney(result.total)}.`);
      setReview(null);
      setData(await getPayables());
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
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
            {data.canPay && (
              <>
                <button type="button" className="spy-btn" disabled={busy} onClick={() => setRentForm({ month: data.today.slice(0, 7), result: null })}>
                  Generar rentas del mes
                </button>
                <button type="button" className="spy-btn" disabled={busy} onClick={() => downloadPayablesTemplate().catch((e) => showError(e.message))}>
                  Plantilla de saldos
                </button>
                <button type="button" className="spy-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Subir saldos</button>
                <button type="button" className="spy-btn primary" disabled={busy} onClick={openDocument}>Nuevo documento por pagar</button>
                <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFile} />
              </>
            )}
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
                  <tr key={r.rowKey} className={selected.includes(r.rowKey) ? "spy-row-on" : ""}>
                    <td>
                      {data.canPay && (
                        <input type="checkbox" className="spy-check" aria-label={`Seleccionar ${r.code}`}
                          checked={selected.includes(r.rowKey)} onChange={() => toggle(r)} />
                      )}
                    </td>
                    <td>
                      <div className="spy-name">{r.code}</div>
                      <div className="spy-sub">{KIND_LABEL[r.kind]}{r.concept ? ` · ${r.concept}` : ""}</div>
                    </td>
                    <td>{r.supplierName}</td>
                    <td className="spy-sub" style={{ fontSize: "0.88rem" }}>{fmtDate(r.receivedDate)}</td>
                    <td>{fmtDate(r.dueDate)}<div className="spy-sub">{dueText(r.daysToDue)}</div></td>
                    <td className="spy-num" style={{ fontWeight: 400 }}>{fmtMoney(r.total)}</td>
                    <td className="spy-num" style={{ fontWeight: 400 }}>{fmtMoney(r.paid)}</td>
                    <td className="spy-num" style={{ fontWeight: 700 }}>{fmtMoney(r.balance)}</td>
                    <td style={{ textAlign: "left", whiteSpace: "nowrap" }}>
                      <span className={`spy-badge spy-s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
                      {data.canPay && r.documentId && (
                        <button type="button" className="spy-linkbtn" style={{ marginLeft: 6 }} onClick={() => voidDocument(r)}>Anular</button>
                      )}
                    </td>
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
                    <div className="spy-order" key={row.rowKey}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{row.code}</div>
                        <div className="spy-sub">Recibida el {fmtDate(row.receivedDate)}{row.paid > 0 ? ` · ya se pagaron ${fmtMoney(row.paid)}` : ""}</div>
                      </div>
                      <div className="spy-sub" style={{ textAlign: "right" }}>Saldo<br /><b style={{ color: "#252422" }}>{fmtMoney(row.balance)}</b></div>
                      <Input type="text" inputMode="decimal" aria-label={`Monto a pagar de ${row.code}`} style={{ textAlign: "right" }}
                        value={form.amounts[row.rowKey]}
                        onChange={(e) => setForm((f) => ({ ...f, amounts: { ...f.amounts, [row.rowKey]: e.target.value } }))} />
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

      {/* Documento por pagar a mano */}
      <Modal isOpen={!!docForm} toggle={() => !busy && setDocForm(null)} modalClassName="spy-modal">
        <ModalHeader toggle={() => !busy && setDocForm(null)}>Nuevo documento por pagar</ModalHeader>
        <ModalBody>
          {docForm && (
            <div className="spy-form">
              <div className="spy-sub">Para lo que se debe y no viene de una orden de compra: servicios, fletes, facturas anteriores.</div>
              <div className="spy-field">
                <label htmlFor="doc-payee">A quién se le debe</label>
                <Input id="doc-payee" list="doc-suppliers" value={docForm.payee} maxLength={200} onChange={(e) => setDoc("payee", e.target.value)} />
                <datalist id="doc-suppliers">{suppliers.map((x) => <option key={x.id} value={x.name} />)}</datalist>
                <small>Si coincide con un proveedor del sistema, queda ligado a él.</small>
              </div>
              <div className="spy-field">
                <label htmlFor="doc-concept">Concepto</label>
                <Input id="doc-concept" value={docForm.concept} maxLength={300} onChange={(e) => setDoc("concept", e.target.value)} />
              </div>
              <div className="spy-grid2">
                <div className="spy-field">
                  <label htmlFor="doc-number">No. de factura o documento <span className="spy-sub">(opcional)</span></label>
                  <Input id="doc-number" value={docForm.number} maxLength={60} onChange={(e) => setDoc("number", e.target.value)} />
                </div>
                <div className="spy-field">
                  <label htmlFor="doc-amount">Monto</label>
                  <Input id="doc-amount" inputMode="decimal" style={{ textAlign: "right" }} value={docForm.amount} onChange={(e) => setDoc("amount", e.target.value)} />
                </div>
                <div className="spy-field">
                  <label htmlFor="doc-date">Fecha del documento</label>
                  <Input id="doc-date" type="date" value={docForm.issueDate} onChange={(e) => setDoc("issueDate", e.target.value)} />
                </div>
                <div className="spy-field">
                  <label htmlFor="doc-due">Vence</label>
                  <Input id="doc-due" type="date" value={docForm.dueDate} onChange={(e) => setDoc("dueDate", e.target.value)} />
                </div>
              </div>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setDocForm(null)}>Cancelar</button>
          <button type="button" className="spy-btn primary" disabled={busy} onClick={submitDocument}>Guardar</button>
        </ModalFooter>
      </Modal>

      {/* Rentas del mes */}
      <Modal isOpen={!!rentForm} toggle={() => !busy && setRentForm(null)} modalClassName="spy-modal">
        <ModalHeader toggle={() => !busy && setRentForm(null)}>Generar rentas del mes</ModalHeader>
        <ModalBody>
          {rentForm && (
            <div className="spy-form">
              <div className="spy-sub">
                Crea una cuenta por pagar por cada kiosco con contrato: el arrendador es el beneficiario, el monto sale de
                Finanzas y vence el día de pago de Rentas. Se puede repetir sin duplicar.
              </div>
              <div className="spy-field">
                <label htmlFor="rent-month">Mes</label>
                <Input id="rent-month" type="month" value={rentForm.month} style={{ maxWidth: 200 }}
                  onChange={(e) => setRentForm({ month: e.target.value, result: null })} />
              </div>
              {rentForm.result && (
                <div className="spy-preview">
                  <div className="spy-preview-title">RESULTADO</div>
                  <div>
                    <b>{rentForm.result.created}</b> {rentForm.result.created === 1 ? "renta creada" : "rentas creadas"} por{" "}
                    <b>{fmtMoney(rentForm.result.createdTotal)}</b>
                    {rentForm.result.alreadyExisting > 0 ? ` · ${rentForm.result.alreadyExisting} ya estaban generadas` : ""}.
                  </div>
                  {rentForm.result.skipped.length > 0 && (
                    <div style={{ fontSize: "0.84rem" }}>
                      <b>No se generaron:</b>
                      <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                        {rentForm.result.skipped.map((line) => <li key={line}>{line}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setRentForm(null)}>Cerrar</button>
          <button type="button" className="spy-btn primary" disabled={busy} onClick={submitRents}>{busy ? "Generando…" : "Generar"}</button>
        </ModalFooter>
      </Modal>

      {/* Revisión de la plantilla de saldos */}
      <Modal isOpen={!!review} toggle={() => !busy && setReview(null)} size="lg" modalClassName="spy-review">
        <ModalHeader toggle={() => !busy && setReview(null)}>Revisar saldos por pagar</ModalHeader>
        <ModalBody>
          {review && (
            <>
              <div className="spy-sub" style={{ marginBottom: 12 }}>Archivo: <b>{review.file.name}</b> · aún no se guardó nada</div>
              <div className="spy-stats">
                <div className="spy-stat"><strong>{review.result.readRows}</strong><span>Renglones leídos</span></div>
                <div className="spy-stat ok"><strong>{review.result.changes.length}</strong><span>Se cargarían</span></div>
                <div className="spy-stat ok"><strong>{fmtMoney(review.result.total)}</strong><span>Total</span></div>
                <div className={`spy-stat ${review.result.errors.length ? "bad" : ""}`}><strong>{review.result.errors.length}</strong><span>Con error</span></div>
              </div>
              {review.result.errors.length > 0 && (
                <div className="spy-errors">
                  <b style={{ color: "#9a3414" }}>
                    No se guarda nada hasta corregir {review.result.errors.length === 1 ? "este renglón" : "estos renglones"}
                  </b>
                  <ul>
                    {review.result.errors.map((er) => (
                      <li key={`${er.row}-${er.message}`}><b>Renglón {er.row}{er.payeeName ? ` · ${er.payeeName}` : ""}:</b> {er.message}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.result.changes.length > 0 && (
                <div className="spy-scroll" style={{ border: "1px solid #e3e3e3", borderRadius: 10 }}>
                  <table className="spy-mini">
                    <thead>
                      <tr><th>A QUIÉN</th><th>CONCEPTO</th><th>DOCUMENTO</th><th>FECHA</th><th>VENCE</th><th style={{ textAlign: "right" }}>MONTO</th></tr>
                    </thead>
                    <tbody>
                      {review.result.changes.map((c, i) => (
                        <tr key={`${c.payeeName}-${c.documentNumber}-${i}`}>
                          <td><b>{c.payeeName}</b>{!c.matchedSupplier && <div className="spy-sub">No es un proveedor del sistema</div>}</td>
                          <td>{c.concept}</td>
                          <td>{c.documentNumber || "—"}</td>
                          <td>{fmtDate(c.issueDate)}</td>
                          <td>{fmtDate(c.dueDate)}</td>
                          <td style={{ textAlign: "right" }}>{fmtMoney(c.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="spy-foot">
            <button type="button" className="spy-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Elegir otro archivo</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setReview(null)}>Cancelar</button>
              <button type="button" className="spy-btn primary"
                disabled={busy || !review || review.result.errors.length > 0 || review.result.changes.length === 0} onClick={applyImport}>
                {busy ? "Cargando…" : `Cargar ${review ? review.result.changes.length : 0} saldos`}
              </button>
            </div>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
