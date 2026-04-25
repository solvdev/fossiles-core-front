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
import { getTaxes, deleteTax } from "services/taxService";
import TaxesForm from "./TaxesForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

function Taxes() {
  const [taxes, setTaxes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedTaxId, setSelectedTaxId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [taxToDelete, setTaxToDelete] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  useEffect(() => {
    loadTaxes();
  }, []);

  const loadTaxes = async () => {
    try {
      setLoading(true);
      const data = await getTaxes();
      setTaxes(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar los impuestos");
      showError(err.message || "Error al cargar los impuestos");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedTaxId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedTaxId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadTaxes();
    setShowForm(false);
    setSelectedTaxId(null);
  };

  const handleDeleteClick = (tax) => {
    setTaxToDelete(tax);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!taxToDelete) return;

    try {
      await deleteTax(taxToDelete.id);
      showSuccess("Impuesto eliminado correctamente");
      loadTaxes();
    } catch (err) {
      showError(err.message || "Error al eliminar el impuesto");
    } finally {
      setTaxToDelete(null);
      setShowDeleteModal(false);
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

  const filteredTaxes = taxes.filter((tax) => {
    const matchesSearch = !searchTerm || 
      tax.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tax.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (tax.type && tax.type.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = filterStatus === "all" || tax.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="4">
                  <CardTitle tag="h4">Impuestos</CardTitle>
                  <p className="text-muted small mb-0">
                    Gestiona los impuestos del sistema (IVA, ISR, etc.)
                  </p>
                </Col>
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="search"
                      placeholder="Código, nombre, tipo..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Estado</Label>
                    <Input
                      type="select"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">Todos</option>
                      <option value="active">Activo</option>
                      <option value="inactive">Inactivo</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="text-right">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <div>
                      <Button color="primary" onClick={handleNew} className="btn-round" block>
                        <i className="nc-icon nc-simple-add" /> Nuevo
                      </Button>
                    </div>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando impuestos...</p></div>
              ) : filteredTaxes.length === 0 ? (
                <div className="text-center">
                  <p>{taxes.length === 0 ? "No hay impuestos registrados." : "No se encontraron impuestos que coincidan con la búsqueda."}</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Porcentaje</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTaxes.map((tax) => (
                      <tr key={tax.id}>
                        <td>{tax.code}</td>
                        <td>{tax.name}</td>
                        <td>{tax.percentage ? `${tax.percentage}%` : "-"}</td>
                        <td>{tax.type || "-"}</td>
                        <td>{getStatusBadge(tax.status)}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(tax.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDeleteClick(tax)} className="btn-round">
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
      <TaxesForm
        taxId={selectedTaxId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedTaxId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirmar Eliminación"
        message={`¿Está seguro de eliminar el impuesto "${taxToDelete?.name}"? Esta acción no se puede deshacer.`}
        confirmText="Sí, Eliminar"
        confirmColor="danger"
      />
    </div>
  );
}

export default Taxes;
