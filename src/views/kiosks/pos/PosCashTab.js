import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Card,
  CardBody,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import {
  closeCashSession,
  getCashCloseReport,
  openCashSession,
} from "services/kioskPosService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";
import PosCashCloseReportModal from "./PosCashCloseReportModal";

const formatDateTime = (value) => formatDateTimeGt(value);

function CashReconciliationSummary({ session }) {
  const opening = Number(session?.openingAmount ?? 300);
  const cashSales = Number(session?.cashSalesTotal ?? 0);
  const expenses = Number(session?.cashExpensesTotal ?? 0);
  const expected = Number(session?.expectedCash ?? opening + cashSales - expenses);

  return (
    <div className="kiosk-pos-cash-summary mb-3">
      <div className="small text-muted mb-1">Cuadre de efectivo</div>
      <div>Fondo inicial: <strong>{formatCurrency(opening)}</strong></div>
      <div>+ Efectivo en ventas: <strong>{formatCurrency(cashSales)}</strong></div>
      <div>- Desembolsos (gastos) del turno: <strong>{formatCurrency(expenses)}</strong></div>
      <div className="mt-2">
        = Efectivo esperado en caja: <strong>{formatCurrency(expected)}</strong>
      </div>
    </div>
  );
}

function PosCashCloseModal({ isOpen, session, onClose, onClosed, pendingDepositSummary, onReportReady }) {
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setCountedCash("");
    setNotes("");
    setSaving(false);
  }, [isOpen]);

  const pendingCount = Number(pendingDepositSummary?.pendingCount || 0);
  const expected = Number(session?.expectedCash ?? 0);
  const countedTrimmed = String(countedCash ?? "").trim();
  const parsedCounted = countedTrimmed === "" ? NaN : Number(countedTrimmed);
  const hasValidCountedCash =
    countedTrimmed !== ""
    && Number.isFinite(parsedCounted)
    && !Number.isNaN(parsedCounted)
    && parsedCounted >= 0;
  const variance = hasValidCountedCash ? parsedCounted - expected : null;

  const handleClose = async () => {
    if (!session?.id) return;
    if (!hasValidCountedCash) {
      showError("Debes ingresar el efectivo contado físicamente.");
      return;
    }
    const sessionId = session.id;
    try {
      setSaving(true);
      await closeCashSession(sessionId, {
        countedCash: parsedCounted,
        notes: notes.trim() || null,
      });
      showSuccess("Caja cerrada correctamente.");
      onClosed();
      onClose();
      if (typeof onReportReady === "function") {
        onReportReady(sessionId);
      }
    } catch (err) {
      showError(err.message || "No se pudo cerrar la caja.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} className="kiosk-pos-cash-close-modal">
      <ModalHeader toggle={onClose}>Cierre de caja</ModalHeader>
      <ModalBody>
        {pendingCount > 0 && (
          <Alert color="warning" className="py-2">
            Hay <strong>{pendingCount}</strong> venta{pendingCount === 1 ? "" : "s"} con depósito pendiente
            ({formatCurrency(pendingDepositSummary?.pendingAmount || 0)} en efectivo).
            Registra las boletas en Reportes de ventas antes de cerrar si aplica.
          </Alert>
        )}
        <CashReconciliationSummary session={session} />
        <div className="mb-2 text-muted small">
          Ventas en sesión: <strong>{session?.salesCount || 0}</strong>
          {" · "}
          Tarjeta: <strong>{formatCurrency(session?.cardSalesTotal || 0)}</strong>
        </div>
        <Label className="kiosk-pos-label">
          Efectivo contado físicamente <span className="text-danger">*</span>
        </Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={countedCash}
          onChange={(e) => setCountedCash(e.target.value)}
          placeholder="Ingresa el monto contado"
          className={`kiosk-pos-input-lg mb-1${!hasValidCountedCash ? " border-danger" : ""}`}
          invalid={!hasValidCountedCash}
        />
        {!hasValidCountedCash && (
          <div className="text-danger small mb-2" role="alert">
            Obligatorio: ingresa el efectivo contado físicamente para poder cerrar la caja.
          </div>
        )}
        {variance != null && (
          <Alert color={variance === 0 ? "success" : "warning"} className="py-2">
            Diferencia (contado − esperado): <strong>{formatCurrency(variance)}</strong>
            {variance !== 0 && (
              <div className="small mt-1 mb-0">
                {variance > 0 ? "Sobra efectivo en caja." : "Falta efectivo en caja."}
              </div>
            )}
          </Alert>
        )}
        <Label className="kiosk-pos-label">Notas de cierre</Label>
        <Input
          type="textarea"
          rows="2"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Observaciones del cierre (opcional)"
        />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleClose} disabled={saving || !hasValidCountedCash}>
          {saving ? <Spinner size="sm" /> : "Confirmar cierre"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PosCashTab({
  cashSession,
  kioskLocationId,
  kioskName,
  posOpeningCashAmount = 300,
  onSessionChange,
  loading,
  pendingDepositSummary,
}) {
  const [opening, setOpening] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [closeReport, setCloseReport] = useState(null);

  const pendingCount = Number(pendingDepositSummary?.pendingCount || 0);
  const expenses = cashSession?.expenses || [];

  const configuredOpening = Number(posOpeningCashAmount ?? 300);

  const handleOpen = async () => {
    try {
      setOpening(true);
      await openCashSession(kioskLocationId);
      showSuccess(`Caja abierta con fondo ${formatCurrency(configuredOpening)}.`);
      await onSessionChange();
    } catch (err) {
      showError(err.message || "No se pudo abrir la caja.");
    } finally {
      setOpening(false);
    }
  };

  const handleShowCloseReport = async (sessionId) => {
    try {
      setReportModalOpen(true);
      setReportLoading(true);
      setCloseReport(null);
      const report = await getCashCloseReport(sessionId);
      setCloseReport(report);
    } catch (err) {
      setReportModalOpen(false);
      showError(err.message || "Caja cerrada, pero no se pudo abrir el reporte.");
    } finally {
      setReportLoading(false);
    }
  };

  const isOpen = cashSession && String(cashSession.status || "").toUpperCase() === "OPEN";

  return (
    <>
      <Card className="kiosk-pos-block mt-2">
        <CardBody>
          {loading ? (
            <div className="text-center py-4">
              <Spinner color="primary" />
            </div>
          ) : !isOpen ? (
            <>
              <h5 className="mb-2">Abrir caja</h5>
              <p className="text-muted">
                {kioskName
                  ? `Antes de vender en ${kioskName}, abre caja con fondo inicial de ${formatCurrency(configuredOpening)}.`
                  : `Abre caja con fondo inicial de ${formatCurrency(configuredOpening)} antes de registrar ventas.`}
              </p>
              <Button color="success" className="kiosk-pos-btn-lg" onClick={handleOpen} disabled={opening}>
                {opening ? <Spinner size="sm" /> : `Abrir caja — ${formatCurrency(configuredOpening)}`}
              </Button>
            </>
          ) : (
            <>
              {pendingCount > 0 && (
                <Alert color="warning" className="mb-3">
                  {pendingCount} venta{pendingCount === 1 ? "" : "s"} sin boleta de depósito
                  ({formatCurrency(pendingDepositSummary?.pendingAmount || 0)} en efectivo pendiente).
                </Alert>
              )}
              <div className="d-flex flex-wrap justify-content-between align-items-start mb-3">
                <div>
                  <h5 className="mb-1">Caja abierta</h5>
                  <div className="text-muted small">
                    Desde {formatDateTime(cashSession.openedAt)} · Fondo {formatCurrency(cashSession.openingAmount ?? configuredOpening)}
                  </div>
                  <div className="text-muted small mt-1">
                    Los desembolsos se registran desde el detalle de cada venta.
                  </div>
                </div>
                <Button color="danger" outline onClick={() => setCloseOpen(true)}>
                  Cerrar caja
                </Button>
              </div>

              <CashReconciliationSummary session={cashSession} />

              <div className="text-muted small mb-3">
                Ventas registradas: <strong>{cashSession.salesCount || 0}</strong>
                {" · "}
                Tarjeta: <strong>{formatCurrency(cashSession.cardSalesTotal || 0)}</strong>
              </div>

              {expenses.length > 0 && (
                <div className="border rounded p-3 mb-0">
                  <h6 className="mb-2">Desembolsos del turno</h6>
                  <p className="text-muted small mb-2">
                    Solo lectura. Se agregan desde el detalle de cada venta.
                  </p>
                  <Table responsive size="sm" className="mb-0">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Venta</th>
                        <th>Descripción</th>
                        <th className="text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{formatDateTime(expense.createdAt)}</td>
                          <td>
                            {expense.kioskSaleId
                              ? expense.internalNumber || expense.saleNumber || `#${expense.kioskSaleId}`
                              : "General"}
                          </td>
                          <td>{expense.description}</td>
                          <td className="text-right">{formatCurrency(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="3">Total gastos</th>
                        <th className="text-right">
                          {formatCurrency(cashSession.cashExpensesTotal || 0)}
                        </th>
                      </tr>
                    </tfoot>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>

      <PosCashCloseModal
        isOpen={closeOpen}
        session={cashSession}
        onClose={() => setCloseOpen(false)}
        onClosed={onSessionChange}
        pendingDepositSummary={pendingDepositSummary}
        onReportReady={handleShowCloseReport}
      />
      <PosCashCloseReportModal
        isOpen={reportModalOpen}
        toggle={() => setReportModalOpen(false)}
        report={closeReport}
        loading={reportLoading}
      />
    </>
  );
}

export default PosCashTab;
