import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Input, Modal, ModalBody, ModalFooter, ModalHeader, Spinner } from "reactstrap";
import {
  clearKioskRent,
  downloadKioskRentTemplate,
  getKioskRents,
  importKioskRentTemplate,
  saveKioskRent,
} from "services/kioskRentService";
import { showError, showSuccess } from "utils/notificationHelper";
import "./KioskRents.css";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MONTH_LONG = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const STATUS_LABEL = {
  VIGENTE: "Vigente",
  POR_VENCER: "Por vencer",
  VENCIDO: "Vencido",
  INCOMPLETO: "Incompleto",
  SIN_CARGAR: "Sin cargar",
};
const STATUS_ACTION = { SIN_CARGAR: "Cargar", INCOMPLETO: "Completar" };
const FILTERS = [
  { key: "", label: "Todos" },
  { key: "VIGENTE", label: "Vigentes" },
  { key: "POR_VENCER", label: "Por vencer" },
  { key: "VENCIDO", label: "Vencidos" },
  { key: "INCOMPLETO", label: "Incompletos" },
  { key: "SIN_CARGAR", label: "Sin cargar" },
];

const parts = (iso) => String(iso).slice(0, 10).split("-").map(Number);
const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]} ${y}`;
};
const fmtDay = (iso) => {
  const [, m, d] = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
};
const fmtMoney = (n) =>
  n === null || n === undefined
    ? "—"
    : `Q ${Number(n).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtPeriod = (period) => {
  if (!period) return "";
  const [y, m] = period.split("-").map(Number);
  return `${MONTH_LONG[m - 1]} ${y}`;
};
const dayDiff = (fromIso, toIso) => {
  const [y1, m1, d1] = parts(fromIso);
  const [y2, m2, d2] = parts(toIso);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
};
const inDays = (n) => (n === 0 ? "hoy" : n === 1 ? "mañana" : `en ${n} días`);
const iso = (y, m, d) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Misma regla que el back: próximo pago desde hoy, último día del mes si el mes es corto, dentro del contrato. */
function nextPayment(day, start, end, today) {
  if (!day) return null;
  const from = start && start > today ? start : today;
  let [y, m] = parts(from);
  const pick = (yy, mm) => iso(yy, mm, Math.min(day, new Date(yy, mm, 0).getDate()));
  let candidate = pick(y, m);
  if (candidate < from) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    candidate = pick(y, m);
  }
  return end && candidate > end ? null : candidate;
}

function contractLeft(days) {
  if (days === null || days === undefined) return "";
  if (days < 0) return days === -1 ? "Venció hace 1 día" : `Venció hace ${-days} días`;
  if (days === 0) return "Vence hoy";
  if (days > 60) return `Faltan ${Math.round(days / 30)} meses`;
  return `Vence en ${days} días`;
}

const EMPTY_FORM = { landlordName: "", paymentDay: "", contractStart: "", contractEnd: "", note: "" };

