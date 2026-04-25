import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Alert,
  Input,
  Label,
  FormGroup,
  Badge,
  Button,
  Spinner,
} from "reactstrap";
import { getRoles } from "services/roleService";
import { getPermissions } from "services/permissionService";
import { updateRole } from "services/roleService";
import { showSuccess, showError } from "utils/notificationHelper";

function PermissionsMatrix() {
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [searchText, setSearchText] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [expandedModules, setExpandedModules] = useState(new Set());
  const [saving, setSaving] = useState({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const [rolesData, permissionsData] = await Promise.all([
        getRoles(),
        getPermissions(),
      ]);
      setRoles(rolesData);
      setPermissions(permissionsData);
    } catch (err) {
      setError(err.message || "Error al cargar datos");
    } finally {
      setLoading(false);
    }
  };

  // Agrupar permisos por módulo
  const permissionsByModule = useMemo(() => {
    const grouped = {};
    permissions.forEach(permission => {
      const module = permission.module || "SIN_MODULO";
      if (!grouped[module]) {
        grouped[module] = [];
      }
      grouped[module].push(permission);
    });
    return grouped;
  }, [permissions]);

  // Obtener módulos únicos
  const modules = useMemo(() => {
    const moduleSet = new Set();
    permissions.forEach(p => {
      if (p.module) moduleSet.add(p.module);
    });
    return Array.from(moduleSet).sort();
  }, [permissions]);

  // Filtrar permisos por módulo y búsqueda
  const filteredPermissions = useMemo(() => {
    let filtered = permissions;
    
    if (filterModule) {
      filtered = filtered.filter(p => p.module === filterModule);
    }
    
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(p => 
        p.code.toLowerCase().includes(searchLower) ||
        (p.description && p.description.toLowerCase().includes(searchLower)) ||
        (p.module && p.module.toLowerCase().includes(searchLower)) ||
        (p.routePath && p.routePath.toLowerCase().includes(searchLower))
      );
    }
    
    return filtered;
  }, [permissions, filterModule, searchText]);

  // Agrupar permisos filtrados por módulo
  const filteredPermissionsByModule = useMemo(() => {
    const grouped = {};
    filteredPermissions.forEach(permission => {
      const module = permission.module || "SIN_MODULO";
      if (!grouped[module]) {
        grouped[module] = [];
      }
      grouped[module].push(permission);
    });
    return grouped;
  }, [filteredPermissions]);

  // Toggle módulo expandido
  const toggleModule = (module) => {
    setExpandedModules(prev => {
      const newSet = new Set(prev);
      if (newSet.has(module)) {
        newSet.delete(module);
      } else {
        newSet.add(module);
      }
      return newSet;
    });
  };

  // Seleccionar/deseleccionar todos los permisos de un módulo para un rol
  const toggleModulePermissionsForRole = async (roleId, module) => {
    const modulePermissions = filteredPermissionsByModule[module] || [];
    if (modulePermissions.length === 0) return;

    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    const currentPermissions = role.permissions || [];
    const modulePermissionCodes = modulePermissions.map(p => p.code);
    const hasAllModulePermissions = modulePermissionCodes.every(code => 
      currentPermissions.some(p => p.code === code)
    );

    const savingKey = `${roleId}-${module}`;
    setSaving(prev => ({ ...prev, [savingKey]: true }));

    try {
      let newPermissions;
      if (hasAllModulePermissions) {
        // Remover todos los permisos del módulo
        newPermissions = currentPermissions.filter(p => !modulePermissionCodes.includes(p.code));
      } else {
        // Agregar todos los permisos del módulo
        const existingCodes = new Set(currentPermissions.map(p => p.code));
        const toAdd = modulePermissions
          .filter(p => !existingCodes.has(p.code))
          .map(p => ({ id: p.id, code: p.code }));
        newPermissions = [...currentPermissions, ...toAdd];
      }

      await updateRole(roleId, {
        name: role.name,
        code: role.code,
        description: role.description,
        permissionIds: newPermissions.map(p => p.id),
      });

      setRoles(prevRoles =>
        prevRoles.map(r =>
          r.id === roleId
            ? { ...r, permissions: newPermissions }
            : r
        )
      );

      showSuccess(
        hasAllModulePermissions
          ? `Permisos del módulo ${module} removidos del rol`
          : `Permisos del módulo ${module} agregados al rol`
      );
    } catch (err) {
      showError(err.message || "Error al actualizar permisos");
    } finally {
      setSaving(prev => {
        const newSaving = { ...prev };
        delete newSaving[savingKey];
        return newSaving;
      });
    }
  };

  // Verificar si un módulo está completamente seleccionado para un rol
  const isModuleFullySelectedForRole = (roleId, module) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !role.permissions) return false;
    
    const modulePermissions = filteredPermissionsByModule[module] || [];
    if (modulePermissions.length === 0) return false;
    
    const rolePermissionCodes = new Set(role.permissions.map(p => p.code));
    return modulePermissions.every(p => rolePermissionCodes.has(p.code));
  };

  // Verificar si un rol tiene un permiso
  const roleHasPermission = (roleId, permissionCode) => {
    const role = roles.find(r => r.id === roleId);
    if (!role || !role.permissions) return false;
    return role.permissions.some(p => p.code === permissionCode);
  };

  // Toggle permiso en un rol
  const togglePermission = async (roleId, permissionCode) => {
    const role = roles.find(r => r.id === roleId);
    if (!role) return;

    const savingKey = `${roleId}-${permissionCode}`;
    setSaving(prev => ({ ...prev, [savingKey]: true }));

    try {
      const currentPermissions = role.permissions || [];
      const hasPermission = currentPermissions.some(p => p.code === permissionCode);

      let newPermissions;
      if (hasPermission) {
        // Remover permiso
        newPermissions = currentPermissions.filter(p => p.code !== permissionCode);
      } else {
        // Agregar permiso
        const permission = permissions.find(p => p.code === permissionCode);
        if (permission) {
          newPermissions = [...currentPermissions, { id: permission.id, code: permission.code }];
        } else {
          newPermissions = currentPermissions;
        }
      }

      // Actualizar rol
      await updateRole(roleId, {
        name: role.name,
        code: role.code,
        description: role.description,
        permissionIds: newPermissions.map(p => p.id),
      });

      // Actualizar estado local
      setRoles(prevRoles =>
        prevRoles.map(r =>
          r.id === roleId
            ? { ...r, permissions: newPermissions }
            : r
        )
      );

      showSuccess(
        hasPermission
          ? "Permiso removido del rol"
          : "Permiso agregado al rol"
      );
    } catch (err) {
      showError(err.message || "Error al actualizar permiso");
    } finally {
      setSaving(prev => {
        const newSaving = { ...prev };
        delete newSaving[savingKey];
        return newSaving;
      });
    }
  };

  if (loading) {
    return (
      <div className="content">
        <Row>
          <Col md="12">
            <Card>
              <CardBody className="text-center py-5">
                <Spinner color="primary" />
                <p className="mt-3">Cargando matriz de permisos...</p>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    );
  }

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="12">
                  <CardTitle tag="h4">Matriz de Permisos</CardTitle>
                  <p className="text-muted mb-3">
                    Vista de permisos por rol. Marca/desmarca para asignar permisos. Usa los filtros para encontrar permisos rápidamente.
                  </p>
                </Col>
              </Row>
              <Row>
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar Permiso</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por código, descripción, módulo o ruta..."
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por Módulo</Label>
                    <Input
                      type="select"
                      value={filterModule}
                      onChange={(e) => setFilterModule(e.target.value)}
                    >
                      <option value="">Todos los módulos</option>
                      {modules.map(module => (
                        <option key={module} value={module}>{module}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Filtrar por Rol</Label>
                    <Input
                      type="select"
                      value={selectedRoleId}
                      onChange={(e) => setSelectedRoleId(e.target.value)}
                    >
                      <option value="">Todos los roles</option>
                      {roles.map(role => (
                        <option key={role.id} value={role.id}>{role.name}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  {(searchText || filterModule || selectedRoleId) && (
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => {
                        setSearchText("");
                        setFilterModule("");
                        setSelectedRoleId("");
                      }}
                      className="btn-round"
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar
                    </Button>
                  )}
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              {roles.length === 0 || permissions.length === 0 ? (
                <Alert color="info">
                  No hay roles o permisos disponibles. Por favor, cree algunos primero.
                </Alert>
              ) : filteredPermissions.length === 0 ? (
                <Alert color="warning">
                  No se encontraron permisos que coincidan con los filtros.
                </Alert>
              ) : (
                <div>
                  {/* Vista agrupada por módulo */}
                  {Object.entries(filteredPermissionsByModule)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([module, modulePermissions]) => {
                      const isExpanded = expandedModules.has(module);
                      const displayRoles = selectedRoleId 
                        ? roles.filter(r => r.id == selectedRoleId)
                        : roles;

                      return (
                        <Card key={module} className="mb-3">
                          <CardHeader 
                            className="py-2 cursor-pointer"
                            onClick={() => toggleModule(module)}
                            style={{ cursor: "pointer" }}
                          >
                            <Row className="align-items-center">
                              <Col md="6">
                                <CardTitle tag="h6" className="mb-0">
                                  <i className={`nc-icon nc-minimal-${isExpanded ? "down" : "right"} mr-2`} />
                                  {module}
                                  <Badge color="info" className="ml-2">{modulePermissions.length}</Badge>
                                </CardTitle>
                              </Col>
                              <Col md="6" className="text-right">
                                {displayRoles.length > 0 && (
                                  <Button
                                    color="link"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      displayRoles.forEach(role => {
                                        toggleModulePermissionsForRole(role.id, module);
                                      });
                                    }}
                                    disabled={saving[`${displayRoles[0]?.id}-${module}`]}
                                  >
                                    {displayRoles.some(r => isModuleFullySelectedForRole(r.id, module))
                                      ? "Deseleccionar Todo"
                                      : "Seleccionar Todo"}
                                  </Button>
                                )}
                              </Col>
                            </Row>
                          </CardHeader>
                          {isExpanded && (
                            <CardBody className="pt-2">
                              <div style={{ overflowX: "auto" }}>
                                <Table responsive bordered size="sm">
                                  <thead>
                                    <tr>
                                      <th style={{ minWidth: "300px" }}>Permiso</th>
                                      {displayRoles.map(role => (
                                        <th key={role.id} className="text-center" style={{ minWidth: "100px" }}>
                                          <div>{role.name}</div>
                                          <small className="text-muted">{role.code}</small>
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {modulePermissions.map(permission => (
                                      <tr key={permission.id}>
                                        <td>
                                          <div>
                                            <code className="text-primary">{permission.code}</code>
                                            {permission.action && (
                                              <Badge color="secondary" className="ml-1">{permission.action}</Badge>
                                            )}
                                          </div>
                                          <small className="text-muted d-block mt-1">
                                            {permission.description || "-"}
                                          </small>
                                        </td>
                                        {displayRoles.map(role => {
                                          const hasPermission = roleHasPermission(role.id, permission.code);
                                          const savingKey = `${role.id}-${permission.code}`;
                                          const isSaving = saving[savingKey];

                                          return (
                                            <td key={role.id} className="text-center align-middle">
                                              {isSaving ? (
                                                <Spinner size="sm" color="primary" />
                                              ) : (
                                                <Input
                                                  type="checkbox"
                                                  checked={hasPermission}
                                                  onChange={() => togglePermission(role.id, permission.code)}
                                                  style={{ cursor: "pointer", transform: "scale(1.2)" }}
                                                />
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    ))}
                                  </tbody>
                                </Table>
                              </div>
                            </CardBody>
                          )}
                        </Card>
                      );
                    })}
                </div>
              )}

              <div className="mt-3">
                <small className="text-muted">
                  Mostrando {filteredPermissions.length} de {permissions.length} permisos
                  {filterModule && ` en el módulo ${filterModule}`}
                </small>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default PermissionsMatrix;

