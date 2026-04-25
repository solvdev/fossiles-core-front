import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Table,
  Alert,
  FormGroup,
  Label,
  Input,
  Row,
  Col,
  Button,
} from "reactstrap";
import { getMaterialConsumptionHistory, getMaterialStockIntelligence } from "services/stockIntelligenceService";
import { getMaterials } from "services/materialService";
import { showError } from "utils/notificationHelper";

function MaterialConsumptionHistory() {
  const [materials, setMaterials] = useState([]);
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [consumptionHistory, setConsumptionHistory] = useState([]);
  const [stockIntelligence, setStockIntelligence] = useState(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMaterials();
  }, []);

  useEffect(() => {
    if (selectedMaterialId) {
      loadConsumptionHistory();
      loadStockIntelligence();
    }
  }, [selectedMaterialId, days]);

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
    }
  };

  const loadConsumptionHistory = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getMaterialConsumptionHistory(selectedMaterialId, days);
      setConsumptionHistory(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar historial de consumo");
      showError(err.message || "Error al cargar historial de consumo");
    } finally {
      setLoading(false);
    }
  };

  const loadStockIntelligence = async () => {
    try {
      const data = await getMaterialStockIntelligence(selectedMaterialId);
      setStockIntelligence(data);
    } catch (err) {
      console.error("Error al cargar inteligencia de stock:", err);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "-";
    return new Date(dateString).toLocaleDateString("es-GT");
  };

  const selectedMaterial = materials.find((m) => m.id === parseInt(selectedMaterialId));

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Historial de Consumo de Materiales</CardTitle>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}

          <Row className="mb-4">
            <Col md="6">
              <FormGroup>
                <Label>Seleccionar Material</Label>
                <Input
                  type="select"
                  value={selectedMaterialId}
                  onChange={(e) => setSelectedMaterialId(e.target.value)}
                >
                  <option value="">Seleccione un material</option>
                  {materials.map((material) => (
                    <option key={material.id} value={material.id}>
                      {material.sku} - {material.name}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Días de Historial</Label>
                <Input
                  type="select"
                  value={days}
                  onChange={(e) => setDays(parseInt(e.target.value))}
                >
                  <option value="7">Últimos 7 días</option>
                  <option value="14">Últimos 14 días</option>
                  <option value="30">Últimos 30 días</option>
                  <option value="60">Últimos 60 días</option>
                  <option value="90">Últimos 90 días</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>&nbsp;</Label>
                <Button color="primary" block onClick={loadConsumptionHistory}>
                  Actualizar
                </Button>
              </FormGroup>
            </Col>
          </Row>

          {selectedMaterialId && selectedMaterial && (
            <>
              {/* Información de Inteligencia */}
              {stockIntelligence && (
                <Card className="mb-4 bg-light">
                  <CardBody>
                    <Row>
                      <Col md="3">
                        <strong>Stock Actual:</strong> {selectedMaterial.quantity || 0}
                      </Col>
                      <Col md="3">
                        <strong>Consumo Promedio/Día:</strong>{" "}
                        {stockIntelligence.averageDailyConsumption || "0.00"}
                      </Col>
                      <Col md="3">
                        <strong>Punto de Reorden:</strong> {stockIntelligence.reorderPoint || "-"}
                      </Col>
                      <Col md="3">
                        <strong>Días de Entrega:</strong> {selectedMaterial.deliveryDays || "-"}
                      </Col>
                    </Row>
                  </CardBody>
                </Card>
              )}

              {/* Historial de Consumo */}
              {loading ? (
                <p>Cargando historial...</p>
              ) : consumptionHistory.length === 0 ? (
                <Alert color="info">
                  No hay historial de consumo para este material en los últimos {days} días.
                </Alert>
              ) : (
                <Table responsive striped>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Cantidad Consumida</th>
                      <th>Origen</th>
                      <th>Referencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {consumptionHistory.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatDate(entry.consumptionDate)}</td>
                        <td>
                          <strong>{entry.quantityConsumed}</strong>
                        </td>
                        <td>
                          {entry.source === "PRODUCTION_ORDER" && (
                            <span className="badge badge-info">Orden de Producción</span>
                          )}
                          {entry.source === "TASK" && (
                            <span className="badge badge-warning">Tarea</span>
                          )}
                          {entry.source === "MANUAL" && (
                            <span className="badge badge-secondary">Manual</span>
                          )}
                          {!entry.source && <span>-</span>}
                        </td>
                        <td>{entry.sourceReferenceId || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th>Total ({consumptionHistory.length} días)</th>
                      <th>
                        {consumptionHistory
                          .reduce((sum, entry) => sum + parseFloat(entry.quantityConsumed || 0), 0)
                          .toFixed(3)}
                      </th>
                      <th colSpan="2"></th>
                    </tr>
                  </tfoot>
                </Table>
              )}
            </>
          )}

          {!selectedMaterialId && (
            <Alert color="info">Seleccione un material para ver su historial de consumo.</Alert>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

export default MaterialConsumptionHistory;

