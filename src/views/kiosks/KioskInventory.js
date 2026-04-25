import React, { useState, useEffect } from "react";
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
  Alert,
} from "reactstrap";
import { getLocations } from "services/locationService";

function KioskInventory() {
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [locations, setLocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      const data = await getLocations();
      setLocations(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar los kioscos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Inventario del Kiosko</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="4">
                  <Label>Filtrar por Kiosko</Label>
                  <Input
                    type="select"
                    value={selectedKiosk}
                    onChange={(e) => setSelectedKiosk(e.target.value)}
                    disabled={loading}
                  >
                    <option value="">Todos los kioskos</option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name} {location.categoria ? `(${location.categoria})` : ""}
                      </option>
                    ))}
                  </Input>
                </Col>
              </Row>
              {loading ? (
                <div className="text-center"><p>Cargando...</p></div>
              ) : inventory.length === 0 ? (
                <div className="text-center"><p>No hay inventario de kioskos registrado.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Kiosko</th>
                      <th>Producto</th>
                      <th>Stock Actual</th>
                      <th>Stock Mínimo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.map((item) => (
                      <tr key={item.id}>
                        <td>{item.kioskName}</td>
                        <td>{item.productName}</td>
                        <td>{item.stock}</td>
                        <td>{item.minStock}</td>
                        <td>
                          {item.stock < item.minStock ? (
                            <Badge color="danger">Crítico</Badge>
                          ) : (
                            <Badge color="success">Normal</Badge>
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

export default KioskInventory;

