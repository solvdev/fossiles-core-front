import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Button,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Label,
  FormGroup,
  Alert,
  Badge,
  Spinner,
} from "reactstrap";
import {
  getInventoryLocationTypes,
  createInventoryLocationType,
  updateInventoryLocationType,
  deleteInventoryLocationType,
} from "services/inventoryLocationTypeService";
import { showError, showSuccess } from "utils/notificationHelper";

function InventoryLocationTypes() {
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(false);
  const [editingType, setEditingType] = useState(null);
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
    isActive: true,
  });

  useEffect(() => {
    loadTypes();
  }, []);

  const loadTypes = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getInventoryLocationTypes();
      setTypes(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar tipos de ubicación");
      showError(err.message || "Error al cargar tipos de ubicación");
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (type = null) => {
    if (type) {
      setEditingType(type);
      setFormData({
        code: type.code || "",
        name: type.name || "",
        description: type.description || "",
        isActive: type.isActive !== undefined ? type.isActive : true,
      });
    } else {
      setEditingType(null);
      setFormData({
        code: "",
        name: "",
        description: "",
        isActive: true,
      });
    }
    setModal(true);
  };

  const handleCloseModal = () => {
    setModal(false);
    setEditingType(null);
    setFormData({
      code: "",
      name: "",
      description: "",
      isActive: true,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      if (editingType) {
        await updateInventoryLocationType(editingType.id, formData);
        showSuccess("Tipo de ubicación actualizado correctamente");
      } else {
        await createInventoryLocationType(formData);
        showSuccess("Tipo de ubicación creado correctamente");
      }
      handleCloseModal();
      await loadTypes();
    } catch (err) {
      setError(err.message || "Error al guardar tipo de ubicación");
      showError(err.message || "Error al guardar tipo de ubicación");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro de eliminar este tipo de ubicación?")) {
      return;
    }
    try {
      setError("");
      await deleteInventoryLocationType(id);
      showSuccess("Tipo de ubicación eliminado correctamente");
      await loadTypes();
    } catch (err) {
      setError(err.message || "Error al eliminar tipo de ubicación");
      showError(err.message || "Error al eliminar tipo de ubicación");
    }
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

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Tipos de Ubicación de Inventario</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => handleOpenModal()}
                    className="mt-2"
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Nuevo Tipo
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
                  <p className="mt-2">Cargando tipos de ubicación...</p>
                </div>
              ) : types.length === 0 ? (
                <Alert color="info" className="mt-3">
                  No hay tipos de ubicación registrados. Haz clic en "Nuevo Tipo" para crear uno.
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Código</th>
                      <th>Nombre</th>
                      <th>Descripción</th>
                      <th>Estado</th>
                      <th>Creado</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {types.map((type) => (
                      <tr key={type.id}>
                        <td>
                          <strong>{type.code}</strong>
                        </td>
                        <td>{type.name}</td>
                        <td>
                          <small className="text-muted">
                            {type.description || "Sin descripción"}
                          </small>
                        </td>
                        <td>
                          <Badge color={type.isActive ? "success" : "secondary"}>
                            {type.isActive ? "Activo" : "Inactivo"}
                          </Badge>
                        </td>
                        <td>
                          <small>{formatDate(type.createdAt)}</small>
                        </td>
                        <td>
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => handleOpenModal(type)}
                            className="mr-2"
                          >
                            <i className="nc-icon nc-ruler-pencil" />
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            onClick={() => handleDelete(type.id)}
                          >
                            <i className="nc-icon nc-simple-remove" />
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

      {/* Modal para crear/editar */}
      <Modal isOpen={modal} toggle={handleCloseModal} size="lg">
        <ModalHeader toggle={handleCloseModal}>
          {editingType ? "Editar Tipo de Ubicación" : "Nuevo Tipo de Ubicación"}
        </ModalHeader>
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <FormGroup>
              <Label>Código *</Label>
              <Input
                type="text"
                value={formData.code}
                onChange={(e) =>
                  setFormData({ ...formData, code: e.target.value.toUpperCase() })
                }
                placeholder="Ej: BODEGA_PT, VENDEDOR, ONLINE"
                required
                disabled={!!editingType}
              />
              <small className="text-muted">
                {editingType
                  ? "El código no se puede modificar"
                  : "Código único del tipo de ubicación (solo mayúsculas)"}
              </small>
            </FormGroup>
            <FormGroup>
              <Label>Nombre *</Label>
              <Input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="Ej: Bodega Producto Terminado"
                required
              />
            </FormGroup>
            <FormGroup>
              <Label>Descripción</Label>
              <Input
                type="textarea"
                rows="3"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="Descripción del tipo de ubicación"
              />
            </FormGroup>
            <FormGroup>
              <Label check>
                <Input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                />{" "}
                Activo
              </Label>
            </FormGroup>
          </ModalBody>
          <ModalFooter>
            <Button color="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button color="primary" type="submit">
              {editingType ? "Actualizar" : "Crear"}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
}

export default InventoryLocationTypes;

