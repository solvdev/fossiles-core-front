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
import {
  downloadKioskCashClosePdf,
  exportKioskCashCloseToExcel,
} from "utils/kioskCashCloseReport";
import { formatDateTimeGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";
import PosCashCloseReportModal from "./PosCashCloseReportModal";

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
  const [busySessionId, setBusySessionId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalReport, setModalReport] = useState(null);

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

  const fetchReport = async (sessionId) => {
    const report = await getCashCloseReport(sessionId);
    return report;
  };

  const handleView = async (sessionId) => {
    if (!sessionId) return;
    try {
      setBusySessionId(sessionId);
      setBusyAction("view");
      setModalOpen(true);
      setModalLoading(true);
      setModalReport(null);
      const report = await fetchReport(sessionId);
      setModalReport(report);
    } catch (err) {
      setModalOpen(false);
      showError(err.message || "No se pudo abrir el reporte de cierre.");
    } finally {
      setModalLoading(false);
      setBusySessionId(null);
      setBusyAction(null);
    }
  };

  const handlePdf = async (sessionId) => {
    if (!sessionId) return;
    try {
      setBusySessionId(sessionId);
      setBusyAction("pdf");
      const report = await fetchReport(sessionId);
      await downloadKioskCashClosePdf(report);
      showSuccess("PDF descargado.");
    } catch (err) {
      showError(err.message || "No se pudo descargar el PDF.");
    } finally {
      setBusySessionId(null);
      setBusyAction(null);
    }
  };

  const handleExcel = async (sessionId) => {
    if (!sessionId) return;
    try {
      setBusySessionId(sessionId);
      setBusyAction("excel");
      const report = await fetchReport(sessionId);
      exportKioskCashCloseToExcel(report);
      showSuccess("Excel descargado.");
    } catch (err) {
      showError(err.message || "No se pudo exportar a Excel.");
    } finally {
      setBusySessionId(null);
      setBusyAction(null);
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
                <th style={{ minWidth: 220 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const busy = busySessionId === row.sessionId;
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
                        className="mr-1 mb-1"
                        disabled={busy}
                        onClick={() => handleView(row.sessionId)}
                      >
                        {busy && busyAction === "view" ? <Spinner size="sm" /> : "Ver"}
                      </Button>
                      <Button
                        color="primary"
                        size="sm"
                        outline
                        className="mr-1 mb-1"
                        disabled={busy}
                        onClick={() => handlePdf(row.sessionId)}
                      >
                        {busy && busyAction === "pdf" ? <Spinner size="sm" /> : "PDF"}
                      </Button>
                      <Button
                        color="success"
                        size="sm"
                        outline
                        className="mb-1"
                        disabled={busy}
                        onClick={() => handleExcel(row.sessionId)}
                      >
                        {busy && busyAction === "excel" ? <Spinner size="sm" /> : "Excel"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}

        <PosCashCloseReportModal
          isOpen={modalOpen}
          toggle={() => setModalOpen(false)}
          report={modalReport}
          loading={modalLoading}
        />
      </CardBody>
    </Card>
  );
}

export default PosCashClosuresTab;
