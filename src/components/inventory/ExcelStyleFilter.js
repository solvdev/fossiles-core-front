import React, { useMemo, useState } from "react";
import "./ExcelStyleFilter.css";

const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const naturalCompare = (a, b) =>
  String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });

const triState = (keys, draftSet) => {
  if (!keys.length) return "none";
  const on = keys.filter((k) => draftSet.has(k)).length;
  if (on === 0) return "none";
  return on === keys.length ? "all" : "some";
};

/**
 * Selector con casillas y búsqueda, como el filtro de Excel: se marca lo que se quiere ver
 * y recién con «Aceptar» se aplica. Sin nada aplicado (value vacío) significa «todos».
 *
 * items: [{ key, label, group? }]. Con `grouped`, cada grupo tiene su casilla para marcar todos sus elementos.
 * counts: { [key]: número } muestra las unidades de cada opción.
 */
function ExcelStyleFilter({
  label,
  title,
  items,
  value,
  onChange,
  allText,
  noun,
  counts,
  grouped = false,
  headerExtra = null,
  searchPlaceholder = "Buscar…",
  width = 300,
  panelWidth = 380,
  unitLabel = "uds",
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState([]);
  const [query, setQuery] = useState("");

  const allKeys = useMemo(() => items.map((i) => i.key), [items]);
  const labelByKey = useMemo(() => new Map(items.map((i) => [i.key, i.label])), [items]);
  const applied = useMemo(() => value.filter((k) => labelByKey.has(k)), [value, labelByKey]);
  const filtered = applied.length > 0 && applied.length < allKeys.length;

  const draftSet = useMemo(() => new Set(draft), [draft]);
  const q = norm(query);
  const visible = useMemo(
    () =>
      items.filter(
        (i) => !q || norm(i.label).includes(q) || (grouped && i.group && norm(i.group).includes(q))
      ),
    [items, q, grouped]
  );

  // Escape cierra solo el filtro (sin cerrar la ventana que lo contiene).
  const onKeyDown = (e) => {
    if (open && e.key === "Escape") {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const openPanel = () => {
    setDraft(applied.length ? applied : allKeys);
    setQuery("");
    setOpen(true);
  };

  const setKeys = (keys, on) => {
    const remove = new Set(keys);
    setDraft((prev) => prev.filter((k) => !remove.has(k)).concat(on ? keys : []));
  };

  const draftValid = draft.filter((k) => labelByKey.has(k));
  const apply = () => {
    if (!draftValid.length) return;
    onChange(draftValid.length === allKeys.length ? [] : draftValid);
    setOpen(false);
  };

  const triggerText = !filtered
    ? allText
    : applied.length <= 2
      ? applied.map((k) => labelByKey.get(k)).join(", ")
      : `${applied.length} ${noun} seleccionados`;

  const countOf = (keys) => keys.reduce((a, k) => a + (Number(counts?.[k]) || 0), 0);
  const fmt = (n) => Number(n).toLocaleString("es-GT", { maximumFractionDigits: 0 });

  const rows = [];
  const visibleKeys = visible.map((i) => i.key);
  rows.push({
    id: "__all",
    label: q ? "(Seleccionar resultados de la búsqueda)" : "(Seleccionar todo)",
    keys: visibleKeys,
    state: triState(visibleKeys, draftSet),
    level: "all",
    countText: "",
  });
  if (grouped) {
    const groups = [...new Set(visible.map((i) => i.group))].sort(naturalCompare);
    groups.forEach((g) => {
      const members = visible.filter((i) => i.group === g);
      const keys = members.map((m) => m.key);
      rows.push({
        id: `g:${g}`,
        label: g,
        keys,
        state: triState(keys, draftSet),
        level: "group",
        countText: counts ? `${fmt(countOf(keys))} ${unitLabel}` : "",
      });
      members.forEach((m) =>
        rows.push({
          id: m.key,
          label: m.label,
          keys: [m.key],
          state: triState([m.key], draftSet),
          level: "item",
          countText: counts ? `${fmt(countOf([m.key]))} ${unitLabel}` : "",
        })
      );
    });
  } else {
    visible.forEach((m) =>
      rows.push({
        id: m.key,
        label: m.label,
        keys: [m.key],
        state: triState([m.key], draftSet),
        level: "flat",
        countText: counts ? `${fmt(countOf([m.key]))} ${unitLabel}` : "",
      })
    );
  }

  return (
    <div className={`esf ${open ? "esf-open" : ""}`} style={{ width }} onKeyDown={onKeyDown}>
      <div className="esf-label">{label}</div>
      <button
        type="button"
        className={`esf-trigger ${filtered ? "esf-trigger-on" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openPanel())}
      >
        <span className="esf-trigger-text">{triggerText}</span>
        {filtered ? <span className="esf-count">{applied.length}</span> : null}
        <i className="nc-icon nc-minimal-down esf-chevron" aria-hidden="true" />
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="esf-backdrop"
            aria-label={`Cerrar filtro de ${label.toLowerCase()}`}
            tabIndex={-1}
            onClick={() => setOpen(false)}
          />
          <div className="esf-panel" style={{ width: panelWidth }} role="dialog" aria-label={title || label}>
            <div className="esf-panel-head">
              <div className="esf-panel-title">{title || `Filtrar ${label.toLowerCase()}`}</div>
              {headerExtra}
            </div>
            <input
              type="text"
              className="esf-search"
              aria-label={searchPlaceholder}
              placeholder={searchPlaceholder}
              value={query}
              autoFocus
              onChange={(e) => setQuery(e.target.value)}
            />
            <div className="esf-list">
              {rows.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  role="checkbox"
                  aria-checked={row.state === "all" ? "true" : row.state === "some" ? "mixed" : "false"}
                  className={`esf-row esf-row-${row.level}`}
                  onClick={() => setKeys(row.keys, row.state !== "all")}
                >
                  <span className={`esf-box ${row.state === "none" ? "" : "esf-box-on"}`}>
                    {row.state === "all" ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M5 12l5 5 9-10" />
                      </svg>
                    ) : null}
                    {row.state === "some" ? (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" aria-hidden="true">
                        <path d="M6 12h12" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="esf-row-label">{row.label}</span>
                  {row.countText ? <span className="esf-row-count">{row.countText}</span> : null}
                </button>
              ))}
              {visible.length === 0 ? <div className="esf-empty">Sin coincidencias.</div> : null}
            </div>
            <div className="esf-foot">
              <span className="esf-foot-text">
                {draftValid.length} de {allKeys.length} seleccionados
              </span>
              <div className="esf-foot-actions">
                <button type="button" className="esf-btn" onClick={() => setOpen(false)}>
                  Cancelar
                </button>
                <button
                  type="button"
                  className="esf-btn esf-btn-primary"
                  disabled={draftValid.length === 0}
                  onClick={apply}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default ExcelStyleFilter;
