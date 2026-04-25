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
import { getUserById, updateUser, getUsers } from "services/userService";
import { getRoles } from "services/roleService";

function UserRolesForm({ userId: propUserId, onSuccess, onCancel }) {
  const [availableRoles, setAvailableRoles] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(propUserId || null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadRoles();
    loadUsers();
    if (propUserId && propUserId !== 'undefined' && propUserId !== 'null') {
      setSelectedUserId(propUserId);
      loadUserData(propUserId);
    }
  }, [propUserId]);

  useEffect(() => {
    if (selectedUserId && selectedUserId !== 'undefined' && selectedUserId !== 'null') {
      loadUserData(selectedUserId);
    } else {
      setSelectedRoles([]);
    }
  }, [selectedUserId]);

  const loadRoles = async () => {
    try {
      const roles = await getRoles();
      console.log('Roles cargados:', roles);
      setAvailableRoles(roles || []);
    } catch (err) {
      console.error('Error al cargar roles:', err);
      setError(err.message || "Error al cargar los roles disponibles");
    }
  };

  const loadUsers = async () => {
    try {
      const users = await getUsers();
      setAvailableUsers(users || []);
    } catch (err) {
      console.error('Error al cargar usuarios:', err);
      setError(err.message || "Error al cargar los usuarios");
    }
  };

  const loadUserData = async (userId) => {
    try {
      setLoading(true);
      const user = await getUserById(userId);
      console.log('Usuario cargado:', user);
      // Establecer los roles seleccionados del usuario
      // Los roles vienen en user.roles como un array de objetos RoleResponse
      const userRoleIds = user.roles ? user.roles.map((role) => role.id) : [];
      setSelectedRoles(userRoleIds);
    } catch (err) {
      console.error('Error al cargar usuario:', err);
      setError(err.message || "Error al cargar los datos del usuario");
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = (roleId, checked) => {
    if (checked) {
      setSelectedRoles((prev) => [...prev, roleId]);
    } else {
      setSelectedRoles((prev) => prev.filter((id) => id !== roleId));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedUserId || selectedUserId === 'undefined' || selectedUserId === 'null') {
      setError("Por favor, seleccione un usuario");
      return;
    }

    try {
      setLoading(true);
      // Obtener los datos actuales del usuario
      const user = await getUserById(selectedUserId);
      // Actualizar el usuario con los nuevos roles
      await updateUser(selectedUserId, {
        username: user.username,
        email: user.email,
        status: user.status,
        firstName: user.firstName,
        lastName: user.lastName,
        departmentId: user.department ? user.department.id : null,
        costCenterId: user.costCenter ? user.costCenter.id : null,
        operationalUnitId: user.operationalUnit ? user.operationalUnit.id : null,
        roleIds: selectedRoles.length > 0 ? selectedRoles : []
      });
      setSuccess("Roles asignados correctamente");

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al asignar roles");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="8">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Asignar Roles al Usuario</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={handleSubmit}>
                <FormGroup>
                  <Label>Seleccione el usuario:</Label>
                  <Input
                    type="select"
                    value={selectedUserId || ''}
                    onChange={(e) => setSelectedUserId(e.target.value)}
                    disabled={loading || !!propUserId}
                  >
                    <option value="">-- Seleccione un usuario --</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.username} ({user.email})
                      </option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup>
                  <Label>Seleccione los roles para este usuario:</Label>
                  {!selectedUserId || selectedUserId === 'undefined' || selectedUserId === 'null' ? (
                    <Alert color="info">
                      Por favor, seleccione un usuario primero para ver los roles disponibles.
                    </Alert>
                  ) : loading && availableRoles.length === 0 ? (
                    <p>Cargando roles...</p>
                  ) : availableRoles.length === 0 ? (
                    <Alert color="warning">
                      No hay roles disponibles. Cree roles primero desde la sección de Roles.
                    </Alert>
                  ) : (
                    availableRoles.map((role) => (
                      <FormGroup check key={role.id} className="mb-2">
                        <Label check>
                          <Input
                            type="checkbox"
                            checked={selectedRoles.includes(role.id)}
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
                <CardFooter>
                  <Button
                    type="submit"
                    color="primary"
                    disabled={loading}
                    className="btn-round"
                  >
                    {loading ? "Guardando..." : "Guardar Roles"}
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

export default UserRolesForm;

