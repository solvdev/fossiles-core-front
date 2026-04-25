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
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
} from "reactstrap";
import { getDocumentSeries, deleteDocumentSeries, resetCorrelative } from "services/documentSeriesService";
import DocumentSeriesForm from "./DocumentSeriesForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

function DocumentSeries() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedSeriesId, setSelectedSeriesId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  useEffect(() => {
    loadSeries();
  }, []);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const data = await getDocumentSeries();
      setSeries(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las series de documentos");
      showError(err.message || "Error al cargar las series de documentos");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedSeriesId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedSeriesId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadSeries();
    setShowForm(false);
    setSelectedSeriesId(null);
  };

  const handleDeleteClick = (serie) => {
    setSeriesToDelete(serie);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!seriesToDelete) return;

    try {
      await deleteDocumentSeries(seriesToDelete.id);
      showSuccess("Serie de documento eliminada correctamente");
      loadSeries();
    } catch (err) {
      showError(err.message || "Error al eliminar la serie de documento");
    } finally {
      setSeriesToDelete(null);
      setShowDeleteModal(false);
    }
  };

  const handleResetCorrelative = async (id, currentValue) => {
    const newValue = window.prompt(`Ingrese el nuevo valor del correlativo (actual: ${currentValue}):`, currentValue);
    if (newValue && !isNaN(newValue) && parseInt(newValue) >= 0) {
      try {
        await resetCorrelative(id, parseInt(newValue));
        showSuccess("Correlativo reseteado correctamente");
        loadSeries();
      } catch (err) {
        showError(err.message || "Error al resetear el correlativo");
      }
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "active":
        return <Badge color="success">Activo</Badge>;
      case "inactive":
        return <Badge color="secondary">Inactivo</Badge>;
      default:
        return <Badge color="secondary">{status}</Badge>;
    }
  };

  const filteredSeries = series.filter((serie) => {
    const matchesSearch = !searchTerm || 
      serie.documentType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      serie.series.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || serie.documentType === filterType;
    return matchesSearch && matchesType;
  });

  const documentTypes = [...new Set(series.map(s => s.documentType))];

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="4">
                  <CardTitle tag="h4">Series de Documentos</CardTitle>
                  <p className="text-muted small mb-0">
                    Gestiona las series y correlativos de documentos
                  </p>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="search"
                      placeholder="Tipo, serie..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Tipo</Label>
                    <Input
                      type="select"
                      value={filterType}
                      onChange={(e) => setFilterType(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      {documentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="text-right">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleNew} className="btn-round" block>
                        <i className="nc-icon nc-simple-add" /> Nueva
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando series...</p></div>
              ) : filteredSeries.length === 0 ? (
                <div className="text-center">
                  <p>{series.length === 0 ? "No hay series configuradas." : "No se encontraron series que coincidan con la búsqueda."}</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Tipo</th>
                      <th>Serie</th>
                      <th>Correlativo Actual</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSeries.map((serie) => (
                      <tr key={serie.id}>
                        <td>{serie.documentType}</td>
                        <td>{serie.series}</td>
                        <td>{serie.currentCorrelative}</td>
                        <td>{getStatusBadge(serie.status)}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(serie.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="warning" size="sm" onClick={() => handleResetCorrelative(serie.id, serie.currentCorrelative)} className="btn-round mr-1">
                            <i className="nc-icon nc-refresh-69" /> Reset
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDeleteClick(serie)} className="btn-round">
                            <i className="nc-icon nc-simple-remove" /> Eliminar
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
      <DocumentSeriesForm
        seriesId={selectedSeriesId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedSeriesId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirmar Eliminación"
        message={`¿Está seguro de eliminar la serie "${seriesToDelete?.documentType} - ${seriesToDelete?.series}"? Esta acción no se puede deshacer.`}
        confirmText="Sí, Eliminar"
        confirmColor="danger"
      />
    </div>
  );
}

export default DocumentSeries;
