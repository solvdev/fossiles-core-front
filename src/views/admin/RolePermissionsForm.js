import React, { useState, useEffect, useMemo } from "react";
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
  Badge,
} from "reactstrap";
import { getRoleById, updateRole, getRoles } from "services/roleService";
import { getPermissions } from "services/permissionService";
import { 
  getLearnedSuggestions, 
  savePermissionPattern, 
  analyzeExistingRoles,
  getRelatedPermissions 
} from "utils/permissionLearning";

function RolePermissionsForm({ roleId: propRoleId, onSuccess, onCancel }) {
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [availableRoles, setAvailableRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(propRoleId || null);
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPermissions();
    loadRoles();
    if (propRoleId && propRoleId !== 'undefined' && propRoleId !== 'null') {
      setSelectedRoleId(propRoleId);
      loadRoleData(propRoleId);
    }
    // Analizar roles existentes para aprendizaje (solo una vez al cargar)
    analyzeExistingRoles(getRoles, getRoleById).catch(console.error);
  }, [propRoleId]);

  useEffect(() => {
    if (selectedRoleId && selectedRoleId !== 'undefined' && selectedRoleId !== 'null') {
      loadRoleData(selectedRoleId);
    } else {
      setSelectedPermissions([]);
    }
  }, [selectedRoleId]);

  const loadPermissions = async () => {
    try {
      const permissions = await getPermissions();
      console.log('Permisos cargados:', permissions);
      setAvailablePermissions(permissions || []);
    } catch (err) {
      console.error('Error al cargar permisos:', err);
      setError(err.message || "Error al cargar los permisos disponibles");
    }
  };

  const loadRoles = async () => {
    try {
      const roles = await getRoles();
      setAvailableRoles(roles || []);
    } catch (err) {
      console.error('Error al cargar roles:', err);
      setError(err.message || "Error al cargar los roles");
    }
  };

  const loadRoleData = async (roleId) => {
    try {
      setLoading(true);
      const role = await getRoleById(roleId);
      console.log('Rol cargado:', role);
      // Establecer los permisos seleccionados del rol
      // Los permisos vienen en role.permissions como un array de objetos PermissionResponse
      const rolePermissionIds = role.permissions ? role.permissions.map((perm) => perm.id) : [];
      setSelectedPermissions(rolePermissionIds);
    } catch (err) {
      console.error('Error al cargar rol:', err);
      setError(err.message || "Error al cargar los datos del rol");
    } finally {
      setLoading(false);
    }
  };

  // Agrupar permisos por módulo
  const permissionsByModule = useMemo(() => {
    const modules = {};
    const moduleMapping = {
      'PRODUCT_CATEGORY': 'PRODUCT_CATEGORY',
      'COST_CENTER': 'COST_CENTER',
      'OPERATIONAL_UNIT': 'OPERATIONAL_UNIT',
      'DAILY_PRODUCTION': 'DAILY',
    };
    
    availablePermissions.forEach((perm) => {
      if (perm.code.startsWith("QA")) {
        return;
      }
      let moduleName = perm.code.split('_')[0];
      
      // Manejar módulos especiales con múltiples partes
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
  }, [availablePermissions]);

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

  // Sugerir permisos basados en el nombre del rol (con aprendizaje)
  const getSuggestedPermissions = (roleName) => {
    if (!roleName) return [];
    const roleNameUpper = roleName.toUpperCase();
    const suggestions = new Set();

    // 1. PRIMERO: Intentar usar aprendizaje (patrones guardados)
    const learned = getLearnedSuggestions(roleName, availablePermissions);
    learned.forEach(id => suggestions.add(id));

    // 2. SEGUNDO: Reglas básicas por tipo de rol
    if (roleNameUpper.includes('ADMIN') || roleNameUpper.includes('ADMINISTRADOR')) {
      // Admin: todos los permisos
      availablePermissions.forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('PRODUCCION') || roleNameUpper.includes('PRODUCTION')) {
      // Producción
      availablePermissions.filter(p => 
        p.code.startsWith('DASHBOARD_PRODUCTION') ||
        p.code.startsWith('PRODUCTION') ||
        p.code.startsWith('TASK') ||
        p.code.startsWith('MATERIAL') ||
        p.code.startsWith('PRODUCT_READ') ||
        p.code.startsWith('PRODUCT_RECIPE')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('VENTA') || roleNameUpper.includes('SALES') || roleNameUpper.includes('VENDEDOR')) {
      // Ventas
      availablePermissions.filter(p => 
        p.code.startsWith('DASHBOARD_SALES') ||
        p.code.startsWith('SALES') ||
        p.code.startsWith('KIOSK') ||
        p.code.startsWith('CUSTOMER_READ') ||
        p.code.startsWith('PRODUCT_READ')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('KIOSKO') || roleNameUpper.includes('KIOSK')) {
      // Kiosco
      availablePermissions.filter(p => 
        p.code.startsWith('KIOSK') ||
        p.code.startsWith('SALES_ONLINE')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('BODEGA') || roleNameUpper.includes('INVENTORY') || roleNameUpper.includes('ALMACEN')) {
      // Bodega/Inventario
      availablePermissions.filter(p => 
        p.code.startsWith('INVENTORY') ||
        p.code.startsWith('MATERIAL_INVENTORY') ||
        p.code.startsWith('SHIPMENT') ||
        p.code.startsWith('PRODUCT_READ')
      ).forEach(p => suggestions.add(p.id));
    }

    // 3. SIEMPRE: Agregar órdenes de producción a todos los roles
    availablePermissions
      .filter(p => p.code.startsWith('PRODUCTION_ORDER'))
      .forEach(p => suggestions.add(p.id));

    // 4. Si hay permisos ya seleccionados, sugerir relacionados por co-ocurrencia
    if (selectedPermissions.length > 0) {
      const selectedCodes = availablePermissions
        .filter(p => selectedPermissions.includes(p.id))
        .map(p => p.code);
      const related = getRelatedPermissions(selectedCodes, availablePermissions, 3);
      related.forEach(id => suggestions.add(id));
    }

    return Array.from(suggestions);
  };

  const handlePermissionChange = (permissionId, checked) => {
    if (checked) {
      setSelectedPermissions((prev) => [...prev, permissionId]);
    } else {
      setSelectedPermissions((prev) =>
        prev.filter((id) => id !== permissionId)
      );
    }
  };

  const handleModuleToggle = (moduleCode, selectAll) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    const modulePermissionIds = modulePermissions.map(p => p.id);

    if (selectAll) {
      // Agregar todos los permisos del módulo
      setSelectedPermissions((prev) => {
        const newSet = new Set([...prev, ...modulePermissionIds]);
        return Array.from(newSet);
      });
    } else {
      // Remover todos los permisos del módulo
      setSelectedPermissions((prev) =>
        prev.filter((id) => !modulePermissionIds.includes(id))
      );
    }
  };

  const handleApplySuggestions = () => {
    if (!selectedRoleId) return;
    const role = availableRoles.find(r => r.id == selectedRoleId);
    if (role) {
      const suggested = getSuggestedPermissions(role.name);
      setSelectedPermissions(suggested);
    }
  };

  const isModuleFullySelected = (moduleCode) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    if (modulePermissions.length === 0) return false;
    return modulePermissions.every(p => selectedPermissions.includes(p.id));
  };

  const isModulePartiallySelected = (moduleCode) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    if (modulePermissions.length === 0) return false;
    const selectedCount = modulePermissions.filter(p => selectedPermissions.includes(p.id)).length;
    return selectedCount > 0 && selectedCount < modulePermissions.length;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedRoleId || selectedRoleId === 'undefined' || selectedRoleId === 'null') {
      setError("Por favor, seleccione un rol");
      return;
    }

    try {
      setLoading(true);
      // Obtener los datos actuales del rol
      const roleData = await getRoleById(selectedRoleId);
      // Actualizar el rol con los nuevos permisos
      await updateRole(selectedRoleId, {
        name: roleData.name,
        description: roleData.description,
        permissionIds: selectedPermissions.length > 0 ? selectedPermissions : []
      });
      setSuccess("Permisos asignados correctamente");

      // Guardar patrón para aprendizaje
      const selectedRole = availableRoles.find(r => r.id == selectedRoleId);
      if (selectedRole) {
        const permissionCodes = availablePermissions
          .filter(p => selectedPermissions.includes(p.id))
          .map(p => p.code);
        savePermissionPattern(selectedRole.name, selectedPermissions, permissionCodes);
      }

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al asignar permisos");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="content">
      <Row>
        <Col md="10">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Asignar Permisos al Rol</CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={handleSubmit}>
                <FormGroup>
                  <Label>Seleccione el rol:</Label>
                  <Input
                    type="select"
                    value={selectedRoleId || ''}
                    onChange={(e) => setSelectedRoleId(e.target.value)}
                    disabled={loading || !!propRoleId}
                  >
                    <option value="">-- Seleccione un rol --</option>
                    {availableRoles.map((role) => (
                      <option key={role.id} value={role.id}>
                        {role.name} {role.description ? `- ${role.description}` : ''}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
                <FormGroup>
                  <Row className="mb-3">
                    <Col md="8">
                      <Label>Seleccione los permisos para este rol:</Label>
                    </Col>
                    <Col md="4" className="text-right">
                      {selectedRoleId && availableRoles.find(r => r.id == selectedRoleId) && (
                        <Button
                          type="button"
                          color="info"
                          size="sm"
                          onClick={handleApplySuggestions}
                          className="btn-round"
                          title="Aplicar permisos sugeridos según el nombre del rol"
                        >
                          <i className="fa fa-lightbulb-o" /> Aplicar Sugerencias
                        </Button>
                      )}
                    </Col>
                  </Row>
                  {!selectedRoleId || selectedRoleId === 'undefined' || selectedRoleId === 'null' ? (
                    <Alert color="info">
                      Por favor, seleccione un rol primero para ver los permisos disponibles.
                    </Alert>
                  ) : loading && availablePermissions.length === 0 ? (
                    <p>Cargando permisos...</p>
                  ) : availablePermissions.length === 0 ? (
                    <Alert color="warning">
                      No hay permisos disponibles. Cree permisos primero desde la sección de Permisos.
                    </Alert>
                  ) : (
                    <div>
                      {Object.keys(permissionsByModule).sort().map((moduleCode) => {
                        const modulePermissions = permissionsByModule[moduleCode];
                        const fullySelected = isModuleFullySelected(moduleCode);
                        const partiallySelected = isModulePartiallySelected(moduleCode);
                        
                        return (
                          <Card key={moduleCode} className="mb-3">
                            <CardHeader className="py-2">
                              <Row className="align-items-center">
                                <Col md="6">
                                  <CardTitle tag="h6" className="mb-0">
                                    {getModuleName(moduleCode)}
                                    <Badge color="info" className="ml-2">
                                      {modulePermissions.length}
                                    </Badge>
                                    {partiallySelected && (
                                      <Badge color="warning" className="ml-1">
                                        Parcial
                                      </Badge>
                                    )}
                                  </CardTitle>
                                </Col>
                                <Col md="6" className="text-right">
                                  <Button
                                    type="button"
                                    color={fullySelected ? "secondary" : "primary"}
                                    size="sm"
                                    onClick={() => handleModuleToggle(moduleCode, !fullySelected)}
                                    className="btn-round"
                                  >
                                    {fullySelected ? (
                                      <>
                                        <i className="fa fa-check-square" /> Deseleccionar Todos
                                      </>
                                    ) : (
                                      <>
                                        <i className="fa fa-square" /> Seleccionar Todos
                                      </>
                                    )}
                                  </Button>
                                </Col>
                              </Row>
                            </CardHeader>
                            <CardBody className="pt-2">
                              <Row>
                                {modulePermissions.map((permission) => (
                                  <Col md="6" key={permission.id} className="mb-2">
                                    <FormGroup check>
                                      <Label check>
                                        <Input
                                          type="checkbox"
                                          checked={selectedPermissions.includes(
                                            permission.id
                                          )}
                                          onChange={(e) =>
                                            handlePermissionChange(
                                              permission.id,
                                              e.target.checked
                                            )
                                          }
                                          disabled={loading}
                                        />
                                        <span className="form-check-sign" />
                                        <strong className="text-sm">{permission.code}</strong>
                                        {permission.description && (
                                          <div className="text-muted small ml-4">
                                            {permission.description}
                                          </div>
                                        )}
                                      </Label>
                                    </FormGroup>
                                  </Col>
                                ))}
                              </Row>
                            </CardBody>
                          </Card>
                        );
                      })}
                      <Alert color="info" className="mt-3">
                        <strong>Total seleccionados:</strong> {selectedPermissions.length} de {availablePermissions.length} permisos
                      </Alert>
                    </div>
                  )}
                </FormGroup>
                <CardFooter>
                  <Button
                    type="submit"
                    color="primary"
                    disabled={loading}
                    className="btn-round"
                  >
                    {loading ? "Guardando..." : "Guardar Permisos"}
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

export default RolePermissionsForm;

