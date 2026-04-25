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
import { getProductCategoryById, createProductCategory, updateProductCategory } from "services/productCategoryService";

function ProductCategoriesForm({ categoryId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    hourlyCost: "",
    payrollTotal: "",
    availableHours: "",
    numberOfTables: "",
  });
  const [calculatedHourlyCost, setCalculatedHourlyCost] = useState(0);
  const [calculatedMinuteCost, setCalculatedMinuteCost] = useState(0);
  const [calculatedHourlyCostPerTable, setCalculatedHourlyCostPerTable] = useState(0);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (categoryId) {
        loadCategory();
      } else {
        resetForm();
      }
    }
  }, [isOpen, categoryId]);

  const loadCategory = async () => {
    try {
      setLoading(true);
      const category = await getProductCategoryById(categoryId);
      setFormData({
        code: category.code || "",
        name: category.name || "",
        hourlyCost: category.hourlyCost || "",
        payrollTotal: category.payrollTotal || "",
        availableHours: category.availableHours || "",
        numberOfTables: category.numberOfTables || "",
      });
      calculateCosts(category.payrollTotal, category.availableHours, category.numberOfTables);
    } catch (err) {
      setError(err.message || "Error al cargar la categoría");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", name: "", hourlyCost: "", payrollTotal: "", availableHours: "", numberOfTables: "" });
    setCalculatedHourlyCost(0);
    setCalculatedMinuteCost(0);
    setCalculatedHourlyCostPerTable(0);
    setErrors({});
    setError("");
  };

  const calculateCosts = (payroll, minutes, tables) => {
    if (payroll && minutes && parseFloat(minutes) > 0) {
      const payrollValue = parseFloat(payroll);
      const minutesValue = parseFloat(minutes);
      const tablesValue = tables ? parseInt(tables, 10) : 1;
      
      // Costo por minuto por mesa = Planilla ÷ (Minutos × Número de Mesas)
      const minutePerTable = payrollValue / (minutesValue * tablesValue);
      // Costo por hora por mesa = Costo por minuto × 60
      const hourlyPerTable = minutePerTable * 60;
      
      // Costo total por hora (sin dividir por mesas) para referencia
      const hours = minutesValue / 60;
      const hourly = payrollValue / hours;
      
      setCalculatedHourlyCost(hourly);
      setCalculatedHourlyCostPerTable(hourlyPerTable);
      setCalculatedMinuteCost(minutePerTable);
    } else {
      setCalculatedHourlyCost(0);
      setCalculatedHourlyCostPerTable(0);
      setCalculatedMinuteCost(0);
    }
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
      const submitData = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        hourlyCost: formData.hourlyCost ? parseFloat(formData.hourlyCost) : null,
        payrollTotal: formData.payrollTotal ? parseFloat(formData.payrollTotal) : null,
        availableHours: formData.availableHours ? parseFloat(formData.availableHours) : null,
        numberOfTables: formData.numberOfTables ? parseInt(formData.numberOfTables, 10) : null,
      };
      if (categoryId) {
        await updateProductCategory(categoryId, submitData);
      } else {
        await createProductCategory(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la categoría");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {categoryId ? "Editar Categoría" : "Nueva Categoría"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
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
          <hr />
          <h5>Costos de Manufactura (Opcional - Solo para Cintos)</h5>
          <p className="text-muted small">
            <strong>Nota:</strong> Solo configure esto si esta categoría necesita costos separados (ej: Cintos).
            <br />
            Si deja estos campos vacíos, la categoría usará la planilla global configurada en Configuración del Sistema.
            <br />
            El sistema calculará automáticamente el costo por hora y por minuto basado en la planilla y horas ingresadas.
          </p>
          
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Total de Planilla (Q)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.payrollTotal}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, payrollTotal: value });
                    calculateCosts(value, formData.availableHours, formData.numberOfTables);
                  }}
                  placeholder="Ej: 25000"
                />
                <small className="form-text text-muted">
                  Total de salarios de la planilla para esta categoría
                </small>
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Minutos Disponibles</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.availableHours}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, availableHours: value });
                    calculateCosts(formData.payrollTotal, value, formData.numberOfTables);
                  }}
                  placeholder="Ej: 9600 minutos (160 horas)"
                />
                <small className="form-text text-muted">
                  Minutos totales disponibles de trabajo para esta categoría. Ej: 9600 minutos = 160 horas
                </small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Número de Mesas</Label>
                <Input
                  type="number"
                  step="1"
                  min="1"
                  value={formData.numberOfTables}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFormData({ ...formData, numberOfTables: value });
                    calculateCosts(formData.payrollTotal, formData.availableHours, value);
                  }}
                  placeholder="Ej: 12"
                />
                <small className="form-text text-muted">
                  Número de mesas de trabajo para esta categoría
                </small>
              </FormGroup>
            </Col>
          </Row>

          {calculatedHourlyCostPerTable > 0 && (
            <Alert color="info">
              <Row>
                <Col md="4">
                  <strong>Costo por Hora por Mesa:</strong> Q {calculatedHourlyCostPerTable.toFixed(2)}/hora/mesa
                </Col>
                <Col md="4">
                  <strong>Costo por Minuto por Mesa:</strong> Q {calculatedMinuteCost.toFixed(4)}/min/mesa
                </Col>
                <Col md="4">
                  <strong>Costo Total por Hora:</strong> Q {calculatedHourlyCost.toFixed(2)}/hora
                </Col>
              </Row>
              <small>
                Fórmula: {formData.payrollTotal || 0} ÷ ({formData.availableHours || 0} min × {formData.numberOfTables || 1} mesas) × 60 = Q{calculatedHourlyCostPerTable.toFixed(2)}/hora/mesa
                <br />
                (Equivale a: {formData.payrollTotal || 0} ÷ ({((formData.availableHours || 0) / 60).toFixed(1)} hrs × {formData.numberOfTables || 1} mesas))
                <br />
                Este es el costo que se usará para calcular el costo de manufactura de cada producto de esta categoría.
              </small>
            </Alert>
          )}

          <FormGroup>
            <Label>Costo por Hora Manual (Q) - Opcional</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={formData.hourlyCost}
              onChange={(e) => setFormData({ ...formData, hourlyCost: e.target.value })}
              placeholder="Opcional: Si se especifica, se usa este en lugar del calculado"
            />
            <small className="form-text text-muted">
              Si se especifica, este costo manual se usará en lugar del calculado automáticamente.
              Si se deja vacío, se usará el costo calculado arriba o el costo global.
            </small>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : categoryId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default ProductCategoriesForm;

