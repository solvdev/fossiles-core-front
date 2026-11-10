import React, { useMemo, useState } from "react";
import { formatDateGt } from "utils/dateTimeHelper";
import { Badge, Button, Card, CardBody, CustomInput, Spinner, Table } from "reactstrap";
import {
  CINCHO_WORK_STATUS,
  isRowDelivered,
  rowWorkStatus,
} from "utils/cinchoDayBoardHelper";

const FAMILY_COLORS = {
  OPL: "primary",
  OPCK: "info",
  OPC: "dark",
  OPCF: "warning",
  OPCM: "secondary",
};

function sortCinchoRows(rows) {
  return [...(rows || [])].sort((a, b) => {
    const o = String(a.orderCode || "").localeCompare(String(b.orderCode || ""));
    if (o !== 0) return o;
    const p = String(a.productCode || "").localeCompare(String(b.productCode || ""));
    if (p !== 0) return p;
    return String(a.colorName || "").localeCompare(String(b.colorName || ""));
  });
}

function rowBackground(workStatus, delivered) {
  if (delivered) return "rgba(40, 167, 69, 0.08)";
  if (workStatus === CINCHO_WORK_STATUS.IN_PROGRESS) return "#f0f8ff";
  if (workStatus === CINCHO_WORK_STATUS.COMPLETED) return "rgba(40, 167, 69, 0.05)";
  return undefined;
}

function CinchoWorkStatusActions({ workStatus, saving, onStatusChange }) {
  const commonStyle = { fontSize: "10px", padding: "1px 6px", height: "24px" };

  if (workStatus === CINCHO_WORK_STATUS.COMPLETED) {
    return <Badge color="success">Completado</Badge>;
  }

  if (workStatus === CINCHO_WORK_STATUS.PENDING) {
    return (
      <Button
        color="info"
        size="sm"
        style={commonStyle}
        disabled={saving}
        onClick={() => onStatusChange(CINCHO_WORK_STATUS.IN_PROGRESS)}
        title="Iniciar línea"
      >
        Iniciar
      </Button>
    );
  }

  if (workStatus === CINCHO_WORK_STATUS.IN_PROGRESS) {
    return (
      <div className="d-flex align-items-center flex-wrap" style={{ gap: 4 }}>
        <Button
          color="success"
          size="sm"
          style={commonStyle}
          disabled={saving}
          onClick={() => onStatusChange(CINCHO_WORK_STATUS.COMPLETED)}
          title="Marcar completado"
        >
          Completar
        </Button>
        <Button
          color="warning"
          outline
          size="sm"
          style={commonStyle}
          disabled={saving}
          onClick={() => onStatusChange(CINCHO_WORK_STATUS.PENDING)}
          title="Pausar (vuelve a pendiente)"
        >
          Pausar
        </Button>
      </div>
    );
  }

  return null;
}

/**
 * OP consolidada (OPC de Luis Felipe): las líneas de sus órdenes van juntas, bajo un bloque con
 * acciones para todo el bloque; cada línea sigue guardando su estado en su propia OP.
 *
 * @param groupByOrderId { [orderId]: { id, code, ... } } consolidadas activas
 * @returns {{ blocks: { group, orders: string[], rows }[], rest }}
 */
export function splitGroupRows(rows, groupByOrderId = {}) {
  const byGroup = new Map();
  const rest = [];
  (rows || []).forEach((r) => {
    const g = groupByOrderId[r.productionOrderId];
    if (!g) { rest.push(r); return; }
    if (!byGroup.has(g.id)) byGroup.set(g.id, { group: g, rows: [] });
    byGroup.get(g.id).rows.push(r);
  });
  const blocks = Array.from(byGroup.values())
    .map((b) => ({ ...b, orders: Array.from(new Set(b.rows.map((r) => r.orderCode))) }))
    .sort((a, b) => String(a.group.code).localeCompare(String(b.group.code)));
  return { blocks, rest };
}

