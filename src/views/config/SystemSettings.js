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
} from "reactstrap";
import { getSystemConfigByKey, getManufacturingPayroll, getManufacturingAvailableHours, getManufacturingNumberOfTables, calculateManufacturingCosts, saveManufacturingConfig } from "services/systemConfigService";
import { bulkUpdatePrices } from "services/productService";
import { getProductCategories } from "services/productCategoryService";

function SystemSettings() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategoryForPriceUpdate, setSelectedCategoryForPriceUpdate] = useState("");
  const [priceUpdateLoading, setPriceUpdateLoading] = useState(false);
  
  // State for production lines - only fields needed for formulas
  const [payrollCinchos, setPayrollCinchos] = useState(0);
  const [payrollMesas, setPayrollMesas] = useState(0);
  const [payrollWarehouse, setPayrollWarehouse] = useState(0);
  const [minutesCinchos, setMinutesCinchos] = useState(0);
  const [minutesMesas, setMinutesMesas] = useState(0);
  const [numberOfTablesMesas, setNumberOfTablesMesas] = useState(12);
  const [calculatedCosts, setCalculatedCosts] = useState({ costoHoraCinchos: 0, costoHoraMesas: 0 });

  useEffect(() => {
    loadSettings();
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const data = await getProductCategories();
      setCategories(data || []);
    } catch (err) {
      console.error("Error al cargar categorías:", err);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      // Load values for "mesas" products (used by ProductRecipeModal)
      const payrollMesas = await getManufacturingPayroll();
      setPayrollMesas(payrollMesas || 0);
      
      const minutesMesas = await getManufacturingAvailableHours(); // Contains minutes
      setMinutesMesas(minutesMesas || 0);
      
      const tablesMesas = await getManufacturingNumberOfTables();
      setNumberOfTablesMesas(tablesMesas || 12);
      
      // Load other values
      const payrollCinchosConfig = await getSystemConfigByKey('MANUFACTURING_PAYROLL_CINCHOS');
      if (payrollCinchosConfig && payrollCinchosConfig.configValue) {
        setPayrollCinchos(parseFloat(payrollCinchosConfig.configValue) || 0);
      }
      
      const payrollWarehouseConfig = await getSystemConfigByKey('MANUFACTURING_PAYROLL_WAREHOUSE');
      if (payrollWarehouseConfig && payrollWarehouseConfig.configValue) {
        setPayrollWarehouse(parseFloat(payrollWarehouseConfig.configValue) || 0);
      }
      
      const minutesCinchosConfig = await getSystemConfigByKey('MANUFACTURING_MINUTES_CINCHOS');
      if (minutesCinchosConfig && minutesCinchosConfig.configValue) {
        setMinutesCinchos(parseInt(minutesCinchosConfig.configValue, 10) || 0);
      }
    } catch (err) {
      console.error("Error al cargar configuraciones:", err);
    } finally {
      setLoading(false);
    }
  };

  // Recalculate costs when production line inputs change - using backend
  useEffect(() => {
    const recalculateCosts = async () => {
      if (minutesCinchos > 0 || (minutesMesas > 0 && numberOfTablesMesas > 0)) {
        try {
          const costs = await calculateManufacturingCosts({
            payrollCinchos,
            payrollMesas,
            payrollWarehouse,
            minutesCinchos,
            minutesMesas,
            numberOfTablesMesas
          });
          setCalculatedCosts({
            costoHoraCinchos: costs.costoHoraCinchos || 0,
            costoHoraMesas: costs.costoHoraMesas || 0
          });
        } catch (err) {
          console.error("Error al calcular costos:", err);
          setCalculatedCosts({ costoHoraCinchos: 0, costoHoraMesas: 0 });
        }
      } else {
        setCalculatedCosts({ costoHoraCinchos: 0, costoHoraMesas: 0 });
      }
    };
    
    recalculateCosts();
  }, [payrollCinchos, payrollMesas, payrollWarehouse, minutesCinchos, minutesMesas, numberOfTablesMesas]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      // Save all manufacturing configuration using backend endpoint
      await saveManufacturingConfig({
        payrollCinchos,
        payrollMesas,
        payrollWarehouse,
        minutesCinchos,
        minutesMesas,
        numberOfTablesMesas
      });

      setSuccess("Configuraciones actualizadas correctamente");
    } catch (err) {
      setError(err.message || "Error al guardar la configuración");
    } finally {
      setLoading(false);
    }
  };

  const handleBulkPriceUpdate = async (percentage) => {
    try {
      setPriceUpdateLoading(true);
      setError("");
      setSuccess("");
      
      const categoryId = selectedCategoryForPriceUpdate ? parseInt(selectedCategoryForPriceUpdate, 10) : null;
      const result = await bulkUpdatePrices(percentage, categoryId);
      
      setSuccess(result);
    } catch (err) {
      setError(err.message || "Error al actualizar precios");
    } finally {
      setPriceUpdateLoading(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Configuración del Sistema</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}

              {/* Cálculo de Costos por Líneas de Producción Duales */}
              <Row className="mt-4">
                <Col md="12">
                  <Card>
                    <CardHeader>
                      <CardTitle tag="h5">Cálculo de Costos por Líneas de Producción</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <p className="text-muted">
                        Configure las planillas y minutos productivos para calcular el costo por hora de manufactura 
                        para las líneas de producción de Cinchos (categoría FOSS) y Mesas. El costo de bodega se suma 
                        a ambas líneas en el cálculo.
                      </p>
                      
                      <form onSubmit={handleSubmit}>
                      <Row>
                        <Col md="6">
                          <FormGroup>
                            <Label>Planilla Cinchos (Q)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={payrollCinchos}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setPayrollCinchos(value);
                              }}
                              placeholder="Ej: 25000"
                            />
                            <small className="form-text text-muted">
                              Planilla de la línea de producción de cinchos
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label>Planilla Mesas (Q) - Anual</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={payrollMesas}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setPayrollMesas(value);
                              }}
                              placeholder="Ej: 300000"
                            />
                            <small className="form-text text-muted">
                              Planilla anual de la línea de producción de mesas (se divide por 12 para obtener mensual)
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label>Planilla Bodega (Q)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={payrollWarehouse}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setPayrollWarehouse(value);
                              }}
                              placeholder="Ej: 10000"
                            />
                            <small className="form-text text-muted">
                              Planilla de operaciones de bodega (se suma a ambas líneas)
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label>Minutos Productivos Cinchos</Label>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={minutesCinchos}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setMinutesCinchos(value);
                              }}
                              placeholder="Ej: 9600"
                            />
                            <small className="form-text text-muted">
                              Minutos productivos de trabajo para la línea de cinchos (por período, ej: mensual)
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label>Minutos Productivos Mesas</Label>
                            <Input
                              type="number"
                              step="1"
                              min="0"
                              value={minutesMesas}
                              onChange={(e) => {
                                const value = parseFloat(e.target.value) || 0;
                                setMinutesMesas(value);
                              }}
                              placeholder="Ej: 9600"
                            />
                            <small className="form-text text-muted">
                              Minutos productivos de trabajo para la línea de mesas (por período, ej: mensual)
                            </small>
                          </FormGroup>
                        </Col>
                        <Col md="6">
                          <FormGroup>
                            <Label>Número de Mesas</Label>
                            <Input
                              type="number"
                              step="1"
                              min="1"
                              value={numberOfTablesMesas}
                              onChange={(e) => {
                                const value = parseInt(e.target.value, 10) || 1;
                                setNumberOfTablesMesas(value);
                              }}
                              placeholder="Ej: 12"
                            />
                            <small className="form-text text-muted">
                              Número de mesas de trabajo para la línea de mesas (usado en el cálculo del costo)
                            </small>
                          </FormGroup>
                        </Col>
                      </Row>
                      
                      {/* Formulas Section */}
                      <Row className="mt-3">
                        <Col md="12">
                          <Alert color="light">
                            <h6 className="mb-3"><strong>Fórmulas de Cálculo</strong></h6>
                            <Row>
                              <Col md="6">
                                <div className="mb-2">
                                  <strong className="text-primary">Costo por Hora Cinchos:</strong>
                                  <div className="mt-2" style={{ fontSize: '14px', color:'black' }}>
                                    ((Planilla Cinchos + Planilla Bodega) / Minutos Productivos Cinchos) × 60
                                  </div>
                                </div>
                              </Col>
                              <Col md="6">
                                <div className="mb-2">
                                  <strong className="text-success">Costo por Hora Mesas:</strong>
                                  <div className="mt-2" style={{ fontSize: '14px', color:'black' }}>
                                    ((Planilla Mesas + Planilla Bodega) / (Número de Mesas × Minutos Productivos Mesas)) × 60
                                  </div>
                                </div>
                              </Col>
                            </Row>
                          </Alert>
                        </Col>
                      </Row>
                      
                      <Row className="mt-3">
                        <Col md="12">
                          <Button color="primary" type="submit" disabled={loading}>
                            {loading ? "Guardando..." : "Guardar Configuración"}
                          </Button>
                        </Col>
                      </Row>
                      </form>

                      {/* Results Display */}
                      {(calculatedCosts.costoHoraCinchos > 0 || calculatedCosts.costoHoraMesas > 0) && (
                        <Row className="mt-4">
                          <Col md="12">
                            <h6 className="mb-3">Resultados del Cálculo</h6>
                            
                            <Alert color="info" className="mb-3">
                              <Row>
                                <Col md="6">
                                  <strong>Costo por Hora Cinchos:</strong> Q {calculatedCosts.costoHoraCinchos.toFixed(2)}/hora
                                  <br />
                                  <small className="text-muted">
                                    Fórmula: (({payrollCinchos.toFixed(2)} + {payrollWarehouse.toFixed(2)}) ÷ {minutesCinchos.toFixed(0)} min) × 60
                                  </small>
                                </Col>
                                <Col md="6">
                                  <strong>Costo por Hora Mesas:</strong> Q {calculatedCosts.costoHoraMesas.toFixed(2)}/hora
                                  <br />
                                  <small className="text-muted">
                                    Fórmula: (({payrollMesas.toFixed(2)} + {payrollWarehouse.toFixed(2)}) ÷ ({numberOfTablesMesas} × {minutesMesas.toFixed(0)} min)) × 60
                                  </small>
                                </Col>
                              </Row>
                            </Alert>
                          </Col>
                        </Row>
                      )}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              <hr />

              {/* Ajuste Masivo de Precios */}
              <Row className="mt-4">
                <Col md="12">
                  <Card>
                    <CardHeader>
                      <CardTitle tag="h5">Ajuste Masivo de Precios de Venta</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <p className="text-muted">
                        Esta herramienta permite aumentar o disminuir los precios de venta de los productos en un porcentaje específico.
                        Solo se actualizarán productos que tengan un precio de venta establecido.
                      </p>
                      <Row>
                        <Col md="6">
                          <FormGroup>
                            <Label>Seleccionar Categoría (Opcional)</Label>
                            <Input
                              type="select"
                              value={selectedCategoryForPriceUpdate}
                              onChange={(e) => setSelectedCategoryForPriceUpdate(e.target.value)}
                              disabled={priceUpdateLoading}
                            >
                              <option value="">Todos los productos</option>
                              {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                  {category.code} - {category.name}
                                </option>
                              ))}
                            </Input>
                            <small className="form-text text-muted">
                              Si no selecciona una categoría, se aplicará a todos los productos
                            </small>
                          </FormGroup>
                        </Col>
                      </Row>
                      <Row className="mt-3">
                        <Col md="12">
                          <h6>Aumentar Precios</h6>
                          <Button
                            color="success"
                            className="me-2 mb-2"
                            onClick={() => handleBulkPriceUpdate(10)}
                            disabled={priceUpdateLoading}
                          >
                            +10%
                          </Button>
                          <Button
                            color="success"
                            className="me-2 mb-2"
                            onClick={() => handleBulkPriceUpdate(15)}
                            disabled={priceUpdateLoading}
                          >
                            +15%
                          </Button>
                        </Col>
                      </Row>
                      <Row className="mt-2">
                        <Col md="12">
                          <h6>Disminuir Precios</h6>
                          <Button
                            color="warning"
                            className="me-2 mb-2"
                            onClick={() => handleBulkPriceUpdate(-10)}
                            disabled={priceUpdateLoading}
                          >
                            -10%
                          </Button>
                          <Button
                            color="warning"
                            className="me-2 mb-2"
                            onClick={() => handleBulkPriceUpdate(-15)}
                            disabled={priceUpdateLoading}
                          >
                            -15%
                          </Button>
                        </Col>
                      </Row>
                      {priceUpdateLoading && (
                        <Alert color="info" className="mt-3">
                          Actualizando precios...
                        </Alert>
                      )}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              <hr />

              <Row className="mt-4">
                <Col md="12">
                  <h5>Información</h5>
                  <p>
                    <strong>Configuración de Líneas de Producción:</strong>
                    <br />
                    • <strong>Cinchos (categoría FOSS):</strong> Usa la planilla de cinchos más la planilla de bodega, dividida por minutos productivos
                    <br />
                    • <strong>Mesas:</strong> Usa la planilla de mesas más la planilla de bodega, dividida por el número de mesas y luego por minutos productivos
                    <br />
                    • <strong>Bodega:</strong> Se suma directamente a ambas líneas en el cálculo
                  </p>
                  <p>
                    <strong>Fórmulas de Cálculo:</strong>
                    <br />
                    <strong>Costo por Hora Cinchos:</strong>
                    <br />
                    - Fórmula: ((Planilla Cinchos + Planilla Bodega) ÷ Minutos Productivos Cinchos) × 60
                    <br />
                    - Ejemplo: ((Q25,000 + Q10,000) ÷ 9,600 min) × 60 = Q218.75/hora
                    <br />
                    <br />
                    <strong>Costo por Hora Mesas:</strong>
                    <br />
                    - Fórmula: ((Planilla Mesas + Planilla Bodega) ÷ (Número de Mesas × Minutos Productivos Mesas)) × 60
                    <br />
                    - Ejemplo: ((Q300,000 + Q10,000) ÷ (12 mesas × 9,600 min)) × 60 = Q161.46/hora
                  </p>
                  <p>
                    <strong>Nota:</strong> Los valores de "Planilla Mesas", "Minutos Productivos Mesas" y "Número de Mesas" se guardan 
                    y se usan en el cálculo de costos de manufactura para productos que NO son cinchos (categorías distintas a código FOSS).
                    Los precios de venta se establecen manualmente para cada producto.
                  </p>
                </Col>
              </Row>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default SystemSettings;

