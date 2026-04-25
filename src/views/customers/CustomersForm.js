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
import { getCustomerById, createCustomer, updateCustomer } from "services/customerService";

function CustomersForm({ customerId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    nit: "",
    phone: "",
    email: "",
    address: "",
    status: "active",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (customerId) {
        loadCustomer();
      } else {
        resetForm();
      }
    }
  }, [isOpen, customerId]);

  const loadCustomer = async () => {
    try {
      setLoading(true);
      const customer = await getCustomerById(customerId);
      setFormData({
        name: customer.name || "",
        nit: customer.nit || "",
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        status: customer.status || "active",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el cliente");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      nit: "",
      phone: "",
      email: "",
      address: "",
      status: "active",
    });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.nit.trim()) newErrors.nit = "El NIT es requerido";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "El email no es válido";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      if (customerId) {
        await updateCustomer(customerId, formData);
      } else {
        await createCustomer(formData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el cliente");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {customerId ? "Editar Cliente" : "Nuevo Cliente"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
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
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>NIT *</Label>
                <Input
                  type="text"
                  value={formData.nit}
                  onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                  invalid={!!errors.nit}
                />
                {errors.nit && <div className="text-danger small">{errors.nit}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Teléfono</Label>
                <Input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  invalid={!!errors.email}
                />
                {errors.email && <div className="text-danger small">{errors.email}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label>Dirección</Label>
            <Input
              type="textarea"
              rows="2"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : customerId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default CustomersForm;

