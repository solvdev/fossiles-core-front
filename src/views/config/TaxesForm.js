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
import { getTaxById, createTax, updateTax } from "services/taxService";
import { showSuccess, showError } from "utils/notificationHelper";

function TaxesForm({ taxId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    percentage: "",
    type: "",
    description: "",
    status: "active",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (taxId) {
        loadTax();
      } else {
        resetForm();
      }
    }
  }, [isOpen, taxId]);

  const loadTax = async () => {
    try {
      setLoading(true);
      const tax = await getTaxById(taxId);
      setFormData({
        code: tax.code || "",
        name: tax.name || "",
        percentage: tax.percentage ? tax.percentage.toString() : "",
        type: tax.type || "",
        description: tax.description || "",
        status: tax.status || "active",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el impuesto");
      showError(err.message || "Error al cargar el impuesto");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: "",
      name: "",
      percentage: "",
      type: "",
      description: "",
      status: "active",
    });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.code.trim()) newErrors.code = "El código es requerido";
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.percentage || parseFloat(formData.percentage) < 0 || parseFloat(formData.percentage) > 100) {
      newErrors.percentage = "El porcentaje debe estar entre 0 y 100";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) {
      showError("Por favor, corrige los errores en el formulario.");
      return;
    }
    try {
      setLoading(true);
      setError("");
      const submitData = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        percentage: parseFloat(formData.percentage),
        type: formData.type.trim() || null,
        description: formData.description.trim() || null,
        status: formData.status,
      };
      if (taxId) {
        await updateTax(taxId, submitData);
        showSuccess("Impuesto actualizado correctamente");
      } else {
        await createTax(submitData);
        showSuccess("Impuesto creado correctamente");
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el impuesto");
      showError(err.message || "Error al guardar el impuesto");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {taxId ? "Editar Impuesto" : "Nuevo Impuesto"}
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
                <Label>Porcentaje *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.percentage}
                  onChange={(e) => setFormData({ ...formData, percentage: e.target.value })}
                  invalid={!!errors.percentage}
                  placeholder="Ej: 12.00"
                />
                {errors.percentage && <div className="text-danger small">{errors.percentage}</div>}
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Tipo</Label>
                <Input
                  type="select"
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="">Seleccione tipo</option>
                  <option value="IVA">IVA</option>
                  <option value="ISR">ISR</option>
                  <option value="IGSS">IGSS</option>
                  <option value="OTRO">Otro</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Estado *</Label>
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
          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Descripción</Label>
                <Input
                  type="textarea"
                  rows="3"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción del impuesto..."
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
            {loading ? "Guardando..." : taxId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default TaxesForm;

