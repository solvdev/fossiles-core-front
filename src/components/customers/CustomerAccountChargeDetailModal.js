import React from "react";
import {
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
  formatAccountMoney,
  getConceptLabel,
  getDueBadgeStyle,
} from "services/customerAccountService";

function childLabel(line) {
  if (line.entryType === "PAYMENT" && line.movementConceptCode === "11") return "Descarga";
  if (line.entryType === "CREDIT_NOTE") return "Descuento comercial";
  if (line.entryType === "RETURN") return "Devolución";
  return ENTRY_TYPE_LABELS[line.entryType] || line.entryType;
}

function CustomerAccountChargeDetailModal({
  isOpen,
  toggle,
  chargeLine,
  onDischarge,
  onDiscountReturn,
  onVoidChild,
}) {
  if (!chargeLine) return null;

  const children = chargeLine.childEntries || [];
  const activeChildren = children.filter((c) => c.status === "ACTIVE");
  const balanceDue = Number(chargeLine.chargeBalanceDue ?? 0);
  const chargeAmount = Number(chargeLine.debit) || 0;

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Detalle del cargo — {chargeLine.invoiceNumber || chargeLine.vendorShipmentNumber || chargeLine.documentNumber || "—"}
      </ModalHeader>
      <ModalBody>
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
              <span className="text-muted d-block">Liquidaciones</span>
              <strong>{activeChildren.length}</strong>
            </div>
          </div>
        </div>

        {activeChildren.length === 0 ? (
          <p className="text-muted mb-0">Este cargo no tiene descargas, descuentos ni devoluciones registradas.</p>
        ) : (
          <Table responsive size="sm" className="mb-0">
            <thead className="text-primary">
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Concepto</th>
                <th>Recibo / boleta</th>
                <th className="text-right">Monto</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {children.map((child) => (
                <tr key={child.id} className={child.status === "VOID" ? "text-muted" : ""}>
                  <td>{child.entryDate}</td>
                  <td>{childLabel(child)}</td>
                  <td>{getConceptLabel(child.movementConceptCode)}</td>
                  <td>{child.receiptNumber || child.returnVoucherNumber || child.reference || "—"}</td>
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
              ))}
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
        </div>
        <Button color="secondary" size="sm" onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountChargeDetailModal;
