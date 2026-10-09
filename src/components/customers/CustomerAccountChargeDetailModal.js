import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Table,
} from "reactstrap";
import {
  ENTRY_TYPE_LABELS,
  buildChargeAdjustmentPayload,
  createCustomerAccountEntry,
  endSingleFlight,
  formatAccountMoney,
  formatDueDateLabel,
  formatReassignedFromNote,
  formatStatementLineAmount,
  getConceptLabel,
  getDueBadgeStyle,
  getOrderChargeQuote,
  isOverdueReceivableLine,
  shippingLinesPendingAdjustment,
  tryBeginSingleFlight,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";

function childLabel(line) {
  if (line.entryType === "PAYMENT" && line.movementConceptCode === "11") return "Descarga";
  if (line.entryType === "CREDIT_NOTE") return "Descuento comercial";
  if (line.entryType === "RETURN") return "Devolución";
  if (line.entryType === "CHARGE_ADJUSTMENT") return "Ajuste de envío";
  return ENTRY_TYPE_LABELS[line.entryType] || line.entryType;
}

function CustomerAccountChargeDetailModal({
  isOpen,
  toggle,
  chargeLine,
  customerId,
  knownLines = [],
  onDischarge,
  onDiscountReturn,
  onAdjust,
  onVoidChild,
  onChanged,
}) {
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState("");
  const [addingId, setAddingId] = useState(null);
  const gate = useRef(false);
  const today = getTodayYmdGuatemala();

  useEffect(() => {
    if (!isOpen || !chargeLine?.productionOrderId) {
      setQuote(null);
      setQuoteError("");
      return undefined;
    }
    let cancelled = false;
    setQuoteError("");
    getOrderChargeQuote(chargeLine.productionOrderId)
      .then((next) => {
        if (!cancelled) setQuote(next);
      })
      .catch((err) => {
        if (!cancelled) {
          setQuote(null);
          setQuoteError(err.message || "No se pudo cargar la cotización");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, chargeLine]);

  const addShipping = async (line) => {
    if (!customerId || !chargeLine) return;
    const requestId = tryBeginSingleFlight(gate);
    if (!requestId) return;
    setAddingId(line.productShipmentId);
    setQuoteError("");
    try {
      await createCustomerAccountEntry(
        customerId,
        buildChargeAdjustmentPayload({
          shippingLine: line,
          entryDate: getTodayYmdGuatemala(),
          productionOrderId: chargeLine.productionOrderId,
        }),
        { requestId }
      );
      if (onChanged) onChanged();
    } catch (err) {
      setQuoteError(err.message || "No se pudo agregar el envío");
    } finally {
      endSingleFlight(gate);
      setAddingId(null);
    }
  };

  if (!chargeLine) return null;

  const children = chargeLine.childEntries || [];
  const activeChildren = children.filter((c) => c.status === "ACTIVE");
  const balanceDue = Number(chargeLine.chargeBalanceDue ?? 0);
  const chargeAmount = Number(chargeLine.debit) || 0;
  const pendingShipping = shippingLinesPendingAdjustment(quote?.shippingLines, children);
  const chargeOverdue = isOverdueReceivableLine(chargeLine, today);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Detalle del cargo — {chargeLine.invoiceNumber || chargeLine.vendorShipmentNumber || chargeLine.documentNumber || "—"}
      </ModalHeader>
      <ModalBody>
        {quoteError && <Alert color="danger">{quoteError}</Alert>}
        <div className="mb-3 p-3 bg-light rounded">
          <div className="row small">
            <div className="col-md-4">
              <span className="text-muted d-block">Fecha</span>
              <strong>{chargeLine.entryDate}</strong>
            </div>
            <div className="col-md-4">
              <span className="text-muted d-block">Documento</span>
              <strong>
                {chargeLine.documentNumber || chargeLine.productionOrderCode || "—"}
                {chargeLine.orderKind ? ` (${chargeLine.orderKind})` : ""}
              </strong>
            </div>
            <div className="col-md-4">
              <span className="text-muted d-block">No. factura / ENVP</span>
              <strong>{chargeLine.invoiceNumber || chargeLine.vendorShipmentNumber || "—"}</strong>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Monto cargo</span>
              <strong>{formatAccountMoney(chargeAmount)}</strong>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Saldo pendiente</span>
              <span style={getDueBadgeStyle(balanceDue)}>{formatAccountMoney(balanceDue)}</span>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Vencimiento</span>
              <strong className={chargeOverdue ? "text-danger" : undefined}>
                {formatDueDateLabel(chargeLine.dueDate)}
              </strong>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Crédito aplicado</span>
              <strong>{formatStatementLineAmount(chargeLine.allocatedCredit)}</strong>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Saldo de la línea</span>
              <strong>{formatStatementLineAmount(chargeLine.lineOpenBalance)}</strong>
            </div>
            <div className="col-md-4 mt-2">
              <span className="text-muted d-block">Liquidaciones</span>
              <strong>{activeChildren.filter((c) => c.entryType !== "CHARGE_ADJUSTMENT").length}</strong>
            </div>
          </div>
        </div>

        <h6 className="mb-2">Envíos del cargo</h6>
        {pendingShipping.length === 0 ? (
          <p className="text-muted">Sin envío pendiente de agregar.</p>
        ) : (
          pendingShipping.map((line) => (
            <div key={line.productShipmentId} className="d-flex align-items-center justify-content-between mb-2">
              <span>
                {line.shipmentNumber || `Envío ${line.productShipmentId}`} · {formatAccountMoney(line.shippingCost)}
              </span>
              <Button
                color="success"
                size="sm"
                outline
                disabled={addingId != null}
                onClick={() => addShipping(line)}
              >
                {addingId === line.productShipmentId ? "Agregando..." : "Agregar envío"}
              </Button>
            </div>
          ))
        )}

        <h6 className="mb-2">Movimientos del envío / factura</h6>
        {children.length === 0 ? (
          <p className="text-muted mb-0">Este cargo no tiene descargas, descuentos, devoluciones ni ajustes de envío.</p>
        ) : (
          <Table responsive size="sm" className="mb-0">
            <thead className="text-primary">
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Recibo / boleta</th>
                <th className="text-right">Débito</th>
                <th className="text-right">Abono</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {children.map((child) => {
                const movedNote = formatReassignedFromNote(child, knownLines);
                const overdue = isOverdueReceivableLine(child, today);
                return (
                  <tr key={child.id} className={child.status === "VOID" ? "text-muted" : overdue ? "table-danger" : ""}>
                    <td>
                      {child.entryDate}
                      {movedNote && <div className="small text-muted">{movedNote}</div>}
                    </td>
                    <td>{childLabel(child)}</td>
                    <td>{getConceptLabel(child.movementConceptCode)}</td>
                    <td>{child.receiptNumber || child.returnVoucherNumber || child.reference || "—"}</td>
                    <td className="text-right">
                      {Number(child.debit) > 0 ? formatAccountMoney(child.debit) : "—"}
                    </td>
                    <td className="text-right">
                      {Number(child.credit) > 0 ? formatAccountMoney(child.credit) : "—"}
                    </td>
                    <td className="text-right">
                      {child.status === "ACTIVE" && onVoidChild && (
                        <Button color="danger" size="sm" outline onClick={() => onVoidChild(child)}>
                          Anular
                        </Button>
                      )}
                      {child.status === "VOID" && <Badge color="secondary">Anulado</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </ModalBody>
      <ModalFooter className="d-flex flex-wrap justify-content-between">
        <div className="d-flex flex-wrap" style={{ gap: 8 }}>
          {balanceDue > 0 && onDischarge && (
            <Button color="success" size="sm" onClick={() => onDischarge(chargeLine)}>
              Registrar descarga
            </Button>
          )}
          {balanceDue > 0 && onDiscountReturn && (
            <Button color="warning" size="sm" outline onClick={() => onDiscountReturn(chargeLine)}>
              Descuento o devolución
            </Button>
          )}
          {onAdjust && (
            <Button color="secondary" size="sm" outline onClick={() => onAdjust(chargeLine)}>
              Ajustar
            </Button>
          )}
        </div>
        <Button color="secondary" size="sm" onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountChargeDetailModal;
