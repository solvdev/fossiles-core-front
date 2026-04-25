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
} from "reactstrap";
import { getEmailConfigs, deleteEmailConfig, testEmailConnection } from "services/emailConfigService";
import EmailConfigForm from "./EmailConfigForm";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { showSuccess, showError } from "utils/notificationHelper";

function EmailConfig() {
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [configToDelete, setConfigToDelete] = useState(null);
  const [testingConnection, setTestingConnection] = useState(null);

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await getEmailConfigs();
      setConfigs(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar las configuraciones de email");
      showError(err.message || "Error al cargar las configuraciones de email");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedConfigId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedConfigId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadConfigs();
    setShowForm(false);
    setSelectedConfigId(null);
  };

  const handleDeleteClick = (config) => {
    setConfigToDelete(config);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!configToDelete) return;

    try {
      await deleteEmailConfig(configToDelete.id);
      showSuccess("Configuración de email eliminada correctamente");
      loadConfigs();
    } catch (err) {
      showError(err.message || "Error al eliminar la configuración de email");
    } finally {
      setConfigToDelete(null);
      setShowDeleteModal(false);
    }
  };

  const handleTestConnection = async (id) => {
    try {
      setTestingConnection(id);
      await testEmailConnection(id);
      showSuccess("Conexión de email probada correctamente");
    } catch (err) {
      showError(err.message || "Error al probar la conexión de email");
    } finally {
      setTestingConnection(null);
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
                  <CardTitle tag="h4">Configuración de Email</CardTitle>
                  <p className="text-muted small mb-0">
                    Gestiona las configuraciones SMTP para el envío de documentos por email
                  </p>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nueva Configuración
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {loading ? (
                <div className="text-center"><p>Cargando configuraciones...</p></div>
              ) : configs.length === 0 ? (
                <div className="text-center">
                  <p>No hay configuraciones de email registradas.</p>
                </div>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Servidor SMTP</th>
                      <th>Puerto</th>
                      <th>Usuario</th>
                      <th>Email Remitente</th>
                      <th>TLS/SSL</th>
                      <th>Estado</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {configs.map((config) => (
                      <tr key={config.id}>
                        <td>{config.smtpHost}</td>
                        <td>{config.smtpPort}</td>
                        <td>{config.username}</td>
                        <td>{config.fromEmail}</td>
                        <td>
                          {config.useTls && <Badge color="info" className="mr-1">TLS</Badge>}
                          {config.useSsl && <Badge color="success">SSL</Badge>}
                          {!config.useTls && !config.useSsl && <span>-</span>}
                        </td>
                        <td>
                          {config.isActive ? (
                            <Badge color="success">Activo</Badge>
                          ) : (
                            <Badge color="secondary">Inactivo</Badge>
                          )}
                        </td>
                        <td className="text-right">
                          <Button 
                            color="warning" 
                            size="sm" 
                            onClick={() => handleTestConnection(config.id)} 
                            className="btn-round mr-1"
                            disabled={testingConnection === config.id}
                          >
                            <i className="nc-icon nc-check-2" /> 
                            {testingConnection === config.id ? "Probando..." : "Probar"}
                          </Button>
                          <Button color="info" size="sm" onClick={() => handleEdit(config.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDeleteClick(config)} className="btn-round">
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
      <EmailConfigForm
        configId={selectedConfigId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedConfigId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Confirmar Eliminación"
        message={`¿Está seguro de eliminar la configuración de email "${configToDelete?.smtpHost}"? Esta acción no se puede deshacer.`}
        confirmText="Sí, Eliminar"
        confirmColor="danger"
      />
    </div>
  );
}

export default EmailConfig;

