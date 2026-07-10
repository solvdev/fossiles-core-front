import React, { useState } from "react";
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
  addCashSessionExpense,
  closeCashSession,
  getCashCloseReport,
  openCashSession,
} from "services/kioskPosService";
import { openKioskCashCloseReport } from "utils/kioskCashCloseReport";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";

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

function PosCashCloseModal({ isOpen, session, onClose, onClosed, pendingDepositSummary }) {
  const [countedCash, setCountedCash] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const pendingCount = Number(pendingDepositSummary?.pendingCount || 0);
  const expected = Number(session?.expectedCash ?? 0);
  const parsedCounted = Number(countedCash);
  const variance =
    countedCash !== "" && !Number.isNaN(parsedCounted)
      ? parsedCounted - expected
      : null;

  const handleClose = async () => {
    if (!session?.id) return;
    if (Number.isNaN(parsedCounted)) {
      showError("Ingresa el efectivo contado en caja.");
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
      try {
        const report = await getCashCloseReport(sessionId);
        const opened = openKioskCashCloseReport(report, { autoPrint: true });
        if (!opened) {
          showError("Permite ventanas emergentes para ver el reporte de cierre.");
        }
      } catch (reportErr) {
        showError(reportErr.message || "Caja cerrada, pero no se pudo abrir el reporte.");
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
        <Label className="kiosk-pos-label">Efectivo contado físicamente</Label>
        <Input
          type="number"
          min="0"
          step="0.01"
          value={countedCash}
          onChange={(e) => setCountedCash(e.target.value)}
          placeholder="0.00"
          className="kiosk-pos-input-lg mb-2"
        />
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
        <Button color="primary" onClick={handleClose} disabled={saving}>
          {saving ? <Spinner size="sm" /> : "Confirmar cierre"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function PosCashTab({ cashSession, kioskLocationId, kioskName, onSessionChange, loading, pendingDepositSummary }) {
  const [opening, setOpening] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [expenseSaving, setExpenseSaving] = useState(false);

  const pendingCount = Number(pendingDepositSummary?.pendingCount || 0);
  const expenses = cashSession?.expenses || [];

  const handleOpen = async () => {
    try {
      setOpening(true);
      await openCashSession(kioskLocationId);
      showSuccess("Caja abierta con fondo Q300.");
      await onSessionChange();
    } catch (err) {
      showError(err.message || "No se pudo abrir la caja.");
    } finally {
      setOpening(false);
    }
  };

  const handleAddExpense = async () => {
    if (!cashSession?.id) return;
    const amount = Number(expenseAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      showError("Ingresa un monto válido para el gasto.");
      return;
    }
    if (!expenseDescription.trim()) {
      showError("Describe para qué fue el gasto.");
      return;
    }
    try {
      setExpenseSaving(true);
      await addCashSessionExpense(cashSession.id, {
        amount,
        description: expenseDescription.trim(),
      });
      setExpenseAmount("");
      setExpenseDescription("");
      showSuccess("Gasto registrado.");
      await onSessionChange();
    } catch (err) {
      showError(err.message || "No se pudo registrar el gasto.");
    } finally {
      setExpenseSaving(false);
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
                  ? `Antes de vender en ${kioskName}, abre caja con fondo inicial de Q300.`
                  : "Abre caja con fondo inicial de Q300 antes de registrar ventas."}
              </p>
              <Button color="success" className="kiosk-pos-btn-lg" onClick={handleOpen} disabled={opening}>
                {opening ? <Spinner size="sm" /> : "Abrir caja — Q300"}
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
                    Desde {formatDateTime(cashSession.openedAt)} · Fondo Q300
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

              <div className="border rounded p-3 mb-0">
                <h6 className="mb-2">Registrar desembolso (gasto de efectivo)</h6>
                <p className="text-muted small mb-2">
                  Dinero que sale de la caja por un gasto operativo del turno (taxi, compras menores, etc.).
                </p>
                <div className="d-flex flex-wrap align-items-end" style={{ gap: 12 }}>
                  <div style={{ minWidth: 120 }}>
                    <Label className="kiosk-pos-label mb-1">Monto</Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <Label className="kiosk-pos-label mb-1">Descripción</Label>
                    <Input
                      value={expenseDescription}
                      onChange={(e) => setExpenseDescription(e.target.value)}
                      placeholder="Ej. compra de bolsas"
                    />
                  </div>
                  <Button color="warning" outline onClick={handleAddExpense} disabled={expenseSaving}>
                    {expenseSaving ? <Spinner size="sm" /> : "Agregar desembolso"}
                  </Button>
                </div>

                {expenses.length > 0 && (
                  <Table responsive size="sm" className="mt-3 mb-0">
                    <thead>
                      <tr>
                        <th>Hora</th>
                        <th>Descripción</th>
                        <th className="text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map((expense) => (
                        <tr key={expense.id}>
                          <td>{formatDateTime(expense.createdAt)}</td>
                          <td>{expense.description}</td>
                          <td className="text-right">{formatCurrency(expense.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th colSpan="2">Total gastos</th>
                        <th className="text-right">
                          {formatCurrency(cashSession.cashExpensesTotal || 0)}
                        </th>
                      </tr>
                    </tfoot>
                  </Table>
                )}
              </div>
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
      />
    </>
  );
}

export default PosCashTab;
