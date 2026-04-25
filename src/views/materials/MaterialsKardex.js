import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Input,
  Label,
  Badge,
  Spinner,
  Alert,
} from "reactstrap";
import { getMaterialKardex } from "services/inventoryService";
import { getMaterials } from "services/materialService";
import { showError } from "utils/notificationHelper";

function MaterialsKardex() {
  const { materialId } = useParams();
  const [selectedMaterial, setSelectedMaterial] = useState(materialId || "");
  const [kardex, setKardex] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadMaterials();
    if (materialId) {
      loadKardex(materialId);
    }
  }, [materialId]);

  useEffect(() => {
    if (selectedMaterial) {
      loadKardex(selectedMaterial);
    } else {
      setKardex([]);
    }
  }, [selectedMaterial]);

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
    }
  };

  const loadKardex = async (matId) => {
    try {
      setLoading(true);
      setError("");
      const data = await getMaterialKardex(matId);
      setKardex(data || []);
    } catch (err) {
      const errorMessage = err.message || "Error al cargar kardex del material";
      setError(errorMessage);
      showError(errorMessage);
      setKardex([]);
    } finally {
      setLoading(false);
    }
  };

  const getMovementTypeBadge = (type) => {
    const typeMap = {
      ENTRY: { color: "success", text: "Entrada" },
      EXIT: { color: "danger", text: "Salida" },
      ADJUSTMENT: { color: "warning", text: "Ajuste" },
    };
    const config = typeMap[type] || { color: "secondary", text: type };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const formatNumber = (value) => {
    if (value == null) return "0";
    return parseFloat(value).toFixed(3);
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Movimientos de Material (Kardex)</CardTitle>
              <Badge color="info" className="mt-2">
                Método: FIFO (First In, First Out)
              </Badge>
              <small className="text-muted d-block mt-1">
                Los costos de salida se calculan usando el método FIFO (los lotes más antiguos se consumen primero)
              </small>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Material</Label>
                  <Input
                    type="select"
                    value={selectedMaterial}
                    onChange={(e) => setSelectedMaterial(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Seleccione un material</option>
                    {materials.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.sku} - {material.name}
                      </option>
                    ))}
                  </Input>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando kardex...</p>
                </div>
              ) : !selectedMaterial ? (
                <Alert color="info">
                  Por favor seleccione un material para ver su kardex.
                </Alert>
              ) : kardex.length === 0 ? (
                <Alert color="warning">
                  No hay movimientos registrados para este material.
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Cantidad</th>
                      <th>Stock Antes</th>
                      <th>Stock Después</th>
                      <th>Costo Unitario (FIFO)</th>
                      <th>Costo Total (FIFO)</th>
                      <th>Referencia</th>
                      <th>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {kardex.map((movement) => (
                      <tr key={movement.id}>
                        <td>{formatDate(movement.movementDate)}</td>
                        <td>{getMovementTypeBadge(movement.movementType)}</td>
                        <td>
                          <strong className={movement.quantity >= 0 ? "text-success" : "text-danger"}>
                            {movement.quantity >= 0 ? "+" : ""}{formatNumber(movement.quantity)}
                          </strong>
                        </td>
                        <td>{formatNumber(movement.quantityBefore)}</td>
                        <td>
                          <strong>{formatNumber(movement.quantityAfter)}</strong>
                        </td>
                        <td>
                          {movement.unitCost ? (
                            <span>
                              Q{formatNumber(movement.unitCost)}
                              {movement.movementType === "EXIT" && (
                                <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                                  FIFO
                                </Badge>
                              )}
                            </span>
                          ) : "N/A"}
                        </td>
                        <td>
                          {movement.totalCost ? (
                            <span>
                              <strong>Q{formatNumber(movement.totalCost)}</strong>
                              {movement.movementType === "EXIT" && (
                                <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                                  FIFO
                                </Badge>
                              )}
                            </span>
                          ) : "N/A"}
                        </td>
                        <td>
                          {movement.referenceNumber ? (
                            <small>{movement.referenceType}: {movement.referenceNumber}</small>
                          ) : (
                            "N/A"
                          )}
                        </td>
                        <td>
                          {movement.description && movement.description.includes("[FIFO:") ? (
                            <small>
                              {movement.description.split("[FIFO:")[0]}
                              <Badge color="info" className="ml-1" style={{ fontSize: "0.7rem" }}>
                                {movement.description.match(/\[FIFO:.*?\]/)?.[0]}
                              </Badge>
                            </small>
                          ) : (
                            <small>{movement.description || "N/A"}</small>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default MaterialsKardex;