export default function KioskRents() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [review, setReview] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await getKioskRents());
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
      if (!text) return true;
      return [r.name, r.code, r.landlordName].some((v) => String(v || "").toLowerCase().includes(text));
    });
  }, [data, filter, query]);

  const openEditor = (row) => {
    setEditing(row);
    setForm({
      landlordName: row.landlordName || "",
      paymentDay: row.paymentDay || "",
      contractStart: row.contractStart || "",
      contractEnd: row.contractEnd || "",
      note: row.note || "",
    });
  };

  const setField = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));

  const handleSave = async () => {
    const day = Number(form.paymentDay);
    if (!form.landlordName.trim()) return showError("Indique el arrendador.");
    if (!Number.isInteger(day) || day < 1 || day > 31) return showError("El día de pago debe estar entre 1 y 31.");
    if (!form.contractStart || !form.contractEnd) return showError("Indique desde cuándo y hasta cuándo dura el contrato.");
    if (form.contractEnd < form.contractStart) return showError("«Contrato hasta» no puede ser anterior a «Contrato desde».");
    setSaving(true);
    try {
      setData(
        await saveKioskRent(editing.locationId, {
          landlordName: form.landlordName.trim(),
          paymentDay: day,
          contractStart: form.contractStart,
          contractEnd: form.contractEnd,
          note: form.note.trim() || null,
        })
      );
      showSuccess(`Renta de ${editing.name} guardada.`);
      setEditing(null);
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!window.confirm(`¿Quitar los datos del contrato de ${editing.name}? La renta de Finanzas no se toca.`)) return;
    setSaving(true);
    try {
      setData(await clearKioskRent(editing.locationId));
      showSuccess(`Se quitaron los datos de ${editing.name}.`);
      setEditing(null);
    } catch (e) {
      showError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = async () => {
    try {
      await downloadKioskRentTemplate();
    } catch (e) {
      showError(e.message);
    }
  };

  const handleFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      setReview({ file, result: await importKioskRentTemplate(file) });
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleApply = async () => {
    setBusy(true);
    try {
      const result = await importKioskRentTemplate(review.file, { apply: true });
      if (!result.applied) {
        setReview({ file: review.file, result });
        return;
      }
      showSuccess(`Se actualizaron ${result.changes.length} kioscos.`);
      setReview(null);
      await load();
    } catch (e) {
      showError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="content">
        <div className="krn-empty"><Spinner size="sm" /> Cargando rentas…</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="content">
        <div className="krn-empty">No se pudieron cargar las rentas.</div>
      </div>
    );
  }

  const { summary, today, canEdit } = data;
  const counts = summary.countByStatus || {};
  const soon = data.rows.filter((r) => r.daysToNextPayment !== null && r.daysToNextPayment <= 7);
  const cards = [
    {
      label: "Renta mensual total",
      value: fmtMoney(summary.totalMonthlyRent),
      hint: `${summary.kiosksWithRent} de ${summary.kiosksTotal} kioscos con renta en Finanzas`,
    },
    {
      label: "Pagos en 7 días",
      value: `${summary.paymentsNext7Days} ${summary.paymentsNext7Days === 1 ? "kiosco" : "kioscos"}`,
      hint: soon.length ? `${soon[0].name}${soon.length > 1 ? ` y ${soon.length - 1} más` : ""} · ${fmtMoney(summary.paymentsNext7DaysAmount)}` : "Ninguno por ahora",
    },
    { label: "Contratos por vencer", value: String(counts.POR_VENCER || 0), hint: `en los próximos ${data.expiringDays} días` },
    { label: "Contratos vencidos", value: String(counts.VENCIDO || 0), hint: "Hay que renovarlos o cargar el nuevo" },
  ];

  const previewNext = nextPayment(Number(form.paymentDay) || null, form.contractStart || null, form.contractEnd || null, today);
  const previewEndDays = form.contractEnd ? dayDiff(today, form.contractEnd) : null;
  const rent = editing?.monthlyRent;

  const result = review?.result;
  const hasErrors = result && result.errors.length > 0;

  return (
    <div className="content">
      <div className="krn">
        <div className="krn-head">
          <div>
            <h4>Rentas de kioscos</h4>
            <p>
              Cuánto se paga de renta por kiosco, cuándo se paga, hasta cuándo dura el contrato y quién es el arrendador
              (a quien se le paga). El monto se toma de Finanzas &gt; Costos por kiosco; aquí se llena lo demás, a mano o con
              la plantilla de Excel.
            </p>
          </div>
          <div className="krn-head-actions">
            <button type="button" className="krn-btn" onClick={handleDownload}>Descargar plantilla</button>
            {canEdit && (
              <button type="button" className="krn-btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                {busy && !review ? "Leyendo…" : "Subir plantilla"}
              </button>
            )}
            <input ref={fileRef} type="file" accept=".xlsx" hidden onChange={handleFile} />
          </div>
        </div>

        <div className="krn-cards">
          {cards.map((c) => (
            <div className="krn-card" key={c.label}>
              <div className="krn-card-label">{c.label}</div>
              <div className="krn-card-value">{c.value}</div>
              <div className="krn-card-hint">{c.hint}</div>
            </div>
          ))}
        </div>

        <div className="krn-panel">
          <div className="krn-tools">
            <div className="krn-chips" role="group" aria-label="Filtrar por estado">
              {FILTERS.map((f) => (
                <button
                  type="button"
                  key={f.key}
                  className={`krn-chip ${filter === f.key ? "on" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label} ({f.key ? counts[f.key] || 0 : summary.kiosksTotal})
                </button>
              ))}
            </div>
            <input
              type="search"
              className="krn-search"
              placeholder="Buscar kiosco o arrendador"
              aria-label="Buscar kiosco o arrendador"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="krn-scroll">
            <table className="krn-table">
              <thead>
                <tr>
                  <th>KIOSCO</th>
                  <th>ARRENDADOR</th>
                  <th className="krn-num">RENTA MENSUAL (DE FINANZAS)</th>
                  <th>PAGO</th>
                  <th>VIGENCIA DEL CONTRATO</th>
                  <th>ESTADO</th>
                  <th><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.locationId}>
                    <td>
                      <div className="krn-name">{r.name}</div>
                      <div className="krn-sub">{r.code}</div>
                    </td>
                    <td className={r.landlordName ? "" : "krn-missing"}>{r.landlordName || "Falta indicar"}</td>
                    <td className="krn-num">
                      {fmtMoney(r.monthlyRent)}
                      {r.monthlyRent === null && <div className="krn-sub">Falta en Finanzas</div>}
                    </td>
                    <td>
                      <div>{r.paymentDay ? `Día ${r.paymentDay} de cada mes` : "Sin día de pago"}</div>
                      <div className="krn-sub">
                        {r.nextPaymentDate
                          ? `Próximo: ${fmtDay(r.nextPaymentDate)} · ${inDays(r.daysToNextPayment)}`
                          : r.paymentDay ? "Sin más pagos en el contrato" : "Falta cargar"}
                      </div>
                    </td>
                    <td>
                      {r.contractStart && r.contractEnd ? (
                        <>
                          <div>{fmtDate(r.contractStart)} → {fmtDate(r.contractEnd)}</div>
                          <div className={`krn-bar krn-bar-${r.status}`}><div style={{ width: `${r.contractProgressPct || 0}%` }} /></div>
                          <div className="krn-sub">{contractLeft(r.daysToContractEnd)}</div>
                        </>
                      ) : (
                        <div className="krn-sub">Sin fechas de contrato</div>
                      )}
                    </td>
                    <td><span className={`krn-badge krn-s-${r.status}`}>{STATUS_LABEL[r.status]}</span></td>
                    <td>
                      {canEdit && (
                        <button
                          type="button"
                          className="krn-btn plain"
                          aria-label={`Editar renta de ${r.name}`}
                          onClick={() => openEditor(r)}
                        >
                          {STATUS_ACTION[r.status] || "Editar"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="krn-empty">No hay kioscos con ese filtro.</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="krn-total">
                  <td>Total de rentas</td>
                  <td className="krn-sub">{summary.kiosksWithRent} de {summary.kiosksTotal} kioscos</td>
                  <td className="krn-num">{fmtMoney(summary.totalMonthlyRent)}</td>
                  <td colSpan={4} className="krn-sub" style={{ textAlign: "left" }}>
                    por mes · {fmtMoney(summary.totalAnnualRent)} al año
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Editar un kiosco */}
      <Modal isOpen={!!editing} toggle={() => !saving && setEditing(null)} modalClassName="krn-drawer" fade={false}>
        <ModalHeader toggle={() => !saving && setEditing(null)}>
          {editing?.name} <span className="krn-sub">· {editing?.code}</span>
        </ModalHeader>
        <ModalBody>
          <div className="krn-form">
            <div className="krn-field">
              <label htmlFor="krn-landlord">Arrendador <span className="krn-sub">(a quien se le paga)</span> <span className="krn-req">*</span></label>
              <Input id="krn-landlord" list="krn-landlords" value={form.landlordName} onChange={setField("landlordName")} maxLength={200} />
              <datalist id="krn-landlords">
                {(data.landlords || []).map((n) => <option key={n} value={n} />)}
              </datalist>
              <small>Al escribir se sugieren los arrendadores ya usados, para que el nombre no cambie de un kiosco a otro.</small>
            </div>

            <div className="krn-rentbox">
              <div>
                <div className="krn-card-label">Renta mensual</div>
                <strong>{fmtMoney(rent)}</strong>
              </div>
              <span>
                {rent !== null && rent !== undefined
                  ? `Se toma de Finanzas > Costos por kiosco (último mes cargado: ${fmtPeriod(editing?.rentPeriod)}). Aquí no se edita.`
                  : "Finanzas aún no tiene la renta de este kiosco. Se carga en Finanzas > Costos por kiosco."}
              </span>
            </div>

            <div className="krn-field">
              <label htmlFor="krn-day">Día de pago del mes <span className="krn-req">*</span></label>
              <Input id="krn-day" type="number" min={1} max={31} value={form.paymentDay} onChange={setField("paymentDay")} style={{ maxWidth: 160 }} />
              <small>Si el mes tiene menos días (por ejemplo, 30 en febrero), se toma el último día del mes.</small>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div className="krn-field">
                <label htmlFor="krn-from">Contrato desde <span className="krn-req">*</span></label>
                <Input id="krn-from" type="date" value={form.contractStart} onChange={setField("contractStart")} />
              </div>
              <div className="krn-field">
                <label htmlFor="krn-to">Contrato hasta <span className="krn-req">*</span></label>
                <Input id="krn-to" type="date" value={form.contractEnd} onChange={setField("contractEnd")} />
              </div>
            </div>

            <div className="krn-field">
              <label htmlFor="krn-note">Notas <span className="krn-sub">(opcional)</span></label>
              <Input id="krn-note" type="textarea" rows={3} maxLength={500} value={form.note} onChange={setField("note")} />
            </div>

            {(previewNext || previewEndDays !== null) && (
              <div className="krn-preview">
                <div className="krn-preview-title">ASÍ QUEDA</div>
                {previewNext && (
                  <div>
                    Próximo pago: <b>{fmtDate(previewNext)}</b> · {inDays(dayDiff(today, previewNext))}
                    {rent !== null && rent !== undefined && <> · <b>{fmtMoney(rent)}</b></>}
                  </div>
                )}
                {previewEndDays !== null && (
                  <div>Contrato: <b>{fmtDate(form.contractEnd)}</b> · {contractLeft(previewEndDays).toLowerCase()}</div>
                )}
                {rent !== null && rent !== undefined && <div>Costo anual de la renta: <b>{fmtMoney(rent * 12)}</b></div>}
              </div>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <div className="krn-foot">
            {editing?.status !== "SIN_CARGAR" ? (
              <button type="button" className="krn-linkbtn" disabled={saving} onClick={handleClear}>Quitar datos del contrato</button>
            ) : <span />}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="krn-btn plain" disabled={saving} onClick={() => setEditing(null)}>Cancelar</button>
              <button type="button" className="krn-btn primary" disabled={saving} onClick={handleSave}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </ModalFooter>
      </Modal>

      {/* Revisión de la plantilla subida */}
      <Modal isOpen={!!review} toggle={() => !busy && setReview(null)} size="lg" modalClassName="krn-review">
        <ModalHeader toggle={() => !busy && setReview(null)}>Revisar plantilla de rentas</ModalHeader>
        <ModalBody>
          {result && (
            <>
              <div className="krn-sub" style={{ marginBottom: 12 }}>
                Archivo: <b>{review.file.name}</b> · aún no se guardó nada
              </div>
              <div className="krn-stats">
                <div className="krn-stat"><strong>{result.readRows}</strong><span>Filas leídas</span></div>
                <div className="krn-stat ok"><strong>{result.changes.length}</strong><span>Cambios</span></div>
                <div className="krn-stat"><strong>{result.unchangedRows + result.blankRows}</strong><span>Sin cambios</span></div>
                <div className={`krn-stat ${hasErrors ? "bad" : ""}`}><strong>{result.errors.length}</strong><span>Con error</span></div>
              </div>

              {hasErrors && (
                <div className="krn-errors">
                  <b className="krn-missing">
                    {result.errors.length === 1 ? "1 fila con error" : `${result.errors.length} filas con error`} · no se aplica nada hasta corregirlas
                  </b>
                  <ul>
                    {result.errors.map((er) => (
                      <li key={`${er.row}-${er.message}`}>
                        <b>Fila {er.row}{er.name ? ` · ${er.name}` : ""}:</b> {er.message}
                      </li>
                    ))}
                  </ul>
                  <div className="krn-sub">Corrija el archivo en Excel y vuelva a subirlo.</div>
                </div>
              )}

              {result.changes.length > 0 && (
                <>
                  <div className="krn-subtitle">Cambios que se aplicarían</div>
                  <div className="krn-scroll" style={{ border: "1px solid #e3e3e3", borderRadius: 10 }}>
                    <table className="krn-mini">
                      <thead>
                        <tr><th>KIOSCO</th><th>ARRENDADOR</th><th>DÍA DE PAGO</th><th>CONTRATO</th><th>QUÉ PASA</th></tr>
                      </thead>
                      <tbody>
                        {result.changes.map((c) => (
                          <tr key={c.locationId}>
                            <td><b>{c.name}</b></td>
                            <td>{c.landlordName || "—"}</td>
                            <td>{c.paymentDay ? `Día ${c.paymentDay}` : "—"}</td>
                            <td>
                              {fmtDate(c.contractStart)} → {fmtDate(c.contractEnd)}
                              {c.previousContractEnd && c.contractEnd !== c.previousContractEnd && (
                                <div className="krn-sub">antes terminaba el {fmtDate(c.previousContractEnd)}</div>
                              )}
                            </td>
                            <td>
                              <span className={`krn-tag ${c.kind === "NEW" ? "new" : "upd"}`}>
                                {c.kind === "NEW" ? "Datos nuevos" : "Se actualiza"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="krn-sub" style={{ marginTop: 8 }}>
                    Las celdas vacías no borran nada: un kiosco que viene sin datos se deja como está.
                  </div>
                </>
              )}
              {!hasErrors && result.changes.length === 0 && (
                <div className="krn-empty">El archivo no trae cambios respecto a lo que ya está guardado.</div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <div className="krn-foot">
            <button type="button" className="krn-btn" disabled={busy} onClick={() => fileRef.current?.click()}>Elegir otro archivo</button>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="krn-btn plain" disabled={busy} onClick={() => setReview(null)}>Cancelar</button>
              <button
                type="button"
                className="krn-btn primary"
                disabled={busy || hasErrors || !result || result.changes.length === 0}
                onClick={handleApply}
              >
                {busy ? "Aplicando…" : `Aplicar ${result ? result.changes.length : 0} cambios`}
              </button>
            </div>
          </div>
        </ModalFooter>
      </Modal>
    </div>
  );
}
