import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MONTHS_ES, MONTHS_ES_SHORT } from "utils/financeFormat";
import { parsePasteBlock } from "utils/financeInput";
import { showWarning, showSuccess } from "utils/notificationHelper";
import { formatCellValue, editTextFor, parseFor } from "./costsModel";
import "./KioskCosts.css";

const INPUT_FILTER = /[^0-9.,\-Qq%\s()]/g;
let gridSeq = 0;

function StatusMark({ complete, hasData }) {
  if (complete) {
    return (
      <span className="kc-mark kc-mark-ok" title="Mes completo">
        <span aria-hidden="true">✓</span>
        <span className="sr-only">Completo</span>
      </span>
    );
  }
  if (hasData) {
    return (
      <span className="kc-mark kc-mark-warn" title="Mes incompleto: falta meta, tasas o algún costo">
        <span aria-hidden="true">!</span>
        <span className="sr-only">Incompleto</span>
      </span>
    );
  }
  return (
    <span className="kc-mark kc-mark-none" title="Sin datos">
      <span aria-hidden="true">·</span>
      <span className="sr-only">Sin datos</span>
    </span>
  );
}

/**
 * Grilla tipo Excel. Recibe un modelo (buildSiteGrid / buildMonthGrid) y notifica ediciones
 * como onEdit([{ ref: { siteId, month, field }, value }]). Teclado: flechas, Tab, Enter, F2, Esc,
 * Supr. Pegado de bloques TSV desde Excel.
 */
