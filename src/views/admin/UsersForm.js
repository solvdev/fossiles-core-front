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
import { createUser, updateUser, getUserById, uploadUserProfilePhoto } from "services/userService";
import { getRoles } from "services/roleService";
import { getDepartments } from "services/departmentService";
import { getCostCenters } from "services/costCenterService";
import { getOperationalUnits } from "services/operationalUnitService";
import { encrypt } from "services/encryptionService";

function UsersForm({ userId, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    firstName: "",
    lastName: "",
    password: "",
    confirmPassword: "",
    status: "active",
    departmentId: "",
    costCenterId: "",
    operationalUnitId: "",
    roleIds: [],
  });
  const [availableRoles, setAvailableRoles] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [costCenters, setCostCenters] = useState([]);
  const [operationalUnits, setOperationalUnits] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [profileImageFile, setProfileImageFile] = useState(null);
  const [profileImagePreview, setProfileImagePreview] = useState("");

  useEffect(() => {
    loadLookups();
    if (userId && userId !== 'undefined' && userId !== 'null') {
      loadUser();
    }
  }, [userId]);

  const loadLookups = async () => {
    try {
      const [rolesData, departmentsData, costCentersData, operationalUnitsData] = await Promise.all([
        getRoles(),
        getDepartments(),
        getCostCenters(),
        getOperationalUnits(),
      ]);
      setAvailableRoles(rolesData);
      setDepartments(departmentsData || []);
      setCostCenters(costCentersData || []);
      setOperationalUnits(operationalUnitsData || []);
    } catch (err) {
      console.error("Error al cargar catálogos de usuario:", err);
      setError(err.message || "No se pudieron cargar los catálogos necesarios");
    }
  };

  const loadUser = async () => {
    try {
      setLoading(true);
      const user = await getUserById(userId);
      setFormData({
        username: user.username || "",
        email: user.email || "",
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        password: "",
        confirmPassword: "",
        status: user.status || "active",
        departmentId: user.department ? String(user.department.id) : "",
        costCenterId: user.costCenter ? String(user.costCenter.id) : "",
        operationalUnitId: user.operationalUnit ? String(user.operationalUnit.id) : "",
        roleIds: user.roles ? user.roles.map((role) => role.id) : [],
      });
      setProfileImagePreview(resolveImageUrl(user.profileImageUrl));
      setProfileImageFile(null);
    } catch (err) {
      setError(err.message || "Error al cargar el usuario");
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.username.trim()) {
      newErrors.username = "El nombre de usuario es requerido";
    } else if (formData.username.length < 3) {
      newErrors.username = "El nombre de usuario debe tener al menos 3 caracteres";
    }

    if (!formData.email.trim()) {
      newErrors.email = "El email es requerido";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "El email no es válido";
    }

    if (!formData.firstName.trim()) {
      newErrors.firstName = "El nombre es requerido";
    }

    if (!formData.lastName.trim()) {
      newErrors.lastName = "El apellido es requerido";
    }

    if (!formData.departmentId) {
      newErrors.departmentId = "El departamento es requerido";
    }

    if (!formData.costCenterId) {
      newErrors.costCenterId = "El centro de costo es requerido";
    }

    if (!formData.operationalUnitId) {
      newErrors.operationalUnitId = "La unidad operativa es requerida";
    }

    if (!userId && !formData.password) {
      newErrors.password = "La contraseña es requerida";
    } else if (formData.password && formData.password.length < 6) {
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = "Las contraseñas no coinciden";
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
      const userData = {
        username: formData.username.trim(),
        email: formData.email.trim(),
        firstName: formData.firstName.trim(),
        lastName: formData.lastName.trim(),
        status: formData.status,
        departmentId: Number(formData.departmentId),
        costCenterId: Number(formData.costCenterId),
        operationalUnitId: Number(formData.operationalUnitId),
        roleIds: formData.roleIds.length > 0 ? formData.roleIds : [],
      };

      // Solo incluir password si se está creando o si se cambió
      if (!userId || formData.password) {
        userData.password = encrypt(formData.password);
      }

      let targetUserId = userId;
      if (userId && userId !== 'undefined' && userId !== 'null') {
        await updateUser(userId, userData);
        setSuccess("Usuario actualizado correctamente");
      } else {
        const createdUser = await createUser(userData);
        targetUserId = createdUser?.id;
        setSuccess("Usuario creado correctamente");
        // Limpiar formulario
        setFormData({
          username: "",
          email: "",
          firstName: "",
          lastName: "",
          password: "",
          confirmPassword: "",
          status: "active",
          departmentId: "",
          costCenterId: "",
          operationalUnitId: "",
          roleIds: [],
        });
      }

      if (profileImageFile && targetUserId) {
        await uploadUserProfilePhoto(targetUserId, profileImageFile);
        setSuccess(userId ? "Usuario y foto actualizados correctamente" : "Usuario y foto creados correctamente");
      }

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al guardar el usuario");
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

  const handleRoleChange = (roleId, checked) => {
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        roleIds: [...prev.roleIds, roleId],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        roleIds: prev.roleIds.filter((id) => id !== roleId),
      }));
    }
  };

  const resolveImageUrl = (rawValue) => {
    const raw = String(rawValue || "").trim();
    if (!raw) return "";
    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:")
    ) {
      return raw;
    }
    try {
      const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
      const origin = new URL(apiUrl).origin;
      return `${origin}${raw.startsWith("/") ? raw : `/${raw}`}`;
    } catch {
      return raw;
    }
  };

  const handleProfileImageChange = (event) => {
    const file = event.target.files?.[0] || null;
    setProfileImageFile(file);
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setProfileImagePreview(preview);
  };

  return (
    <div className="content">
      <Row>
        <Col md="8">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">
                {userId ? "Editar Usuario" : "Nuevo Usuario"}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md="12">
                    <FormGroup>
                      <Label>Foto de perfil</Label>
                      <div className="mb-2">
                        {profileImagePreview ? (
                          <img
                            src={profileImagePreview}
                            alt="Foto de perfil"
                            style={{
                              width: "96px",
                              height: "96px",
                              objectFit: "cover",
                              borderRadius: "50%",
                              border: "1px solid #d9d9d9",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "96px",
                              height: "96px",
                              borderRadius: "50%",
                              border: "1px dashed #d9d9d9",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              color: "#9a9a9a",
                              fontSize: "12px",
                            }}
                          >
                            Sin foto
                          </div>
                        )}
                      </div>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={handleProfileImageChange}
                        disabled={loading}
                      />
                    </FormGroup>
                  </Col>
                  <Col md="6">
                    <FormGroup className={errors.username ? "has-danger" : ""}>
                      <Label>Nombre de Usuario *</Label>
                      <Input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        placeholder="Ingrese el nombre de usuario"
                        disabled={loading}
                      />
                      {errors.username && (
                        <label className="error">{errors.username}</label>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md="6">
                    <FormGroup className={errors.email ? "has-danger" : ""}>
                      <Label>Email *</Label>
                      <Input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="usuario@ejemplo.com"
                        disabled={loading}
                      />
                      {errors.email && (
                        <label className="error">{errors.email}</label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="6">
                    <FormGroup className={errors.firstName ? "has-danger" : ""}>
                      <Label>Nombre *</Label>
                      <Input
                        type="text"
                        name="firstName"
                        value={formData.firstName}
                        onChange={handleChange}
                        placeholder="Nombre"
                        disabled={loading}
                      />
                      {errors.firstName && (
                        <label className="error">{errors.firstName}</label>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md="6">
                    <FormGroup className={errors.lastName ? "has-danger" : ""}>
                      <Label>Apellido *</Label>
                      <Input
                        type="text"
                        name="lastName"
                        value={formData.lastName}
                        onChange={handleChange}
                        placeholder="Apellido"
                        disabled={loading}
                      />
                      {errors.lastName && (
                        <label className="error">{errors.lastName}</label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="4">
                    <FormGroup className={errors.departmentId ? "has-danger" : ""}>
                      <Label>Departamento *</Label>
                      <Input
                        type="select"
                        name="departmentId"
                        value={formData.departmentId}
                        onChange={handleChange}
                        disabled={loading}
                      >
                        <option value="">Seleccione</option>
                        {departments.map((dept) => (
                          <option key={dept.id} value={dept.id}>
                            {dept.name || dept.code}
                          </option>
                        ))}
                      </Input>
                      {errors.departmentId && (
                        <label className="error">{errors.departmentId}</label>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md="4">
                    <FormGroup className={errors.costCenterId ? "has-danger" : ""}>
                      <Label>Centro de costo *</Label>
                      <Input
                        type="select"
                        name="costCenterId"
                        value={formData.costCenterId}
                        onChange={handleChange}
                        disabled={loading}
                      >
                        <option value="">Seleccione</option>
                        {costCenters.map((cc) => (
                          <option key={cc.id} value={cc.id}>
                            {cc.code} - {cc.name}
                          </option>
                        ))}
                      </Input>
                      {errors.costCenterId && (
                        <label className="error">{errors.costCenterId}</label>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md="4">
                    <FormGroup className={errors.operationalUnitId ? "has-danger" : ""}>
                      <Label>Unidad operativa *</Label>
                      <Input
                        type="select"
                        name="operationalUnitId"
                        value={formData.operationalUnitId}
                        onChange={handleChange}
                        disabled={loading}
                      >
                        <option value="">Seleccione</option>
                        {operationalUnits.map((ou) => (
                          <option key={ou.id} value={ou.id}>
                            {ou.code} - {ou.name}
                          </option>
                        ))}
                      </Input>
                      {errors.operationalUnitId && (
                        <label className="error">{errors.operationalUnitId}</label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="6">
                    <FormGroup className={errors.password ? "has-danger" : ""}>
                      <Label>
                        Contraseña {userId ? "(dejar vacío para no cambiar)" : "*"}
                      </Label>
                      <Input
                        type="password"
                        name="password"
                        value={formData.password}
                        onChange={handleChange}
                        placeholder="Ingrese la contraseña"
                        disabled={loading}
                      />
                      {errors.password && (
                        <label className="error">{errors.password}</label>
                      )}
                    </FormGroup>
                  </Col>
                  <Col md="6">
                    <FormGroup
                      className={errors.confirmPassword ? "has-danger" : ""}
                    >
                      <Label>
                        Confirmar Contraseña{" "}
                        {userId ? "(dejar vacío para no cambiar)" : "*"}
                      </Label>
                      <Input
                        type="password"
                        name="confirmPassword"
                        value={formData.confirmPassword}
                        onChange={handleChange}
                        placeholder="Confirme la contraseña"
                        disabled={loading}
                      />
                      {errors.confirmPassword && (
                        <label className="error">
                          {errors.confirmPassword}
                        </label>
                      )}
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="6">
                    <FormGroup>
                      <Label>Estado</Label>
                      <Input
                        type="select"
                        name="status"
                        value={formData.status}
                        onChange={handleChange}
                        disabled={loading}
                      >
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                      </Input>
                    </FormGroup>
                  </Col>
                </Row>
                <Row>
                  <Col md="12">
                    <FormGroup>
                      <Label>Roles</Label>
                      {availableRoles.length === 0 ? (
                        <p className="text-muted">No hay roles disponibles</p>
                      ) : (
                        availableRoles.map((role) => (
                          <FormGroup check key={role.id} className="mb-2">
                            <Label check>
                              <Input
                                type="checkbox"
                                checked={formData.roleIds.includes(role.id)}
                                onChange={(e) =>
                                  handleRoleChange(role.id, e.target.checked)
                                }
                                disabled={loading}
                              />
                              <span className="form-check-sign" />
                              <strong>{role.name}</strong>
                              {role.description && (
                                <span className="text-muted ml-2">
                                  - {role.description}
                                </span>
                              )}
                            </Label>
                          </FormGroup>
                        ))
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
                    {loading ? "Guardando..." : userId ? "Actualizar" : "Crear"}
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

export default UsersForm;

