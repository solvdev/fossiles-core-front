import React, { useCallback, useEffect, useState } from "react";
import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import { Link } from "react-router-dom";
import {
  getPaymentConfig,
  saveBankAccount,
  saveChequeLayout,
  savePayablesStart,
  savePaymentMethod,
} from "services/supplierPaymentService";
import { openPayrollPrintWindow } from "utils/payrollPrintHtml";
import {
  buildChequeTestHtml,
  chequeFieldBox,
  chequeFieldText,
  FIELD_LABELS,
  FIELD_ORDER,
  FONT_FAMILIES,
  FONT_LABELS,
  SAMPLE_CHEQUE,
} from "utils/supplierChequePrintHtml";
import { showError, showSuccess } from "utils/notificationHelper";
import "./SupplierPayments.css";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const num = (value) => {
  const n = Number(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : NaN;
};

/** El mismo formato de los cheques de Planilla (165 × 70 mm, Times New Roman). */
const PAYROLL_PRESET = {
  widthMm: "165",
  heightMm: "70",
  fontFamily: "TIMES",
  fields: {
    DATE: { on: true, top: "17", side: "LEFT", edge: "20", size: "10" },
    AMOUNT: { on: true, top: "25.7", side: "RIGHT", edge: "10", size: "10" },
    PAYEE: { on: true, top: "26.4", side: "LEFT", edge: "19.4", size: "11" },
    WORDS: { on: true, top: "30.5", side: "LEFT", edge: "18.3", size: "9" },
    CONCEPT: { on: false, top: "48", side: "LEFT", edge: "19", size: "9" },
    NUMBER: { on: false, top: "8", side: "RIGHT", edge: "12", size: "9" },
    LEGEND: { on: false, top: "40", side: "LEFT", edge: "19", size: "9" },
  },
};

const layoutToForm = (layout) => ({
  id: layout.id,
  name: layout.name,
  widthMm: String(layout.widthMm),
  heightMm: String(layout.heightMm),
  fontFamily: layout.fontFamily,
  active: layout.active,
  fields: Object.fromEntries(FIELD_ORDER.map((key) => {
    const f = layout.fields.find((x) => x.key === key) || { on: false, ...PAYROLL_PRESET.fields[key] };
    return [key, { on: f.on, top: String(f.top), side: f.side, edge: String(f.edge), size: String(f.size) }];
  })),
});

const formToLayout = (form) => ({
  id: form.id,
  name: form.name,
  widthMm: num(form.widthMm),
  heightMm: num(form.heightMm),
  fontFamily: form.fontFamily,
  active: form.active,
  fields: FIELD_ORDER.map((key) => {
    const f = form.fields[key];
    return { key, on: f.on, top: num(f.top), side: f.side, edge: num(f.edge), size: num(f.size) };
  }),
});

/** Cheque de ejemplo con las medidas reales, para comparar con la chequera. */
function ChequePreview({ form }) {
  const layout = formToLayout(form);
  if ([layout.widthMm, layout.heightMm].some((n) => !Number.isFinite(n) || n <= 0)) return null;
  return (
    <div className="spy-cheque" style={{ width: `${layout.widthMm}mm`, height: `${layout.heightMm}mm`, fontFamily: FONT_FAMILIES[layout.fontFamily] }}>
      {layout.fields.filter((f) => f.on && [f.top, f.edge, f.size].every(Number.isFinite)).map((f) => {
        const box = chequeFieldBox(f, layout, SAMPLE_CHEQUE);
        return (
          <div key={f.key} style={{
            top: `${box.top}mm`,
            [box.fromRight ? "right" : "left"]: `${box.edge}mm`,
            textAlign: box.fromRight ? "right" : "left",
            width: box.width ? `${box.width}mm` : undefined,
            fontSize: `${box.size}pt`,
            whiteSpace: box.wrap ? "normal" : "nowrap",
            overflow: box.width && !box.wrap ? "hidden" : undefined,
          }}>
            {chequeFieldText(f.key, SAMPLE_CHEQUE)}
          </div>
        );
      })}
    </div>
  );
}

export default function PaymentSettings() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState(null);
  const [method, setMethod] = useState(null);
  const [layout, setLayout] = useState(null);
  const [start, setStart] = useState("");

  const load = useCallback(async () => {
    try {
      const cfg = await getPaymentConfig();
      setConfig(cfg);
      setStart(cfg.payablesStartDate);
    } catch (e) {
      showError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (action, okMessage, close) => {
    setBusy(true);
    try {
      const cfg = await action();
      setConfig(cfg);
      setStart(cfg.payablesStartDate);
      showSuccess(okMessage);
      close?.();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="content"><div className="spy-empty"><Spinner size="sm" /> Cargando…</div></div>;
  }
  if (!config) {
    return <div className="content"><div className="spy-empty">No se pudo cargar la configuración.</div></div>;
  }
  const canConfigure = config.canConfigure;

  const newAccount = () => setAccount({
    id: null, name: "", accountNumber: "", ledgerCode: "", ledgerName: "", firstChequeNumber: "",
    sharesPayrollChecks: false, chequeLayoutId: config.layouts[0]?.id ? String(config.layouts[0].id) : "", active: true,
  });
  const editAccount = (a) => setAccount({
    ...a, accountNumber: a.accountNumber || "", ledgerName: a.ledgerName || "", firstChequeNumber: a.firstChequeNumber || "",
    chequeLayoutId: a.chequeLayoutId ? String(a.chequeLayoutId) : "",
  });
  const submitAccount = () => {
    if (!account.name.trim()) return showError("Indique el nombre de la cuenta.");
    if (!account.ledgerCode.trim()) return showError("Indique la cuenta contable (por ejemplo 1.1.1.02).");
    return run(() => saveBankAccount(account.id, {
      ...account, chequeLayoutId: account.chequeLayoutId ? Number(account.chequeLayoutId) : null,
    }), "Cuenta guardada.", () => setAccount(null));
  };

  const newMethod = () => setMethod({ id: null, name: "", requiresBank: true, requiresReference: false, printsCheque: false, sortOrder: config.methods.length + 1, active: true });
  const submitMethod = () => {
    if (!method.name.trim()) return showError("Indique el nombre de la forma de pago.");
    return run(() => savePaymentMethod(method.id, { ...method, sortOrder: Number(method.sortOrder) || 0 }),
      "Forma de pago guardada.", () => setMethod(null));
  };

  const newLayout = () => setLayout({ id: null, name: "Formato nuevo", active: true, ...PAYROLL_PRESET });
  const submitLayout = () => {
    const body = formToLayout(layout);
    if (!layout.name.trim()) return showError("Indique el nombre del formato.");
    if ([body.widthMm, body.heightMm].some((n) => !Number.isFinite(n))
      || body.fields.some((f) => ![f.top, f.edge, f.size].every(Number.isFinite))) {
      return showError("Revise las medidas: todas deben ser números.");
    }
    return run(() => saveChequeLayout(layout.id, body), "Formato guardado.", () => setLayout(null));
  };

  const setLayoutField = (key, name, value) =>
    setLayout((l) => ({ ...l, fields: { ...l.fields, [key]: { ...l.fields[key], [name]: value } } }));
  const nudge = (dx, dy) => setLayout((l) => ({
    ...l,
    fields: Object.fromEntries(Object.entries(l.fields).map(([key, f]) => {
      const top = Math.max(0, num(f.top) + dy);
      const move = f.side === "RIGHT" ? -dx : dx;
      const edge = Math.max(0, num(f.edge) + move);
      return [key, { ...f, top: String(Number(top.toFixed(1))), edge: String(Number(edge.toFixed(1))) }];
    })),
  }));
  const testPage = () => {
    const body = formToLayout(layout);
    if (!openPayrollPrintWindow(buildChequeTestHtml(body))) showError("El navegador bloqueó la ventana de impresión.");
  };

  return (
    <div className="content">
      <div className="spy">
        <div className="spy-head">
          <div>
            <h4>Bancos y formas de pago</h4>
            <p>Con qué cuentas se paga y de qué maneras. Cada cuenta lleva su chequera y su formato de cheque; cada forma de pago decide qué datos pide y si imprime cheque.</p>
          </div>
          <div className="spy-head-actions">
            <Link to="/admin/accounting/payables" className="spy-btn" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
              Cuentas por pagar
            </Link>
          </div>
        </div>

        {/* Cuentas por pagar desde */}
        <div className="spy-panel" style={{ padding: "16px 20px", marginBottom: 18, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ maxWidth: 560 }}>
            <b>Cuentas por pagar desde</b>
            <div className="spy-sub">Solo se muestran las órdenes recibidas desde esta fecha; las anteriores se dan por pagadas fuera del sistema. Hoy: {fmtDate(config.payablesStartDate)}.</div>
          </div>
          {canConfigure && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Input type="date" aria-label="Cuentas por pagar desde" value={start} onChange={(e) => setStart(e.target.value)} style={{ minHeight: 44 }} />
              <button type="button" className="spy-btn" disabled={busy || !start || start === config.payablesStartDate}
                onClick={() => run(() => savePayablesStart(start), "Fecha guardada.")}>Guardar fecha</button>
            </div>
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
          <section style={{ flex: "1 1 560px", minWidth: 0 }} className="spy-cards2">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h5 style={{ margin: 0, fontWeight: 700 }}>Cuentas bancarias</h5>
              {canConfigure && <button type="button" className="spy-btn primary" onClick={newAccount}>Agregar cuenta</button>}
            </div>
            {config.accounts.map((a) => (
              <div className="spy-acc" key={a.id}>
                <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "1.05rem" }}>{a.name}</div>
                    <div className="spy-sub">{a.accountNumber || "Sin número de cuenta"}</div>
                  </div>
                  <span className={`spy-badge ${a.active ? "spy-s-PAGADO" : "spy-s-ANULADO"}`}>{a.active ? "Activa" : "Inactiva"}</span>
                </div>
                <div className="spy-acc-grid">
                  <div><b>Cuenta contable</b>{a.ledgerCode}{a.ledgerName ? ` · ${a.ledgerName}` : ""}</div>
                  <div><b>Próximo cheque</b>{a.nextChequeNumber || "Sin definir"}</div>
                  <div><b>Formato de cheque</b>{a.chequeLayoutName || "Sin formato"}</div>
                </div>
                {a.sharesPayrollChecks && <div className="spy-sub">Comparte la chequera con Planilla: los cheques de ambos siguen la misma numeración.</div>}
                {canConfigure && <div><button type="button" className="spy-btn plain" onClick={() => editAccount(a)}>Editar cuenta</button></div>}
              </div>
            ))}
            {config.accounts.length === 0 && <div className="spy-empty">Aún no hay cuentas. Agregue la primera.</div>}
          </section>

          <section style={{ flex: "1 1 420px", minWidth: 0 }}>
            <div className="spy-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #e3e3e3" }}>
                <h5 style={{ margin: 0, fontWeight: 700 }}>Formas de pago</h5>
                {canConfigure && <button type="button" className="spy-btn" onClick={newMethod}>Agregar forma</button>}
              </div>
              <div className="spy-scroll">
                <table className="spy-table" style={{ minWidth: 460 }}>
                  <thead>
                    <tr><th>NOMBRE</th><th>PIDE CUENTA</th><th>PIDE No. / REF.</th><th>IMPRIME CHEQUE</th><th style={{ textAlign: "left" }}>ESTADO</th><th /></tr>
                  </thead>
                  <tbody>
                    {config.methods.map((m) => (
                      <tr key={m.id}>
                        <td className="spy-name">{m.name}</td>
                        <td>{m.requiresBank ? "Sí" : "No"}</td>
                        <td>{m.requiresReference ? "Sí" : "No"}</td>
                        <td>{m.printsCheque ? "Sí" : "No"}</td>
                        <td style={{ textAlign: "left" }}><span className={`spy-badge ${m.active ? "spy-s-PAGADO" : "spy-s-ANULADO"}`}>{m.active ? "Activa" : "Inactiva"}</span></td>
                        <td>{canConfigure && <button type="button" className="spy-btn plain" onClick={() => setMethod({ ...m })}>Editar</button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="spy-sub" style={{ padding: "12px 20px", borderTop: "1px solid #e3e3e3" }}>
                Una forma nueva (por ejemplo «Giro» o «Cheque certificado») se crea aquí sin tocar el sistema. Las que ya se usaron no se borran: se desactivan.
              </div>
            </div>
          </section>
        </div>

        {/* Formatos de cheque */}
        <div className="spy-panel" style={{ marginTop: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid #e3e3e3" }}>
            <h5 style={{ margin: 0, fontWeight: 700 }}>Formatos de cheque</h5>
            {canConfigure && <button type="button" className="spy-btn" onClick={newLayout}>Nuevo formato</button>}
          </div>
          <div className="spy-scroll">
            <table className="spy-table" style={{ minWidth: 560 }}>
              <thead><tr><th>NOMBRE</th><th>PAPEL</th><th>LETRA</th><th>DATOS</th><th style={{ textAlign: "left" }}>ESTADO</th><th /></tr></thead>
              <tbody>
                {config.layouts.map((l) => (
                  <tr key={l.id}>
                    <td className="spy-name">{l.name}</td>
                    <td>{l.widthMm} × {l.heightMm} mm</td>
                    <td>{FONT_LABELS[l.fontFamily] || l.fontFamily}</td>
                    <td className="spy-sub">{l.fields.filter((f) => f.on).map((f) => FIELD_LABELS[f.key]).join(", ")}</td>
                    <td style={{ textAlign: "left" }}><span className={`spy-badge ${l.active ? "spy-s-PAGADO" : "spy-s-ANULADO"}`}>{l.active ? "Activo" : "Inactivo"}</span></td>
                    <td>{canConfigure && <button type="button" className="spy-btn plain" onClick={() => setLayout(layoutToForm(l))}>Editar formato</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Cuenta */}
      <Modal isOpen={!!account} toggle={() => !busy && setAccount(null)} modalClassName="spy-modal">
        <ModalHeader toggle={() => !busy && setAccount(null)}>{account?.id ? "Editar cuenta" : "Nueva cuenta"}</ModalHeader>
        <ModalBody>
          {account && (
            <div className="spy-form">
              <div className="spy-field"><label htmlFor="ba-name">Nombre</label>
                <Input id="ba-name" value={account.name} maxLength={120} onChange={(e) => setAccount({ ...account, name: e.target.value })} /></div>
              <div className="spy-field"><label htmlFor="ba-num">Número de cuenta <span className="spy-sub">(opcional)</span></label>
                <Input id="ba-num" value={account.accountNumber} maxLength={60} onChange={(e) => setAccount({ ...account, accountNumber: e.target.value })} /></div>
              <div className="spy-grid2">
                <div className="spy-field"><label htmlFor="ba-led">Cuenta contable</label>
                  <Input id="ba-led" value={account.ledgerCode} maxLength={30} placeholder="1.1.1.02" onChange={(e) => setAccount({ ...account, ledgerCode: e.target.value })} /></div>
                <div className="spy-field"><label htmlFor="ba-ledn">Nombre de la cuenta contable</label>
                  <Input id="ba-ledn" value={account.ledgerName} maxLength={120} placeholder="Bancos" onChange={(e) => setAccount({ ...account, ledgerName: e.target.value })} /></div>
              </div>
              <div className="spy-grid2">
                <div className="spy-field"><label htmlFor="ba-lay">Formato de cheque</label>
                  <Input id="ba-lay" type="select" value={account.chequeLayoutId} onChange={(e) => setAccount({ ...account, chequeLayoutId: e.target.value })}>
                    <option value="">Sin formato (no imprime cheques)</option>
                    {config.layouts.filter((l) => l.active || String(l.id) === String(account.chequeLayoutId)).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </Input></div>
                <div className="spy-field"><label htmlFor="ba-first">Primer cheque de la chequera</label>
                  <Input id="ba-first" value={account.firstChequeNumber} maxLength={30} placeholder="99645603/GCF" onChange={(e) => setAccount({ ...account, firstChequeNumber: e.target.value })} />
                  <small>Solo se usa mientras la cuenta no tenga cheques; luego sigue el último usado.</small></div>
              </div>
              <label><input type="checkbox" className="spy-check" checked={account.sharesPayrollChecks} onChange={(e) => setAccount({ ...account, sharesPayrollChecks: e.target.checked })} /> Esta chequera también la usa Planilla</label>
              <label><input type="checkbox" className="spy-check" checked={account.active} onChange={(e) => setAccount({ ...account, active: e.target.checked })} /> Cuenta activa</label>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setAccount(null)}>Cancelar</button>
          <button type="button" className="spy-btn primary" disabled={busy} onClick={submitAccount}>Guardar</button>
        </ModalFooter>
      </Modal>

      {/* Forma de pago */}
      <Modal isOpen={!!method} toggle={() => !busy && setMethod(null)} modalClassName="spy-modal">
        <ModalHeader toggle={() => !busy && setMethod(null)}>{method?.id ? "Editar forma de pago" : "Nueva forma de pago"}</ModalHeader>
        <ModalBody>
          {method && (
            <div className="spy-form">
              <div className="spy-field"><label htmlFor="pm-name">Nombre</label>
                <Input id="pm-name" value={method.name} maxLength={80} onChange={(e) => setMethod({ ...method, name: e.target.value })} /></div>
              <label><input type="checkbox" className="spy-check" checked={method.printsCheque} onChange={(e) => setMethod({ ...method, printsCheque: e.target.checked })} /> Imprime cheque (siempre pide cuenta y número de cheque)</label>
              <label><input type="checkbox" className="spy-check" checked={method.requiresBank || method.printsCheque} disabled={method.printsCheque} onChange={(e) => setMethod({ ...method, requiresBank: e.target.checked })} /> Pide cuenta bancaria</label>
              <label><input type="checkbox" className="spy-check" checked={method.requiresReference || method.printsCheque} disabled={method.printsCheque} onChange={(e) => setMethod({ ...method, requiresReference: e.target.checked })} /> Pide número de boleta o referencia</label>
              <div className="spy-field"><label htmlFor="pm-order">Orden en la lista</label>
                <Input id="pm-order" type="number" value={method.sortOrder} onChange={(e) => setMethod({ ...method, sortOrder: e.target.value })} style={{ maxWidth: 120 }} /></div>
              <label><input type="checkbox" className="spy-check" checked={method.active} onChange={(e) => setMethod({ ...method, active: e.target.checked })} /> Forma de pago activa</label>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setMethod(null)}>Cancelar</button>
          <button type="button" className="spy-btn primary" disabled={busy} onClick={submitMethod}>Guardar</button>
        </ModalFooter>
      </Modal>

      {/* Formato del cheque */}
      <Modal isOpen={!!layout} toggle={() => !busy && setLayout(null)} size="xl" modalClassName="spy-modal">
        <ModalHeader toggle={() => !busy && setLayout(null)}>Formato del cheque</ModalHeader>
        <ModalBody>
          {layout && (
            <div className="spy-form">
              <div className="spy-sub">Se acomoda cada dato como lo pide la chequera. La vista previa se mueve al instante; para confirmar, imprima la hoja de prueba y póngala sobre un cheque en blanco.</div>
              <div className="spy-grid2" style={{ gridTemplateColumns: "2fr 1fr 1fr 1fr" }}>
                <div className="spy-field"><label htmlFor="cl-name">Nombre del formato</label>
                  <Input id="cl-name" value={layout.name} maxLength={120} onChange={(e) => setLayout({ ...layout, name: e.target.value })} /></div>
                <div className="spy-field"><label htmlFor="cl-w">Ancho (mm)</label>
                  <Input id="cl-w" value={layout.widthMm} onChange={(e) => setLayout({ ...layout, widthMm: e.target.value })} /></div>
                <div className="spy-field"><label htmlFor="cl-h">Alto (mm)</label>
                  <Input id="cl-h" value={layout.heightMm} onChange={(e) => setLayout({ ...layout, heightMm: e.target.value })} /></div>
                <div className="spy-field"><label htmlFor="cl-f">Tipo de letra</label>
                  <Input id="cl-f" type="select" value={layout.fontFamily} onChange={(e) => setLayout({ ...layout, fontFamily: e.target.value })}>
                    {Object.entries(FONT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Input></div>
              </div>

              <div style={{ overflowX: "auto" }}><ChequePreview form={layout} /></div>
              <div className="spy-sub">Cada cuadro de la regla mide 10 mm. Al imprimir no salen los cuadros.</div>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }} role="group" aria-label="Mover todo el texto">
                <span className="spy-sub">Mover todo 0.5 mm</span>
                <button type="button" className="spy-btn plain" aria-label="Subir" onClick={() => nudge(0, -0.5)}>↑</button>
                <button type="button" className="spy-btn plain" aria-label="Bajar" onClick={() => nudge(0, 0.5)}>↓</button>
                <button type="button" className="spy-btn plain" aria-label="Izquierda" onClick={() => nudge(-0.5, 0)}>←</button>
                <button type="button" className="spy-btn plain" aria-label="Derecha" onClick={() => nudge(0.5, 0)}>→</button>
                <button type="button" className="spy-btn plain" onClick={() => setLayout((l) => ({ ...l, ...PAYROLL_PRESET }))}>Copiar el formato de Planilla</button>
              </div>

              <div className="spy-scroll">
                <table className="spy-fields" style={{ minWidth: 640 }}>
                  <thead><tr><th>DATO</th><th>SALE</th><th>DESDE ARRIBA (mm)</th><th>LADO</th><th>DISTANCIA (mm)</th><th>TAMAÑO (pt)</th></tr></thead>
                  <tbody>
                    {FIELD_ORDER.map((key) => {
                      const f = layout.fields[key];
                      return (
                        <tr key={key}>
                          <td><b>{FIELD_LABELS[key]}</b></td>
                          <td><input type="checkbox" className="spy-check" aria-label={`Mostrar ${FIELD_LABELS[key]}`} checked={f.on} onChange={(e) => setLayoutField(key, "on", e.target.checked)} /></td>
                          <td><input type="text" aria-label={`Desde arriba de ${FIELD_LABELS[key]}`} value={f.top} onChange={(e) => setLayoutField(key, "top", e.target.value)} /></td>
                          <td><select aria-label={`Lado de ${FIELD_LABELS[key]}`} value={f.side} onChange={(e) => setLayoutField(key, "side", e.target.value)}>
                            <option value="LEFT">Izquierda</option><option value="RIGHT">Derecha</option></select></td>
                          <td><input type="text" aria-label={`Distancia al lado de ${FIELD_LABELS[key]}`} value={f.edge} onChange={(e) => setLayoutField(key, "edge", e.target.value)} /></td>
                          <td><input type="text" aria-label={`Tamaño de ${FIELD_LABELS[key]}`} value={f.size} onChange={(e) => setLayoutField(key, "size", e.target.value)} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <label><input type="checkbox" className="spy-check" checked={layout.active} onChange={(e) => setLayout({ ...layout, active: e.target.checked })} /> Formato activo</label>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="spy-foot">
            <button type="button" className="spy-btn" disabled={busy} onClick={testPage}>Imprimir hoja de prueba</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="spy-btn plain" disabled={busy} onClick={() => setLayout(null)}>Cancelar</button>
              <button type="button" className="spy-btn primary" disabled={busy} onClick={submitLayout}>Guardar formato</button>
            </div>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
