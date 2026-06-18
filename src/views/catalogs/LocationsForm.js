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
    felEstablishmentCode: "",
    felEstablishmentName: "",
    felAddressLine: "",
    felMunicipio: "",
    felDepartamento: "",
    posTestMode: false,
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

  const isKioskRole = (role) => {
    if (!role?.name) return false;
    const name = role.name.toLowerCase();
    return name.includes("kiosco") || name.includes("encargada_kiosko");
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      const kioskUsers = (data || []).filter((user) => {
        if (!user.roles || user.roles.length === 0) return false;
        return user.roles.some(isKioskRole);
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
        felEstablishmentCode: location.felEstablishmentCode || "",
        felEstablishmentName: location.felEstablishmentName || "",
        felAddressLine: location.felAddressLine || "",
        felMunicipio: location.felMunicipio || "",
        felDepartamento: location.felDepartamento || "",
        posTestMode: Boolean(location.posTestMode),
      });
    } catch (err) {
      setError(err.message || "Error al cargar la ubicación");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      departamento: "",
      municipio: "",
      zona: "",
      categoria: "",
      encargadoId: "",
      felEstablishmentCode: "",
      felEstablishmentName: "",
      felAddressLine: "",
      felMunicipio: "",
      felDepartamento: "",
    });
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
        felEstablishmentCode: formData.felEstablishmentCode.trim() || null,
        felEstablishmentName: formData.felEstablishmentName.trim() || null,
        felAddressLine: formData.felAddressLine.trim() || null,
        felMunicipio: formData.felMunicipio.trim() || null,
        felDepartamento: formData.felDepartamento.trim() || null,
        posTestMode: Boolean(formData.posTestMode),
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
                  <option value="KIOSKO">KIOSKO</option>
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
                    <option value="" disabled>No hay encargadas de kiosko disponibles</option>
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
                    Cree un usuario con rol ENCARGADA_KIOSKO y asígnelo aquí (1 encargada = 1 kiosko).
                  </small>
                )}
              </FormGroup>
            </Col>
          </Row>
          <hr />
          <h6 className="text-muted mb-3">Punto de venta (POS)</h6>
          <FormGroup check className="mb-3">
            <Label check>
              <Input
                type="checkbox"
                checked={Boolean(formData.posTestMode)}
                onChange={(e) => setFormData({ ...formData, posTestMode: e.target.checked })}
              />{" "}
              Modo piloto POS (ventas no cuentan en reportes de producción)
            </Label>
            <small className="text-muted d-block mt-1">
              Desmarca esta opción cuando el kiosko entre en producción real. Las ventas ya registradas en piloto
              conservan su marca de prueba.
            </small>
          </FormGroup>
          <hr />
          <h6 className="text-muted mb-3">Facturación electrónica (FEL)</h6>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Código establecimiento FEL</Label>
                <Input
                  type="text"
                  placeholder="Ej. 46"
                  value={formData.felEstablishmentCode}
                  onChange={(e) => setFormData({ ...formData, felEstablishmentCode: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="8">
              <FormGroup>
                <Label>Nombre establecimiento FEL</Label>
                <Input
                  type="text"
                  placeholder="Ej. CUEROGLAM INTERPLAZA VILLALOBOS"
                  value={formData.felEstablishmentName}
                  onChange={(e) => setFormData({ ...formData, felEstablishmentName: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Dirección FEL (emisor en XML)</Label>
                <Input
                  type="text"
                  value={formData.felAddressLine}
                  onChange={(e) => setFormData({ ...formData, felAddressLine: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Municipio FEL</Label>
                <Input
                  type="text"
                  value={formData.felMunicipio}
                  onChange={(e) => setFormData({ ...formData, felMunicipio: e.target.value })}
                />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Departamento FEL</Label>
                <Input
                  type="text"
                  value={formData.felDepartamento}
                  onChange={(e) => setFormData({ ...formData, felDepartamento: e.target.value })}
                />
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
