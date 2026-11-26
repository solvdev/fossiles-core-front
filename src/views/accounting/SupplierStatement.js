import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getSupplierStatement } from "services/supplierPaymentService";
import { getSuppliers, normalizeSupplierCode } from "services/supplierService";
import { showError } from "utils/notificationHelper";
import { money, rangeText, shortDate, statementExcel, statementPdf } from "utils/supplierStatementExport";
import { focusSibling, Kbd, useHotkeys } from "hooks/useKeyboard";
import "./SupplierPayments.css";
import "./SupplierStatement.css";

/**
 * Contabilidad › Estado de cuenta de proveedores (el «Pagos generales» del sistema anterior).
 * Por proveedor y en orden de código: cada compra y documento con cargos, abonos y saldo a la fecha de corte.
 * Pensado para usarse con el teclado: ver los atajos con «?».
 */

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const BUCKETS = [
  { id: "all", label: "Todo" },
  { id: "cur", label: "Por vencer", test: (d) => d <= 0 },
  { id: "30", label: "Vencido 1–30 días", test: (d) => d >= 1 && d <= 30 },
  { id: "90", label: "Vencido 31–90 días", test: (d) => d > 30 && d <= 90 },
  { id: "365", label: "Vencido 91–365 días", test: (d) => d > 90 && d <= 365 },
  { id: "old", label: "Más de un año", test: (d) => d > 365 },
];

const KINDS = [
  { id: "ALL", label: "Todos" },
  { id: "ORDERS", label: "Compras (órdenes)" },
  { id: "DOCUMENTS", label: "Servicios y otros" },
  { id: "OPENING", label: "Saldos iniciales" },
  { id: "RENTS", label: "Rentas" },
];

const dueBadge = (line) => {
  const b = Number(line.balance);
  if (b < 0) return <span className="sst-pill ok">a favor</span>;
  if (b === 0) return null;
  if (line.daysLate > 365) {
    const years = Math.floor(line.daysLate / 365);
    return <span className="sst-pill old">{years} año{years > 1 ? "s" : ""}</span>;
  }
  if (line.daysLate > 0) return <span className="sst-pill late">vencido {line.daysLate} d</span>;
  return <span className="sst-pill ok">{line.daysLate === 0 ? "vence hoy" : `en ${-line.daysLate} d`}</span>;
};

