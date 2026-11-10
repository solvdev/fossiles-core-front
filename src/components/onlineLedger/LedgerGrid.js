import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { num, formatMoney, formatDay, fold } from "./onlineLedgerHelper";

/**
 * Hoja tipo Excel del libro de ventas en línea.
 * - Una celda activa y un rango (Shift+flechas, Shift+clic o arrastrando); se escribe encima para reemplazar, F2 para
 *   corregir, Supr para vaciar, Ctrl+C / Ctrl+V con Excel (texto separado por tabulaciones), Ctrl+D rellena hacia abajo,
 *   Ctrl+Enter escribe lo mismo en todo el rango, Ctrl+Z / Ctrl+Y deshacer / rehacer (lo maneja la página).
 * - Filtro por columna como el autofiltro de Excel (▾ en el encabezado o Alt+↓): ordenar, buscar y marcar valores.
 *
 * Columna: { id, label, width, kind: lock|calc|ed, type: text|money|date|bool, get(row), fmt?(value), text?(row),
 *   render?(row), field? (si se edita), sys?(row) (el valor viene de la venta: cursiva), orig? (clave en
 *   row.saleOriginal), list? (datalist), total?, num?, center?, strong?, need?(row) }
 */

const ROW_H = 32;
const EMPTY_KEY = "\u0000vacio";

// ───────── valores ─────────

export const colValueText = (col, value) => {
  if (value === null || value === undefined || value === "") return "";
  if (col.fmt) return col.fmt(value);
  switch (col.type) {
    case "money": return formatMoney(value);
    case "date": return formatDay(value);
    case "bool": return value ? "Sí" : "No";
    default: return String(value);
  }
};

export const cellText = (col, row) => (col.text ? col.text(row) : colValueText(col, col.get(row)));

