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
import { getEmailConfigById, createEmailConfig, updateEmailConfig } from "services/emailConfigService";
import { showSuccess, showError } from "utils/notificationHelper";

function EmailConfigForm({ configId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    smtpHost: "",
    smtpPort: 587,
    username: "",
    password: "",
    fromEmail: "",
    fromName: "",
    useTls: true,
    useSsl: false,
    isActive: false,
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (configId) {
        loadConfig();
      } else {
        resetForm();
      }
    }
  }, [isOpen, configId]);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const config = await getEmailConfigById(configId);
      setFormData({
        smtpHost: config.smtpHost || "",
        smtpPort: config.smtpPort || 587,
        username: config.username || "",
        password: "", // No mostrar la contraseña existente por seguridad
        fromEmail: config.fromEmail || "",
        fromName: config.fromName || "",
        useTls: config.useTls !== undefined ? config.useTls : true,
        useSsl: config.useSsl !== undefined ? config.useSsl : false,
        isActive: config.isActive !== undefined ? config.isActive : false,
        description: config.description || "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar la configuración de email");
      showError(err.message || "Error al cargar la configuración de email");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      smtpHost: "",
      smtpPort: 587,
      username: "",
      password: "",
      fromEmail: "",
      fromName: "",
      useTls: true,
      useSsl: false,
      isActive: false,
      description: "",
    });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.smtpHost.trim()) newErrors.smtpHost = "El servidor SMTP es requerido";
    if (!formData.smtpPort || formData.smtpPort < 1 || formData.smtpPort > 65535) {
      newErrors.smtpPort = "El puerto debe estar entre 1 y 65535";
    }
    if (!formData.username.trim()) newErrors.username = "El usuario es requerido";
    if (!configId && !formData.password.trim()) {
      newErrors.password = "La contraseña es requerida";
    }
    if (!formData.fromEmail.trim()) newErrors.fromEmail = "El email remitente es requerido";
    if (formData.fromEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.fromEmail)) {
      newErrors.fromEmail = "El email remitente no es válido";
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
        smtpHost: formData.smtpHost.trim(),
        smtpPort: parseInt(formData.smtpPort),
        username: formData.username.trim(),
        password: formData.password.trim() || undefined, // Solo enviar si hay valor
        fromEmail: formData.fromEmail.trim(),
        fromName: formData.fromName.trim() || null,
        useTls: formData.useTls,
        useSsl: formData.useSsl,
        isActive: formData.isActive,
        description: formData.description.trim() || null,
      };
      if (configId) {
        await updateEmailConfig(configId, submitData);
        showSuccess("Configuración de email actualizada correctamente");
      } else {
        await createEmailConfig(submitData);
        showSuccess("Configuración de email creada correctamente");
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la configuración de email");
      showError(err.message || "Error al guardar la configuración de email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {configId ? "Editar Configuración de Email" : "Nueva Configuración de Email"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="8">
              <FormGroup>
                <Label>Servidor SMTP *</Label>
                <Input
                  type="text"
                  value={formData.smtpHost}
                  onChange={(e) => setFormData({ ...formData, smtpHost: e.target.value })}
                  invalid={!!errors.smtpHost}
                  placeholder="smtp.gmail.com"
                />
                {errors.smtpHost && <div className="text-danger small">{errors.smtpHost}</div>}
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Puerto *</Label>
                <Input
                  type="number"
                  min="1"
                  max="65535"
                  value={formData.smtpPort}
                  onChange={(e) => setFormData({ ...formData, smtpPort: e.target.value })}
                  invalid={!!errors.smtpPort}
                />
                {errors.smtpPort && <div className="text-danger small">{errors.smtpPort}</div>}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Usuario *</Label>
                <Input
                  type="text"
                  value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                  invalid={!!errors.username}
                  placeholder="usuario@ejemplo.com"
                />
                {errors.username && <div className="text-danger small">{errors.username}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Contraseña {!configId && "*"}</Label>
                <Input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  invalid={!!errors.password}
                  placeholder={configId ? "Dejar vacío para mantener la actual" : ""}
                />
                {errors.password && <div className="text-danger small">{errors.password}</div>}
                {configId && (
                  <small className="form-text text-muted">
                    Dejar vacío para mantener la contraseña actual
                  </small>
                )}
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Email Remitente *</Label>
                <Input
                  type="email"
                  value={formData.fromEmail}
                  onChange={(e) => setFormData({ ...formData, fromEmail: e.target.value })}
                  invalid={!!errors.fromEmail}
                  placeholder="noreply@ejemplo.com"
                />
                {errors.fromEmail && <div className="text-danger small">{errors.fromEmail}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Nombre Remitente</Label>
                <Input
                  type="text"
                  value={formData.fromName}
                  onChange={(e) => setFormData({ ...formData, fromName: e.target.value })}
                  placeholder="Mi Empresa"
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Seguridad</Label>
                <div className="form-check">
                  <Input
                    type="checkbox"
                    checked={formData.useTls}
                    onChange={(e) => setFormData({ ...formData, useTls: e.target.checked, useSsl: e.target.checked ? false : formData.useSsl })}
                  />
                  <Label check className="form-check-label">
                    Usar TLS
                  </Label>
                </div>
                <div className="form-check">
                  <Input
                    type="checkbox"
                    checked={formData.useSsl}
                    onChange={(e) => setFormData({ ...formData, useSsl: e.target.checked, useTls: e.target.checked ? false : formData.useTls })}
                  />
                  <Label check className="form-check-label">
                    Usar SSL
                  </Label>
                </div>
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Estado</Label>
                <div className="form-check">
                  <Input
                    type="checkbox"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  />
                  <Label check className="form-check-label">
                    Activar esta configuración
                  </Label>
                </div>
                <small className="form-text text-muted">
                  Solo puede haber una configuración activa
                </small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Descripción</Label>
                <Input
                  type="textarea"
                  rows="2"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Descripción de la configuración..."
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
            {loading ? "Guardando..." : configId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default EmailConfigForm;