function SupplierStatement() {
  const [suppliers, setSuppliers] = useState([]);
  const [fromRaw, setFromRaw] = useState("");
  const [toRaw, setToRaw] = useState("");
  const [cutoff, setCutoff] = useState(todayIso());
  const [kind, setKind] = useState("ALL");
  const [onlyBalance, setOnlyBalance] = useState(true);
  const [includeNoCode, setIncludeNoCode] = useState(false);
  const [bucket, setBucket] = useState("all");
  const [search, setSearch] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [active, setActive] = useState(0);
  const [help, setHelp] = useState(false);
  const filtersRef = useRef(null);
  const fromRef = useRef(null);
  const cutoffRef = useRef(null);
  const searchRef = useRef(null);
  const groupRefs = useRef({});

  useEffect(() => {
    getSuppliers().then(setSuppliers).catch(() => setSuppliers([]));
  }, []);

  const from = normalizeSupplierCode(fromRaw);
  const to = normalizeSupplierCode(toRaw);
  const codeError =
    (fromRaw.trim() && !from) || (toRaw.trim() && !to) ? "Escriba el código como PV013 o solo el número (13)." : "";

  useEffect(() => {
    if (codeError) return undefined;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getSupplierStatement({ from, to, cutoff, kind, onlyBalance, includeNoCode });
        if (!cancelled) {
          setData(res);
          setActive(0);
        }
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [from, to, cutoff, kind, onlyBalance, includeNoCode, codeError]);

  // Antigüedad: sobre los documentos con saldo.
  const aging = useMemo(() => {
    const out = BUCKETS.map((b) => ({ ...b, amount: 0, count: 0 }));
    (data?.groups || []).forEach((g) =>
      g.lines.forEach((l) => {
        if (Number(l.balance) <= 0) return;
        out.forEach((b) => {
          if (!b.test || b.test(l.daysLate)) {
            b.amount += Number(l.balance);
            b.count += 1;
          }
        });
      })
    );
    return out;
  }, [data]);

  const groups = useMemo(() => {
    const b = BUCKETS.find((x) => x.id === bucket);
    const text = search.trim().toLowerCase();
    const asCode = normalizeSupplierCode(search);
    return (data?.groups || [])
      .filter(
        (g) =>
          !text ||
          (asCode && g.code === asCode) ||
          [g.code, g.name, g.payeeName].some((v) => String(v || "").toLowerCase().includes(text))
      )
      .map((g) => {
        const lines = b.test ? g.lines.filter((l) => Number(l.balance) > 0 && b.test(l.daysLate)) : g.lines;
        const charges = lines.reduce((s, l) => s + Number(l.charges), 0);
        const credits = lines.reduce((s, l) => s + Number(l.credits), 0);
        return { ...g, lines, charges, credits, balance: charges - credits };
      })
      .filter((g) => g.lines.length > 0);
  }, [data, bucket, search]);

  const totals = useMemo(
    () =>
      groups.reduce(
        (t, g) => ({ charges: t.charges + g.charges, credits: t.credits + g.credits, docs: t.docs + g.lines.length }),
        { charges: 0, credits: 0, docs: 0 }
      ),
    [groups]
  );

  useEffect(() => {
    setActive(0);
  }, [bucket, search]);

  const move = (step) => {
    if (groups.length === 0) return;
    const next = step === Infinity ? groups.length - 1 : step === -Infinity ? 0 : Math.min(groups.length - 1, Math.max(0, active + step));
    setActive(next);
    groupRefs.current[groups[next]?.key]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  };

  const bucketLabel = bucket === "all" ? "" : BUCKETS.find((b) => b.id === bucket)?.label;
  const exportPdf = () => data && groups.length && statementPdf(data, groups, { bucketLabel });
  const exportExcel = () => data && groups.length && statementExcel(data, groups);

  const hotkeys = {
    "?": () => setHelp((v) => !v),
    "/": () => searchRef.current?.focus(),
    d: () => fromRef.current?.focus(),
    f: () => cutoffRef.current?.focus(),
    s: () => setOnlyBalance((v) => !v),
    e: () => exportExcel(),
    p: () => exportPdf(),
    arrowdown: () => move(1),
    j: () => move(1),
    arrowup: () => move(-1),
    k: () => move(-1),
    pagedown: () => move(5),
    pageup: () => move(-5),
    home: () => move(-Infinity),
    end: () => move(Infinity),
    escape: () => {
      if (help) setHelp(false);
      else if (search) setSearch("");
      else if (bucket !== "all") setBucket("all");
      else return false;
      return true;
    },
  };
  BUCKETS.forEach((b, i) => {
    hotkeys[String(i + 1)] = () => setBucket(b.id);
  });
  useHotkeys(hotkeys);

  // En los filtros: Enter pasa al siguiente; en el último, baja al reporte.
  const onFilterKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (e.target.classList.contains("sst-code")) {
      const code = normalizeSupplierCode(e.target.value);
      if (code) (e.target === fromRef.current ? setFromRaw : setToRaw)(code);
    }
    if (!focusSibling(filtersRef.current, e.target, e.shiftKey ? -1 : 1)) {
      e.target.blur();
      move(0);
    }
  };

  const onSearchKey = (e) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      e.currentTarget.blur();
      move(0);
    }
  };

  const blurCode = (raw, setter) => () => {
    const code = normalizeSupplierCode(raw);
    if (code && code !== raw) setter(code);
  };

  return (
    <div className="content spy">
      <div className="spy-head">
        <div>
          <h4>Estado de cuenta de proveedores</h4>
          <p>
            Lo que se le debe a cada proveedor a una fecha de corte, ordenado por código: compras recibidas, documentos y
            saldos iniciales, con lo que ya se abonó.
          </p>
        </div>
        <div className="spy-head-actions">
          <button type="button" className="spy-btn" onClick={exportExcel} disabled={!groups.length}>
            Excel <Kbd>E</Kbd>
          </button>
          <button type="button" className="spy-btn primary" onClick={exportPdf} disabled={!groups.length}>
            PDF <Kbd>P</Kbd>
          </button>
          <Link to="/admin/accounting/payables" className="spy-btn plain" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }}>
            Cuentas por pagar
          </Link>
        </div>
      </div>

      <div className="spy-panel">
        <div className="sst-filters" ref={filtersRef} onKeyDown={onFilterKey}>
          <div className="sst-field">
            <label htmlFor="sst-from">Del proveedor</label>
            <input
              id="sst-from"
              ref={fromRef}
              className="sst-code"
              list="sst-codes"
              placeholder="PV001"
              value={fromRaw}
              onChange={(e) => setFromRaw(e.target.value)}
              onBlur={blurCode(fromRaw, setFromRaw)}
              autoComplete="off"
              autoFocus
            />
          </div>
          <div className="sst-field">
            <label htmlFor="sst-to">Al proveedor</label>
            <input
              id="sst-to"
              className="sst-code"
              list="sst-codes"
              placeholder="PV999"
              value={toRaw}
              onChange={(e) => setToRaw(e.target.value)}
              onBlur={blurCode(toRaw, setToRaw)}
              autoComplete="off"
            />
          </div>
          <datalist id="sst-codes">
            {suppliers
              .filter((s) => s.code)
              .map((s) => (
                <option key={s.id} value={s.code}>
                  {s.name}
                </option>
              ))}
          </datalist>
          <div className="sst-field">
            <label htmlFor="sst-cutoff">Fecha de corte</label>
            <input id="sst-cutoff" ref={cutoffRef} type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value || todayIso())} />
          </div>
          <div className="sst-field">
            <label htmlFor="sst-kind">Qué documentos</label>
            <select id="sst-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
              {KINDS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <label className="sst-check" htmlFor="sst-balance">
            <input id="sst-balance" type="checkbox" checked={onlyBalance} onChange={(e) => setOnlyBalance(e.target.checked)} />
            Solo con saldo
          </label>
          <label className="sst-check" htmlFor="sst-nocode">
            <input id="sst-nocode" type="checkbox" checked={includeNoCode} onChange={(e) => setIncludeNoCode(e.target.checked)} />
            Incluir arrendadores sin código
          </label>
          <span className="sst-spacer" />
          {codeError && <span className="text-danger small">{codeError}</span>}
        </div>

        <div className="sst-aging" role="group" aria-label="Filtrar por antigüedad">
          {aging.map((b, i) => (
            <button key={b.id} type="button" className={b.id === bucket ? "on" : ""} aria-pressed={b.id === bucket} onClick={() => setBucket(b.id)}>
              <div className="k">
                <Kbd>{i + 1}</Kbd>
                {b.label}
              </div>
              <div className="v">Q {money(b.amount)}</div>
              <div className="n">
                {b.count} documento{b.count === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>

        <div className="sst-bar">
          <input
            ref={searchRef}
            className="sst-search"
            type="text"
            placeholder="Buscar proveedor en el reporte (código o nombre)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKey}
            aria-label="Buscar proveedor en el reporte"
          />
          <span className="kbd-bar">
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> proveedor</span>
            <span><Kbd>/</Kbd> buscar</span>
            <span><Kbd>D</Kbd> rango</span>
            <span><Kbd>1</Kbd>–<Kbd>6</Kbd> antigüedad</span>
            <span><Kbd>?</Kbd> todos los atajos</span>
          </span>
        </div>

        {help && (
          <div className="sst-help" role="note">
            <span><Kbd>D</Kbd> ir a «Del proveedor»</span>
            <span><Kbd>F</Kbd> ir a la fecha de corte</span>
            <span><Kbd>Enter</Kbd> en un filtro: el siguiente</span>
            <span><Kbd>S</Kbd> solo con saldo sí/no</span>
            <span><Kbd>1</Kbd>…<Kbd>6</Kbd> antigüedad (1 = todo)</span>
            <span><Kbd>/</Kbd> buscar proveedor en el reporte</span>
            <span><Kbd>↑</Kbd><Kbd>↓</Kbd> o <Kbd>J</Kbd><Kbd>K</Kbd> proveedor anterior / siguiente</span>
            <span><Kbd>RePág</Kbd><Kbd>AvPág</Kbd> de 5 en 5 · <Kbd>Inicio</Kbd><Kbd>Fin</Kbd></span>
            <span><Kbd>E</Kbd> Excel · <Kbd>P</Kbd> PDF</span>
            <span><Kbd>Esc</Kbd> quitar búsqueda o antigüedad</span>
          </div>
        )}

        {error && <div className="spy-empty text-danger">{error}</div>}
        {!error && loading && !data && <div className="spy-empty">Generando…</div>}
        {!error && data && (
          <div className="sst-sheet-wrap" style={{ opacity: loading ? 0.6 : 1 }}>
            <div className="sst-sheet">
              <div className="sst-sheet-head">
                <div className="sst-meta">
                  {totals.docs} documento{totals.docs === 1 ? "" : "s"} · {groups.length} proveedor{groups.length === 1 ? "" : "es"}
                </div>
                <div className="c">
                  <div className="sst-co">FOSSILES</div>
                  <div className="sst-title">Estado de cuenta de proveedores</div>
                </div>
                <div className="r sst-meta">Corte al {shortDate(data.cutoff)}</div>
              </div>
              <div className="sst-range">
                {rangeText(data)}
                {bucketLabel ? ` · ${bucketLabel}` : ""}
                {data.onlyBalance ? " · solo documentos con saldo" : ""}
              </div>
              {groups.length === 0 ? (
                <div className="spy-empty">No hay documentos con esos filtros.</div>
              ) : (
                <table className="sst-rep">
                  <thead>
                    <tr>
                      <th>Concepto</th>
                      <th className="sst-num">Documento</th>
                      <th className="sst-num">F. apli.</th>
                      <th className="sst-num">F. venc.</th>
                      <th className="sst-num">Cargos</th>
                      <th className="sst-num">Abonos</th>
                      <th className="sst-num">Saldos</th>
                    </tr>
                  </thead>
                  {groups.map((g, i) => (
                    <tbody
                      key={g.key}
                      ref={(el) => {
                        groupRefs.current[g.key] = el;
                      }}
                      className={`sst-group${i === active ? " active" : ""}`}
                      onClick={() => setActive(i)}
                    >
                      <tr>
                        <td colSpan={5}>
                          <span className="sst-code">{g.code || "S/C"}</span>
                          <span className="sst-name">{g.name}</span>
                          {g.payeeName && <span className="sst-payee">Cheque a nombre de {g.payeeName}</span>}
                        </td>
                        <td colSpan={2} className="sst-phone">
                          {g.phone}
                        </td>
                      </tr>
                      {g.lines.map((l) => (
                        <tr key={l.rowKey}>
                          <td>{l.concept}</td>
                          <td className="sst-num">
                            {l.document}
                            {l.orderCode && l.orderCode !== l.document && <span className="sst-sub">{l.orderCode}</span>}
                          </td>
                          <td className="sst-num">{shortDate(l.issueDate)}</td>
                          <td className="sst-num">
                            {shortDate(l.dueDate)}
                            {dueBadge(l)}
                          </td>
                          <td className="sst-num">{money(l.charges)}</td>
                          <td className="sst-num">
                            {money(l.credits)}
                            {(l.payments || []).map((p) => (
                              <span key={`${p.paymentId}-${p.amount}`} className="sst-sub" title={`${p.number} · ${shortDate(p.payDate)}`}>
                                {p.label}
                              </span>
                            ))}
                          </td>
                          <td className={`sst-num${Number(l.balance) < 0 ? " sst-favor" : ""}`}>{money(l.balance)}Q</td>
                        </tr>
                      ))}
                      <tr className="sst-subtotal">
                        <td colSpan={4} />
                        <td className="sst-num">{money(g.charges)}</td>
                        <td className="sst-num">{money(g.credits)}</td>
                        <td className={`sst-num${g.balance < 0 ? " sst-favor" : ""}`}>{money(g.balance)}</td>
                      </tr>
                    </tbody>
                  ))}
                  <tbody>
                    <tr className="sst-total">
                      <td colSpan={4}>Total general</td>
                      <td className="sst-num">{money(totals.charges)}</td>
                      <td className="sst-num">{money(totals.credits)}</td>
                      <td className="sst-num">{money(totals.charges - totals.credits)}Q</td>
                    </tr>
                  </tbody>
                </table>
              )}
              {data.payablesStartDate && (
                <div className="sst-meta mt-3">
                  Las compras recibidas antes del {shortDate(data.payablesStartDate)} no aparecen (se cambia en Bancos y formas de
                  pago); lo pendiente de antes se carga como saldo inicial.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SupplierStatement;
