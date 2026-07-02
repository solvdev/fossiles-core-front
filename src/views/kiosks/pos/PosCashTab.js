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
} from "reactstrap";
import { closeCashSession, openCashSession } from "services/kioskPosService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency } from "./posUtils";

const formatDateTime = (value) => formatDateTimeGt(value);

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
    try {
      setSaving(true);
      await closeCashSession(session.id, {
        countedCash: parsedCounted,
        notes: notes.trim() || null,
      });
      showSuccess("Caja cerrada correctamente.");
      onClosed();
      onClose();
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
        <div className="kiosk-pos-cash-summary mb-3">
          <div>Fondo inicial: <strong>{formatCurrency(session?.openingAmount || 300)}</strong></div>
          <div>Ventas en sesión: <strong>{session?.salesCount || 0}</strong></div>
          <div>Efectivo en ventas: <strong>{formatCurrency(session?.cashSalesTotal || 0)}</strong></div>
          <div>Tarjeta en ventas: <strong>{formatCurrency(session?.cardSalesTotal || 0)}</strong></div>
          <div className="mt-2">
            Efectivo esperado en caja: <strong>{formatCurrency(expected)}</strong>
          </div>
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
            Diferencia: <strong>{formatCurrency(variance)}</strong>
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

  const pendingCount = Number(pendingDepositSummary?.pendingCount || 0);

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
              <div className="kiosk-pos-cash-summary">
                <div>Ventas registradas: <strong>{cashSession.salesCount || 0}</strong></div>
                <div>Efectivo en ventas: <strong>{formatCurrency(cashSession.cashSalesTotal || 0)}</strong></div>
                <div>Tarjeta: <strong>{formatCurrency(cashSession.cardSalesTotal || 0)}</strong></div>
                <div className="mt-2">
                  Efectivo esperado ahora:{" "}
                  <strong>{formatCurrency(cashSession.expectedCash || 300)}</strong>
                </div>
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