/** Texto que va al portapapeles: montos sin separador de miles para que Excel los tome como número. */
const copyText = (col, row) => {
  const v = col.get(row);
  if (col.type === "money") return v === null || v === undefined || v === "" ? "" : num(v).toFixed(2);
  const t = cellText(col, row);
  return /[\t\n"]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

const pad = (n) => String(n).padStart(2, "0");

/** Convierte lo escrito o pegado al valor que se guarda. */
export const parseInput = (col, raw) => {
  const t = String(raw ?? "").trim();
  if (col.type === "bool") {
    return { value: /^(s[ií]?|x|1|true|verdadero|y|yes|✓|✔)$/i.test(t) };
  }
  if (t === "") return { value: "" };
  if (col.type === "money") {
    const n = parseFloat(t.replace(/^\(?-?\s*Q\s*/i, (m) => (m.includes("-") || m.includes("(") ? "-" : "")).replace(/[,\s)]/g, ""));
    return Number.isFinite(n) ? { value: String(Math.round(n * 100) / 100) } : { error: `«${t}» no es un monto` };
  }
  if (col.type === "date") {
    let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    let y; let mo; let d;
    if (m) { [, y, mo, d] = m; } else {
      m = t.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
      if (!m) return { error: `«${t}» no es una fecha (dd/mm/aaaa)` };
      [, d, mo, y] = m;
      if (!y) y = String(new Date().getFullYear());
      if (y.length === 2) y = `20${y}`;
    }
    const date = new Date(Number(y), Number(mo) - 1, Number(d));
    if (date.getDate() !== Number(d) || date.getMonth() !== Number(mo) - 1) return { error: `«${t}» no es una fecha válida` };
    return { value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` };
  }
  return { value: t };
};

/** true si el valor nuevo es el mismo que ya se ve en la celda. */
export const sameAsCell = (col, row, value) => {
  const cur = col.get(row);
  if (col.type === "bool") return Boolean(cur) === Boolean(value);
  if (col.type === "money") {
    const a = cur === null || cur === undefined || cur === "" ? "" : num(cur).toFixed(2);
    const b = value === "" ? "" : num(value).toFixed(2);
    return a === b;
  }
  if (col.type === "date") return String(cur || "").slice(0, 10) === value;
  return fold(String(cur ?? "")).trim() === fold(value).trim() || fold(cellText(col, row)).trim() === fold(value).trim();
};

/** Clave de filtro de la celda (el texto que se ve; vacío aparte). */
const filterKey = (col, row) => {
  const t = cellText(col, row).trim();
  return t === "" ? EMPTY_KEY : t;
};

/** Aplica filtros de columna y orden a las filas. */
export const applyColumnFilters = (rows, columns, filters, sort) => {
  const active = columns.filter((c) => filters[c.id]);
  let out = active.length === 0 ? rows : rows.filter((r) => active.every((c) => filters[c.id].includes(filterKey(c, r))));
  if (sort) {
    const col = columns.find((c) => c.id === sort.id);
    if (col) {
      const key = (r) => {
        const v = col.get(r);
        if (col.type === "money") return v === null || v === undefined || v === "" ? -Infinity : num(v);
        if (col.type === "bool") return v ? 1 : 0;
        if (col.type === "date") return String(v || "");
        return fold(cellText(col, r));
      };
      const dir = sort.dir === "desc" ? -1 : 1;
      out = [...out].sort((a, b) => {
        const x = key(a);
        const y = key(b);
        if (x < y) return -dir;
        if (x > y) return dir;
        return 0;
      });
    }
  }
  return out;
};

// ───────── filtro de columna (autofiltro) ─────────

function FilterMenu({ col, rows, allowed, sort, anchor, onApply, onSort, onClose }) {
  const ref = useRef(null);
  const searchRef = useRef(null);
  const [search, setSearch] = useState("");
  const values = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      const k = filterKey(col, r);
      const e = map.get(k);
      if (e) e.count += 1;
      else map.set(k, { key: k, label: k === EMPTY_KEY ? "(Vacías)" : k, count: 1, sortKey: col.type === "money" ? num(col.get(r)) : col.type === "date" ? String(col.get(r) || "") : fold(k) });
    });
    return Array.from(map.values()).sort((a, b) => {
      if (a.key === EMPTY_KEY) return 1;
      if (b.key === EMPTY_KEY) return -1;
      return a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0;
    });
  }, [col, rows]);
  const [checked, setChecked] = useState(() => new Set(allowed || values.map((v) => v.key)));
  const shown = useMemo(() => {
    const q = fold(search).trim();
    return q ? values.filter((v) => fold(v.label).includes(q)) : values;
  }, [values, search]);
  const allShownOn = shown.length > 0 && shown.every((v) => checked.has(v.key));

  useEffect(() => { searchRef.current?.focus(); }, []);
  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const toggle = (key) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleShown = () => setChecked((prev) => {
    const next = new Set(prev);
    shown.forEach((v) => (allShownOn ? next.delete(v.key) : next.add(v.key)));
    return next;
  });
  const apply = () => {
    // Con búsqueda escrita, como Excel: quedan solo los valores que coinciden y están marcados.
    const keys = (search.trim() ? shown : values).filter((v) => checked.has(v.key)).map((v) => v.key);
    onApply(keys.length === values.length ? null : keys);
  };

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "Enter" && e.target.type !== "checkbox" && e.target.tagName !== "BUTTON") { e.preventDefault(); apply(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const items = Array.from(ref.current.querySelectorAll("input, button"));
      const i = items.indexOf(document.activeElement);
      const next = items[i + (e.key === "ArrowDown" ? 1 : -1)];
      if (next) { e.preventDefault(); next.focus(); }
    }
  };

  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - 300));
  const top = Math.min(anchor.bottom + 4, window.innerHeight - 380);
  return ReactDOM.createPortal(
    <div className="ol-fmenu" ref={ref} style={{ left, top }} role="dialog" aria-label={`Filtro de ${col.label}`} onKeyDown={onKeyDown}>
      <button type="button" className={`it${sort?.id === col.id && sort.dir === "asc" ? " on" : ""}`} onClick={() => onSort("asc")}>
        {col.type === "money" ? "Ordenar de menor a mayor" : col.type === "date" ? "Ordenar del más antiguo al más reciente" : "Ordenar de A a Z"}
      </button>
      <button type="button" className={`it${sort?.id === col.id && sort.dir === "desc" ? " on" : ""}`} onClick={() => onSort("desc")}>
        {col.type === "money" ? "Ordenar de mayor a menor" : col.type === "date" ? "Ordenar del más reciente al más antiguo" : "Ordenar de Z a A"}
      </button>
      {sort?.id === col.id && <button type="button" className="it" onClick={() => onSort(null)}>Quitar orden</button>}
      <button type="button" className="it" disabled={!allowed} onClick={() => onApply(null)}>Borrar filtro de «{col.label}»</button>
      <div className="sep" />
      <input ref={searchRef} className="ol-input srch" type="search" placeholder="Buscar" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="vals">
        <label className="ol-check"><input type="checkbox" checked={allShownOn} onChange={toggleShown} />
          {search.trim() ? "(Seleccionar todos los resultados)" : "(Seleccionar todo)"}
        </label>
        {shown.slice(0, 1500).map((v) => (
          <label key={v.key} className="ol-check">
            <input type="checkbox" checked={checked.has(v.key)} onChange={() => toggle(v.key)} />
            <span className="lbl">{v.label}</span><span className="cnt">{v.count}</span>
          </label>
        ))}
        {shown.length > 1500 && <div className="ol-note">… {shown.length - 1500} más: afine la búsqueda.</div>}
      </div>
      <div className="foot">
        <button type="button" className="ol-btn primary sm" onClick={apply}>Aceptar</button>
        <button type="button" className="ol-btn quiet sm" onClick={onClose}>Cancelar</button>
      </div>
    </div>,
    document.body,
  );
}

// ───────── celda en edición ─────────

function CellEditor({ col, initial, mode, onDone }) {
  const ref = useRef(null);
  const doneRef = useRef(false);
  const [draft, setDraft] = useState(initial);
  const finish = (value, where) => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone(value, where);
  };
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);
  const onKeyDown = (e) => {
    const k = e.key;
    if (k === "Escape") { e.preventDefault(); finish(null, null); return; }
    if (k === "Enter") {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) { finish(draft, "fill"); return; }
      if (e.altKey) return;
      finish(draft, e.shiftKey ? "up" : "down");
      return;
    }
    if (k === "Tab") { e.preventDefault(); finish(draft, e.shiftKey ? "left" : "right"); return; }
    // Modo «Introducir» (se empezó escribiendo encima): las flechas guardan y se mueven, como en Excel.
    if (mode === "replace" && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k) && !e.shiftKey) {
      e.preventDefault();
      finish(draft, { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" }[k]);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k === ";") {
      e.preventDefault();
      const d = new Date();
      setDraft(`${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`);
    }
    e.stopPropagation();
  };
  return (
    <input
      ref={ref}
      className={`ol-editor${col.type === "money" ? " num" : ""}`}
      value={draft}
      list={col.list}
      inputMode={col.type === "money" ? "decimal" : undefined}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(draft, "blur")}
      aria-label={col.label}
    />
  );
}

// ───────── fila ─────────

const widthStyle = (w) => ({ width: w, minWidth: w, maxWidth: w });

const GridRow = React.memo(function GridRow({
  row, n, r, columns, widths, canEdit: canEditSheet, states, selC1, selC2, ac, editing, onEditDone,
  canLock, canUnlock, checked, onCheck, onToggleLock, lockTitle, rowTone, carrierKey,
}) {
  const locked = Boolean(row.locked);
  const canEdit = canEditSheet && !locked;
  const tone = rowTone(row);
  return (
    <tr className={`t-${carrierKey(row)}${tone ? ` s-${tone}` : ""}${locked ? " is-locked" : ""}${checked ? " is-selected" : ""}`}>
      <td className="stick c0 rowno" data-rowhead={r}>
        <span className="ol-rowtools">
          {canLock && (
            <input type="checkbox" tabIndex={-1} checked={checked} onChange={(e) => onCheck(row.id, e.target.checked)} aria-label={`Marcar línea ${n}`} />
          )}
          {(locked || canLock) && (
            <button type="button" tabIndex={-1} className={`ol-lockbtn${locked ? " is-on" : ""}`} disabled={locked ? !canUnlock : !canLock}
              title={locked && !canUnlock ? `${lockTitle(row)} · solo un administrador puede desbloquearla` : lockTitle(row)}
              aria-label={locked ? "Línea bloqueada" : "Bloquear línea"} aria-pressed={locked} onClick={() => onToggleLock(row)}>🔒</button>
          )}
          <span>{n}</span>
        </span>
      </td>
      {columns.map((col, c) => {
        const inSel = c >= selC1 && c <= selC2;
        const isActive = ac === c;
        const editable = Boolean(col.field) && canEdit;
        const state = col.field ? states?.[col.field] : null;
        const sys = col.sys ? col.sys(row) : false;
        const original = col.orig && row.saleOriginal && Object.prototype.hasOwnProperty.call(row.saleOriginal, col.orig)
          ? colValueText(col, row.saleOriginal[col.orig]) : null;
        const cls = [
          c === 0 ? "stick c1" : "",
          col.kind,
          col.field ? "ed" : "",
          editable ? "" : (col.field ? "ro" : ""),
          col.num || col.type === "money" ? "num" : "",
          col.strong ? "strong" : "",
          col.center || col.type === "bool" ? "center" : "",
          sys ? "sys" : "",
          original !== null ? "ov" : "",
          col.need && editable && col.need(row) ? "empty-need" : "",
          state ? `is-${state.status}` : "",
          inSel ? "in-sel" : "",
          isActive ? "is-active" : "",
        ].filter(Boolean).join(" ");
        let title;
        if (state?.status === "err") title = state.message;
        else if (original !== null) title = `En la venta: ${original || "(vacío)"}`;
        else if (sys) title = "Dato de la venta: escriba encima para corregirlo en el libro";
        let content;
        if (editing && editing.c === c) {
          content = <CellEditor col={col} initial={editing.initial} mode={editing.mode} onDone={onEditDone} />;
        } else if (col.type === "bool") {
          content = <span className={`ol-tick${col.get(row) ? " on" : ""}`} aria-label={col.get(row) ? "Sí" : "No"}>{col.get(row) ? "✓" : ""}</span>;
        } else {
          content = col.render ? col.render(row) : cellText(col, row);
        }
        return (
          <td key={col.id} data-r={r} data-c={c} className={cls} style={widthStyle(widths[col.id])} title={title}>
            {content}
          </td>
        );
      })}
    </tr>
  );
});

// ───────── encabezado ─────────

const MIN_WIDTH = 44;
const MAX_WIDTH = 640;

function HeadCell({ col, c, width, onResize, filtered, sorted, onOpenFilter, onSelectColumn, className }) {
  // data-hc: Alt+↓ busca aquí el botón de filtro de la columna activa
  const startDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const onMove = (ev) => onResize(col.id, Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width + ev.clientX - startX)));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.classList.remove("ol-resizing");
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.classList.add("ol-resizing");
  };
  return (
    <th className={className} style={widthStyle(width)} title={col.title || col.label} data-hc={c}>
      <span className="lbl" onMouseDown={(e) => { e.preventDefault(); onSelectColumn(c, e.shiftKey); }}>{col.label}</span>
      <button type="button" tabIndex={-1} className={`ol-fbtn${filtered || sorted ? " on" : ""}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => onOpenFilter(col.id, e.currentTarget.getBoundingClientRect())}
        title={`Filtrar u ordenar «${col.label}» (Alt+↓)`} aria-label={`Filtro de ${col.label}`}>
        {filtered ? "⧩" : sorted ? (sorted === "asc" ? "↑" : "↓") : "▾"}
      </button>
      <span className="ol-resize" onMouseDown={startDrag} onDoubleClick={() => onResize(col.id, null)}
        role="separator" aria-orientation="vertical" aria-label={`Ancho de ${col.label}`} title="Arrastre para cambiar el ancho · doble clic: ancho original" />
    </th>
  );
}

// ───────── hoja ─────────

/**
 * Props: columns (la primera es Cliente, fija), rows (página actual ya filtrada), filterRows(colId) → filas para la lista
 * del filtro, filters, sort, onFilter, onSort, onChanges([{row, col, value}], meta), onUndo, onRedo, onMessage, …
 */
export default function LedgerGrid({
  columns, rows, lineNumber, widths, onResize, canEdit, cellStates, totals, count, wrap,
  filters, sort, onFilter, onSort, filterRows, onChanges, onUndo, onRedo, onMessage, onSheetKey,
  canLock, canUnlock, checkedIds, onCheck, onCheckAll, allChecked, onToggleLock, lockTitle, rowTone, carrierKey,
  groupLabels,
}) {
  const wrapRef = useRef(null);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [anchor, setAnchor] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState(null);
  const [filterOpen, setFilterOpen] = useState(null);
  const dragRef = useRef(false);

  const maxR = rows.length - 1;
  const maxC = columns.length - 1;

  // Si cambian las filas o columnas, la celda activa queda dentro de la hoja.
  useEffect(() => {
    setActive((a) => ({ r: Math.max(0, Math.min(a.r, maxR)), c: Math.max(0, Math.min(a.c, maxC)) }));
    setAnchor((a) => ({ r: Math.max(0, Math.min(a.r, maxR)), c: Math.max(0, Math.min(a.c, maxC)) }));
  }, [maxR, maxC]);

  const range = useMemo(() => ({
    r1: Math.min(active.r, anchor.r), r2: Math.max(active.r, anchor.r),
    c1: Math.min(active.c, anchor.c), c2: Math.max(active.c, anchor.c),
  }), [active, anchor]);

  const focusGrid = useCallback(() => wrapRef.current?.focus({ preventScroll: true }), []);

  // La celda activa siempre a la vista (los márgenes de desplazamiento evitan que quede bajo lo fijo).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !wrap.contains(document.activeElement)) return;
    const td = wrap.querySelector(`td[data-r="${active.r}"][data-c="${active.c}"]`);
    if (td) td.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  const move = useCallback((r, c, extend) => {
    const nr = Math.max(0, Math.min(r, maxR));
    const nc = Math.max(0, Math.min(c, maxC));
    setActive({ r: nr, c: nc });
    if (!extend) setAnchor({ r: nr, c: nc });
  }, [maxR, maxC]);

  // ── edición ──
  const cellEditable = useCallback((r, c) => {
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) return false;
    return Boolean(col.field) && canEdit && !row.locked;
  }, [columns, rows, canEdit]);

  const explainReadOnly = useCallback((r, c) => {
    const col = columns[c];
    const row = rows[r];
    if (!col || !row) return;
    if (!canEdit) onMessage("Solo lectura: no tiene permiso para editar el libro.");
    else if (row.locked) onMessage("Esta línea está bloqueada: ya no se modifica.");
    else if (!col.field) onMessage(`«${col.label}» es dato de la venta y no se edita aquí.`);
  }, [columns, rows, canEdit, onMessage]);

  const startEdit = useCallback((mode, text) => {
    const { r, c } = active;
    if (!cellEditable(r, c)) { explainReadOnly(r, c); return; }
    const col = columns[c];
    if (col.type === "bool") return;
    const row = rows[r];
    let initial = text;
    if (mode === "edit") {
      const v = col.get(row);
      initial = col.type === "money" ? (v === null || v === undefined || v === "" ? "" : String(num(v))) : cellText(col, row);
    }
    setEditing({ r, c, initial, mode });
  }, [active, cellEditable, explainReadOnly, columns, rows]);

  /** Junta cambios de varias celdas (solo editables y que de verdad cambian). */
  const collect = useCallback((cells) => {
    const out = [];
    let skipped = 0;
    let bad = "";
    cells.forEach(({ r, c, raw, parsed }) => {
      const row = rows[r];
      const col = columns[c];
      if (!row || !col) return;
      if (!col.field || !canEdit || row.locked) { if (col.field || raw !== "") skipped += 1; return; }
      const p = parsed || parseInput(col, raw);
      if (p.error) { bad = bad || `${col.label}: ${p.error}`; return; }
      // Vaciar una celda que muestra el dato de la venta no cambia nada.
      if (p.value === "" && col.sys && col.sys(row)) return;
      if (sameAsCell(col, row, p.value)) return;
      out.push({ row, col, value: p.value });
    });
    if (bad) onMessage(bad);
    else if (skipped > 0) onMessage(`${skipped} ${skipped === 1 ? "celda no se cambió" : "celdas no se cambiaron"}: son de la venta o la línea está bloqueada.`);
    return out;
  }, [rows, columns, canEdit, onMessage]);

  const rangeCells = useCallback((fn) => {
    const cells = [];
    for (let r = range.r1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) cells.push(fn(r, c));
    }
    return cells;
  }, [range]);

  const onEditDone = useCallback((draft, where) => {
    const ed = editing;
    setEditing(null);
    if (!ed) return;
    if (draft !== null) {
      const col = columns[ed.c];
      const parsed = parseInput(col, draft);
      if (parsed.error) {
        onMessage(`${col.label}: ${parsed.error}`);
      } else if (where === "fill") {
        // Ctrl+Enter: lo mismo en todas las celdas del rango (como Excel).
        const changes = collect(rangeCells((r, c) => ({ r, c, raw: draft })));
        if (changes.length) onChanges(changes);
      } else {
        const changes = collect([{ r: ed.r, c: ed.c, raw: draft, parsed }]);
        if (changes.length) onChanges(changes);
      }
    }
    if (where && where !== "blur") {
      const d = { down: [1, 0], up: [-1, 0], left: [0, -1], right: [0, 1] }[where];
      if (d) move(ed.r + d[0], ed.c + d[1], false);
      focusGrid();
    } else if (draft === null) {
      focusGrid();
    }
  }, [editing, columns, collect, rangeCells, onChanges, onMessage, move, focusGrid]);

  // ── portapapeles ──
  useEffect(() => {
    const inGrid = () => wrapRef.current && wrapRef.current === document.activeElement;
    const onCopy = (e, cut) => {
      if (!inGrid() || editing) return;
      const lines = [];
      for (let r = range.r1; r <= range.r2; r += 1) {
        const cells = [];
        for (let c = range.c1; c <= range.c2; c += 1) cells.push(copyText(columns[c], rows[r]));
        lines.push(cells.join("\t"));
      }
      e.clipboardData.setData("text/plain", lines.join("\r\n"));
      e.preventDefault();
      const n = (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1);
      if (cut) {
        const changes = collect(rangeCells((r, c) => ({ r, c, raw: "" })));
        if (changes.length) onChanges(changes);
      }
      onMessage(`${n} ${n === 1 ? "celda copiada" : "celdas copiadas"}${cut ? " y vaciadas" : ""}.`);
    };
    const onPaste = (e) => {
      if (!inGrid() || editing) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      e.preventDefault();
      const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n").map((l) => l.split("\t"));
      const cells = [];
      const single = lines.length === 1 && lines[0].length === 1;
      if (single) {
        // Un solo valor sobre un rango: llena todo el rango (como Excel).
        cells.push(...rangeCells((r, c) => ({ r, c, raw: lines[0][0] })));
      } else {
        lines.forEach((vals, i) => vals.forEach((v, j) => {
          const r = range.r1 + i;
          const c = range.c1 + j;
          if (r <= maxR && c <= maxC) cells.push({ r, c, raw: v.replace(/^"([\s\S]*)"$/, "$1").replace(/""/g, '"') });
        }));
      }
      const changes = collect(cells);
      if (changes.length) onChanges(changes, { label: "pegar" });
      if (!single) {
        setAnchor({ r: range.r1, c: range.c1 });
        setActive({ r: Math.min(maxR, range.r1 + lines.length - 1), c: Math.min(maxC, range.c1 + Math.max(...lines.map((l) => l.length)) - 1) });
      }
    };
    const copy = (e) => onCopy(e, false);
    const cut = (e) => onCopy(e, true);
    document.addEventListener("copy", copy);
    document.addEventListener("cut", cut);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("copy", copy);
      document.removeEventListener("cut", cut);
      document.removeEventListener("paste", onPaste);
    };
  }, [range, rows, columns, editing, collect, rangeCells, onChanges, onMessage, maxR, maxC]);

  // ── teclado ──
  const pageRows = () => Math.max(1, Math.floor((wrapRef.current?.clientHeight || 400) / ROW_H) - 3);

  const onKeyDown = (e) => {
    if (editing || e.target !== wrapRef.current) return;
    const ctrl = e.ctrlKey || e.metaKey;
    const { r, c } = active;
    const k = e.key;
    const done = () => { e.preventDefault(); e.stopPropagation(); };

    if (ctrl && (k === "PageDown" || k === "PageUp")) { done(); onSheetKey(k === "PageDown" ? 1 : -1); return; }
    if (e.altKey && k === "ArrowDown") {
      done();
      const th = wrapRef.current.querySelector(`thead tr.h th[data-hc="${c}"] .ol-fbtn`);
      if (th) setFilterOpen({ id: columns[c].id, rect: th.getBoundingClientRect() });
      return;
    }
    if (ctrl && e.shiftKey && (k === "L" || k === "l")) { done(); onFilter(null, null); onMessage("Filtros de columna quitados."); return; }
    switch (k) {
      case "ArrowDown": done(); move(ctrl ? maxR : r + 1, c, e.shiftKey); return;
      case "ArrowUp": done(); move(ctrl ? 0 : r - 1, c, e.shiftKey); return;
      case "ArrowRight": done(); move(r, ctrl ? maxC : c + 1, e.shiftKey); return;
      case "ArrowLeft": done(); move(r, ctrl ? 0 : c - 1, e.shiftKey); return;
      case "Home": done(); move(ctrl ? 0 : r, 0, e.shiftKey); return;
      case "End": done(); move(ctrl ? maxR : r, maxC, e.shiftKey); return;
      case "PageDown": if (e.altKey) return; done(); move(r + pageRows(), c, e.shiftKey); return;
      case "PageUp": if (e.altKey) return; done(); move(r - pageRows(), c, e.shiftKey); return;
      case "Tab": done(); move(r, c + (e.shiftKey ? -1 : 1), false); return;
      case "Enter":
        done();
        if (columns[c]?.type === "bool" && !e.shiftKey && cellEditable(r, c)) { toggleBool(); return; }
        move(r + (e.shiftKey ? -1 : 1), c, false);
        return;
      case "F2": done(); startEdit("edit"); return;
      case "Escape": done(); setAnchor(active); return;
      case "Delete": {
        done();
        const changes = collect(rangeCells((rr, cc) => ({ r: rr, c: cc, raw: "" })));
        if (changes.length) onChanges(changes, { label: "vaciar" });
        return;
      }
      case "Backspace": done(); if (columns[c]?.type !== "bool") startEdit("replace", ""); return;
      default: break;
    }
    if (ctrl && !e.altKey) {
      const key = k.toLowerCase();
      if (key === "z" && !e.shiftKey) { done(); onUndo(); return; }
      if (key === "y" || (key === "z" && e.shiftKey)) { done(); onRedo(); return; }
      if (key === "a") { done(); setAnchor({ r: 0, c: 0 }); setActive({ r: maxR, c: maxC }); return; }
      if (key === "d") { done(); fillDown(); return; }
      if (key === ";") {
        done();
        if (columns[c]?.type === "date") {
          const d = new Date();
          const changes = collect(rangeCells((rr, cc) => ({ r: rr, c: cc, raw: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` })));
          if (changes.length) onChanges(changes);
        }
        return;
      }
      if (k === " ") { done(); setAnchor({ r: 0, c }); setActive({ r: maxR, c }); return; }
      return; // Ctrl+C / Ctrl+V / Ctrl+X van por los eventos del portapapeles
    }
    if (e.shiftKey && k === " ") { done(); setAnchor({ r, c: 0 }); setActive({ r, c: maxC }); return; }
    if (k === " " && columns[c]?.type === "bool") { done(); toggleBool(); return; }
    if (k.length === 1 && !e.altKey) {
      done();
      if (columns[c]?.type === "bool") { toggleBool(); return; }
      startEdit("replace", k);
    }
  };

  const toggleBool = () => {
    const col = columns[active.c];
    const row = rows[active.r];
    const next = !col.get(row);
    // Solo las casillas del rango: el resto de columnas no se toca.
    const changes = collect(rangeCells((r, c) => ({ r, c, raw: "", parsed: { value: next } }))
      .filter((cell) => columns[cell.c]?.type === "bool"));
    if (changes.length) onChanges(changes);
  };

  /** Ctrl+D: con rango, copia la primera fila al resto; con una celda, copia la de arriba. */
  const fillDown = () => {
    const top = range.r1 === range.r2 ? range.r1 - 1 : range.r1;
    if (top < 0) return;
    const cells = [];
    for (let r = top + 1; r <= range.r2; r += 1) {
      for (let c = range.c1; c <= range.c2; c += 1) {
        const col = columns[c];
        const v = col.get(rows[top]);
        cells.push({ r, c, raw: "", parsed: { value: col.type === "bool" ? Boolean(v) : v === null || v === undefined ? "" : String(v) } });
      }
    }
    const changes = collect(cells);
    if (changes.length) onChanges(changes, { label: "rellenar" });
  };

  // ── ratón ──
  const cellFromEvent = (e) => {
    const td = e.target.closest("td[data-r]");
    return td ? { r: Number(td.dataset.r), c: Number(td.dataset.c) } : null;
  };
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    const head = e.target.closest("td[data-rowhead]");
    if (head && !e.target.closest("input, button")) {
      e.preventDefault();
      const r = Number(head.dataset.rowhead);
      if (e.shiftKey) { setActive({ r, c: maxC }); } else { setAnchor({ r, c: 0 }); setActive({ r, c: maxC }); }
      focusGrid();
      return;
    }
    const cell = cellFromEvent(e);
    if (!cell || e.target.closest(".ol-editor")) return;
    e.preventDefault();
    move(cell.r, cell.c, e.shiftKey);
    dragRef.current = true;
    focusGrid();
  };
  const onMouseOver = (e) => {
    if (!dragRef.current) return;
    const cell = cellFromEvent(e);
    if (cell) setActive(cell);
  };
  useEffect(() => {
    const up = () => { dragRef.current = false; };
    document.addEventListener("mouseup", up);
    return () => document.removeEventListener("mouseup", up);
  }, []);
  const onDoubleClick = (e) => {
    const cell = cellFromEvent(e);
    if (!cell) return;
    if (columns[cell.c]?.type === "bool") return;
    startEdit("edit");
  };

  const selectColumn = (c, extend) => {
    if (extend) { setActive({ r: maxR, c }); } else { setAnchor({ r: 0, c }); setActive({ r: maxR, c }); }
    focusGrid();
  };

  // ── barra de fórmulas y barra de estado ──
  const activeCol = columns[active.c];
  const activeRow = rows[active.r];
  const formula = activeCol && activeRow ? cellText(activeCol, activeRow) : "";
  const formulaOrig = activeCol?.orig && activeRow?.saleOriginal && Object.prototype.hasOwnProperty.call(activeRow.saleOriginal, activeCol.orig)
    ? colValueText(activeCol, activeRow.saleOriginal[activeCol.orig]) : null;

  const stats = useMemo(() => {
    let sum = 0;
    let numeric = 0;
    let filled = 0;
    for (let r = range.r1; r <= range.r2; r += 1) {
      const row = rows[r];
      if (!row) continue;
      for (let c = range.c1; c <= range.c2; c += 1) {
        const col = columns[c];
        if (!col) continue;
        const v = col.get(row);
        if (col.type === "money") {
          if (v !== null && v !== undefined && v !== "") { sum += num(v); numeric += 1; filled += 1; }
        } else if (cellText(col, row).trim() !== "") filled += 1;
      }
    }
    return { sum, numeric, filled, cells: (range.r2 - range.r1 + 1) * (range.c2 - range.c1 + 1) };
  }, [range, rows, columns]);

  const groups = useMemo(() => {
    const out = [];
    columns.forEach((col, i) => {
      if (i === 0) return;
      const g = col.kind === "lock" ? "lock" : "edit";
      const last = out[out.length - 1];
      if (last && last.g === g) last.span += 1; else out.push({ g, span: 1 });
    });
    return out;
  }, [columns]);

  const stickW = 92 + (widths[columns[0]?.id] || 190);
  const filterCol = filterOpen ? columns.find((c) => c.id === filterOpen.id) : null;

  return (
    <>
      <div className="ol-fx" aria-live="polite">
        <span className="ref">{activeCol ? `${activeCol.label} · No. ${activeRow ? lineNumber.get(activeRow.id) : ""}` : ""}</span>
        <span className="fx">fx</span>
        <span className="val" title={formula}>{formula}</span>
        {formulaOrig !== null && <span className="orig">En la venta: <b>{formulaOrig || "(vacío)"}</b> · Supr para volver a ese dato</span>}
        {activeCol && !activeCol.field && <span className="ro-tag">🔒 de la venta</span>}
        {activeRow?.locked && <span className="ro-tag">🔒 línea bloqueada</span>}
      </div>
      <div className="ol-sheet-wrap ol-grid" ref={wrapRef} tabIndex={0} onKeyDown={onKeyDown} onMouseDown={onMouseDown}
        onMouseOver={onMouseOver} onDoubleClick={onDoubleClick} role="grid" aria-rowcount={rows.length} aria-colcount={columns.length}
        aria-label="Hoja del libro: flechas para moverse, escriba para editar" style={{ "--stick-w": `${stickW}px` }}>
        <table className={`ol-sheet${wrap ? " is-wrap" : ""}`}>
          <thead>
            <tr className="g">
              <th className="g-lock stick c0" />
              <th className="g-lock stick c1" style={widthStyle(widths[columns[0].id])}>{groupLabels.name}</th>
              {groups.map((g, i) => (
                <th key={i} className={g.g === "lock" ? "g-lock" : "g-edit"} colSpan={g.span}>
                  {g.span > 1 ? (g.g === "lock" ? groupLabels.lock : groupLabels.edit) : ""}
                </th>
              ))}
            </tr>
            <tr className="h">
              <th className="stick c0 num">
                <span className="ol-rowtools">
                  {canLock && (
                    <input type="checkbox" tabIndex={-1} checked={allChecked} onChange={(e) => onCheckAll(e.target.checked)}
                      aria-label="Marcar todas las ventas del filtro" title="Marcar todas las ventas del filtro (para bloquear)" />
                  )}
                  <span>No.</span>
                </span>
              </th>
              {columns.map((col, c) => (
                <HeadCell key={col.id} col={col} c={c} width={widths[col.id]} onResize={onResize}
                  filtered={Boolean(filters[col.id])} sorted={sort?.id === col.id ? sort.dir : null}
                  onOpenFilter={(id, rect) => setFilterOpen({ id, rect })} onSelectColumn={selectColumn}
                  className={`${c === 0 ? "stick c1 " : ""}${col.type === "money" || col.num ? "num " : ""}${col.field ? "edit" : ""}${c >= range.c1 && c <= range.c2 ? " hl" : ""}`} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => {
              const inRows = r >= range.r1 && r <= range.r2;
              const isEditRow = editing && editing.r === r;
              return (
                <GridRow key={row.id} row={row} n={lineNumber.get(row.id)} r={r} columns={columns} widths={widths}
                  canEdit={canEdit} states={cellStates[row.id]}
                  selC1={inRows ? range.c1 : -1} selC2={inRows ? range.c2 : -2} ac={r === active.r ? active.c : -1}
                  editing={isEditRow ? editing : null} onEditDone={isEditRow ? onEditDone : null}
                  canLock={canLock} canUnlock={canUnlock} checked={checkedIds.has(row.id)} onCheck={onCheck}
                  onToggleLock={onToggleLock} lockTitle={lockTitle} rowTone={rowTone} carrierKey={carrierKey} />
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="stick c0" />
              <td className="stick c1" style={widthStyle(widths[columns[0].id])}>Totales ({count})</td>
              {columns.slice(1).map((col) => (
                <td key={col.id} className={col.type === "money" ? "num" : ""} style={widthStyle(widths[col.id])}>
                  {col.total ? formatMoney(totals[col.total]) : ""}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="ol-status">
        <span>{stats.cells > 1 ? `${range.r2 - range.r1 + 1} F × ${range.c2 - range.c1 + 1} C` : "Listo"}</span>
        <span className="end">
          {stats.numeric > 0 && <>Promedio: <b>{formatMoney(stats.sum / stats.numeric)}</b></>}
          {stats.cells > 1 && <>Recuento: <b>{stats.filled}</b></>}
          {stats.numeric > 0 && <>Suma: <b>{formatMoney(stats.sum)}</b></>}
        </span>
      </div>
      {filterCol && (
        <FilterMenu col={filterCol} rows={filterRows(filterCol.id)} allowed={filters[filterCol.id] || null} sort={sort}
          anchor={filterOpen.rect}
          onApply={(keys) => { onFilter(filterCol.id, keys); setFilterOpen(null); focusGrid(); }}
          onSort={(dir) => { onSort(dir ? { id: filterCol.id, dir } : null); setFilterOpen(null); focusGrid(); }}
          onClose={() => { setFilterOpen(null); focusGrid(); }} />
      )}
    </>
  );
}
