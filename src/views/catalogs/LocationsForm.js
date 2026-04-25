import React, { useState, useEffect } from "react";
import {
  Button,
  Label,
  FormGroup,
  Input,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Row,
  Col,
} from "reactstrap";
import { getLocationById, createLocation, updateLocation } from "services/locationService";
import { getUsers } from "services/userService";

function LocationsForm({ locationId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    departamento: "",
    municipio: "",
    zona: "",
    categoria: "",
    encargadoId: "",
  });
  const [users, setUsers] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadUsers();
      if (locationId) {
        loadLocation();
      } else {
        resetForm();
      }
    }
  }, [isOpen, locationId]);

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      // Filtrar solo usuarios con rol "Kioscos"
      const kioskUsers = (data || []).filter((user) => {
        if (!user.roles || user.roles.length === 0) return false;
        return user.roles.some(
          (role) => role.name && role.name.toLowerCase().includes("kiosco")
        );
      });
      setUsers(kioskUsers);
    } catch (err) {
      console.error("Error al cargar usuarios:", err);
    }
  };

  const loadLocation = async () => {
    try {
      setLoading(true);
      const location = await getLocationById(locationId);
      setFormData({
        code: location.code || "",
        name: location.name || "",
        departamento: location.departamento || "",
        municipio: location.municipio || "",
        zona: location.zona || "",
        categoria: location.categoria || "",
        encargadoId: location.encargadoId ? String(location.encargadoId) : "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar la ubicación");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", name: "", departamento: "", municipio: "", zona: "", categoria: "", encargadoId: "" });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.code.trim()) newErrors.code = "El código es requerido";
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      const locationData = {
        ...formData,
        encargadoId: formData.encargadoId ? Number(formData.encargadoId) : null,
      };
      if (locationId) {
        await updateLocation(locationId, locationData);
      } else {
        await createLocation(locationData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la ubicación");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {locationId ? "Editar Kiosco" : "Nuevo Kiosco"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Código *</Label>
                <Input
                  type="text"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  invalid={!!errors.code}
                />
                {errors.code && <div className="text-danger small">{errors.code}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Nombre *</Label>
                <Input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  invalid={!!errors.name}
                />
                {errors.name && <div className="text-danger small">{errors.name}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Departamento</Label>
                <Input
                  type="text"
                  value={formData.departamento}
                  onChange={(e) => setFormData({ ...formData, departamento: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Municipio</Label>
                <Input
                  type="text"
                  value={formData.municipio}
                  onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Zona</Label>
                <Input
                  type="text"
                  value={formData.zona}
                  onChange={(e) => setFormData({ ...formData, zona: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Categoría</Label>
                <Input
                  type="select"
                  value={formData.categoria}
                  onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
                >
                  <option value="">Seleccione una categoría</option>
                  <option value="A">A</option>
                  <option value="B">B</option>
                  <option value="C">C</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Encargado</Label>
                <Input
                  type="select"
                  value={formData.encargadoId}
                  onChange={(e) => setFormData({ ...formData, encargadoId: e.target.value })}
                >
                  <option value="">Seleccione un encargado</option>
                  {users.length === 0 ? (
                    <option value="" disabled>No hay usuarios con rol Kioscos disponibles</option>
                  ) : (
                    users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName} (${user.username})`
                          : user.username}
                      </option>
                    ))
                  )}
                </Input>
                {users.length === 0 && (
                  <small className="text-muted d-block mt-1">
                    No hay usuarios con rol "Kioscos" disponibles. Asigna el rol a usuarios desde la sección de Usuarios.
                  </small>
                )}
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : locationId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default LocationsForm;

