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
  Badge,
  Input,
  Label,
  Alert,
} from "reactstrap";
import { getLocations } from "services/locationService";

function KioskReturns() {
  const [selectedKiosk, setSelectedKiosk] = useState("");
  const [locations, setLocations] = useState([]);
  const [returns, setReturns] = useState([]);
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
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Devoluciones / Reintegros</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Devolución
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <p className="text-muted">Productos devueltos → regresan a Bodega PT</p>
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
              ) : returns.length === 0 ? (
                <div className="text-center"><p>No hay devoluciones registradas.</p></div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Código</th>
                      <th>Kiosko</th>
                      <th>Producto</th>
                      <th>Cantidad</th>
                      <th>Motivo</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returns.map((returnItem) => (
                      <tr key={returnItem.id}>
                        <td>{returnItem.code}</td>
                        <td>{returnItem.kioskName}</td>
                        <td>{returnItem.productName}</td>
                        <td>{returnItem.quantity}</td>
                        <td>{returnItem.reason}</td>
                        <td><Badge color="warning">{returnItem.status}</Badge></td>
                        <td className="text-right">
                          <Button color="success" size="sm" className="btn-round">
                            <i className="nc-icon nc-check-2" /> Reintegrar
                          </Button>
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

export default KioskReturns;

