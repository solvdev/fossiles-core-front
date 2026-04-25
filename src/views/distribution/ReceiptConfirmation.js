import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Badge,
  Col,
  Input,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { confirmReceipt, getShipmentsInTransit } from "services/productDistributionService";
import { showError, showSuccess } from "utils/notificationHelper";
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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedShipmentId, setSelectedShipmentId] = useState(location.state?.shipmentId || null);
  const [receivedByDetail, setReceivedByDetail] = useState({});
  const [notes, setNotes] = useState("");

  useEffect(() => {
    loadPendingReceipts();
  }, []);

  const loadPendingReceipts = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getShipmentsInTransit();
      setShipments(data || []);
    } catch (err) {
      const message = err.message || "No se pudieron cargar envios pendientes de recepcion";
      setError(message);
      showError(message);
    } finally {
      setLoading(false);
    }
  };

  const filteredShipments = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    return shipments.filter((shipment) => {
      if (statusFilter !== "ALL" && shipment.status !== statusFilter) return false;
      if (!q) return true;
      const text = `${shipment.shipmentNumber || ""} ${shipment.locationName || ""} ${shipment.locationCode || ""}`
        .toLowerCase();
      const products = (shipment.products || [])
        .map((p) => `${p.productCode || ""} ${p.productName || ""}`)
        .join(" ")
        .toLowerCase();
      return text.includes(q) || products.includes(q);
    });
  }, [shipments, search, statusFilter]);

  const exportCurrentList = () => {
    exportRowsToCsv("historial_recepciones", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
    ], filteredShipments);
  };

  const exportCurrentPdf = () => {
    exportRowsToPdf("Historial de Recepciones", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
    ], filteredShipments);
  };

  const selectedShipment = useMemo(
    () => filteredShipments.find((shipment) => shipment.id === selectedShipmentId)
      || shipments.find((shipment) => shipment.id === selectedShipmentId)
      || null,
    [filteredShipments, shipments, selectedShipmentId]
  );

  useEffect(() => {
    if (!selectedShipment) {
      setReceivedByDetail({});
      setNotes("");
      return;
    }
    const initialMap = {};
    (selectedShipment.products || []).forEach((product) => {
      initialMap[product.id] = Number(product.quantityReceived ?? product.quantity ?? 0);
    });
    setReceivedByDetail(initialMap);
  }, [selectedShipment]);

  const totalSent = useMemo(() => {
    if (!selectedShipment) return 0;
    return (selectedShipment.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0);
  }, [selectedShipment]);

  const totalReceived = useMemo(() => (
    Object.values(receivedByDetail).reduce((sum, qty) => sum + Number(qty || 0), 0)
  ), [receivedByDetail]);

  const updateReceivedQty = (detailId, value, max) => {
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      setReceivedByDetail((prev) => ({ ...prev, [detailId]: 0 }));
      return;
    }
    const bounded = Math.max(0, Math.min(parsed, Number(max || 0)));
    setReceivedByDetail((prev) => ({ ...prev, [detailId]: bounded }));
  };

  const handleConfirmReceipt = async () => {
    if (!selectedShipment) {
      showError("Selecciona un envio para confirmar");
      return;
    }
    if (selectedShipment.status !== "SENT") {
      showError("Solo se puede confirmar recepción para envíos en estado SENT.");
      return;
    }
    try {
      setSaving(true);
      setError("");
      const items = (selectedShipment.products || []).map((product) => ({
        detailId: product.id,
        quantityReceived: Number(receivedByDetail[product.id] ?? product.quantity ?? 0),
      }));
      await confirmReceipt(selectedShipment.id, {
        notes: notes || null,
        items,
      });
      showSuccess("Recepcion confirmada. Inventario de kiosko actualizado.");
      setSelectedShipmentId(null);
      setNotes("");
      await loadPendingReceipts();
    } catch (err) {
      const message = err.message || "No se pudo confirmar la recepcion";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
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

              <Row className="mb-3">
                <Col md="6">
                  <Input
                    type="search"
                    placeholder="Buscar envio, kiosko, codigo o producto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Col>
                <Col md="3">
                  <Input
                    type="select"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="ALL">Todos</option>
                    <option value="SENT">Enviado</option>
                  </Input>
                </Col>
                <Col md="3" className="d-flex justify-content-end align-items-center">
                  <Badge color="warning">Registros: {filteredShipments.length}</Badge>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : filteredShipments.length === 0 ? (
                <Alert color="light" className="mb-0">No hay envios pendientes de recepcion.</Alert>
              ) : (
                <Table responsive hover>
                  <thead className="text-primary">
                    <tr>
                      <th>Envio</th>
                      <th>Kiosko</th>
                      <th>Fecha envio</th>
                      <th>Productos</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShipments.map((shipment) => (
                      <tr key={shipment.id} style={{ backgroundColor: selectedShipmentId === shipment.id ? "#f8fbff" : "transparent" }}>
                        <td><strong>{shipment.shipmentNumber}</strong></td>
                        <td>{shipment.locationName || "-"} {shipment.locationCode ? `(${shipment.locationCode})` : ""}</td>
                        <td>{shipment.sentAt ? formatDateTimeGt(shipment.sentAt) : "-"}</td>
                        <td>{(shipment.products || []).length}</td>
                        <td><Badge color="warning">{tStatus(shipment.status)}</Badge></td>
                        <td className="text-right">
                          {shipment.status === "SENT" ? (
                            <Button
                              color={selectedShipmentId === shipment.id ? "secondary" : "primary"}
                              size="sm"
                              onClick={() => setSelectedShipmentId(selectedShipmentId === shipment.id ? null : shipment.id)}
                            >
                              {selectedShipmentId === shipment.id ? "Cerrar" : "Recibir"}
                            </Button>
                          ) : (
                            <Badge color="secondary">Solo lectura</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}

              {selectedShipment && (
                <Card className="mt-3" style={{ border: "1px solid #dbeafe" }}>
                  <CardHeader style={{ backgroundColor: "#eff6ff" }}>
                    <div className="d-flex justify-content-between align-items-center flex-wrap">
                      <h6 className="mb-0">
                        Recepcion - {selectedShipment.shipmentNumber} ({selectedShipment.locationName})
                      </h6>
                      <small className="text-muted">
                        Enviado: {totalSent} · Recibido: {totalReceived} · Diferencia: {Math.max(totalSent - totalReceived, 0)}
                      </small>
                    </div>
                  </CardHeader>
                  <CardBody>
                    <Table responsive size="sm">
                      <thead>
                        <tr>
                          <th>Codigo</th>
                          <th>Producto</th>
                          <th>Color</th>
                          <th className="text-right">Enviado</th>
                          <th className="text-right">Recibido</th>
                          <th className="text-right">Faltante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(selectedShipment.products || []).map((product) => {
                          const sent = Number(product.quantity || 0);
                          const received = Number(receivedByDetail[product.id] ?? 0);
                          const missing = Math.max(sent - received, 0);
                          return (
                            <tr key={product.id}>
                              <td><strong>{product.productCode || "-"}</strong></td>
                              <td>{product.productName || "-"}</td>
                              <td>{product.colorName || "-"}</td>
                              <td className="text-right">{sent}</td>
                              <td className="text-right" style={{ width: 150 }}>
                                <Input
                                  type="number"
                                  min="0"
                                  max={sent}
                                  step="0.001"
                                  bsSize="sm"
                                  value={received}
                                  onChange={(e) => updateReceivedQty(product.id, e.target.value, sent)}
                                />
                              </td>
                              <td className="text-right">
                                {missing > 0 ? <Badge color="warning">{missing}</Badge> : <Badge color="success">0</Badge>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </Table>

                    <Row>
                      <Col md="9">
                        <Input
                          type="textarea"
                          rows="2"
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Observaciones de recepcion (faltantes, danos, diferencias, etc.)"
                        />
                      </Col>
                      <Col md="3" className="d-flex justify-content-end align-items-end">
                        <Button color="success" onClick={handleConfirmReceipt} disabled={saving}>
                          {saving ? <Spinner size="sm" /> : <><i className="nc-icon nc-check-2 mr-1" />Confirmar recepcion</>}
                        </Button>
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ReceiptConfirmation;

