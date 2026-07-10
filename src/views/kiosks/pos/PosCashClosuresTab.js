import React, { useCallback, useEffect, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  Col,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import {
  getCashCloseReport,
  getCashSessionHistory,
} from "services/kioskPosService";
import { openKioskCashCloseReport } from "utils/kioskCashCloseReport";
import { formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";

const monthStartYmd = () => {
  const today = getTodayYmdGuatemala();
  return `${today.slice(0, 8)}01`;
};

function PosCashClosuresTab({ kioskLocationId, isAdmin, kiosks }) {
  const [startDate, setStartDate] = useState(monthStartYmd);
  const [endDate, setEndDate] = useState(getTodayYmdGuatemala);
  const [filterKioskId, setFilterKioskId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState(null);

  useEffect(() => {
    if (!isAdmin && kioskLocationId) {
      setFilterKioskId(String(kioskLocationId));
    }
  }, [isAdmin, kioskLocationId]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      const kioskId = isAdmin
        ? (filterKioskId || null)
        : (kioskLocationId || null);
      const data = await getCashSessionHistory(startDate, endDate, kioskId);
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      showError(err.message || "No se pudo cargar el historial de cierres.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, filterKioskId, isAdmin, kioskLocationId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const openReport = async (sessionId, autoPrint) => {
    if (!sessionId) return;
    try {
      setLoadingReportId(sessionId);
      const report = await getCashCloseReport(sessionId);
      const opened = openKioskCashCloseReport(report, { autoPrint });
      if (!opened) {
        showError("Permite ventanas emergentes para ver el reporte.");
      }
    } catch (err) {
      showError(err.message || "No se pudo abrir el reporte de cierre.");
    } finally {
      setLoadingReportId(null);
    }
  };

  return (
    <Card className="kiosk-pos-block mt-2">
      <CardBody>
        <h5 className="mb-3">Cierres de caja</h5>
        <Row className="align-items-end mb-3" style={{ gap: 8 }}>
          <Col xs="12" md="2">
            <Label className="kiosk-pos-label mb-1">Desde</Label>
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Col>
          <Col xs="12" md="2">
            <Label className="kiosk-pos-label mb-1">Hasta</Label>
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Col>
          {isAdmin && Array.isArray(kiosks) && kiosks.length > 0 && (
            <Col xs="12" md="3">
              <Label className="kiosk-pos-label mb-1">Kiosko</Label>
              <Input
                type="select"
                value={filterKioskId}
                onChange={(e) => setFilterKioskId(e.target.value)}
              >
                <option value="">Todos</option>
                {kiosks.map((k) => (
                  <option key={k.kioskId} value={k.kioskId}>
                    {k.kioskName || k.kioskCode || k.kioskId}
                  </option>
                ))}
              </Input>
            </Col>
          )}
          <Col xs="12" md="2">
            <Button color="primary" outline onClick={loadHistory} disabled={loading}>
              {loading ? <Spinner size="sm" /> : "Buscar"}
            </Button>
          </Col>
        </Row>

        {loading ? (
          <div className="text-center py-4">
            <Spinner color="primary" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-muted mb-0">No hay cierres de caja en el período seleccionado.</p>
        ) : (
          <Table responsive hover size="sm" className="mb-0">
            <thead>
              <tr>
                <th>Kiosko</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Usuario</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Desembolsos</th>
                <th className="text-right">Diferencia</th>
                <th style={{ minWidth: 160 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = loadingReportId === row.sessionId;
                return (
                  <tr key={row.sessionId}>
                    <td>{row.kioskName || row.kioskCode || "—"}</td>
                    <td>{formatDateTimeGt(row.openedAt)}</td>
                    <td>{formatDateTimeGt(row.closedAt)}</td>
                    <td>{row.closedByName || row.openedByName || "—"}</td>
                    <td className="text-right">
                      {row.salesCount || 0} · {formatCurrency(row.salesTotal)}
                    </td>
                    <td className="text-right">{formatCurrency(row.disbursementsTotal)}</td>
                    <td className="text-right">{formatCurrency(row.variance)}</td>
                    <td>
                      <Button
                        color="secondary"
                        size="sm"
                        outline
                        className="mr-1"
                        disabled={busy}
                        onClick={() => openReport(row.sessionId, false)}
                      >
                        {busy ? <Spinner size="sm" /> : "Ver"}
                      </Button>
                      <Button
                        color="primary"
                        size="sm"
                        outline
                        disabled={busy}
                        onClick={() => openReport(row.sessionId, true)}
                      >
                        PDF
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
}

export default PosCashClosuresTab;
