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
  Alert,
  Badge,
  FormGroup,
  Label,
  Input,
  ListGroup,
  ListGroupItem,
} from "reactstrap";
import { getUsers, getUserById } from "services/userService";
import { getRoles, getRoleById } from "services/roleService";
import { getPermissions } from "services/permissionService";
import { showError } from "utils/notificationHelper";

function PermissionsOverview() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [viewMode, setViewMode] = useState("user"); // "user" o "role"
  const [searchTerm, setSearchTerm] = useState("");
  const [filterModule, setFilterModule] = useState("all");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, rolesData, permissionsData] = await Promise.all([
        getUsers(),
        getRoles(),
        getPermissions(),
      ]);
      setUsers(usersData || []);
      setRoles(rolesData || []);
      setPermissions(permissionsData || []);
    } catch (err) {
      setError(err.message || "Error al cargar datos");
      showError(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  // Agrupar permisos por módulo
  const permissionsByModule = useMemo(() => {
    const modules = {};
    permissions.forEach((perm) => {
      if (perm.code.startsWith("QA")) {
        return;
      }
      let moduleName = perm.code.split('_')[0];
      
      if (perm.code.startsWith('PRODUCT_CATEGORY')) {
        moduleName = 'PRODUCT_CATEGORY';
      } else if (perm.code.startsWith('COST_CENTER')) {
        moduleName = 'COST_CENTER';
      } else if (perm.code.startsWith('OPERATIONAL_UNIT')) {
        moduleName = 'OPERATIONAL_UNIT';
      } else if (perm.code.startsWith('DAILY_PRODUCTION')) {
        moduleName = 'DAILY';
      } else if (perm.code.startsWith('PRODUCT_') && !perm.code.startsWith('PRODUCT_CATEGORY')) {
        moduleName = 'PRODUCT';
      }
      
      if (!modules[moduleName]) {
        modules[moduleName] = [];
      }
      modules[moduleName].push(perm);
    });
    return modules;
  }, [permissions]);

  // Obtener nombre amigable del módulo
  const getModuleName = (moduleCode) => {
    const moduleNames = {
      'DASHBOARD': 'Dashboards',
      'USER': 'Usuarios',
      'ROLE': 'Roles',
      'PERMISSION': 'Permisos',
      'DEPARTMENT': 'Departamentos',
      'COST_CENTER': 'Centros de Costo',
      'OPERATIONAL_UNIT': 'Unidades Operativas',
      'UOM': 'Unidades de Medida',
      'PRODUCT': 'Productos',
      'PRODUCT_CATEGORY': 'Categorías de Producto',
      'COLOR': 'Colores',
      'LOCATION': 'Ubicaciones',
      'CURRENCY': 'Monedas',
      'SUPPLIER': 'Proveedores',
      'CUSTOMER': 'Clientes',
      'MATERIAL': 'Materiales',
      'BOM': 'BOM (Recetas)',
      'PRODUCTION': 'Producción',
      'DAILY': 'Plan Diario',
      'TASK': 'Tareas',
      'INVENTORY': 'Inventarios',
      'CRITICAL': 'Inventario Crítico',
      'SHIPMENT': 'Distribución',
      'KIOSK': 'Kioscos',
      'SALES': 'Ventas',
      'REPORT': 'Reportes',
      'CONFIG': 'Configuración',
      'ADMIN': 'Administración',
      'AUDIT': 'Auditoría',
      'SYSTEM': 'Sistema',
    };
    return moduleNames[moduleCode] || moduleCode;
  };

  // Obtener permisos de un usuario (a través de sus roles)
  const getUserPermissions = async (userId) => {
    try {
      const user = await getUserById(userId);
      const userRoleIds = user.roles ? user.roles.map(r => r.id) : [];
      const allUserPermissions = new Set();
      
      for (const roleId of userRoleIds) {
        const role = await getRoleById(roleId);
        if (role.permissions) {
          role.permissions.forEach(perm => allUserPermissions.add(perm.id));
        }
      }
      
      return Array.from(allUserPermissions);
    } catch (err) {
      console.error('Error al obtener permisos del usuario:', err);
      return [];
    }
  };

  // Obtener permisos de un rol
  const getRolePermissions = (roleId) => {
    const role = roles.find(r => r.id === roleId);
    return role && role.permissions ? role.permissions.map(p => p.id) : [];
  };

  // Filtrar módulos según el filtro
  const filteredModules = useMemo(() => {
    if (filterModule === "all") {
      return Object.keys(permissionsByModule).sort();
    }
    return [filterModule];
  }, [filterModule, permissionsByModule]);

  // Estado para almacenar permisos del usuario/rol seleccionado
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(false);

  useEffect(() => {
    if (viewMode === "user" && selectedUserId) {
      loadUserPermissions();
    } else if (viewMode === "role" && selectedRoleId) {
      setSelectedPermissions(getRolePermissions(selectedRoleId));
    } else {
      setSelectedPermissions([]);
    }
  }, [selectedUserId, selectedRoleId, viewMode, roles]);

  const loadUserPermissions = async () => {
    if (!selectedUserId) return;
    try {
      setLoadingPermissions(true);
      const userPerms = await getUserPermissions(selectedUserId);
      setSelectedPermissions(userPerms);
    } catch (err) {
      console.error('Error al cargar permisos:', err);
    } finally {
      setLoadingPermissions(false);
    }
  };

  const selectedUser = users.find(u => u.id === selectedUserId);
  const selectedRole = roles.find(r => r.id === selectedRoleId);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Vista General de Permisos</CardTitle>
                  <p className="text-muted small mb-0">
                    Visualiza los permisos de usuarios y roles de forma clara y organizada
                  </p>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Modo de Vista</Label>
                    <Input
                      type="select"
                      value={viewMode}
                      onChange={(e) => {
                        setViewMode(e.target.value);
                        setSelectedUserId(null);
                        setSelectedRoleId(null);
                        setSelectedPermissions([]);
                      }}
                    >
                      <option value="user">Por Usuario</option>
                      <option value="role">Por Rol</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar Módulo</Label>
                    <Input
                      type="select"
                      value={filterModule}
                      onChange={(e) => setFilterModule(e.target.value)}
                    >
                      <option value="all">Todos los Módulos</option>
                      {Object.keys(permissionsByModule).sort().map(module => (
                        <option key={module} value={module}>
                          {getModuleName(module)}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {loading ? (
                <div className="text-center"><p>Cargando datos...</p></div>
              ) : (
                <Row>
                  {/* Panel de Selección */}
                  <Col md="4">
                    <Card>
                      <CardHeader>
                        <CardTitle tag="h5">
                          {viewMode === "user" ? "Seleccionar Usuario" : "Seleccionar Rol"}
                        </CardTitle>
                      </CardHeader>
                      <CardBody>
                        <FormGroup>
                          <Input
                            type="search"
                            placeholder={`Buscar ${viewMode === "user" ? "usuario" : "rol"}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="mb-3"
                          />
                        </FormGroup>
                        <ListGroup style={{ maxHeight: "500px", overflowY: "auto" }}>
                          {viewMode === "user" ? (
                            users
                              .filter(user => 
                                !searchTerm || 
                                user.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (user.email && user.email.toLowerCase().includes(searchTerm.toLowerCase()))
                              )
                              .map((user) => (
                                <ListGroupItem
                                  key={user.id}
                                  tag="button"
                                  action
                                  active={selectedUserId === user.id}
                                  onClick={() => setSelectedUserId(user.id)}
                                  style={{ cursor: "pointer" }}
                                >
                                  <div>
                                    <strong>{user.username}</strong>
                                    {user.email && (
                                      <div className="text-muted small">{user.email}</div>
                                    )}
                                    {user.roles && user.roles.length > 0 && (
                                      <div className="mt-1">
                                        {user.roles.map((role, idx) => (
                                          <Badge key={idx} color="info" className="mr-1">
                                            {role.name}
                                          </Badge>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </ListGroupItem>
                              ))
                          ) : (
                            roles
                              .filter(role =>
                                !searchTerm ||
                                role.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                (role.description && role.description.toLowerCase().includes(searchTerm.toLowerCase()))
                              )
                              .map((role) => (
                                <ListGroupItem
                                  key={role.id}
                                  tag="button"
                                  action
                                  active={selectedRoleId === role.id}
                                  onClick={() => setSelectedRoleId(role.id)}
                                  style={{ cursor: "pointer" }}
                                >
                                  <div>
                                    <strong>{role.name}</strong>
                                    {role.description && (
                                      <div className="text-muted small">{role.description}</div>
                                    )}
                                    {role.permissions && (
                                      <div className="mt-1">
                                        <Badge color="success">
                                          {role.permissions.length} permisos
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                </ListGroupItem>
                              ))
                          )}
                        </ListGroup>
                      </CardBody>
                    </Card>
                  </Col>

                  {/* Panel de Permisos */}
                  <Col md="8">
                    <Card>
                      <CardHeader>
                        <CardTitle tag="h5">
                          {viewMode === "user" && selectedUser
                            ? `Permisos de: ${selectedUser.username}`
                            : viewMode === "role" && selectedRole
                            ? `Permisos del Rol: ${selectedRole.name}`
                            : "Seleccione un " + (viewMode === "user" ? "usuario" : "rol")}
                        </CardTitle>
                      </CardHeader>
                      <CardBody>
                        {loadingPermissions ? (
                          <div className="text-center"><p>Cargando permisos...</p></div>
                        ) : !selectedUserId && !selectedRoleId ? (
                          <Alert color="info">
                            Por favor, seleccione un {viewMode === "user" ? "usuario" : "rol"} de la lista para ver sus permisos.
                          </Alert>
                        ) : selectedPermissions.length === 0 ? (
                          <Alert color="warning">
                            {viewMode === "user" 
                              ? "Este usuario no tiene permisos asignados a través de sus roles."
                              : "Este rol no tiene permisos asignados."}
                          </Alert>
                        ) : (
                          <div>
                            {/* Resumen */}
                            <Alert color="info" className="mb-3">
                              <strong>Total de permisos:</strong> {selectedPermissions.length} de {permissions.length}
                              {viewMode === "user" && selectedUser && selectedUser.roles && (
                                <div className="mt-2">
                                  <strong>Roles asignados:</strong>{" "}
                                  {selectedUser.roles.map((role, idx) => (
                                    <Badge key={idx} color="info" className="mr-1">
                                      {role.name}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                            </Alert>

                            {/* Permisos por Módulo */}
                            {filteredModules.map((moduleCode) => {
                              const modulePermissions = permissionsByModule[moduleCode] || [];
                              const selectedModulePermissions = modulePermissions.filter(p => 
                                selectedPermissions.includes(p.id)
                              );
                              
                              if (selectedModulePermissions.length === 0 && filterModule !== "all") {
                                return null;
                              }

                              return (
                                <Card key={moduleCode} className="mb-3">
                                  <CardHeader className="py-2">
                                    <Row className="align-items-center">
                                      <Col md="8">
                                        <CardTitle tag="h6" className="mb-0">
                                          {getModuleName(moduleCode)}
                                          <Badge color="info" className="ml-2">
                                            {selectedModulePermissions.length} / {modulePermissions.length}
                                          </Badge>
                                        </CardTitle>
                                      </Col>
                                      <Col md="4" className="text-right">
                                        {selectedModulePermissions.length === modulePermissions.length ? (
                                          <Badge color="success">Completo</Badge>
                                        ) : selectedModulePermissions.length > 0 ? (
                                          <Badge color="warning">Parcial</Badge>
                                        ) : (
                                          <Badge color="secondary">Sin permisos</Badge>
                                        )}
                                      </Col>
                                    </Row>
                                  </CardHeader>
                                  <CardBody className="pt-2">
                                    {selectedModulePermissions.length === 0 ? (
                                      <p className="text-muted small mb-0">
                                        No tiene permisos en este módulo
                                      </p>
                                    ) : (
                                      <Row>
                                        {selectedModulePermissions.map((permission) => (
                                          <Col md="6" key={permission.id} className="mb-2">
                                            <div className="d-flex align-items-center">
                                              <i className="fa fa-check-circle text-success mr-2" />
                                              <div>
                                                <strong className="text-sm">{permission.code}</strong>
                                                {permission.description && (
                                                  <div className="text-muted small">
                                                    {permission.description}
                                                  </div>
                                                )}
                                              </div>
                                            </div>
                                          </Col>
                                        ))}
                                      </Row>
                                    )}
                                  </CardBody>
                                </Card>
                              );
                            })}
                          </div>
                        )}
                      </CardBody>
                    </Card>
                  </Col>
                </Row>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default PermissionsOverview;

