import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Alert,
  Table,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Badge,
} from "reactstrap";
import { getSystemConfigs, getSystemConfigByKey, updateSystemConfig, createSystemConfig, deleteSystemConfig } from "services/systemConfigService";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";

const ACCOUNTING_CONFIGS = [
  {
    key: "accounting.inventory.account",
    label: "Inventario de Materiales",
    defaultValue: "1.1.3.01",
    description: "Cuenta contable para Inventario de Materiales"
  },
  {
    key: "accounting.accounts_payable.account",
    label: "Cuentas por Pagar",
    defaultValue: "2.1.1.01",
    description: "Cuenta contable para Cuentas por Pagar"
  },
  {
    key: "accounting.material_cost.account",
    label: "Costo de Materiales",
    defaultValue: "5.1.1.01",
    description: "Cuenta contable para Costo de Materiales"
  },
  {
    key: "accounting.inventory_variance.account",
    label: "Variación de Inventario",
    defaultValue: "5.1.1.02",
    description: "Cuenta contable para Variación de Inventario"
  },
  {
    key: "accounting.purchases_in_transit.account",
    label: "Compras en Tránsito",
    defaultValue: "1.1.3.02",
    description: "Cuenta contable para Compras en Tránsito"
  }
];

function AccountingAccounts() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accounts, setAccounts] = useState({});
  const [customAccounts, setCustomAccounts] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState(null);
  const [newAccount, setNewAccount] = useState({
    key: "",
    label: "",
    code: "",
    description: ""
  });

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const accountsData = {};
      
      // Cargar cuentas predefinidas
      for (const config of ACCOUNTING_CONFIGS) {
        try {
          const configData = await getSystemConfigByKey(config.key);
          accountsData[config.key] = {
            value: configData?.configValue || config.defaultValue,
            description: configData?.description || config.description,
            label: config.label,
            isPredefined: true
          };
        } catch (err) {
          accountsData[config.key] = {
            value: config.defaultValue,
            description: config.description,
            label: config.label,
            isPredefined: true
          };
        }
      }

      // Cargar todas las configuraciones y filtrar las de accounting personalizadas
      try {
        const allConfigs = await getSystemConfigs();
        const custom = allConfigs
          .filter(config => 
            config.configKey.startsWith("accounting.") && 
            !ACCOUNTING_CONFIGS.some(predef => predef.key === config.configKey)
          )
          .map(config => ({
            key: config.configKey,
            label: config.configKey.replace("accounting.", "").replace(".account", "").replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
            value: config.configValue || "",
            description: config.description || "",
            isPredefined: false
          }));
        
        custom.forEach(acc => {
          accountsData[acc.key] = acc;
        });
        setCustomAccounts(custom);
      } catch (err) {
        console.error("Error al cargar cuentas personalizadas:", err);
      }
      
      setAccounts(accountsData);
    } catch (err) {
      setError("Error al cargar las cuentas contables");
      console.error("Error al cargar cuentas:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAccountChange = (key, value) => {
    setAccounts(prev => ({
      ...prev,
      [key]: {
        ...prev[key],
        value: value
      }
    }));
  };

  const handleNewAccount = () => {
    setNewAccount({
      key: "",
      label: "",
      code: "",
      description: ""
    });
    setShowModal(true);
  };

  const handleSaveNewAccount = async () => {
    if (!newAccount.key || !newAccount.code || !newAccount.label) {
      setError("Por favor complete todos los campos requeridos");
      return;
    }

    const configKey = `accounting.${newAccount.key}.account`;
    
    // Verificar que no exista ya
    if (accounts[configKey]) {
      setError("Ya existe una cuenta con esta clave");
      return;
    }

    try {
      setLoading(true);
      setError("");
      
      await createSystemConfig({
        configKey: configKey,
        configValue: newAccount.code,
        description: newAccount.description || `Cuenta contable para ${newAccount.label}`
      });

      setSuccess("Cuenta contable creada correctamente");
      setShowModal(false);
      loadAccounts();
    } catch (err) {
      setError(err.message || "Error al crear la cuenta contable");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (accountKey) => {
    setAccountToDelete(accountKey);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;

    try {
      setLoading(true);
      await deleteSystemConfig(accountToDelete);
      setSuccess("Cuenta contable eliminada correctamente");
      setShowDeleteModal(false);
      setAccountToDelete(null);
      loadAccounts();
    } catch (err) {
      setError(err.message || "Error al eliminar la cuenta contable");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      // Guardar todas las cuentas (predefinidas y personalizadas)
      for (const key in accounts) {
        const account = accounts[key];
        const value = account.value || "";
        
        if (!value) continue;
        
        try {
          const existingConfig = await getSystemConfigByKey(key);
          const configData = {
            configKey: key,
            configValue: value,
            description: account.description || ""
          };

          if (existingConfig) {
            await updateSystemConfig(key, configData);
          } else {
            await createSystemConfig(configData);
          }
        } catch (err) {
          console.error(`Error al guardar ${key}:`, err);
        }
      }

      setSuccess("Cuentas contables actualizadas correctamente");
      loadAccounts();
    } catch (err) {
      setError(err.message || "Error al guardar las cuentas contables");
    } finally {
      setLoading(false);
    }
  };

  const allAccounts = [
    ...ACCOUNTING_CONFIGS.map(config => ({
      key: config.key,
      label: config.label,
      value: accounts[config.key]?.value || config.defaultValue,
      description: accounts[config.key]?.description || config.description,
      isPredefined: true
    })),
    ...customAccounts
  ];

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Configuración de Cuentas Contables</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}

              <Row className="mb-3">
                <Col md="12" className="d-flex justify-content-between align-items-center">
                  <p className="text-muted mb-0">
                    Configure las cuentas contables utilizadas en los asientos contables del sistema.
                  </p>
                  <Button color="success" size="sm" onClick={handleNewAccount}>
                    + Nueva Cuenta
                  </Button>
                </Col>
              </Row>

              <Table responsive>
                <thead>
                  <tr>
                    <th>Cuenta</th>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th width="100">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {allAccounts.map((account) => (
                    <tr key={account.key}>
                      <td>
                        <strong>{account.label}</strong>
                        {account.isPredefined && (
                          <Badge color="info" className="ms-2">Predefinida</Badge>
                        )}
                      </td>
                      <td>
                        <Input
                          type="text"
                          value={account.value || ""}
                          onChange={(e) => handleAccountChange(account.key, e.target.value)}
                          placeholder="Código de cuenta"
                          disabled={loading}
                        />
                      </td>
                      <td>
                        <small className="text-muted">{account.description}</small>
                      </td>
                      <td>
                        {!account.isPredefined && (
                          <Button
                            color="danger"
                            size="sm"
                            onClick={() => handleDeleteClick(account.key)}
                            disabled={loading}
                          >
                            Eliminar
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>

              <Row className="mt-4">
                <Col md="12">
                  <Button color="primary" onClick={handleSave} disabled={loading}>
                    {loading ? "Guardando..." : "Guardar Configuración"}
                  </Button>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Modal para nueva cuenta */}
      <Modal isOpen={showModal} toggle={() => setShowModal(false)}>
        <ModalHeader toggle={() => setShowModal(false)}>
          Nueva Cuenta Contable
        </ModalHeader>
        <ModalBody>
          <FormGroup>
            <Label>Clave (sin espacios, usar guiones bajos)</Label>
            <Input
              type="text"
              value={newAccount.key}
              onChange={(e) => setNewAccount({ ...newAccount, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
              placeholder="ej: ventas_contado"
            />
            <small className="text-muted">Se creará como: accounting.{newAccount.key || '...'}.account</small>
          </FormGroup>
          <FormGroup>
            <Label>Nombre de la Cuenta *</Label>
            <Input
              type="text"
              value={newAccount.label}
              onChange={(e) => setNewAccount({ ...newAccount, label: e.target.value })}
              placeholder="ej: Ventas al Contado"
            />
          </FormGroup>
          <FormGroup>
            <Label>Código de Cuenta *</Label>
            <Input
              type="text"
              value={newAccount.code}
              onChange={(e) => setNewAccount({ ...newAccount, code: e.target.value })}
              placeholder="ej: 4.1.1.01"
            />
          </FormGroup>
          <FormGroup>
            <Label>Descripción</Label>
            <Input
              type="textarea"
              rows="3"
              value={newAccount.description}
              onChange={(e) => setNewAccount({ ...newAccount, description: e.target.value })}
              placeholder="Descripción de la cuenta contable"
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowModal(false)}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleSaveNewAccount} disabled={loading}>
            {loading ? "Guardando..." : "Guardar"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <ConfirmModal
        isOpen={showDeleteModal}
        toggle={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Eliminar Cuenta Contable"
        message={`¿Está seguro de eliminar la cuenta contable "${accounts[accountToDelete]?.label || accountToDelete}"?`}
      />
    </div>
  );
}

export default AccountingAccounts;

