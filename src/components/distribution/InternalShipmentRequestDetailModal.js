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
import {
  RequestActionButtons,
  StockIndicator,
  describeStock,
} from "components/distribution/InternalRequestStock";
import { getInternalShipmentRequestById } from "services/internalShipmentRequestService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  computeInternalEnviUnitPrice,
  formatInternalRequestTypeLabel,
  formatQty,
  needsOpiProductionAuthorization,
} from "utils/standaloneInternalShipmentHelper";
import { showError } from "utils/notificationHelper";

const BANNER_TONES = {
  ok: { fg: "#1f7a46", bg: "#e6f6ec", border: "#b6e2c6" },
  danger: { fg: "#b42323", bg: "#fdeaea", border: "#f4bcbc" },
  warn: { fg: "#9a6200", bg: "#fff4dc", border: "#f2d9a0" },
  info: { fg: "#2f5d9e", bg: "#e8f0fb", border: "#bcd1ef" },
};

const BANNER_TEXT = {
  DISPONIBLE: {
    title: "Hay stock para despachar",
    body: "Todas las líneas alcanzan en Devoluciones / Bodega PT. Puede autorizar el envío y se generará el ENVI.",
  },
  SIN_STOCK: {
    title: "Sin stock suficiente",
    body: "Hay líneas que no alcanzan. Autorice la producción: se genera una OPI solo por el faltante y el envío se habilita cuando el producto entre a Bodega PT.",
  },
  EN_PRODUCCION: {
    title: "Producción autorizada, esperando ingreso a Bodega PT",
    body: "El envío se podrá autorizar cuando el producto terminado de la OPI ingrese a Bodega PT.",
  },
};

function StockBanner({ request }) {
  const info = describeStock(request);
  const text = BANNER_TEXT[request.stockStatus];
  const tone = BANNER_TONES[info?.tone] || BANNER_TONES.info;
  return (
    <div
      className="mb-3 d-flex align-items-start justify-content-between flex-wrap"
      style={{
        gap: 12,
        padding: "12px 14px",
        borderRadius: 8,
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        borderLeft: `4px solid ${tone.fg}`,
      }}
    >
      <div style={{ flex: "1 1 260px" }}>
        <div style={{ color: tone.fg, fontWeight: 700, fontSize: 14 }}>{text.title}</div>
        <div style={{ fontSize: 12.5, color: "#444", marginTop: 2 }}>{text.body}</div>
      </div>
      <StockIndicator request={request} />
    </div>
  );
}

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

  const reloadRequest = async () => {
    if (!requestId) return;
    try {
      const data = await getInternalShipmentRequestById(requestId);
      setRequest(data);
    } catch {
      // Si falla el refresco, se conserva el detalle mostrado previamente.
    }
  };

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
  const showStock = Boolean(request?.stockStatus);

  // La confirmación y los avisos los maneja la vista; aquí solo se refresca el detalle si no se pudo completar
  // (el stock pudo cambiar o la OPI pudo generarse).
  const handleApprove = async () => {
    if (!request || !onApprove) return;
    const done = await onApprove(request);
    if (!done) await reloadRequest();
  };

  const handleAuthorizeProduction = async () => {
    if (!request || !onAuthorizeProduction) return;
    const done = await onAuthorizeProduction(request);
    if (!done) await reloadRequest();
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
            {request.stockStatus && BANNER_TEXT[request.stockStatus] && (
              <StockBanner request={request} />
            )}
            <div className="mb-3" style={{ fontSize: 13 }}>
              {request.slipNumber && (
                <div><strong>Boleta física (BLS):</strong> <Badge color="primary">{request.slipNumber}</Badge></div>
              )}
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
                  {showStock && <th className="text-right">Disponible</th>}
                  {showStock && <th className="text-right">Faltante</th>}
                  {showPricing && <th className="text-right">P. unit.</th>}
                  {showPricing && <th className="text-right">Subtotal</th>}
                </tr>
              </thead>
              <tbody>
                {linesWithPricing.map((line) => (
                  <tr
                    key={line.id || `${line.productId}-${line.colorId}-${line.size}`}
                    style={showStock && Number(line.shortageQuantity) > 0 ? { background: "#fff5f5" } : undefined}
                  >
                    <td>{line.productCode || "—"}</td>
                    <td>{line.productName || "—"}</td>
                    <td>{line.colorName || "—"}</td>
                    <td>{line.size || "—"}</td>
                    <td className="text-right">{line.quantity ?? 0}</td>
                    {showStock && (
                      <td className="text-right">{formatQty(line.availableQuantity)}</td>
                    )}
                    {showStock && (
                      <td
                        className="text-right"
                        style={Number(line.shortageQuantity) > 0
                          ? { color: "#b42323", fontWeight: 700 }
                          : { color: "#1f7a46" }}
                      >
                        {Number(line.shortageQuantity) > 0 ? formatQty(line.shortageQuantity) : "✓"}
                      </td>
                    )}
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
                    <td colSpan={showStock ? 8 : 6} className="text-right font-weight-bold">Total</td>
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
          <RequestActionButtons
            request={request}
            size="md"
            busy={actionId === request?.id}
            onAuthorizeShipment={() => void handleApprove()}
            onAuthorizeProduction={() => void handleAuthorizeProduction()}
            onReject={() => handleReject()}
          />
        )}
        <Button color="secondary" onClick={onClose}>Cerrar</Button>
      </ModalFooter>
    </Modal>
  );
}

export default InternalShipmentRequestDetailModal;