function CostGrid({ model, readOnly, onEdit, focusRequest, ariaLabel }) {
  const gridId = useMemo(() => {
    gridSeq += 1;
    return `kcg${gridSeq}`;
  }, []);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const [active, setActive] = useState({ r: 0, c: 0 });
  const [editing, setEditing] = useState(null); // { text }
  const editingRef = useRef(null);
  editingRef.current = editing;

  const { rows, cols, cellAt, rowCount, colCount } = model;

  const navRows = useMemo(
    () => rows.map((row, i) => (row.type === "section" ? -1 : i)).filter((i) => i >= 0),
    [rows]
  );

  // Ajusta la celda activa al cambiar de modelo (otra forma / kiosco)
  useEffect(() => {
    setActive((prev) => {
      let r = Math.min(prev.r, rowCount - 1);
      if (rows[r] && rows[r].type === "section") r = navRows[0] ?? 0;
      return { r: Math.max(r, 0), c: Math.min(prev.c, colCount - 1) };
    });
    setEditing(null);
  }, [rows, rowCount, colCount, navRows]);

  useEffect(() => {
    if (!focusRequest) return;
    const r = Math.min(focusRequest.r, rowCount - 1);
    const c = Math.min(focusRequest.c, colCount - 1);
    setActive({ r: rows[r] && rows[r].type === "section" ? navRows[0] ?? 0 : r, c });
    setEditing(null);
    if (wrapperRef.current) wrapperRef.current.focus({ preventScroll: true });
  }, [focusRequest]); // eslint-disable-line

  const cellId = (r, c) => `${gridId}-r${r}-c${c}`;

  useEffect(() => {
    const el = document.getElementById(cellId(active.r, active.c));
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]); // eslint-disable-line

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (editing.select) inputRef.current.select();
    }
  }, [editing && editing.started]); // eslint-disable-line

  const focusWrapper = () => {
    if (wrapperRef.current) wrapperRef.current.focus({ preventScroll: true });
  };

  const moveTo = useCallback(
    (dr, dc) => {
      setActive((prev) => {
        let r = prev.r;
        let c = prev.c;
        if (dr !== 0) {
          const pos = navRows.indexOf(r);
          const next = navRows[Math.max(0, Math.min(navRows.length - 1, pos + dr))];
          r = next === undefined ? r : next;
        }
        if (dc !== 0) c = Math.max(0, Math.min(colCount - 1, c + dc));
        return { r, c };
      });
    },
    [navRows, colCount]
  );

  const activeCell = () => cellAt(active.r, active.c);
  const isEditable = (cell) => !readOnly && cell && cell.ref && !cell.calc;

  const startEdit = (initialText, select) => {
    const cell = activeCell();
    if (!isEditable(cell)) return;
    const text = initialText !== undefined ? initialText : editTextFor(cell.kind, cell.value);
    setEditing({ text, select: !!select, started: Date.now() });
  };

  // Termina la edición (commit=true intenta guardar). Devuelve false si el valor es inválido.
  const finishEdit = (commit) => {
    const current = editingRef.current;
    if (!current) return true;
    const cell = activeCell();
    if (commit && cell && cell.ref) {
      const parsed = parseFor(cell.kind, current.text);
      if (!parsed.valid) {
        showWarning(
          cell.kind === "pct"
            ? "Porcentaje no válido. Escribe un valor entre 0 y 100."
            : "Monto no válido. Escribe un número mayor o igual a 0."
        );
        return false;
      }
      const same =
        (parsed.value === null && (cell.value === null || cell.value === undefined)) ||
        (parsed.value !== null && cell.value !== null && cell.value !== undefined && Math.abs(parsed.value - cell.value) < 1e-9);
      if (!same) onEdit([{ ref: cell.ref, value: parsed.value }]);
    }
    editingRef.current = null;
    setEditing(null);
    focusWrapper();
    return true;
  };

  const applyPasteText = (text) => {
    const matrix = parsePasteBlock(text);
    if (matrix.length === 0) return;
    const startRowPos = navRows.indexOf(active.r);
    const edits = [];
    let invalid = 0;
    let skipped = 0;
    let clipped = 0;
    matrix.forEach((line, i) => {
      const r = navRows[startRowPos + i];
      line.forEach((rawText, j) => {
        const c = active.c + j;
        if (r === undefined || c >= colCount) {
          clipped += 1;
          return;
        }
        const cell = cellAt(r, c);
        if (!isEditable(cell)) {
          skipped += 1;
          return;
        }
        const parsed = parseFor(cell.kind, rawText);
        if (!parsed.valid) {
          invalid += 1;
          return;
        }
        edits.push({ ref: cell.ref, value: parsed.value });
      });
    });
    if (edits.length > 0) {
      onEdit(edits);
      showSuccess(`${edits.length} celda${edits.length === 1 ? "" : "s"} pegada${edits.length === 1 ? "" : "s"}. Revisa y guarda.`);
    }
    const problems = [];
    if (invalid) problems.push(`${invalid} con valor no válido`);
    if (skipped) problems.push(`${skipped} en celdas no editables`);
    if (clipped) problems.push(`${clipped} fuera de la grilla`);
    if (problems.length) showWarning(`Se omitieron celdas: ${problems.join(", ")}.`);
  };

  const onWrapperKeyDown = (e) => {
    if (editingRef.current) return;
    const { key } = e;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const move = (dr, dc) => {
      e.preventDefault();
      moveTo(dr, dc);
    };
    switch (key) {
      case "ArrowUp":
        return move(-1, 0);
      case "ArrowDown":
        return move(1, 0);
      case "ArrowLeft":
        return move(0, -1);
      case "ArrowRight":
        return move(0, 1);
      case "Tab": {
        const atEnd = e.shiftKey ? active.c === 0 && active.r === navRows[0] : active.c === colCount - 1 && active.r === navRows[navRows.length - 1];
        if (atEnd) return undefined; // deja salir de la grilla
        e.preventDefault();
        if (e.shiftKey) {
          if (active.c === 0) {
            setActive({ r: navRows[Math.max(0, navRows.indexOf(active.r) - 1)], c: colCount - 1 });
          } else moveTo(0, -1);
        } else if (active.c === colCount - 1) {
          setActive({ r: navRows[Math.min(navRows.length - 1, navRows.indexOf(active.r) + 1)], c: 0 });
        } else moveTo(0, 1);
        return undefined;
      }
      case "Enter":
      case "F2":
        e.preventDefault();
        return startEdit(undefined, true);
      case "Delete":
      case "Backspace": {
        e.preventDefault();
        const cell = activeCell();
        if (isEditable(cell) && cell.value !== null && cell.value !== undefined) onEdit([{ ref: cell.ref, value: null }]);
        return undefined;
      }
      case "Home":
        return move(0, -colCount);
      case "End":
        return move(0, colCount);
      default:
        if (/^[0-9.,]$/.test(key)) {
          e.preventDefault();
          startEdit(key, false);
        }
        return undefined;
    }
  };

  const onInputKeyDown = (e) => {
    const { key } = e;
    e.stopPropagation();
    if (key === "Enter") {
      e.preventDefault();
      if (finishEdit(true)) moveTo(e.shiftKey ? -1 : 1, 0);
    } else if (key === "Tab") {
      e.preventDefault();
      if (finishEdit(true)) moveTo(0, e.shiftKey ? -1 : 1);
    } else if (key === "Escape") {
      e.preventDefault();
      finishEdit(false);
    } else if (key === "ArrowUp" || key === "ArrowDown") {
      e.preventDefault();
      if (finishEdit(true)) moveTo(key === "ArrowUp" ? -1 : 1, 0);
    }
  };

  const onPaste = (e) => {
    const text = e.clipboardData ? e.clipboardData.getData("text/plain") : "";
    if (!text) return;
    const multi = /[\t\n\r]/.test(text.replace(/[\r\n]+$/, ""));
    if (editingRef.current && !multi) return; // pegado normal dentro del input
    e.preventDefault();
    if (readOnly) {
      showWarning("No tienes permiso para editar costos.");
      return;
    }
    if (editingRef.current) {
      editingRef.current = null;
      setEditing(null);
    }
    applyPasteText(text);
  };

  const onCopy = (e) => {
    if (editingRef.current) return;
    const cell = activeCell();
    if (!cell || cell.value === null || cell.value === undefined) return;
    e.preventDefault();
    e.clipboardData.setData("text/plain", editTextFor(cell.kind, cell.value));
  };

  const colLabel = (col) => (col.month ? MONTHS_ES[col.month - 1] : col.label);

  const renderCell = (r, c) => {
    const row = rows[r];
    const col = cols[c];
    const cell = cellAt(r, c);
    const isActive = active.r === r && active.c === c;
    const display = cell ? formatCellValue(cell.kind, cell.value) : "";
    const editable = isEditable(cell);
    const classes = ["kc-cell"];
    if (cell && cell.calc) classes.push("kc-cell-calc");
    if (cell && cell.goalExternal) classes.push("kc-cell-external");
    if (cell && cell.dirty) classes.push("kc-cell-dirty");
    if (isActive) classes.push("kc-cell-active");
    if (!display) classes.push("kc-cell-empty");
    if (row.footer || row.type === "calc") classes.push("kc-cell-total");
    const label = `${row.label}, ${colLabel(col)}: ${display || "sin valor"}${cell && cell.dirty ? ", modificado sin guardar" : ""}`;

    return (
      <td
        key={col.id}
        id={cellId(r, c)}
        role="gridcell"
        aria-label={label}
        aria-selected={isActive}
        aria-readonly={!editable}
        title={
          cell && cell.goalExternal
            ? "Meta tomada de Metas de Kioskos (solo lectura aquí)"
            : undefined
        }
        className={classes.join(" ")}
        onMouseDown={(e) => {
          if (editingRef.current && isActive) return;
          if (editingRef.current && !finishEdit(true)) finishEdit(false);
          setActive({ r, c });
          e.preventDefault();
          focusWrapper();
        }}
        onDoubleClick={() => {
          setActive({ r, c });
          if (editable) setEditing({ text: editTextFor(cell.kind, cell.value), select: true, started: Date.now() });
        }}
      >
        {isActive && editing && editable ? (
          <input
            ref={inputRef}
            className="kc-input"
            aria-label={label}
            inputMode="decimal"
            autoComplete="off"
            value={editing.text}
            onChange={(e) => setEditing({ ...editing, text: e.target.value.replace(INPUT_FILTER, "") })}
            onKeyDown={onInputKeyDown}
            onBlur={() => {
              if (editingRef.current && !finishEdit(true)) finishEdit(false);
            }}
          />
        ) : (
          <span className="kc-cell-text">
            {display}
            {cell && cell.dirty ? <span className="sr-only"> (modificado)</span> : null}
          </span>
        )}
      </td>
    );
  };

  return (
    <div
      ref={wrapperRef}
      className="kc-scroll"
      role="grid"
      aria-label={ariaLabel}
      aria-readonly={readOnly}
      aria-rowcount={rowCount + 1}
      aria-colcount={colCount + 1}
      aria-activedescendant={cellId(active.r, active.c)}
      tabIndex={0}
      onKeyDown={onWrapperKeyDown}
      onPaste={onPaste}
      onCopy={onCopy}
    >
      <table className="kc-table" role="presentation">
        <thead>
          <tr role="row">
            <th className="kc-corner" role="columnheader" scope="col">
              {model.mode === "site" ? "Concepto" : "Kiosco"}
            </th>
            {cols.map((col) => (
              <th key={col.id} role="columnheader" scope="col" className={col.total ? "kc-col-total" : ""}>
                {col.month ? (
                  <span className="kc-colhead">
                    <span>{MONTHS_ES_SHORT[col.month - 1]}</span>
                    <StatusMark complete={col.complete} hasData={col.hasData} />
                  </span>
                ) : (
                  col.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) =>
            row.type === "section" ? (
              <tr key={row.id} role="row" className="kc-section">
                <th role="rowheader" colSpan={colCount + 1} scope="colgroup">
                  {row.label}
                </th>
              </tr>
            ) : (
              <tr key={row.id} role="row" className={row.footer || row.type === "calc" ? "kc-row-total" : ""}>
                <th role="rowheader" scope="row" className="kc-rowhead">
                  <span className="kc-rowlabel">
                    {row.label}
                    {row.status === "CLOSED" ? <em className="kc-closed"> (cerrado)</em> : null}
                  </span>
                  {model.mode === "month" && !row.footer ? (
                    <StatusMark complete={row.complete} hasData={row.hasData} />
                  ) : null}
                </th>
                {cols.map((col, c) => renderCell(r, c))}
              </tr>
            )
          )}
        </tbody>
      </table>
    </div>
  );
}

export default CostGrid;
