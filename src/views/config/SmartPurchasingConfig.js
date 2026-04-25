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
  Badge,
} from "reactstrap";
import { getSystemConfigByKey, updateSystemConfig, createSystemConfig } from "services/systemConfigService";

const SMART_PURCHASING_CONFIGS = [
  {
    key: "smart_purchasing.safety_factor",
    label: "Factor de Seguridad",
    defaultValue: "1.15",
    type: "number",
    step: "0.01",
    min: "1.0",
    max: "2.0",
    description: "Factor multiplicador para agregar un margen de seguridad a las solicitudes (ej: 1.15 = 15% extra)",
    help: "Recomendado: 1.15 (15% extra). Se multiplica por el consumo calculado para tener un buffer de seguridad."
  },
  {
    key: "smart_purchasing.forecast_days",
    label: "Días de Forecast",
    defaultValue: "14",
    type: "number",
    step: "1",
    min: "1",
    max: "90",
    description: "Días adicionales de buffer para calcular consumo futuro",
    help: "Recomendado: 14 días. Se suma a los días de entrega para calcular el punto de reorden."
  },
  {
    key: "smart_purchasing.history_days",
    label: "Días de Historial",
    defaultValue: "30",
    type: "number",
    step: "1",
    min: "7",
    max: "365",
    description: "Días de historial a analizar para calcular consumo promedio",
    help: "Recomendado: 30 días. Período de tiempo usado para calcular el consumo promedio diario."
  },
  {
    key: "smart_purchasing.min_stock_threshold",
    label: "Umbral Mínimo de Stock",
    defaultValue: "0.20",
    type: "number",
    step: "0.01",
    min: "0.05",
    max: "0.50",
    description: "Umbral mínimo de stock como porcentaje del stock máximo (ej: 0.20 = 20%)",
    help: "Recomendado: 0.20 (20%). Si el stock actual está por debajo de este porcentaje del máximo, se marca como crítico."
  },
  {
    key: "smart_purchasing.auto_generate_enabled",
    label: "Generación Automática",
    defaultValue: "false",
    type: "select",
    options: [
      { value: "true", label: "Habilitada" },
      { value: "false", label: "Deshabilitada" }
    ],
    description: "Habilitar generación automática de solicitudes de materiales",
    help: "Cuando está habilitada, el sistema puede generar automáticamente solicitudes de materiales basadas en análisis de stock."
  }
];

function SmartPurchasingConfig() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [configs, setConfigs] = useState({});

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const configsData = {};
      
      for (const config of SMART_PURCHASING_CONFIGS) {
        try {
          const configData = await getSystemConfigByKey(config.key);
          configsData[config.key] = configData?.configValue || config.defaultValue;
        } catch (err) {
          configsData[config.key] = config.defaultValue;
        }
      }
      
      setConfigs(configsData);
    } catch (err) {
      setError("Error al cargar las configuraciones de compras inteligentes");
      console.error("Error al cargar configuraciones:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfigChange = (key, value) => {
    setConfigs(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      for (const config of SMART_PURCHASING_CONFIGS) {
        const value = configs[config.key] || config.defaultValue;
        
        try {
          const existingConfig = await getSystemConfigByKey(config.key);
          const configData = {
            configKey: config.key,
            configValue: value,
            description: config.description
          };

          if (existingConfig) {
            await updateSystemConfig(config.key, configData);
          } else {
            await createSystemConfig(configData);
          }
        } catch (err) {
          console.error(`Error al guardar ${config.key}:`, err);
        }
      }

      setSuccess("Configuraciones de compras inteligentes actualizadas correctamente");
    } catch (err) {
      setError(err.message || "Error al guardar las configuraciones");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Configuración de Compras Inteligentes</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}

              <Alert color="info" className="mb-4">
                <h6 className="mb-2"><strong>¿Cómo funcionan las compras inteligentes?</strong></h6>
                <p className="mb-2">
                  El sistema calcula automáticamente el punto de reorden y las cantidades sugeridas basándose en:
                </p>
                <ul className="mb-0">
                  <li><strong>Consumo promedio:</strong> Calculado sobre los últimos N días de historial</li>
                  <li><strong>Punto de reorden:</strong> (Consumo promedio × (Días entrega + Forecast)) × Factor seguridad</li>
                  <li><strong>Cantidad sugerida:</strong> Consumo inmediato + (Consumo promedio × Forecast) × Factor seguridad</li>
                  <li><strong>Umbral crítico:</strong> Cuando el stock está por debajo del % configurado del máximo</li>
                </ul>
              </Alert>

              <Row>
                {SMART_PURCHASING_CONFIGS.map((config) => (
                  <Col md="6" key={config.key} className="mb-4">
                    <Card>
                      <CardBody>
                        <FormGroup>
                          <Label>
                            <strong>{config.label}</strong>
                            {config.key === "smart_purchasing.auto_generate_enabled" && (
                              <Badge color={configs[config.key] === "true" ? "success" : "secondary"} className="ms-2">
                                {configs[config.key] === "true" ? "Activa" : "Inactiva"}
                              </Badge>
                            )}
                          </Label>
                          
                          {config.type === "select" ? (
                            <Input
                              type="select"
                              value={configs[config.key] || config.defaultValue}
                              onChange={(e) => handleConfigChange(config.key, e.target.value)}
                              disabled={loading}
                            >
                              {config.options.map(option => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </Input>
                          ) : (
                            <Input
                              type={config.type}
                              step={config.step}
                              min={config.min}
                              max={config.max}
                              value={configs[config.key] || config.defaultValue}
                              onChange={(e) => handleConfigChange(config.key, e.target.value)}
                              placeholder={config.defaultValue}
                              disabled={loading}
                            />
                          )}
                          
                          <small className="text-muted d-block mt-1">
                            {config.description}
                          </small>
                          <small className="text-info d-block mt-1">
                            <strong>💡</strong> {config.help}
                          </small>
                        </FormGroup>
                      </CardBody>
                    </Card>
                  </Col>
                ))}
              </Row>

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
    </div>
  );
}

export default SmartPurchasingConfig;

