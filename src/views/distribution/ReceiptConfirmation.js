import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Row,
  Spinner,
} from "reactstrap";
import ShipmentReceiptPanel from "components/distribution/ShipmentReceiptPanel";
import { getShipmentsInTransit, getShipmentsByStatus } from "services/productDistributionService";
import { showError } from "utils/notificationHelper";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
};

const tStatus = (status) => STATUS_ES[status] || status || "-";

function ReceiptConfirmation() {
  const location = useLocation();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedShipmentId, setSelectedShipmentId] = useState(location.state?.shipmentId || null);

  useEffect(() => {
    loadPendingReceipts();
  }, []);

  const loadPendingReceipts = async () => {
    try {
      setLoading(true);
      setError("");
      const [inTransit, delivered] = await Promise.all([
        getShipmentsInTransit(),
        getShipmentsByStatus("DELIVERED"),
      ]);
      const merged = [...(inTransit || []), ...(delivered || [])];
      const byId = new Map();
      merged.forEach((shipment) => {
        if (shipment?.id != null) {
          byId.set(shipment.id, shipment);
        }
      });
      setShipments(Array.from(byId.values()));
    } catch (err) {
      const message = err.message || "No se pudieron cargar envios pendientes de recepcion";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const filteredShipmentsForExport = useMemo(() => shipments, [shipments]);

  const exportCurrentList = () => {
    exportRowsToCsv("historial_recepciones", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
    ], filteredShipmentsForExport);
  };

  const exportCurrentPdf = () => {
    exportRowsToPdf("Historial de Recepciones", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
    ], filteredShipmentsForExport);
  };

  const handleSelectShipment = (shipment) => {
    if (!shipment) {
      setSelectedShipmentId(null);
      return;
    }
    setSelectedShipmentId((prev) => (prev === shipment.id ? null : shipment.id));
  };

  const handleConfirmed = async () => {
    setSelectedShipmentId(null);
    await loadPendingReceipts();
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div>
                  <CardTitle tag="h4" className="mb-1">Confirmacion de Recepcion</CardTitle>
                  <p className="text-muted mb-0">
                    Confirma cantidades recibidas por envio y registra faltantes u observaciones.
                    Los envíos entregados permiten sincronizar inventario kiosco (productos, tallas y empaques SUM-).
                  </p>
                </div>
                <Button color="info" size="sm" onClick={loadPendingReceipts} disabled={loading}>
                  {loading ? <Spinner size="sm" /> : <><i className="nc-icon nc-refresh-69 mr-1" />Actualizar</>}
                </Button>
                <Button color="secondary" size="sm" className="ml-2" onClick={exportCurrentList}>
                  <i className="nc-icon nc-cloud-download-93 mr-1" />
                  CSV
                </Button>
                <Button color="secondary" size="sm" className="ml-2" onClick={exportCurrentPdf}>
                  <i className="nc-icon nc-single-copy-04 mr-1" />
                  PDF
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <ShipmentReceiptPanel
                shipments={shipments}
                loading={loading}
                showLocation
                embedded
                actionLabel="Recibir"
                selectedShipmentId={selectedShipmentId}
                onSelectShipment={handleSelectShipment}
                onConfirmed={handleConfirmed}
                emptyMessage="No hay envios en tránsito ni entregados recientes para este alcance."
              />
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ReceiptConfirmation;
