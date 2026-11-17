import React, { useState } from "react";
import { Table } from "reactstrap";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { DIRECTIONS, fmtDay, fmtMoney, fmtNum } from "utils/kardexModel";
import "./kardexDesign.css";

const isTransfer = (row) =>
  (row.type === "TRANSFER_IN" || row.type === "TRANSFER_OUT") && row.referenceId && row.referenceType === "TRANSFER";

/** Qué columnas llevan los datos: material, producto o archivo histórico. */
function columnPlan({ showItem, showValue }) {
  const plan = [
    { key: "date", label: "Fecha", width: showItem ? "11%" : "13%", sortable: true },
    { key: "move", label: "Movimiento", width: showItem ? "24%" : "36%" },
  ];
  if (showItem) plan.push({ key: "item", label: "Ítem", width: "21%" });
  plan.push(
    { key: "in", label: "Entra", width: "8%", numeric: true },
    { key: "out", label: "Sale", width: "8%", numeric: true },
    { key: "saldo", label: "Saldo", width: "10%", numeric: true }
  );
  if (showValue) plan.push({ key: "value", label: "Valor", width: showItem ? "11%" : "14%", numeric: true });
  plan.push({ key: "more", label: "", width: "4%" });
  return plan;
}

function QtyCell({ value, kind }) {
  if (!value) return <span className="kdx-zero">—</span>;
  return <span className={kind === "in" ? "kdx-in" : "kdx-out"}>{kind === "in" ? "+" : "−"}{fmtNum(value)}</span>;
}

function ItemCell({ row, itemKind, showName, showLocation }) {
  if (itemKind === "material") {
    return (
      <>
        <span className="kdx-main">{row.name || "—"}</span>
        <span className="kdx-sub">{[row.code, row.unit].filter(Boolean).join(" · ")}</span>
      </>
    );
  }
  const primary = showName ? row.name || "—" : row.color || row.code || "—";
  const secondary = [
    showName ? row.code : "",
    showName ? row.color : "",
    row.size ? `Talla ${row.size}` : "",
    showLocation ? (row.location ? `${row.location}${row.locationCode ? ` (${row.locationCode})` : ""}` : "") : "",
  ].filter(Boolean);
  return (
    <>
      <span className="kdx-main">{primary}</span>
      <span className="kdx-sub">{secondary.join(" · ")}</span>
    </>
  );
}

/**
 * Tabla del kardex: una fila por movimiento con Entra, Sale y Saldo, y los lotes FIFO al abrir la fila.
 * Las columnas son las mismas en materiales, producto y archivo histórico.
 */
function KardexTable({
  rows,
  sortDir = "desc",
  onToggleSort,
  showItem = true,
  itemKind = "product",
  showName = true,
  showLocation = false,
  showValue = true,
  onOpenTransfer,
  dim = false,
}) {
  const [open, setOpen] = useState({});
  const plan = columnPlan({ showItem, showValue });
  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className="kdx-table-wrap" style={dim ? { opacity: 0.55 } : undefined}>
      <Table className="kdx-table" hover={false}>
        <colgroup>
          {plan.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {plan.map((c) => (
              <th
                key={c.key}
                className={c.numeric ? "kdx-num" : ""}
                aria-sort={c.sortable ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
              >
                {c.sortable && onToggleSort ? (
                  <button type="button" onClick={onToggleSort} title="Cambiar el orden por fecha">
                    {c.label}
                    <span aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const dir = DIRECTIONS[row.direction];
            const hasLots = row.lots && row.lots.length > 0;
            const expanded = !!open[row.key];
            const detail = [row.description, row.fifo ? `FIFO: ${row.fifo}` : ""].filter(Boolean).join(" · ");
            return (
              <React.Fragment key={row.key}>
                <tr className="kdx-row">
                  <td className="text-nowrap">
                    <span className="kdx-main" style={{ fontWeight: 600 }}>{fmtDay(row.date)}</span>
                    <span className="kdx-sub">{formatDateTimeGt(row.date, { year: undefined, month: undefined, day: undefined })}</span>
                  </td>
                  <td>
                    <span className="kdx-dir" style={{ color: dir.color, background: dir.bg }}>
                      {row.typeLabel}
                    </span>
                    <span className="kdx-sub" title={detail}>
                      {row.reference && <span className="kdx-ref">{row.reference}</span>}
                      {row.reference && row.description ? " · " : ""}
                      {row.description}
                    </span>
                    {isTransfer(row) && onOpenTransfer && (
                      <button type="button" className="kdx-link" onClick={() => onOpenTransfer(row.referenceId)}>
                        Ver transferencia
                      </button>
                    )}
                    {row.archive && <span className="kdx-sub">Limpieza {row.archive}</span>}
                  </td>
                  {showItem && (
                    <td>
                      <ItemCell row={row} itemKind={itemKind} showName={showName} showLocation={showLocation} />
                    </td>
                  )}
                  <td className="kdx-num">
                    <QtyCell value={row.qtyIn} kind="in" />
                  </td>
                  <td className="kdx-num">
                    <QtyCell value={row.qtyOut} kind="out" />
                  </td>
                  <td className="kdx-num">
                    <span className="kdx-saldo">{row.after === null ? "—" : fmtNum(row.after)}</span>
                    {row.before !== null && <span className="kdx-sub">antes {fmtNum(row.before)}</span>}
                  </td>
                  {showValue && (
                    <td className="kdx-num">
                      {row.value ? (
                        <>
                          <span className="kdx-main">{fmtMoney(row.value)}</span>
                          {row.unitCost ? <span className="kdx-sub">{fmtMoney(row.unitCost)} c/u</span> : null}
                        </>
                      ) : (
                        <span className="kdx-zero">—</span>
                      )}
                    </td>
                  )}
                  <td className="text-center">
                    {hasLots && (
                      <button
                        type="button"
                        className="kdx-chevron"
                        aria-expanded={expanded}
                        aria-label={expanded ? "Ocultar lotes" : "Ver lotes que quedan"}
                        title={expanded ? "Ocultar lotes" : "Ver lotes que quedan (FIFO)"}
                        onClick={() => toggle(row.key)}
                      >
                        {expanded ? "▾" : "▸"}
                      </button>
                    )}
                  </td>
                </tr>
                {hasLots && expanded && (
                  <tr className="kdx-lots">
                    <td colSpan={plan.length}>
                      <h6>Lotes que quedan después de este movimiento (el más antiguo se consume primero)</h6>
                      <table>
                        <thead>
                          <tr>
                            <th>Entró el</th>
                            <th className="kdx-num">Cantidad</th>
                            <th className="kdx-num">Costo c/u</th>
                            <th className="kdx-num">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {row.lots.map((l, i) => (
                            <tr key={i}>
                              <td>{fmtDay(l.date)}</td>
                              <td className="kdx-num">{fmtNum(l.quantity)}</td>
                              <td className="kdx-num">{fmtMoney(l.unitCost)}</td>
                              <td className="kdx-num">{fmtMoney(l.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </Table>
    </div>
  );
}

export default KardexTable;
