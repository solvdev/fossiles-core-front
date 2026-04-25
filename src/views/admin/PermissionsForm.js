import React, { useState, useEffect } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardFooter,
  CardTitle,
  Label,
  FormGroup,
  Form,
  Input,
  Row,
  Col,
  Alert,
} from "reactstrap";
import {
  createPermission,
  updatePermission,
  getPermissionById,
} from "services/permissionService";

function PermissionsForm({ permissionId, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    code: "",
    description: "",
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (permissionId && permissionId !== 'undefined' && permissionId !== 'null') {
      loadPermission();
    }
  }, [permissionId]);

  const loadPermission = async () => {
    try {
      setLoading(true);
      const permission = await getPermissionById(permissionId);
      setFormData({
        code: permission.code || "",
        description: permission.description || "",
      });
    } catch (err) {
      setError(err.message || "Error al cargar el permiso");
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.code.trim()) {
      newErrors.code = "El código del permiso es requerido";
    } else if (formData.code.length < 3) {
      newErrors.code = "El código del permiso debe tener al menos 3 caracteres";
    } else if (!/^[A-Z_]+$/.test(formData.code)) {
      newErrors.code =
        "El código debe estar en mayúsculas y usar guiones bajos (ej: USER_CREATE)";
    }

    if (formData.description && formData.description.length > 200) {
      newErrors.description =
        "La descripción no puede exceder 200 caracteres";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!validate()) {
      return;
    }

    try {
      setLoading(true);
      const permissionData = {
        code: formData.code.trim().toUpperCase(),
        description: formData.description.trim() || null,
      };

      if (permissionId && permissionId !== 'undefined' && permissionId !== 'null') {
        await updatePermission(permissionId, permissionData);
        setSuccess("Permiso actualizado correctamente");
      } else {
        await createPermission(permissionData);
        setSuccess("Permiso creado correctamente");
        // Limpiar formulario
        setFormData({
          code: "",
          description: "",
        });
      }

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al guardar el permiso");
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
    // Limpiar error del campo cuando el usuario empiece a escribir
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="8">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">
                {permissionId ? "Editar Permiso" : "Nuevo Permiso"}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md="12">
                    <FormGroup className={errors.code ? "has-danger" : ""}>
                      <Label>Código del Permiso *</Label>
                      <Input
                        type="text"
                        name="code"
                        value={formData.code}
                        onChange={handleChange}
                        placeholder="Ej: USER_CREATE, USER_UPDATE"
                        disabled={loading}
                        maxLength={100}
                        style={{ textTransform: "uppercase" }}
                      />
                      <small className="form-text text-muted">
                        Use mayúsculas y guiones bajos (ej: USER_CREATE)
                      </small>
                      {errors.code && (
                        <label className="error">{errors.code}</label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="12">
                    <FormGroup
                      className={errors.description ? "has-danger" : ""}
                    >
                      <Label>Descripción</Label>
                      <Input
                        type="textarea"
                        name="description"
                        value={formData.description}
                        onChange={handleChange}
                        placeholder="Ingrese una descripción del permiso"
                        disabled={loading}
                        rows="4"
                        maxLength={200}
                      />
                      <small className="form-text text-muted">
                        {formData.description.length}/200 caracteres
                      </small>
                      {errors.description && (
                        <label className="error">{errors.description}</label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <CardFooter>
                  <Button
                    type="submit"
                    color="primary"
                    disabled={loading}
                    className="btn-round"
                  >
                    {loading
                      ? "Guardando..."
                      : permissionId
                      ? "Actualizar"
                      : "Crear"}
                  </Button>
                  {onCancel && (
                    <Button
                      type="button"
                      color="secondary"
                      onClick={onCancel}
                      disabled={loading}
                      className="btn-round ml-2"
                    >
                      Cancelar
                    </Button>
                  )}
                </CardFooter>
              </Form>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default PermissionsForm;

