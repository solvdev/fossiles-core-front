import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Input,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getShipmentsInTransit } from "services/productDistributionService";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";

const STATUS_STYLE = {
  SENT: { bg: "#dbeafe", color: "#1d4ed8" },
  DELIVERED: { bg: "#dcfce7", color: "#166534" },
};

const STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
};

const tStatus = (status) => STATUS_ES[status] || status || "-";

function ShipmentsInTransit() {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedShipmentId, setExpandedShipmentId] = useState(null);
  const [search, setSearch] = useState("");

  const loadShipments = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getShipmentsInTransit();
      setShipments(data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar historial de envios");
    } finally {
      setLoading(false);
    }
  };

  const exportCurrentList = () => {
    exportRowsToCsv("historial_envios", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Codigo Kiosko", value: (s) => s.locationCode || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
      { label: "Unidades", value: (s) => (s.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0) },
    ], filteredShipments);
  };

  const exportCurrentPdf = () => {
    exportRowsToPdf("Historial de Envios", [
      { label: "Envio", value: (s) => s.shipmentNumber || s.id },
      { label: "Kiosko", value: (s) => s.locationName || "-" },
      { label: "Codigo Kiosko", value: (s) => s.locationCode || "-" },
      { label: "Estado", value: (s) => tStatus(s.status) },
      { label: "Fecha Envio", value: (s) => (s.sentAt ? formatDateTimeGt(s.sentAt) : "-") },
      { label: "Fecha Recepcion", value: (s) => (s.receivedAt ? formatDateTimeGt(s.receivedAt) : "-") },
      { label: "Productos", value: (s) => (s.products || []).length },
      { label: "Unidades", value: (s) => (s.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0) },
    ], filteredShipments);
  };

  useEffect(() => {
    loadShipments();
  }, []);

  const filteredShipments = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    if (!q) return shipments;
    return shipments.filter((shipment) => {
      const header = `${shipment.shipmentNumber || ""} ${shipment.locationName || ""} ${shipment.locationCode || ""}`
        .toLowerCase();
      const products = (shipment.products || [])
        .map((p) => `${p.productCode || ""} ${p.productName || ""}`)
        .join(" ")
        .toLowerCase();
      return header.includes(q) || products.includes(q);
    });
  }, [shipments, search]);

  const totalTransitShipments = filteredShipments.length;
  const totalTransitUnits = filteredShipments.reduce((sum, shipment) => (
    sum + (shipment.products || []).reduce((acc, p) => acc + Number(p.quantity || 0), 0)
  ), 0);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-center flex-wrap">
                <div>
                  <CardTitle tag="h4" className="mb-1">Envios en Transito</CardTitle>
                  <p className="text-muted mb-0">
                    Consulta envios que ya salieron y aun no han sido recibidos.
                  </p>
                </div>
                <div>
                  <Button color="info" size="sm" onClick={loadShipments} disabled={loading} className="mr-2">
                    {loading ? <Spinner size="sm" /> : <><i className="nc-icon nc-refresh-69 mr-1" />Actualizar</>}
                  </Button>
                  <Button color="secondary" size="sm" onClick={exportCurrentList} className="mr-2">
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    CSV
                  </Button>
                  <Button color="secondary" size="sm" onClick={exportCurrentPdf} className="mr-2">
                    <i className="nc-icon nc-single-copy-04 mr-1" />
                    PDF
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => navigate("/admin/receipt-confirmation")}
                  >
                    <i className="nc-icon nc-check-2 mr-1" />
                    Ir a Confirmacion de Recepcion
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="5">
                  <Input
                    type="search"
                    placeholder="Buscar por envio, kiosko, codigo o producto..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Col>
                <Col md="7" className="d-flex align-items-center justify-content-end">
                  <Badge color="primary" className="mr-2">Envios: {totalTransitShipments}</Badge>
                  <Badge color="info">Unidades en transito: {totalTransitUnits}</Badge>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : filteredShipments.length === 0 ? (
                <Alert color="light" className="mb-0">No hay envios para los filtros seleccionados.</Alert>
              ) : (
                <>
                  <Table responsive hover>
                    <thead className="text-primary">
                      <tr>
                        <th>Envio</th>
                        <th>Kiosko</th>
                        <th>Fecha envio</th>
                        <th>Productos</th>
                        <th>Estado</th>
                        <th className="text-right">Accion</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredShipments.map((shipment) => {
                        const style = STATUS_STYLE[shipment.status] || { bg: "#e5e7eb", color: "#374151" };
                        const qty = (shipment.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0);
                        return (
                          <tr
                            key={shipment.id}
                            style={{ backgroundColor: expandedShipmentId === shipment.id ? "#f8fbff" : "transparent" }}
                          >
                            <td><strong>{shipment.shipmentNumber}</strong></td>
                            <td>{shipment.locationName || "-"}</td>
                            <td>{shipment.sentAt ? formatDateTimeGt(shipment.sentAt) : "-"}</td>
                            <td>
                              {(shipment.products?.length || 0)} prod. / {qty} und.
                            </td>
                            <td>
                              <span style={{ backgroundColor: style.bg, color: style.color, borderRadius: 999, padding: "4px 10px", fontWeight: 700, fontSize: 12 }}>
                                {tStatus(shipment.status)}
                              </span>
                            </td>
                            <td className="text-right">
                              <Button
                                size="sm"
                                color={expandedShipmentId === shipment.id ? "primary" : "outline-primary"}
                                onClick={() => setExpandedShipmentId(expandedShipmentId === shipment.id ? null : shipment.id)}
                                className="mr-2"
                              >
                                {expandedShipmentId === shipment.id ? "Ocultar" : "Ver Detalle"}
                              </Button>
                              <Button
                                size="sm"
                                color="success"
                                onClick={() => navigate("/admin/receipt-confirmation", { state: { shipmentId: shipment.id } })}
                              >
                                Recibir
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>

                  {expandedShipmentId && (
                    <Card className="mt-3" style={{ border: "1px solid #dbeafe" }}>
                      <CardHeader style={{ backgroundColor: "#eff6ff" }}>
                        <h6 className="mb-0">
                          Detalle del envio {
                            (filteredShipments.find((s) => s.id === expandedShipmentId) || {}).shipmentNumber
                          }
                        </h6>
                      </CardHeader>
                      <CardBody>
                        <Table responsive size="sm" className="mb-0">
                          <thead>
                            <tr>
                              <th>Codigo</th>
                              <th>Producto</th>
                              <th>Color</th>
                              <th className="text-right">Cantidad enviada</th>
                            </tr>
                          </thead>
                          <tbody>
                            {((filteredShipments.find((s) => s.id === expandedShipmentId) || {}).products || []).map((p) => (
                              <tr key={p.id}>
                                <td><strong>{p.productCode || "-"}</strong></td>
                                <td>{p.productName || "-"}</td>
                                <td>{p.colorName || "-"}</td>
                                <td className="text-right">{Number(p.quantity || 0)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      </CardBody>
                    </Card>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ShipmentsInTransit;

