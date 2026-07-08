import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import { getInternalShipmentRequestById } from "services/internalShipmentRequestService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  canApproveInternalShipment,
  computeInternalEnviUnitPrice,
  formatInternalRequestTypeLabel,
  needsOpiProductionAuthorization,
} from "utils/standaloneInternalShipmentHelper";
import { showError, showSuccess } from "utils/notificationHelper";

function InternalShipmentRequestDetailModal({
  isOpen,
  requestId,
  onClose,
  canApprove,
  onApprove,
  onAuthorizeProduction,
  onReject,
  actionId,
}) {
  const [loading, setLoading] = useState(false);
  const [request, setRequest] = useState(null);

  useEffect(() => {
    if (!isOpen || !requestId) {
      setRequest(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await getInternalShipmentRequestById(requestId);
        if (!cancelled) setRequest(data);
      } catch (err) {
        if (!cancelled) {
          showError(err.message || "No se pudo cargar el detalle.");
          setRequest(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, requestId]);

  const priceMeta = useMemo(() => {
    if (!request) return null;
    return {
      requestType: request.requestType,
      discountPercent: request.discountPercent,
      discountAmount: request.discountAmount,
    };
  }, [request]);

  const linesWithPricing = useMemo(() => {
    if (!request?.lines) return [];
    return request.lines.map((line) => {
      const unitPrice = computeInternalEnviUnitPrice(line.catalogPrice, priceMeta);
      const qty = Number(line.quantity || 0);
      const subtotal = unitPrice != null ? unitPrice * qty : null;
      return { ...line, unitPrice, subtotal };
    });
  }, [request, priceMeta]);

  const totalAmount = linesWithPricing.reduce(
    (sum, line) => sum + (line.subtotal != null ? line.subtotal : 0),
    0
  );

  const isOpiOnly = String(request?.requestType || "").toUpperCase() === "OPI";
  const showPricing = !isOpiOnly;

  const handleApprove = async () => {
    if (!request || !onApprove) return;
    if (!window.confirm("¿Autorizar el envío interno (ENVI) de esta solicitud?")) return;
    try {
      await onApprove(request);
      showSuccess("Envío autorizado.");
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo autorizar.");
    }
  };

  const handleAuthorizeProduction = async () => {
    if (!request || !onAuthorizeProduction) return;
    const opiCode = request.productionOrderCode || "OPI";
    if (!window.confirm(`¿Autorizar la producción de ${opiCode}?`)) return;
    try {
      await onAuthorizeProduction(request);
      showSuccess("Producción OPI autorizada.");
      onClose();
    } catch (err) {
      showError(err.message || "No se pudo autorizar la producción.");
    }
  };

  const handleReject = () => {
    if (!request || !onReject) return;
    onReject(request.id);
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg">
      <ModalHeader toggle={onClose}>
        Solicitud #{requestId || "—"}
      </ModalHeader>
      <ModalBody>
        {loading ? (
          <div className="text-center py-4"><Spinner /></div>
        ) : !request ? (
          <Alert color="light" className="border mb-0">No hay datos para mostrar.</Alert>
        ) : (
          <>
            <div className="mb-3" style={{ fontSize: 13 }}>
              <div><strong>Colaborador:</strong> {request.recipientName || "—"}</div>
              <div><strong>Teléfono:</strong> {request.recipientPhone || "—"}</div>
              <div><strong>NIT/DPI:</strong> {request.recipientTaxId || "—"}</div>
              <div><strong>Tipo:</strong> {formatInternalRequestTypeLabel(request)}</div>
              <div><strong>Estado solicitud:</strong>{" "}
                <Badge color={request.status === "PENDIENTE" ? "warning" : request.status === "APROBADA" ? "success" : "danger"}>
                  {request.status}
                </Badge>
              </div>
              <div><strong>Solicitado:</strong> {request.requestedAt ? formatDateTimeGt(request.requestedAt) : "—"}</div>
              {request.shipmentNumber && (
                <div><strong>ENVI generado:</strong> {request.shipmentNumber}</div>
              )}
              {request.productionOrderCode && (
                <div>
                  <strong>OPI vinculada:</strong> {request.productionOrderCode}
                  {" "}
                  <Badge color={needsOpiProductionAuthorization(request) ? "warning" : "success"}>
                    {needsOpiProductionAuthorization(request) ? "Borrador" : "Producción autorizada"}
                  </Badge>
                </div>
              )}
              {request.opiAuthorizedAt && (
                <div><strong>Producción autorizada:</strong> {formatDateTimeGt(request.opiAuthorizedAt)}</div>
              )}
              {request.notes && (
                <div className="mt-2"><strong>Observaciones:</strong> {request.notes}</div>
              )}
              {request.rejectionReason && (
                <Alert color="danger" className="mt-2 mb-0 py-2" style={{ fontSize: 12 }}>
                  <strong>Motivo de rechazo:</strong> {request.rejectionReason}
                </Alert>
              )}
            </div>

            <Table responsive size="sm" bordered>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Color</th>
                  <th>Talla</th>
                  <th className="text-right">Cant.</th>
                  {showPricing && <th className="text-right">P. unit.</th>}
                  {showPricing && <th className="text-right">Subtotal</th>}
                </tr>
              </thead>
              <tbody>
                {linesWithPricing.map((line) => (
                  <tr key={line.id || `${line.productId}-${line.colorId}-${line.size}`}>
                    <td>{line.productCode || "—"}</td>
                    <td>{line.productName || "—"}</td>
                    <td>{line.colorName || "—"}</td>
                    <td>{line.size || "—"}</td>
                    <td className="text-right">{line.quantity ?? 0}</td>
                    {showPricing && (
                      <td className="text-right">
                        {line.unitPrice != null ? `Q ${line.unitPrice.toFixed(2)}` : "—"}
                      </td>
                    )}
                    {showPricing && (
                      <td className="text-right">
                        {line.subtotal != null ? `Q ${line.subtotal.toFixed(2)}` : "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {showPricing && (
                <tfoot>
                  <tr>
                    <td colSpan={6} className="text-right font-weight-bold">Total</td>
                    <td className="text-right font-weight-bold">Q {totalAmount.toFixed(2)}</td>
                  </tr>
                </tfoot>
              )}
            </Table>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {request?.status === "PENDIENTE" && canApprove && (
          <>
            {needsOpiProductionAuthorization(request) && onAuthorizeProduction && (
              <Button
                color="primary"
                onClick={() => void handleAuthorizeProduction()}
                disabled={actionId === request?.id}
              >
                {actionId === request?.id ? <Spinner size="sm" /> : "Autorizar producción"}
              </Button>
            )}
            {canApproveInternalShipment(request) && onApprove && (
              <Button
                color="success"
                onClick={() => void handleApprove()}
                disabled={actionId === request?.id}
              >
                {actionId === request?.id ? <Spinner size="sm" /> : "Autorizar envío"}
              </Button>
            )}
            <Button color="danger" outline onClick={handleReject} disabled={actionId === request?.id}>
              Denegar
            </Button>
          </>
        )}
        <Button color="secondary" onClick={onClose}>Cerrar</Button>
      </ModalFooter>
    </Modal>
  );
}

export default InternalShipmentRequestDetailModal;
