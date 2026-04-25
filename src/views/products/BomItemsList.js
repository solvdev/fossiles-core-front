import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Input,
  Label,
  Alert,
} from "reactstrap";
import { getBoms, getBomById } from "services/bomService";
import { getMaterials } from "services/materialService";
import { getUoms } from "services/uomService";

function BomItemsList() {
  const [selectedBom, setSelectedBom] = useState("");
  const [boms, setBoms] = useState([]);
  const [items, setItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [bomData, setBomData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadBoms();
    loadMaterials();
    loadUoms();
  }, []);

  useEffect(() => {
    if (selectedBom) {
      loadBomItems();
    } else {
      setItems([]);
    }
  }, [selectedBom]);

  const loadBoms = async () => {
    try {
      setLoading(true);
      const data = await getBoms();
      setBoms(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las BOMs");
    } finally {
      setLoading(false);
    }
  };

  const loadMaterials = async () => {
    try {
      const data = await getMaterials();
      setMaterials(data || []);
    } catch (err) {
      console.error("Error al cargar materiales:", err);
    }
  };

  const loadUoms = async () => {
    try {
      const data = await getUoms();
      setUoms(data || []);
    } catch (err) {
      console.error("Error al cargar UOMs:", err);
    }
  };

  const loadBomItems = async () => {
    try {
      setLoading(true);
      setError("");
      const bom = await getBomById(selectedBom);
      setBomData(bom);
      setItems(bom.items || []);
    } catch (err) {
      setError(err.message || "Error al cargar los items de la BOM");
      setItems([]);
      setBomData(null);
    } finally {
      setLoading(false);
    }
  };

  const getMaterialName = (materialId) => {
    if (!materialId) return "-";
    const material = materials.find((m) => m.id === materialId);
    if (!material) return `ID: ${materialId}`;
    return material.sku ? `${material.sku} - ${material.name || ""}` : material.name || `ID: ${materialId}`;
  };

  const getMaterialUom = (materialId) => {
    if (!materialId) return "";
    const material = materials.find((m) => m.id === materialId);
    if (!material || !material.uomId) return "";
    const uom = uoms.find((u) => u.id === material.uomId);
    return uom ? uom.code : "";
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">BOM Items</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="4">
                  <Label>Seleccionar BOM</Label>
                  <Input
                    type="select"
                    value={selectedBom}
                    onChange={(e) => setSelectedBom(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Seleccione una BOM</option>
                    {boms.map((bom) => (
                      <option key={bom.id} value={bom.id}>
                        {bom.bomName || `BOM #${bom.id}`}
                      </option>
                    ))}
                  </Input>
                </Col>
              </Row>
              {loading ? (
                <div className="text-center"><p>Cargando...</p></div>
              ) : selectedBom ? (
                <>
                  {bomData && bomData.totalCost !== undefined && (
                    <div className="mb-3 p-3 bg-light rounded">
                      <Row>
                        <Col md="6">
                          <strong>BOM: {bomData.bomName || `BOM #${bomData.id}`}</strong>
                        </Col>
                        <Col md="6" className="text-right">
                          <strong className="text-success" style={{ fontSize: "1.2em" }}>
                            Costo Total: Q {parseFloat(bomData.totalCost).toFixed(2)}
                          </strong>
                        </Col>
                      </Row>
                    </div>
                  )}
                  <Table responsive>
                    <thead className="text-primary">
                      <tr>
                        <th>Material</th>
                        <th>Cantidad</th>
                        <th>Costo Unitario</th>
                        <th>Costo Item</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-center text-muted">
                            No hay items en esta BOM
                          </td>
                        </tr>
                      ) : (
                        items.map((item) => {
                          const material = materials.find((m) => m.id === item.materialId);
                          const materialCost = material && material.cost ? parseFloat(material.cost) : null;
                          const itemCost = item.itemCost ? parseFloat(item.itemCost) : null;
                          const uomCode = getMaterialUom(item.materialId);
                          
                          return (
                            <tr key={item.id}>
                              <td>{getMaterialName(item.materialId)}</td>
                              <td>
                                <strong>{parseFloat(item.quantity).toFixed(3)}</strong>
                                {uomCode && <span className="text-muted ml-1">({uomCode})</span>}
                              </td>
                              <td>
                                {materialCost ? (
                                  <span className="text-info">Q {materialCost.toFixed(2)}</span>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                              <td>
                                {itemCost ? (
                                  <strong className="text-success">Q {itemCost.toFixed(2)}</strong>
                                ) : (
                                  <span className="text-muted">-</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </Table>
                </>
              ) : (
                <div className="text-center text-muted">
                  <p>Seleccione una BOM para ver sus items</p>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default BomItemsList;

