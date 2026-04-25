import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Button,
  Badge,
  Alert,
  Spinner,
} from "reactstrap";
import {
  getDistribuciones,
  deleteDistribucion,
} from "services/distribucionService";
import { showError, showSuccess } from "utils/notificationHelper";

function DistribucionesList() {
  const navigate = useNavigate();
  const [distribuciones, setDistribuciones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    loadDistribuciones();
  }, []);

  const loadDistribuciones = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getDistribuciones();
      setDistribuciones(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar distribuciones");
      showError(err.message || "Error al cargar distribuciones");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar esta distribución? Se eliminarán todos los envíos asociados.")) {
      return;
    }
    try {
      setError("");
      await deleteDistribucion(id);
      showSuccess("Distribución eliminada correctamente");
      await loadDistribuciones();
    } catch (err) {
      setError(err.message || "Error al eliminar distribución");
      showError(err.message || "Error al eliminar distribución");
    }
  };

  const getEstadoBadge = (estado) => {
    const estadoMap = {
      BORRADOR: { color: "secondary", text: "Borrador" },
      CONFIRMADA: { color: "info", text: "Confirmada" },
      ENVIADA: { color: "warning", text: "Enviada" },
      FINALIZADA: { color: "success", text: "Finalizada" },
    };
    const config = estadoMap[estado] || { color: "default", text: estado };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return dateString;
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
                  <CardTitle tag="h4">Distribuciones de Productos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => navigate("/admin/distribuciones/nueva")}
                    className="mt-2"
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Nueva Distribución
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando distribuciones...</p>
                </div>
              ) : distribuciones.length === 0 ? (
                <Alert color="info" className="mt-3">
                  No hay distribuciones registradas. Haz clic en "Nueva Distribución" para crear una.
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Número</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Envíos</th>
                      <th>Descripción</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distribuciones.map((distribucion) => (
                      <tr key={distribucion.id}>
                        <td>
                          <strong>{distribucion.numeroDistribucion}</strong>
                        </td>
                        <td>{formatDate(distribucion.fecha)}</td>
                        <td>{getEstadoBadge(distribucion.estado)}</td>
                        <td>{distribucion.cantidadEnvios || 0}</td>
                        <td>
                          <small className="text-muted">
                            {distribucion.descripcion || "Sin descripción"}
                          </small>
                        </td>
                        <td>
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => navigate(`/admin/distribuciones/${distribucion.id}`)}
                            className="mr-2"
                          >
                            <i className="nc-icon nc-zoom-split" />
                          </Button>
                          {distribucion.estado !== "FINALIZADA" && (
                            <Button
                              color="danger"
                              size="sm"
                              onClick={() => handleDelete(distribucion.id)}
                            >
                              <i className="nc-icon nc-simple-remove" />
                            </Button>
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

export default DistribucionesList;

