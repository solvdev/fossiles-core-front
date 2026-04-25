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
import { getCurrencyById, createCurrency, updateCurrency } from "services/currencyService";

function CurrenciesForm({ currencyId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    symbol: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (currencyId) {
        loadCurrency();
      } else {
        resetForm();
      }
    }
  }, [isOpen, currencyId]);

  const loadCurrency = async () => {
    try {
      setLoading(true);
      const currency = await getCurrencyById(currencyId);
      setFormData({
        code: currency.code || "",
        name: currency.name || "",
        symbol: currency.symbol || "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar la moneda");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", name: "", symbol: "" });
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
      if (currencyId) {
        await updateCurrency(currencyId, formData);
      } else {
        await createCurrency(formData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar la moneda");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {currencyId ? "Editar Moneda" : "Nueva Moneda"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <Row>
            <Col md="4">
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
            <Col md="4">
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
            <Col md="4">
              <FormGroup>
                <Label>Símbolo</Label>
                <Input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                  placeholder="Q, $, €"
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
            {loading ? "Guardando..." : currencyId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default CurrenciesForm;