/** Filas arrastradas agrupadas por OP, la más antigua primero. */
export function carriedByOrder(rows) {
  const map = new Map();
  (rows || []).filter((r) => r.carriedFrom).forEach((r) => {
    if (!map.has(r.productionOrderId)) {
      map.set(r.productionOrderId, {
        orderId: r.productionOrderId, orderCode: r.orderCode, family: r.family,
        customerName: r.customerName, carriedFrom: r.carriedFrom, rows: [], units: 0,
      });
    }
    const g = map.get(r.productionOrderId);
    g.rows.push(r);
    g.units += Number(r.totalQty) || 0;
  });
  return [...map.values()].sort((a, b) => String(a.carriedFrom).localeCompare(String(b.carriedFrom))
    || String(a.orderCode).localeCompare(String(b.orderCode)));
}

function GroupRow({ group, rows, orders, workDateYmd, deliveredMap, workStatusMap, onToggleDelivered, onWorkStatusChange }) {
  const [busy, setBusy] = useState(false);
  const statuses = rows.map((r) => rowWorkStatus(r, workStatusMap || {}));
  const allDone = statuses.every((s) => s === CINCHO_WORK_STATUS.COMPLETED);
  const anyRunning = statuses.some((s) => s === CINCHO_WORK_STATUS.IN_PROGRESS);
  const allDelivered = rows.every((r) => isRowDelivered(r, deliveredMap));
  const units = rows.reduce((s, r) => s + (Number(r.totalQty) || 0), 0);
  const commonStyle = { fontSize: "10px", padding: "1px 6px", height: "24px" };

  // Una línea a la vez: así cada OP guarda su estado y un fallo no deja el resto a medias sin aviso.
  const runAll = async (targets, fn) => {
    setBusy(true);
    try {
      for (const r of targets) {
        // eslint-disable-next-line no-await-in-loop
        await fn(r);
      }
    } finally {
      setBusy(false);
    }
  };
  const setStatus = (next) => runAll(
    rows.filter((r) => rowWorkStatus(r, workStatusMap || {}) !== next
      && rowWorkStatus(r, workStatusMap || {}) !== CINCHO_WORK_STATUS.COMPLETED),
    (r) => onWorkStatusChange(r, next)
  );

  return (
    <tr style={{ backgroundColor: "#f1ecfb" }}>
      <td className="align-middle"><Badge color="secondary" style={{ background: "#6f42c1" }}>LF</Badge></td>
      <td className="align-middle" colSpan={4}>
        <strong>OP consolidada {group.code}</strong>
        <span className="text-muted"> · {orders.join(", ")}</span>
      </td>
      <td className="align-middle text-right"><strong>{units}</strong></td>
      <td />
      <td className="align-middle">
        <div className="d-flex align-items-center flex-wrap" style={{ gap: 4 }}>
          {allDone ? <Badge color="success">Completado</Badge> : anyRunning ? (
            <Button color="success" size="sm" style={commonStyle} disabled={busy}
              onClick={() => setStatus(CINCHO_WORK_STATUS.COMPLETED)} title="Completar todas las líneas">
              Completar todo
            </Button>
          ) : (
            <Button color="info" size="sm" style={commonStyle} disabled={busy}
              onClick={() => setStatus(CINCHO_WORK_STATUS.IN_PROGRESS)} title="Iniciar todas las líneas">
              Iniciar todo
            </Button>
          )}
          {busy && <Spinner size="sm" />}
        </div>
      </td>
      <td className="align-middle">
        <CustomInput
          type="checkbox"
          id={`cincho-grp-${group.id}-${workDateYmd}`}
          label={allDelivered ? "Todo entregado" : "Entregar todo"}
          checked={allDelivered}
          disabled={busy}
          onChange={(e) => {
            const delivered = e.target.checked;
            runAll(rows.filter((r) => isRowDelivered(r, deliveredMap) !== delivered), (r) => onToggleDelivered(r, delivered));
          }}
          className="mb-0"
        />
      </td>
    </tr>
  );
}

