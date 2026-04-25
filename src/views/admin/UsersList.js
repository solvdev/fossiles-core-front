import React, { useState, useEffect, useMemo } from "react";
import {
  Button,
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Badge,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Label,
  FormGroup,
} from "reactstrap";
import { getUsers, changeUserStatus, getUserById, updateUser } from "services/userService";
import { getDepartments } from "services/departmentService";
import { encrypt } from "services/encryptionService";
import UsersForm from "./UsersForm";

function UsersList() {
  const [users, setUsers] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filterName, setFilterName] = useState("");
  const [filterDepartmentId, setFilterDepartmentId] = useState("");
  const [viewDetailsModal, setViewDetailsModal] = useState(false);
  const [userToView, setUserToView] = useState(null);
  const [changePasswordModal, setChangePasswordModal] = useState(false);
  const [userToChangePassword, setUserToChangePassword] = useState(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [changingPassword, setChangingPassword] = useState(false);
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadUsers();
    loadDepartments();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      setError(err.message || "Error al cargar los usuarios");
    } finally {
      setLoading(false);
    }
  };

  const loadDepartments = async () => {
    try {
      const data = await getDepartments();
      setDepartments(data || []);
    } catch (err) {
      console.error("Error al cargar departamentos:", err);
    }
  };

  const handleNew = () => {
    setSelectedUserId(null);
    setShowForm(true);
  };

  const handleEdit = (userId) => {
    setSelectedUserId(userId);
    setShowForm(true);
  };

  const handleDelete = (user) => {
    setUserToDelete(user);
    setDeleteModal(true);
  };

  const handleActivate = async (user) => {
    try {
      setDeleting(true);
      await changeUserStatus(user.id, "active");
      loadUsers();
    } catch (err) {
      setError(err.message || "Error al reactivar el usuario");
    } finally {
      setDeleting(false);
    }
  };

  const handleViewDetails = async (userId) => {
    try {
      const user = await getUserById(userId);
      setUserToView(user);
      setViewDetailsModal(true);
    } catch (err) {
      setError(err.message || "Error al cargar los detalles del usuario");
    }
  };

  const handleChangePassword = (user) => {
    setUserToChangePassword(user);
    setNewPassword("");
    setConfirmNewPassword("");
    setPasswordErrors({});
    setChangePasswordModal(true);
  };

  const validatePassword = () => {
    const newErrors = {};
    if (!newPassword) {
      newErrors.password = "La contraseña es requerida";
    } else if (newPassword.length < 6) {
      newErrors.password = "La contraseña debe tener al menos 6 caracteres";
    }
    if (newPassword !== confirmNewPassword) {
      newErrors.confirmPassword = "Las contraseñas no coinciden";
    }
    setPasswordErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handlePasswordSubmit = async () => {
    if (!validatePassword()) return;

    try {
      setChangingPassword(true);
      const userData = {
        username: userToChangePassword.username,
        email: userToChangePassword.email,
        firstName: userToChangePassword.firstName,
        lastName: userToChangePassword.lastName,
        status: userToChangePassword.status,
        departmentId: userToChangePassword.department ? userToChangePassword.department.id : null,
        costCenterId: userToChangePassword.costCenter ? userToChangePassword.costCenter.id : null,
        operationalUnitId: userToChangePassword.operationalUnit ? userToChangePassword.operationalUnit.id : null,
        roleIds: userToChangePassword.roles ? userToChangePassword.roles.map((r) => r.id) : [],
        password: encrypt(newPassword),
      };
      await updateUser(userToChangePassword.id, userData);
      setChangePasswordModal(false);
      setUserToChangePassword(null);
      setNewPassword("");
      setConfirmNewPassword("");
      setError("");
      loadUsers();
    } catch (err) {
      setPasswordErrors({ general: err.message || "Error al cambiar la contraseña" });
    } finally {
      setChangingPassword(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    try {
      setDeleting(true);
      // En lugar de eliminar, desactivamos el usuario
      await changeUserStatus(userToDelete.id, "inactive");
      setDeleteModal(false);
      setUserToDelete(null);
      loadUsers(); // Recargar la lista
    } catch (err) {
      setError(err.message || "Error al desactivar el usuario");
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedUserId(null);
    loadUsers(); // Recargar la lista
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedUserId(null);
  };

  const getStatusBadge = (status) => {
    return status === "active" ? (
      <Badge color="success">Activo</Badge>
    ) : (
      <Badge color="secondary">Inactivo</Badge>
    );
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

  const filteredUsers = useMemo(() => {
    let filtered = users.filter((user) => {
      const matchesName =
        !filterName ||
        `${user.firstName || ""} ${user.lastName || ""}`
          .toLowerCase()
          .includes(filterName.toLowerCase()) ||
        user.username.toLowerCase().includes(filterName.toLowerCase()) ||
        user.email.toLowerCase().includes(filterName.toLowerCase());

      const matchesDepartment =
        !filterDepartmentId ||
        (user.department && String(user.department.id) === filterDepartmentId);

      return matchesName && matchesDepartment;
    });

    // Aplicar ordenamiento
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue, bValue;

        switch (sortField) {
          case "id":
            aValue = a.id || 0;
            bValue = b.id || 0;
            break;
          case "username":
            aValue = (a.username || "").toLowerCase();
            bValue = (b.username || "").toLowerCase();
            break;
          case "name":
            aValue = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
            bValue = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
            break;
          case "email":
            aValue = (a.email || "").toLowerCase();
            bValue = (b.email || "").toLowerCase();
            break;
          case "department":
            aValue = (a.department?.name || "").toLowerCase();
            bValue = (b.department?.name || "").toLowerCase();
            break;
          case "costCenter":
            aValue = (a.costCenter?.name || "").toLowerCase();
            bValue = (b.costCenter?.name || "").toLowerCase();
            break;
          case "operationalUnit":
            aValue = (a.operationalUnit?.name || "").toLowerCase();
            bValue = (b.operationalUnit?.name || "").toLowerCase();
            break;
          case "status":
            aValue = (a.status || "").toLowerCase();
            bValue = (b.status || "").toLowerCase();
            break;
          default:
            return 0;
        }

        if (aValue < bValue) {
          return sortDirection === "asc" ? -1 : 1;
        }
        if (aValue > bValue) {
          return sortDirection === "asc" ? 1 : -1;
        }
        return 0;
      });
    }

    return filtered;
  }, [users, filterName, filterDepartmentId, sortField, sortDirection]);

  const handleClearFilters = () => {
    setFilterName("");
    setFilterDepartmentId("");
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field) => {
    if (sortField !== field) {
      return <i className="nc-icon nc-minimal-up" style={{ opacity: 0.3 }} />;
    }
    return sortDirection === "asc" 
      ? <i className="nc-icon nc-minimal-up" /> 
      : <i className="nc-icon nc-minimal-down" />;
  };

  if (showForm) {
    return (
      <UsersForm
        userId={selectedUserId}
        onSuccess={handleFormSuccess}
        onCancel={handleFormCancel}
      />
    );
  }

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Gestión de Usuarios</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    onClick={handleNew}
                    className="btn-round"
                  >
                    <i className="nc-icon nc-simple-add" /> Nuevo Usuario
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="5">
                  <FormGroup>
                    <Label>Filtrar por nombre</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por nombre, usuario o email..."
                      value={filterName}
                      onChange={(e) => setFilterName(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="5">
                  <FormGroup>
                    <Label>Filtrar por departamento</Label>
                    <Input
                      type="select"
                      value={filterDepartmentId}
                      onChange={(e) => setFilterDepartmentId(e.target.value)}
                    >
                      <option value="">Todos los departamentos</option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name || dept.code}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  {(filterName || filterDepartmentId) && (
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={handleClearFilters}
                      className="btn-round"
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar
                    </Button>
                  )}
                </Col>
              </Row>

              {loading ? (
                <div className="text-center">
                  <p>Cargando usuarios...</p>
                </div>
              ) : users.length === 0 ? (
                <div className="text-center">
                  <p>No hay usuarios registrados.</p>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    Crear primer usuario
                  </Button>
                </div>
              ) : filteredUsers.length === 0 ? (
                <Alert color="info">
                  No se encontraron usuarios que coincidan con los filtros seleccionados.
                  {(filterName || filterDepartmentId) && (
                    <Button
                      color="link"
                      onClick={handleClearFilters}
                      className="p-0 ml-2"
                    >
                      Limpiar filtros
                    </Button>
                  )}
                </Alert>
              ) : (
                <>
                  <div className="mb-2">
                    <small className="text-muted">
                      Mostrando {filteredUsers.length} de {users.length} usuario(s)
                    </small>
                  </div>
                  <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("id")}
                      >
                        ID {getSortIcon("id")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("username")}
                      >
                        Usuario {getSortIcon("username")}
                      </th>
                      <th>Foto</th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("name")}
                      >
                        Nombre {getSortIcon("name")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("email")}
                      >
                        Email {getSortIcon("email")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("department")}
                      >
                        Departamento {getSortIcon("department")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("costCenter")}
                      >
                        Centro de costo {getSortIcon("costCenter")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("operationalUnit")}
                      >
                        Unidad operativa {getSortIcon("operationalUnit")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("status")}
                      >
                        Estado {getSortIcon("status")}
                      </th>
                      <th className="text-right" width="200">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr key={user.id}>
                        <td>{user.id}</td>
                        <td>{user.username}</td>
                        <td>
                          {resolveImageUrl(user.profileImageUrl) ? (
                            <img
                              src={resolveImageUrl(user.profileImageUrl)}
                              alt={`Foto ${user.username}`}
                              style={{
                                width: "40px",
                                height: "40px",
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "1px solid #d9d9d9",
                              }}
                            />
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          {user.firstName} {user.lastName}
                        </td>
                        <td>{user.email}</td>
                        <td>{user.department ? user.department.name || user.department.code : "-"}</td>
                        <td>
                          {user.costCenter
                            ? `${user.costCenter.code}${user.costCenter.name ? ` - ${user.costCenter.name}` : ""}`
                            : "-"}
                        </td>
                        <td>
                          {user.operationalUnit
                            ? `${user.operationalUnit.code}${user.operationalUnit.name ? ` - ${user.operationalUnit.name}` : ""}`
                            : "-"}
                        </td>
                        <td>{getStatusBadge(user.status)}</td>
                        <td className="text-right">
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => handleViewDetails(user.id)}
                            className="btn-round mr-1"
                            title="Ver detalles"
                          >
                            <i className="nc-icon nc-zoom-split" />
                          </Button>
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => handleEdit(user.id)}
                            className="btn-round mr-1"
                            title="Editar"
                          >
                            <i className="nc-icon nc-ruler-pencil" />
                          </Button>
                          <Button
                            color="warning"
                            size="sm"
                            onClick={() => handleChangePassword(user)}
                            className="btn-round mr-1"
                            title="Cambiar contraseña"
                          >
                            <i className="nc-icon nc-key-25" />
                          </Button>
                          {user.status === "active" ? (
                            <Button
                              color="warning"
                              size="sm"
                              onClick={() => handleDelete(user)}
                              className="btn-round"
                              title="Desactivar"
                            >
                              <i className="nc-icon nc-simple-remove" />
                            </Button>
                          ) : (
                            <Button
                              color="success"
                              size="sm"
                              onClick={() => handleActivate(user)}
                              className="btn-round"
                              title="Reactivar"
                              disabled={deleting}
                            >
                              <i className="nc-icon nc-check-2" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Modal de confirmación de eliminación */}
      <Modal isOpen={deleteModal} toggle={() => setDeleteModal(false)}>
        <ModalHeader toggle={() => setDeleteModal(false)}>
          Confirmar Desactivación
        </ModalHeader>
        <ModalBody>
          ¿Está seguro de que desea desactivar al usuario{" "}
          <strong>{userToDelete?.username}</strong>? El usuario no podrá iniciar sesión hasta que sea reactivado.
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => setDeleteModal(false)}
            disabled={deleting}
          >
            Cancelar
          </Button>
          <Button
            color="danger"
            onClick={confirmDelete}
            disabled={deleting}
          >
            {deleting ? "Desactivando..." : "Desactivar"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de detalles del usuario */}
      <Modal isOpen={viewDetailsModal} toggle={() => setViewDetailsModal(false)} size="lg">
        <ModalHeader toggle={() => setViewDetailsModal(false)}>
          Detalles del Usuario
        </ModalHeader>
        <ModalBody>
          {userToView && (
            <Row>
              <Col md="12">
                <FormGroup>
                  <Label><strong>Foto de perfil:</strong></Label>
                  {resolveImageUrl(userToView.profileImageUrl) ? (
                    <div className="d-flex justify-content-center">
                      <img
                        src={resolveImageUrl(userToView.profileImageUrl)}
                        alt={`Foto ${userToView.username}`}
                        style={{
                          width: "140px",
                          height: "140px",
                          borderRadius: "50%",
                          objectFit: "cover",
                          border: "1px solid #d9d9d9",
                        }}
                      />
                    </div>
                  ) : (
                    <p className="text-muted">Sin foto de perfil</p>
                  )}
                </FormGroup>
              </Col>
              <Col md="12">
                <hr />
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>ID:</strong></Label>
                  <p>{userToView.id}</p>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>Estado:</strong></Label>
                  <p>{getStatusBadge(userToView.status)}</p>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>Nombre de Usuario:</strong></Label>
                  <p>{userToView.username}</p>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>Email:</strong></Label>
                  <p>{userToView.email}</p>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>Nombre:</strong></Label>
                  <p>{userToView.firstName}</p>
                </FormGroup>
              </Col>
              <Col md="6">
                <FormGroup>
                  <Label><strong>Apellido:</strong></Label>
                  <p>{userToView.lastName}</p>
                </FormGroup>
              </Col>
              <Col md="12">
                <hr />
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label><strong>Departamento:</strong></Label>
                  <p>{userToView.department ? (userToView.department.name || userToView.department.code) : "-"}</p>
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label><strong>Centro de Costo:</strong></Label>
                  <p>
                    {userToView.costCenter
                      ? `${userToView.costCenter.code}${userToView.costCenter.name ? ` - ${userToView.costCenter.name}` : ""}`
                      : "-"}
                  </p>
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label><strong>Unidad Operativa:</strong></Label>
                  <p>
                    {userToView.operationalUnit
                      ? `${userToView.operationalUnit.code}${userToView.operationalUnit.name ? ` - ${userToView.operationalUnit.name}` : ""}`
                      : "-"}
                  </p>
                </FormGroup>
              </Col>
              <Col md="12">
                <hr />
              </Col>
              <Col md="12">
                <FormGroup>
                  <Label><strong>Roles Asignados:</strong></Label>
                  {userToView.roles && userToView.roles.length > 0 ? (
                    <div>
                      {userToView.roles.map((role, index) => (
                        <Badge key={role.id} color="primary" className="mr-1 mb-1">
                          {role.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-muted">No tiene roles asignados</p>
                  )}
                </FormGroup>
              </Col>
            </Row>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => setViewDetailsModal(false)}
          >
            Cerrar
          </Button>
          {userToView && (
            <>
              <Button
                color="info"
                onClick={() => {
                  setViewDetailsModal(false);
                  handleEdit(userToView.id);
                }}
              >
                <i className="nc-icon nc-ruler-pencil" /> Editar
              </Button>
              <Button
                color="warning"
                onClick={() => {
                  setViewDetailsModal(false);
                  handleChangePassword(userToView);
                }}
              >
                <i className="nc-icon nc-key-25" /> Cambiar Contraseña
              </Button>
            </>
          )}
        </ModalFooter>
      </Modal>

      {/* Modal para cambiar contraseña */}
      <Modal isOpen={changePasswordModal} toggle={() => setChangePasswordModal(false)}>
        <ModalHeader toggle={() => setChangePasswordModal(false)}>
          Cambiar Contraseña
        </ModalHeader>
        <ModalBody>
          {passwordErrors.general && <Alert color="danger">{passwordErrors.general}</Alert>}
          {userToChangePassword && (
            <div className="mb-3">
              <p>
                <strong>Usuario:</strong> {userToChangePassword.username}
              </p>
              <p>
                <strong>Email:</strong> {userToChangePassword.email}
              </p>
            </div>
          )}
          <FormGroup className={passwordErrors.password ? "has-danger" : ""}>
            <Label>Nueva Contraseña *</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (passwordErrors.password) {
                  setPasswordErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.password;
                    return newErrors;
                  });
                }
              }}
              placeholder="Ingrese la nueva contraseña"
              disabled={changingPassword}
            />
            {passwordErrors.password && (
              <label className="error">{passwordErrors.password}</label>
            )}
          </FormGroup>
          <FormGroup className={passwordErrors.confirmPassword ? "has-danger" : ""}>
            <Label>Confirmar Nueva Contraseña *</Label>
            <Input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => {
                setConfirmNewPassword(e.target.value);
                if (passwordErrors.confirmPassword) {
                  setPasswordErrors((prev) => {
                    const newErrors = { ...prev };
                    delete newErrors.confirmPassword;
                    return newErrors;
                  });
                }
              }}
              placeholder="Confirme la nueva contraseña"
              disabled={changingPassword}
            />
            {passwordErrors.confirmPassword && (
              <label className="error">{passwordErrors.confirmPassword}</label>
            )}
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button
            color="secondary"
            onClick={() => setChangePasswordModal(false)}
            disabled={changingPassword}
          >
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={handlePasswordSubmit}
            disabled={changingPassword}
          >
            {changingPassword ? "Cambiando..." : "Cambiar Contraseña"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default UsersList;



