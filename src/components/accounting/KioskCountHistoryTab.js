import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Spinner } from "reactstrap";
import { getCountHistory } from "services/kioskCountCalendarService";
import {
  HISTORY_HEADERS,
  buildBlocks,
  downloadCountHistoryExcel,
  mondayOfDate,
  monthKey,
  monthLabel,
  plusDays,
  shortDate,
} from "utils/kioskCountHistoryExport";
import { showError } from "utils/notificationHelper";

const MODES = [
  ["month", "Mes"],
  ["week", "Semana"],
  ["range", "Rango de fechas"],
];
const CUTS = [
  ["round", "Del 13 al 12"],
  ["calendar", "Del 1 al 31"],
];

const unique = (values) => [...new Set(values)].sort();
/** El elegido si existe; si no, el más reciente. */
const pick = (list, value) => (list.includes(value) ? value : list[list.length - 1] || "");

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="kcc-seg" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button type="button" key={id} className={value === id ? "on" : ""} aria-pressed={value === id} onClick={() => onChange(id)}>
          {text}
        </button>
      ))}
    </div>
  );
}

function Block({ supervisor, block }) {
  return (
    <section className="kch-block">
      <div className="kch-head">
        <strong className="kch-title">REPORTES DE INVENTARIOS KIOSCOS</strong>
        <span className="kch-period" style={{ background: `#${block.color}` }}>
          {block.title}
        </span>
      </div>
      <div className="kch-sup">
        SUPERVISORA: <strong>{supervisor}</strong>
      </div>
      <table>
        <thead>
          <tr>
            {HISTORY_HEADERS.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={`${row.name}-${row.to}`} style={{ background: `#${block.color}` }}>
              <td className="c">{i + 1}</td>
              <td>
                {row.name}
                {row.twice && <small>CADA 15 DIAS</small>}
              </td>
              <td className="num">{shortDate(row.from)}</td>
              <td className="num">{shortDate(row.to)}</td>
              <td />
              <td className="b">{row.accountant}</td>
              <td className="num">{shortDate(row.delivery)}</td>
              <td className="num">{shortDate(row.liquidation)}</td>
              <td className="c b">{row.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Historial de conteos físicos cerrados, por mes, semana o rango de fechas, descargable en Excel. */
export default function KioskCountHistoryTab({ supervisorId, refreshKey }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("month");
  const [cut, setCut] = useState("round");
  const [month, setMonth] = useState("");
  const [week, setWeek] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await getCountHistory());
    } catch (error) {
      showError(error.message);
      setRows(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const months = useMemo(() => unique((rows || []).map((r) => monthKey(r.periodTo, cut))), [rows, cut]);
  const weeks = useMemo(() => unique((rows || []).map((r) => mondayOfDate(r.periodTo))), [rows]);
  const filter = {
    supervisorId,
    mode,
    cut,
    month: pick(months, month),
    week: pick(weeks, week),
    from,
    until,
  };
  const model = buildBlocks(rows || [], filter);
  const total = model.reduce((n, g) => n + g.blocks.reduce((m, b) => m + b.rows.length, 0), 0);

  const stepper = (label, list, value, set, text) => (
    <div className="kch-step">
      <button type="button" className="kcc-icon-btn" aria-label={`${label} anterior`} disabled={list.indexOf(value) <= 0} onClick={() => set(list[list.indexOf(value) - 1])}>
        ‹
      </button>
      <Input type="select" bsSize="sm" value={value} aria-label={label} onChange={(e) => set(e.target.value)}>
        {list.map((item) => (
          <option key={item} value={item}>
            {text(item)}
          </option>
        ))}
      </Input>
      <button type="button" className="kcc-icon-btn" aria-label={`${label} siguiente`} disabled={list.indexOf(value) >= list.length - 1} onClick={() => set(list[list.indexOf(value) + 1])}>
        ›
      </button>
    </div>
  );

  const download = () => {
    const suffix = mode === "month" ? filter.month : mode === "week" ? filter.week : `${from || "inicio"}_${until || "hoy"}`;
    try {
      downloadCountHistoryExcel(model, suffix);
    } catch (error) {
      showError(error.message || "No se pudo generar el Excel.");
    }
  };

  if (loading) {
    return (
      <div className="kcc-center">
        <Spinner color="primary" />
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="kcc-empty">
        <h5>No se pudo cargar el historial</h5>
        <Button color="primary" outline onClick={load}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="kch-bar">
        <Segmented label="Ver por" options={MODES} value={mode} onChange={setMode} />
        {mode === "month" && stepper("Mes", months, filter.month, setMonth, (m) => monthLabel(m, true))}
        {mode === "week" && stepper("Semana", weeks, filter.week, setWeek, (w) => `${shortDate(w)} al ${shortDate(plusDays(w, 6))}`)}
        {mode === "range" && (
          <div className="kch-step">
            <label>
              Del <Input type="date" bsSize="sm" value={from} onChange={(e) => setFrom(e.target.value)} />
            </label>
            <label>
              al <Input type="date" bsSize="sm" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
          </div>
        )}
        {mode !== "week" && <Segmented label="Corte del mes" options={CUTS} value={cut} onChange={setCut} />}
        <Button color="primary" size="sm" className="kch-download" disabled={!total} onClick={download}>
          Descargar Excel
        </Button>
      </div>

      {total === 0 ? (
        <div className="kcc-empty">
          <h5>No hay conteos cerrados en ese período</h5>
          <p>Elige otro mes, semana o rango de fechas.</p>
        </div>
      ) : (
        <div className="kch-sheet">
          {model.map((group) => group.blocks.map((block) => <Block key={`${group.supervisor}-${block.key}`} supervisor={group.supervisor} block={block} />))}
        </div>
      )}
    </>
  );
}
