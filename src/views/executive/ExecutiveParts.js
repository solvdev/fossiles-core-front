import React from "react";
import { fK, fN, weekLabel } from "views/executive/executiveModel";

export function Kpi({ label, value, delta, tone, sub }) {
  return (
    <div className="x-kpi">
      <div className="x-kpi-label">{label}</div>
      <div className="x-kpi-value">{value}</div>
      <div className="x-kpi-sub">
        {delta ? <span className={tone || ""}>{delta}</span> : null} {sub}
      </div>
    </div>
  );
}

export function KpiGrid({ items }) {
  return (
    <div className="x-kpis">
      {items.filter(Boolean).map((k) => (
        <Kpi key={k.label} {...k} />
      ))}
    </div>
  );
}

export function Card({ title, hint, actions, children, className = "", style }) {
  return (
    <section className={`x-card ${className}`} style={style}>
      {title || actions ? (
        <div className="x-cardhead">
          <div>
            {title ? <h2>{title}</h2> : null}
            {hint ? <p className="x-hint">{hint}</p> : null}
          </div>
          {actions ? <div className="x-chips">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export const Decide = ({ children }) => <div className="x-decide">{children}</div>;

export function Chips({ options, value, onChange }) {
  return options.map(([id, label]) => (
    <button key={id} type="button" className={`x-chip ${value === id ? "on" : ""}`} aria-pressed={value === id} onClick={() => onChange(id)}>
      {label}
    </button>
  ));
}

export function Track({ parts, className = "" }) {
  return (
    <div className={`x-track ${className}`}>
      {parts.map((p, i) => (
        <div key={i} className={p.cls || "x-fill"} style={{ width: `${Math.max(0, Math.min(100, p.w))}%`, background: p.color }} />
      ))}
    </div>
  );
}

/** Columnas por semana; la última (en curso) va en tono claro. */
export function WeekColumns({ weeks, money }) {
  const max = Math.max(1, ...weeks.map((w) => w.value));
  return (
    <div className="x-cols" role="img" aria-label="Gráfica por semana">
      {weeks.map((w) => (
        <div className="x-col" key={w.start} title={`Semana del ${weekLabel(w.start)}: ${money ? fK(w.value) : fN(w.value)}`}>
          <span className="x-cv">{money ? fK(w.value) : fN(w.value)}</span>
          <div className={`x-bar ${w.current ? "cur" : ""}`} style={{ height: `${Math.max(2, (w.value / max) * 80)}%` }} />
          <span className="x-cl">{weekLabel(w.start)}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Tabla en grilla: `cols` = [{ label, width, align }]. Cada fila es un arreglo de celdas (nodos).
 * `minWidth` activa el scroll horizontal en pantallas angostas.
 */
export function GridTable({ cols, rows, minWidth = 0, empty = "Sin datos en el periodo." }) {
  const template = cols.map((c) => c.width || "minmax(0, 1fr)").join(" ");
  return (
    <div className="x-scroll">
      <div style={{ minWidth }}>
        <div className="x-tr x-th" style={{ gridTemplateColumns: template }}>
          {cols.map((c, i) => (
            <span key={i} className={c.align === "r" ? "r" : ""}>
              {c.label}
            </span>
          ))}
        </div>
        {rows.length === 0 ? <div className="x-empty">{empty}</div> : null}
        {rows.map((cells, ri) => (
          <div key={ri} className="x-tr num" style={{ gridTemplateColumns: template }}>
            {cells.map((cell, ci) => (
              <span key={ci} className={`${cols[ci].align === "r" ? "r" : ""} ${cols[ci].cls || ""}`} style={{ minWidth: 0 }}>
                {cell}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export const Pill = ({ tone, children }) => <span className={`x-pill ${tone}`}>{children}</span>;

export function BarCell({ parts, value }) {
  return (
    <span className="x-barcell">
      <Track parts={parts} />
      {value != null ? <span className="v">{value}</span> : null}
    </span>
  );
}
