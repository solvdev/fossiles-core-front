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
import { getDocumentSeriesById, createDocumentSeries, updateDocumentSeries } from "services/documentSeriesService";
import { showSuccess, showError } from "utils/notificationHelper";

function DocumentSeriesForm({ seriesId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    documentType: "",
    series: "",
    currentCorrelative: 0,
    description: "",
    status: "active",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const documentTypes = [
    "INVOICE",
    "PURCHASE_ORDER",
    "PRODUCTION_ORDER",
    "QUOTE",
    "DELIVERY_NOTE",
    "CREDIT_NOTE",
    "DEBIT_NOTE",
    "VOUCHER"
  ];

  useEffect(() => {
    if (isOpen) {
      if (seriesId) {
        loadSeries();
      } else {
        resetForm();
      }
    }
  }, [isOpen, seriesId]);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const serie = await getDocumentSeriesById(seriesId);
      setFormData({
        documentType: serie.documentType || "",
        series: serie.series || "",
        currentCorrelative: serie.currentCorrelative || 0,
        description: serie.description || "",
        status: serie.status || "active",
      });
    } catch (err) {
      setError(err.message || "Error al cargar la serie de documento");
      showError(err.message || "Error al cargar la serie de documento");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      documentType: "",
      series: "",
      currentCorrelative: 0,
      description: "",
      status: "active",
    });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.documentType.trim()) newErrors.documentType = "El tipo de documento es requerido";
    if (!formData.series.trim()) newErrors.series = "La serie es requerida";
    if (formData.currentCorrelative < 0) {
      newErrors.currentCorrelative = "El correlativo debe ser mayor o igual a 0";
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
        documentType: formData.documentType.trim(),
        series: formData.series.trim().toUpperCase(),
        currentCorrelative: parseInt(formData.currentCorrelative),
        description: formData.description.trim() || null,
        status: formData.status,
      };
      if (seriesId) {
        await updateDocumentSeries(seriesId, submitData);
        showSuccess("Serie de documento actualizada correctamente");
      } else {
        await createDocumentSeries(submitData);
        showSuccess("Serie de documento creada correctamente");
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la serie de documento");
      showError(err.message || "Error al guardar la serie de documento");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {seriesId ? "Editar Serie de Documento" : "Nueva Serie de Documento"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Tipo de Documento *</Label>
                <Input
                  type="select"
                  value={formData.documentType}
                  onChange={(e) => setFormData({ ...formData, documentType: e.target.value })}
                  invalid={!!errors.documentType}
                >
                  <option value="">Seleccione tipo</option>
                  {documentTypes.map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </Input>
                {errors.documentType && <div className="text-danger small">{errors.documentType}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Serie *</Label>
                <Input
                  type="text"
                  value={formData.series}
                  onChange={(e) => setFormData({ ...formData, series: e.target.value.toUpperCase() })}
                  invalid={!!errors.series}
                  placeholder="A, B, C, etc."
                  maxLength={20}
                />
                {errors.series && <div className="text-danger small">{errors.series}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Correlativo Inicial</Label>
                <Input
                  type="number"
                  min="0"
                  value={formData.currentCorrelative}
                  onChange={(e) => setFormData({ ...formData, currentCorrelative: e.target.value })}
                  invalid={!!errors.currentCorrelative}
                />
                {errors.currentCorrelative && <div className="text-danger small">{errors.currentCorrelative}</div>}
                <small className="form-text text-muted">
                  Número inicial del correlativo (generalmente 0)
                </small>
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
                  placeholder="Descripción de la serie..."
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
            {loading ? "Guardando..." : seriesId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default DocumentSeriesForm;

