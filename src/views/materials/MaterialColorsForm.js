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
import { getMaterialColorById, createMaterialColor, createMaterialColors, updateMaterialColor } from "services/materialColorService";

function MaterialColorsForm({ colorId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isOpen) {
      if (colorId) {
        loadColor();
      } else {
        resetForm();
      }
    }
  }, [isOpen, colorId]);

  const loadColor = async () => {
    try {
      setLoading(true);
      const color = await getMaterialColorById(colorId);
      setFormData({
        name: color.name || "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el color");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
    });
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
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
      if (colorId) {
        await updateMaterialColor(colorId, { name: formData.name.trim() });
      } else {
        const colorNames = formData.name
          .split(",")
          .map(name => name.trim())
          .filter(name => name.length > 0);
        
        if (colorNames.length === 0) {
          setError("Debe ingresar al menos un color");
          setLoading(false);
          return;
        }
        
        if (colorNames.length === 1) {
          await createMaterialColor({ name: colorNames[0] });
        } else {
          await createMaterialColors(colorNames);
        }
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el color");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {colorId ? "Editar Color de Material" : "Nuevo Color de Material"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <FormGroup>
            <Label>Nombre *</Label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              invalid={!!errors.name}
              placeholder={colorId ? "Nombre del color" : "Nombre del color o múltiples colores separados por coma (ej: Rojo, Azul, Verde)"}
            />
            {errors.name && <div className="text-danger small">{errors.name}</div>}
            {!colorId && (
              <div className="text-muted small mt-1">
                Puede ingresar múltiples colores separados por coma. Ejemplo: Rojo, Azul, Verde
              </div>
            )}
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : colorId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default MaterialColorsForm;

