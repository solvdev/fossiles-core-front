import React, { useCallback, useEffect, useState } from "react";
import { Button, Spinner, Table } from "reactstrap";
import { getCashCloseReport, getCashSessionHistory } from "services/kioskPosService";
import {
  downloadKioskCashClosePdf,
  exportKioskCashCloseToExcel,
} from "utils/kioskCashCloseReport";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "views/kiosks/pos/posUtils";
import PosCashCloseReportModal from "views/kiosks/pos/PosCashCloseReportModal";

function SalesReportsCashClosuresPanel({ startDate, endDate, kioskLocationId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busySessionId, setBusySessionId] = useState(null);
  const [busyAction, setBusyAction] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalReport, setModalReport] = useState(null);

  const loadHistory = useCallback(async () => {
    if (!startDate) return;
    try {
      setLoading(true);
      const to = endDate || startDate;
      const data = await getCashSessionHistory(
        startDate,
        to,
        kioskLocationId ? Number(kioskLocationId) : null
      );
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      showError(err.message || "No se pudo cargar el historial de cierres.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, kioskLocationId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const fetchReport = async (sessionId) => getCashCloseReport(sessionId);

  const handleView = async (sessionId) => {
    if (!sessionId) return;
    try {
      setBusySessionId(sessionId);
      setBusyAction("view");
      setModalOpen(true);
      setModalLoading(true);
      setModalReport(null);
      setModalReport(await fetchReport(sessionId));
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
      await downloadKioskCashClosePdf(await fetchReport(sessionId));
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
      exportKioskCashCloseToExcel(await fetchReport(sessionId));
      showSuccess("Excel descargado.");
    } catch (err) {
      showError(err.message || "No se pudo exportar a Excel.");
    } finally {
      setBusySessionId(null);
      setBusyAction(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner color="primary" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <p className="text-muted mb-0">
        No hay cierres de caja en el período seleccionado.
      </p>
    );
  }

  return (
    <>
      <Table responsive hover className="mb-0">
        <thead className="text-primary">
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
                    color="info"
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

      <PosCashCloseReportModal
        isOpen={modalOpen}
        toggle={() => setModalOpen(false)}
        report={modalReport}
        loading={modalLoading}
      />
    </>
  );
}

export default SalesReportsCashClosuresPanel;
