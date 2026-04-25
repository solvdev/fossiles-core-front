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
import { createRole, updateRole, getRoleById } from "services/roleService";
import { getPermissions } from "services/permissionService";
import { 
  getLearnedSuggestions, 
  savePermissionPattern,
  getRelatedPermissions 
} from "utils/permissionLearning";

function RolesForm({ roleId, onSuccess, onCancel }) {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    permissionIds: [],
  });
  const [availablePermissions, setAvailablePermissions] = useState([]);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    loadPermissions();
    if (roleId && roleId !== 'undefined' && roleId !== 'null') {
      loadRole();
    }
  }, [roleId]);

  const loadPermissions = async () => {
    try {
      const permissions = await getPermissions();
      setAvailablePermissions(permissions);
    } catch (err) {
      console.error("Error al cargar permisos:", err);
    }
  };

  const loadRole = async () => {
    try {
      setLoading(true);
      const role = await getRoleById(roleId);
      setFormData({
        name: role.name || "",
        description: role.description || "",
        permissionIds: role.permissions ? role.permissions.map((perm) => perm.id) : [],
      });
    } catch (err) {
      setError(err.message || "Error al cargar el rol");
    } finally {
      setLoading(false);
    }
  };

  const validate = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = "El nombre del rol es requerido";
    } else if (formData.name.length < 3) {
      newErrors.name = "El nombre del rol debe tener al menos 3 caracteres";
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
      const roleData = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        permissionIds: formData.permissionIds.length > 0 ? formData.permissionIds : [],
      };

      if (roleId && roleId !== 'undefined' && roleId !== 'null') {
        await updateRole(roleId, roleData);
        setSuccess("Rol actualizado correctamente");
      } else {
        await createRole(roleData);
        setSuccess("Rol creado correctamente");
        
        // Guardar patrón para aprendizaje
        const permissionCodes = availablePermissions
          .filter(p => formData.permissionIds.includes(p.id))
          .map(p => p.code);
        savePermissionPattern(formData.name, formData.permissionIds, permissionCodes);
        
        // Limpiar formulario
        setFormData({
          name: "",
          description: "",
          permissionIds: [],
        });
      }

      if (onSuccess) {
        setTimeout(() => {
          onSuccess();
        }, 1500);
      }
    } catch (err) {
      setError(err.message || "Error al guardar el rol");
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

  // Agrupar permisos por módulo
  const permissionsByModule = useMemo(() => {
    const modules = {};
    
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
      availablePermissions.forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('PRODUCCION') || roleNameUpper.includes('PRODUCTION')) {
      availablePermissions.filter(p => 
        p.code.startsWith('DASHBOARD_PRODUCTION') ||
        p.code.startsWith('PRODUCTION') ||
        p.code.startsWith('TASK') ||
        p.code.startsWith('MATERIAL') ||
        p.code.startsWith('PRODUCT_READ') ||
        p.code.startsWith('PRODUCT_RECIPE')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('VENTA') || roleNameUpper.includes('SALES') || roleNameUpper.includes('VENDEDOR')) {
      availablePermissions.filter(p => 
        p.code.startsWith('DASHBOARD_SALES') ||
        p.code.startsWith('SALES') ||
        p.code.startsWith('KIOSK') ||
        p.code.startsWith('CUSTOMER_READ') ||
        p.code.startsWith('PRODUCT_READ')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('KIOSKO') || roleNameUpper.includes('KIOSK')) {
      availablePermissions.filter(p => 
        p.code.startsWith('KIOSK') ||
        p.code.startsWith('SALES_ONLINE')
      ).forEach(p => suggestions.add(p.id));
    } else if (roleNameUpper.includes('BODEGA') || roleNameUpper.includes('INVENTORY') || roleNameUpper.includes('ALMACEN')) {
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

    // 4. Si hay permisos ya seleccionados, sugerir relacionados
    if (formData.permissionIds.length > 0) {
      const selectedCodes = availablePermissions
        .filter(p => formData.permissionIds.includes(p.id))
        .map(p => p.code);
      const related = getRelatedPermissions(selectedCodes, availablePermissions, 3);
      related.forEach(id => suggestions.add(id));
    }

    return Array.from(suggestions);
  };

  const handlePermissionChange = (permissionId, checked) => {
    if (checked) {
      setFormData((prev) => ({
        ...prev,
        permissionIds: [...prev.permissionIds, permissionId],
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        permissionIds: prev.permissionIds.filter((id) => id !== permissionId),
      }));
    }
  };

  const handleModuleToggle = (moduleCode, selectAll) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    const modulePermissionIds = modulePermissions.map(p => p.id);

    if (selectAll) {
      setFormData((prev) => {
        const newSet = new Set([...prev.permissionIds, ...modulePermissionIds]);
        return {
          ...prev,
          permissionIds: Array.from(newSet),
        };
      });
    } else {
      setFormData((prev) => ({
        ...prev,
        permissionIds: prev.permissionIds.filter((id) => !modulePermissionIds.includes(id)),
      }));
    }
  };

  const handleApplySuggestions = () => {
    const suggested = getSuggestedPermissions(formData.name);
    setFormData(prev => ({
      ...prev,
      permissionIds: suggested,
    }));
  };

  const isModuleFullySelected = (moduleCode) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    if (modulePermissions.length === 0) return false;
    return modulePermissions.every(p => formData.permissionIds.includes(p.id));
  };

  const isModulePartiallySelected = (moduleCode) => {
    const modulePermissions = permissionsByModule[moduleCode] || [];
    if (modulePermissions.length === 0) return false;
    const selectedCount = modulePermissions.filter(p => formData.permissionIds.includes(p.id)).length;
    return selectedCount > 0 && selectedCount < modulePermissions.length;
  };

  return (
    <div className="content">
      <Row>
        <Col md="8">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">
                {roleId ? "Editar Rol" : "Nuevo Rol"}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {success && <Alert color="success">{success}</Alert>}
              <Form onSubmit={handleSubmit}>
                <Row>
                  <Col md="12">
                    <FormGroup className={errors.name ? "has-danger" : ""}>
                      <Label>Nombre del Rol *</Label>
                      <Input
                        type="text"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Ingrese el nombre del rol"
                        disabled={loading}
                        maxLength={50}
                      />
                      {errors.name && (
                        <label className="error">{errors.name}</label>
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
                        placeholder="Ingrese una descripción del rol"
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
                <Row>
                  <Col md="12">
                    <FormGroup>
                      <Row className="mb-3">
                        <Col md="8">
                          <Label>Permisos</Label>
                        </Col>
                        <Col md="4" className="text-right">
                          {formData.name && (
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
                      {availablePermissions.length === 0 ? (
                        <p className="text-muted">No hay permisos disponibles</p>
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
                                              checked={formData.permissionIds.includes(permission.id)}
                                              onChange={(e) =>
                                                handlePermissionChange(permission.id, e.target.checked)
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
                            <strong>Total seleccionados:</strong> {formData.permissionIds.length} de {availablePermissions.length} permisos
                          </Alert>
                        </div>
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
                      : roleId
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

export default RolesForm;

