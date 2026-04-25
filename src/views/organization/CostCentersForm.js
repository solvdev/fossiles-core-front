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
} from "reactstrap";
import { getCostCenterById, createCostCenter, updateCostCenter } from "services/costCenterService";

function CostCentersForm({ costCenterId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (costCenterId) {
        loadCostCenter();
      } else {
        resetForm();
      }
    }
  }, [isOpen, costCenterId]);

  const loadCostCenter = async () => {
    try {
      setLoading(true);
      const costCenter = await getCostCenterById(costCenterId);
      setFormData({
        code: costCenter.code || "",
        name: costCenter.name || "",
        description: costCenter.description || "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el centro de costo");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({ code: "", name: "", description: "" });
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
      const submitData = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        description: formData.description.trim() || null,
      };
      if (costCenterId) {
        await updateCostCenter(costCenterId, submitData);
      } else {
        await createCostCenter(submitData);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el centro de costo");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {costCenterId ? "Editar Centro de Costo" : "Nuevo Centro de Costo"}
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
          <FormGroup>
            <Label>Descripción</Label>
            <Input
              type="textarea"
              rows="3"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : costCenterId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default CostCentersForm;