function CinchosDayBoard({
  rows,
  groupByOrderId,
  workDateYmd,
  deliveredMap,
  workStatusMap,
  loading,
  savingKey,
  onToggleDelivered,
  onWorkStatusChange,
}) {
  // Las de días anteriores van aparte, agrupadas por OP; el cuadro del día queda como antes.
  const sortedRows = useMemo(() => sortCinchoRows((rows || []).filter((r) => !r.carriedFrom)), [rows]);
  const carried = useMemo(() => carriedByOrder(rows), [rows]);
  const [openCarried, setOpenCarried] = useState(() => new Set());
  const { blocks, rest } = useMemo(() => splitGroupRows(sortedRows, groupByOrderId), [sortedRows, groupByOrderId]);
  // Filas en orden de pantalla: cada consolidada con su encabezado y sus líneas, luego las sueltas.
  const items = useMemo(() => [
    ...blocks.flatMap((b) => [{ header: b }, ...b.rows.map((row) => ({ row, inGroup: true }))]),
    ...rest.map((row) => ({ row, inGroup: false })),
  ], [blocks, rest]);

  if (loading) {
    return (
      <div className="text-center py-3 mb-2 text-muted small">
        <Spinner size="sm" className="mr-2" />
        Cargando cinchos y pulseras…
      </div>
    );
  }

  if (!sortedRows.length && !carried.length) {
    return null;
  }

  const renderLine = (row, inGroup) => {
    const delivered = isRowDelivered(row, deliveredMap);
    const workStatus = rowWorkStatus(row, workStatusMap || {});
    const saving = savingKey === row.key;
    return (
      <tr
        key={row.key}
        style={{
          backgroundColor: rowBackground(workStatus, delivered) || (inGroup ? "#faf8fe" : undefined),
          boxShadow: inGroup ? "inset 3px 0 0 #c9b8ee" : undefined,
        }}
      >
        <td className="align-middle">
          <Badge color={FAMILY_COLORS[row.family] || "secondary"} className="mr-0">
            {row.family}
          </Badge>
        </td>
        <td className="align-middle">
          <strong>{row.orderCode}</strong>
          {row.customerName && (
            <div className="text-muted" title={row.customerName}
              style={{ fontSize: 10, maxWidth: 160, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {row.customerName}
            </div>
          )}
        </td>
        <td className="align-middle">
          <strong>{row.productCode}</strong>
          {row.productName ? ` — ${row.productName}` : ""}
        </td>
        <td className="align-middle text-muted">{row.colorName || "—"}</td>
        <td className="align-middle">
          {row.sizes && Object.keys(row.sizes).length ? (
            <div className="d-flex flex-wrap" style={{ gap: 3 }}>
              {Object.entries(row.sizes).map(([size, q]) => (
                <span key={size} style={{ fontSize: 10, border: "1px solid #e3e1dc", borderRadius: 4, padding: "0 5px", background: "#fff", whiteSpace: "nowrap" }}>
                  <b>{size}</b> × {q}
                </span>
              ))}
            </div>
          ) : <span className="text-muted small">{row.sizesText || "—"}</span>}
        </td>
        <td className="align-middle text-right">{row.totalQty}</td>
        <td className="align-middle text-center">
          {row.mixedOrder ? (
            <Badge color="light" className="text-dark border" title="Otros productos en mesas">
              Sí
            </Badge>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td className="align-middle">
          <div className="d-flex align-items-center flex-wrap" style={{ gap: 6 }}>
            <CinchoWorkStatusActions
              workStatus={workStatus}
              saving={saving}
              onStatusChange={(next) => onWorkStatusChange(row, next)}
            />
            {saving && <Spinner size="sm" />}
          </div>
        </td>
        <td className="align-middle">
          <div className="d-flex align-items-center flex-wrap" style={{ gap: 6 }}>
            <CustomInput
              type="checkbox"
              id={`cincho-del-${workDateYmd}-${row.key}`}
              label={delivered ? "Entregado" : "Marcar entregado"}
              checked={delivered}
              disabled={saving}
              onChange={(e) => onToggleDelivered(row, e.target.checked)}
              className="mb-0"
            />
          </div>
        </td>
      </tr>
    );
  };

  const carriedLines = carried.reduce((n, c) => n + c.rows.length, 0);
  const toggleCarried = (id) => setOpenCarried((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allCarriedOpen = carried.length > 0 && carried.every((c) => openCarried.has(c.orderId));

  return (
    <div className="mb-0">
      <div
        className="small font-weight-bold text-muted mb-2 text-uppercase"
        style={{ letterSpacing: "0.04em" }}
      >
        Mesa cinchos — cinchos y pulseras (OPL / OPCK / OPC)
      </div>
      <Card
        className="m-0"
        style={{
          border: "1px solid #e8c89a",
          borderLeft: "4px solid #fd7e14",
          backgroundColor: "#fffaf5",
        }}
      >
        <CardBody className="p-0">
          <Table responsive size="sm" className="mb-0" style={{ fontSize: "12px" }}>
            <thead className="thead-light">
              <tr>
                <th style={{ width: "56px" }}>Tipo</th>
                <th style={{ width: "88px" }}>OP</th>
                <th>Producto</th>
                <th style={{ width: "100px" }}>Color</th>
                <th style={{ minWidth: "120px" }}>Tallas</th>
                <th className="text-right" style={{ width: "56px" }}>
                  Uds.
                </th>
                <th style={{ width: "72px" }} className="text-center">
                  Mixta
                </th>
                <th style={{ minWidth: "168px" }}>Estado</th>
                <th style={{ width: "140px" }}>Entregado</th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ header, row, inGroup }) => {
                if (header) {
                  return (
                    <GroupRow
                      key={`grp-${header.group.id}`}
                      group={header.group}
                      rows={header.rows}
                      orders={header.orders}
                      workDateYmd={workDateYmd}
                      deliveredMap={deliveredMap}
                      workStatusMap={workStatusMap}
                      onToggleDelivered={onToggleDelivered}
                      onWorkStatusChange={onWorkStatusChange}
                    />
                  );
                }
                return renderLine(row, inGroup);
              })}
              {carried.length > 0 && (
                <tr style={{ backgroundColor: "#fff3d6" }}>
                  <td colSpan={9} className="align-middle">
                    <div className="d-flex flex-wrap align-items-center" style={{ gap: 8 }}>
                      <strong>↻ Vienen de días anteriores</strong>
                      <span className="text-muted">
                        {carried.length} OP · {carriedLines} {carriedLines === 1 ? "línea sin terminar" : "líneas sin terminar"} · se terminan aquí
                      </span>
                      <Button color="link" size="sm" className="p-0 ml-auto"
                        onClick={() => setOpenCarried(allCarriedOpen ? new Set() : new Set(carried.map((c) => c.orderId)))}>
                        {allCarriedOpen ? "Plegar todas" : "Abrir todas"}
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {carried.flatMap((c) => {
                const open = openCarried.has(c.orderId);
                const running = c.rows.filter((r) => rowWorkStatus(r, workStatusMap || {}) === CINCHO_WORK_STATUS.IN_PROGRESS).length;
                const done = c.rows.filter((r) => rowWorkStatus(r, workStatusMap || {}) === CINCHO_WORK_STATUS.COMPLETED).length;
                return [
                  <tr key={`carry-${c.orderId}`} style={{ backgroundColor: "#fffaf0", cursor: "pointer" }}
                    onClick={() => toggleCarried(c.orderId)} aria-expanded={open}>
                    <td className="align-middle">
                      <Badge color={FAMILY_COLORS[c.family] || "secondary"} className="mr-0">{c.family}</Badge>
                    </td>
                    <td className="align-middle" colSpan={4}>
                      <strong>{c.orderCode}</strong>
                      <span className="text-muted"> · {c.customerName || "Sin cliente"}</span>
                      <Badge color="warning" className="ml-2" title="Fecha de la OP: sigue aquí hasta quedar completada y entregada">
                        ↻ desde {formatDateGt(c.carriedFrom)}
                      </Badge>
                    </td>
                    <td className="align-middle text-right"><strong>{c.units}</strong></td>
                    <td />
                    <td className="align-middle text-muted small">
                      {c.rows.length} {c.rows.length === 1 ? "línea" : "líneas"}
                      {running ? ` · ${running} en mesa` : ""}{done ? ` · ${done} sin entregar` : ""}
                    </td>
                    <td className="align-middle text-right">
                      <Button color="link" size="sm" className="p-0">{open ? "Ocultar ▴" : "Ver líneas ▾"}</Button>
                    </td>
                  </tr>,
                  ...(open ? c.rows.map((r) => renderLine(r, false)) : []),
                ];
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default CinchosDayBoard;
