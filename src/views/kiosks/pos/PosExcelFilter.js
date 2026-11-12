import React, { useEffect, useMemo, useRef, useState } from "react";

const norm = (text) =>
  String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Filtro estilo Excel: botón que resume la selección y abre una lista con casillas,
 * buscador, «Seleccionar todos» y contador ("12 de 40").
 *
 * Dos modos:
 *  - `emptyMeansAll` (ej. kioscos): lista vacía = todas las casillas marcadas. Se pueden
 *    desmarcar algunas; si quedan todas marcadas se guarda [] (aplica a todos, incluidos los nuevos).
 *    Siempre debe quedar al menos una marcada.
 *  - positivo (categorías, productos, tallas…): lista vacía = sin filtro («todas»). Se marcan
 *    solo las que quieres; «Seleccionar todos» marca las que se ven con la búsqueda actual.
 *
 * @param {{ value: string|number, label: string, searchText?: string, hint?: string }[]} props.options
 * @param {Array<string|number>} props.selected
 * @param {(next: Array<string|number>) => void} props.onChange
 */
function PosExcelFilter({
  label,
  options,
  selected,
  onChange,
  emptyMeansAll = false,
  allLabel = "Todas",
  noun = "elementos",
  searchPlaceholder = "Buscar…",
  disabled = false,
  maxRows = 300,
  hint,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const rootRef = useRef(null);
  const allRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = useMemo(() => options || [], [options]);
  const total = list.length;
  const optionValues = useMemo(() => new Set(list.map((o) => String(o.value))), [list]);

  // Casillas marcadas (como texto). En modo "vacío = todos" y sin selección, todas.
  const checked = useMemo(() => {
    if (emptyMeansAll && (!selected || selected.length === 0)) return new Set(list.map((o) => String(o.value)));
    return new Set((selected || []).map((v) => String(v)));
  }, [emptyMeansAll, selected, list]);

  const checkedInOptions = useMemo(() => list.filter((o) => checked.has(String(o.value))).length, [list, checked]);
  // Seleccionados que ya no están en la lista (ej. producto oculto): se conservan.
  const unknownSelected = useMemo(
    () => (emptyMeansAll ? [] : (selected || []).filter((v) => !optionValues.has(String(v)))),
    [emptyMeansAll, selected, optionValues]
  );

  const visible = useMemo(() => {
    const q = norm(query).trim();
    if (!q) return list;
    return list.filter((o) => norm(o.searchText ?? o.label).includes(q));
  }, [list, query]);
  const shown = visible.slice(0, Math.max(1, maxRows));

  const visibleChecked = visible.filter((o) => checked.has(String(o.value))).length;
  const allVisibleChecked = visible.length > 0 && visibleChecked === visible.length;
  const someVisibleChecked = visibleChecked > 0 && !allVisibleChecked;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = someVisibleChecked;
  }, [someVisibleChecked, open]);

  const commit = (nextSet) => {
    setNotice("");
    if (emptyMeansAll) {
      if (nextSet.size === 0) {
        setNotice("Deja al menos uno marcado.");
        return;
      }
      const everyOption = list.length > 0 && list.every((o) => nextSet.has(String(o.value)));
      onChange(everyOption ? [] : list.filter((o) => nextSet.has(String(o.value))).map((o) => o.value));
      return;
    }
    const known = list.filter((o) => nextSet.has(String(o.value))).map((o) => o.value);
    onChange([...known, ...unknownSelected.filter((v) => nextSet.has(String(v)))]);
  };

  const toggleOne = (value) => {
    const next = new Set(checked);
    const key = String(value);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    commit(next);
  };

  const toggleAllVisible = () => {
    const next = new Set(checked);
    if (allVisibleChecked) visible.forEach((o) => next.delete(String(o.value)));
    else visible.forEach((o) => next.add(String(o.value)));
    commit(next);
  };

  // ---- resumen del botón
  const labelOf = (o) => String(o.label ?? o.value);
  const excluded = emptyMeansAll ? list.filter((o) => !checked.has(String(o.value))) : [];
  const picked = list.filter((o) => checked.has(String(o.value)));
  let summary;
  let counter;
  let isFiltered = true;
  if (emptyMeansAll) {
    if (excluded.length === 0) {
      summary = allLabel;
      isFiltered = false;
    } else if (excluded.length <= 2 && total > 3) {
      summary = `${allLabel} menos ${excluded.map(labelOf).join(" y ")}`;
    } else if (picked.length <= 2) {
      summary = picked.map(labelOf).join(" y ");
    } else {
      summary = `${picked.length} ${noun} marcados`;
    }
    counter = `${checkedInOptions} de ${total}`;
  } else {
    const count = (selected || []).length;
    if (count === 0) {
      summary = allLabel;
      isFiltered = false;
      counter = `${total}`;
    } else {
      summary =
        picked.length > 0 && picked.length <= 2 && count <= 2
          ? picked.map(labelOf).join(" y ")
          : `${count} ${noun} marcados`;
      counter = `${count} de ${total}`;
    }
  }

  return (
    <div className={`pr-xl${open ? " is-open" : ""}`} ref={rootRef}>
      {label && <label className="pr-field-label">{label}</label>}
      <button
        type="button"
        className={`pr-xl-trigger${isFiltered ? " is-filtered" : ""}`}
        disabled={disabled}
        aria-expanded={open}
        onClick={() => {
          setOpen((prev) => !prev);
          setQuery("");
          setNotice("");
        }}
      >
        <span className="pr-xl-summary">{summary}</span>
        <span className="pr-xl-counter">{counter}</span>
        <span className="pr-xl-caret" aria-hidden="true">▾</span>
      </button>
      {hint && <small className="pr-hint">{hint}</small>}

      {open && (
        <div className="pr-xl-panel" role="listbox" aria-multiselectable="true">
          <input
            type="text"
            className="pr-xl-search"
            placeholder={searchPlaceholder}
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
          />
          <label className="pr-xl-row pr-xl-all">
            <input
              ref={allRef}
              type="checkbox"
              checked={allVisibleChecked}
              disabled={visible.length === 0}
              onChange={toggleAllVisible}
            />
            <span>{query.trim() ? "Seleccionar resultados" : "Seleccionar todos"}</span>
            <span className="pr-xl-count">
              {query.trim() ? `${visibleChecked} de ${visible.length}` : `${checkedInOptions} de ${total}`}
            </span>
          </label>
          <div className="pr-xl-list">
            {shown.length === 0 ? (
              <div className="pr-xl-empty">{total === 0 ? "No hay opciones." : "Sin resultados."}</div>
            ) : (
              shown.map((o) => (
                <label key={`xl-${o.value}`} className="pr-xl-row">
                  <input type="checkbox" checked={checked.has(String(o.value))} onChange={() => toggleOne(o.value)} />
                  <span className="pr-xl-text">
                    {o.label}
                    {o.hint && <small>{o.hint}</small>}
                  </span>
                </label>
              ))
            )}
            {visible.length > shown.length && (
              <div className="pr-xl-empty">
                Mostrando {shown.length} de {visible.length}. Escribe en el buscador para afinar.
              </div>
            )}
          </div>
          {notice && <div className="pr-xl-notice">{notice}</div>}
          <div className="pr-xl-foot">
            {!emptyMeansAll && (selected || []).length > 0 ? (
              <button type="button" className="pr-link" onClick={() => onChange([])}>
                Quitar selección ({allLabel.toLowerCase()})
              </button>
            ) : (
              <span className="pr-hint">{emptyMeansAll ? "Desmarca los que no entran." : "Sin marcar = sin filtro."}</span>
            )}
            <button type="button" className="pr-link is-strong" onClick={() => setOpen(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default PosExcelFilter;
