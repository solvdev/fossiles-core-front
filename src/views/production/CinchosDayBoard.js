import React, { useMemo } from "react";
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

function CinchosDayBoard({
  rows,
  workDateYmd,
  deliveredMap,
  workStatusMap,
  loading,
  savingKey,
  onToggleDelivered,
  onWorkStatusChange,
}) {
  const sortedRows = useMemo(() => sortCinchoRows(rows), [rows]);

  if (loading) {
    return (
      <div className="text-center py-3 mb-2 text-muted small">
        <Spinner size="sm" className="mr-2" />
        Cargando cinchos y pulseras…
      </div>
    );
  }

  if (!sortedRows.length) {
    return null;
  }

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
              {sortedRows.map((row) => {
                const delivered = isRowDelivered(row, deliveredMap);
                const workStatus = rowWorkStatus(row, workStatusMap || {});
                const saving = savingKey === row.key;
                return (
                  <tr
                    key={row.key}
                    style={{ backgroundColor: rowBackground(workStatus, delivered) }}
                  >
                    <td className="align-middle">
                      <Badge color={FAMILY_COLORS[row.family] || "secondary"} className="mr-0">
                        {row.family}
                      </Badge>
                    </td>
                    <td className="align-middle">
                      <strong>{row.orderCode}</strong>
                    </td>
                    <td className="align-middle">
                      <strong>{row.productCode}</strong>
                      {row.productName ? ` — ${row.productName}` : ""}
                    </td>
                    <td className="align-middle text-muted">{row.colorName || "—"}</td>
                    <td className="align-middle text-muted small">{row.sizesText || "—"}</td>
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
              })}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}

export default CinchosDayBoard;
