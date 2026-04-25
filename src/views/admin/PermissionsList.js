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
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Input,
  Label,
  FormGroup,
  Badge,
} from "reactstrap";
import { getPermissions, deletePermission } from "services/permissionService";
import { syncPermissions, getSyncReport } from "services/permissionSyncService";
import { extractPermissionsFromRoutes } from "utils/routePermissionsExtractor";
import routes from "routes.js";
import PermissionsForm from "./PermissionsForm";
import { showSuccess, showError } from "utils/notificationHelper";

function PermissionsList() {
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedPermissionId, setSelectedPermissionId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [permissionToDelete, setPermissionToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterModule, setFilterModule] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncReport, setSyncReport] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [viewMode, setViewMode] = useState("table"); // "table" or "grouped"

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getPermissions();
      setPermissions(data);
    } catch (err) {
      setError(err.message || "Error al cargar los permisos");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedPermissionId(null);
    setShowForm(true);
  };

  const handleEdit = (permissionId) => {
    setSelectedPermissionId(permissionId);
    setShowForm(true);
  };

  const handleDelete = (permission) => {
    setPermissionToDelete(permission);
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!permissionToDelete) return;

    try {
      setDeleting(true);
      await deletePermission(permissionToDelete.id);
      setDeleteModal(false);
      setPermissionToDelete(null);
      loadPermissions(); // Recargar la lista
    } catch (err) {
      setError(err.message || "Error al eliminar el permiso");
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedPermissionId(null);
    loadPermissions(); // Recargar la lista
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedPermissionId(null);
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      const routePermissions = extractPermissionsFromRoutes(routes);
      const result = await syncPermissions(routePermissions);
      setSyncReport(result);
      setShowSyncModal(true);
      showSuccess(result.message || "Sincronización completada");
      loadPermissions(); // Recargar permisos
    } catch (err) {
      showError(err.message || "Error al sincronizar permisos");
    } finally {
      setSyncing(false);
    }
  };

  const handleGetSyncReport = async () => {
    try {
      setSyncing(true);
      const routePermissions = extractPermissionsFromRoutes(routes);
      const result = await getSyncReport(routePermissions);
      setSyncReport(result);
      setShowSyncModal(true);
    } catch (err) {
      showError(err.message || "Error al obtener reporte de sincronización");
    } finally {
      setSyncing(false);
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

  // Obtener lista de módulos únicos
  const modules = useMemo(() => {
    const moduleSet = new Set();
    permissions.forEach(p => {
      if (p.module) moduleSet.add(p.module);
    });
    return Array.from(moduleSet).sort();
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    let filtered = permissions.filter((permission) => {
      const searchLower = filterSearch.toLowerCase();
      const matchesSearch = !filterSearch ||
        (permission.code && permission.code.toLowerCase().includes(searchLower)) ||
        (permission.description && permission.description.toLowerCase().includes(searchLower)) ||
        (permission.module && permission.module.toLowerCase().includes(searchLower)) ||
        (permission.routePath && permission.routePath.toLowerCase().includes(searchLower));
      
      const matchesModule = !filterModule || permission.module === filterModule;
      
      return matchesSearch && matchesModule;
    });

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue, bValue;
        switch (sortField) {
          case "id":
            aValue = a.id || 0;
            bValue = b.id || 0;
            break;
          case "code":
            aValue = (a.code || "").toLowerCase();
            bValue = (b.code || "").toLowerCase();
            break;
          case "description":
            aValue = (a.description || "").toLowerCase();
            bValue = (b.description || "").toLowerCase();
            break;
          default:
            return 0;
        }
        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [permissions, filterSearch, sortField, sortDirection]);

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
      <PermissionsForm
        permissionId={selectedPermissionId}
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
                  <CardTitle tag="h4">Gestión de Permisos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="info"
                    onClick={handleGetSyncReport}
                    className="btn-round mr-2"
                    disabled={syncing}
                  >
                    <i className="nc-icon nc-refresh-69" /> Ver Reporte
                  </Button>
                  <Button
                    color="success"
                    onClick={handleSync}
                    className="btn-round mr-2"
                    disabled={syncing}
                  >
                    <i className="nc-icon nc-refresh-69" /> 
                    {syncing ? "Sincronizando..." : "Sincronizar desde Rutas"}
                  </Button>
                  <Button
                    color="primary"
                    onClick={handleNew}
                    className="btn-round"
                  >
                    <i className="nc-icon nc-simple-add" /> Nuevo Permiso
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por código, descripción, módulo o ruta..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
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
                    <Label>Vista</Label>
                    <Input
                      type="select"
                      value={viewMode}
                      onChange={(e) => setViewMode(e.target.value)}
                    >
                      <option value="table">Tabla</option>
                      <option value="grouped">Agrupado por Módulo</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  {(filterSearch || filterModule) && (
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => {
                        setFilterSearch("");
                        setFilterModule("");
                      }}
                      className="btn-round"
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar
                    </Button>
                  )}
                </Col>
              </Row>

              {loading ? (
                <div className="text-center">
                  <p>Cargando permisos...</p>
                </div>
              ) : permissions.length === 0 ? (
                <div className="text-center">
                  <p>No hay permisos registrados.</p>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    Crear primer permiso
                  </Button>
                </div>
              ) : filteredPermissions.length === 0 ? (
                <Alert color="info">
                  No se encontraron permisos que coincidan con la búsqueda.
                  {filterSearch && (
                    <Button
                      color="link"
                      onClick={() => setFilterSearch("")}
                      className="p-0 ml-2"
                    >
                      Limpiar filtro
                    </Button>
                  )}
                </Alert>
              ) : (
                <>
                  <div className="mb-2">
                    <small className="text-muted">
                      Mostrando {filteredPermissions.length} de {permissions.length} permiso(s)
                    </small>
                  </div>
                  
                  {viewMode === "grouped" ? (
                    // Vista agrupada por módulo
                    Object.entries(permissionsByModule)
                      .filter(([module]) => !filterModule || module === filterModule)
                      .map(([module, modulePermissions]) => {
                        const filtered = modulePermissions.filter(p => {
                          const searchLower = filterSearch.toLowerCase();
                          return !filterSearch ||
                            (p.code && p.code.toLowerCase().includes(searchLower)) ||
                            (p.description && p.description.toLowerCase().includes(searchLower)) ||
                            (p.routePath && p.routePath.toLowerCase().includes(searchLower));
                        });
                        
                        if (filtered.length === 0) return null;
                        
                        return (
                          <Card key={module} className="mb-3">
                            <CardHeader>
                              <CardTitle tag="h5">
                                {module} <Badge color="info">{filtered.length}</Badge>
                              </CardTitle>
                            </CardHeader>
                            <CardBody>
                              <Table responsive size="sm">
                                <thead>
                                  <tr>
                                    <th>Código</th>
                                    <th>Descripción</th>
                                    <th>Ruta</th>
                                    <th>Acción</th>
                                    <th className="text-right">Acciones</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {filtered.map((permission) => (
                                    <tr key={permission.id}>
                                      <td><code>{permission.code}</code></td>
                                      <td>{permission.description || "-"}</td>
                                      <td><small className="text-muted">{permission.routePath || "-"}</small></td>
                                      <td><Badge color="secondary">{permission.action || "-"}</Badge></td>
                                      <td className="text-right">
                                        <Button
                                          color="info"
                                          size="sm"
                                          onClick={() => handleEdit(permission.id)}
                                          className="btn-round mr-1"
                                        >
                                          <i className="nc-icon nc-ruler-pencil" />
                                        </Button>
                                        <Button
                                          color="danger"
                                          size="sm"
                                          onClick={() => handleDelete(permission)}
                                          className="btn-round"
                                        >
                                          <i className="nc-icon nc-simple-remove" />
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </Table>
                            </CardBody>
                          </Card>
                        );
                      })
                  ) : (
                    // Vista de tabla
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
                            onClick={() => handleSort("code")}
                          >
                            Código {getSortIcon("code")}
                          </th>
                          <th>Módulo</th>
                          <th>Ruta</th>
                          <th>Acción</th>
                          <th 
                            style={{ cursor: "pointer", userSelect: "none" }}
                            onClick={() => handleSort("description")}
                          >
                            Descripción {getSortIcon("description")}
                          </th>
                          <th className="text-right">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredPermissions.map((permission) => (
                          <tr key={permission.id}>
                            <td>{permission.id}</td>
                            <td>
                              <code>{permission.code}</code>
                            </td>
                            <td>
                              {permission.module ? (
                                <Badge color="info">{permission.module}</Badge>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td>
                              <small className="text-muted">{permission.routePath || "-"}</small>
                            </td>
                            <td>
                              {permission.action ? (
                                <Badge color="secondary">{permission.action}</Badge>
                              ) : (
                                <span className="text-muted">-</span>
                              )}
                            </td>
                            <td>{permission.description || "-"}</td>
                            <td className="text-right">
                              <Button
                                color="info"
                                size="sm"
                                onClick={() => handleEdit(permission.id)}
                                className="btn-round mr-1"
                              >
                                <i className="nc-icon nc-ruler-pencil" /> Editar
                              </Button>
                              <Button
                                color="danger"
                                size="sm"
                                onClick={() => handleDelete(permission)}
                                className="btn-round"
                              >
                                <i className="nc-icon nc-simple-remove" /> Eliminar
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      {/* Modal de reporte de sincronización */}
      <Modal isOpen={showSyncModal} toggle={() => setShowSyncModal(false)} size="lg">
        <ModalHeader toggle={() => setShowSyncModal(false)}>
          Reporte de Sincronización de Permisos
        </ModalHeader>
        <ModalBody>
          {syncReport && (
            <div>
              <Alert color="success">
                <strong>{syncReport.message}</strong>
              </Alert>
              <Row className="mb-3">
                <Col md="4">
                  <Card className="text-center">
                    <CardBody>
                      <h3 className="text-primary">{syncReport.totalInRoutes}</h3>
                      <small>En Rutas</small>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="4">
                  <Card className="text-center">
                    <CardBody>
                      <h3 className="text-success">{syncReport.created}</h3>
                      <small>Creados</small>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="4">
                  <Card className="text-center">
                    <CardBody>
                      <h3 className="text-info">{syncReport.updated}</h3>
                      <small>Actualizados</small>
                    </CardBody>
                  </Card>
                </Col>
              </Row>
              
              {syncReport.missing && syncReport.missing.length > 0 && (
                <Alert color="warning">
                  <strong>Permisos faltantes ({syncReport.missing.length}):</strong>
                  <ul className="mb-0 mt-2">
                    {syncReport.missing.map((perm, idx) => (
                      <li key={idx}><code>{perm.code}</code> - {perm.description}</li>
                    ))}
                  </ul>
                </Alert>
              )}
              
              {syncReport.orphaned && syncReport.orphaned.length > 0 && (
                <Alert color="info">
                  <strong>Permisos huérfanos ({syncReport.orphaned.length}):</strong>
                  <small className="d-block mt-2">Estos permisos existen en BD pero no están en las rutas</small>
                  <ul className="mb-0 mt-2">
                    {syncReport.orphaned.slice(0, 10).map((perm, idx) => (
                      <li key={idx}><code>{perm.code}</code> - {perm.description}</li>
                    ))}
                    {syncReport.orphaned.length > 10 && (
                      <li><em>... y {syncReport.orphaned.length - 10} más</em></li>
                    )}
                  </ul>
                </Alert>
              )}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowSyncModal(false)}>
            Cerrar
          </Button>
        </ModalFooter>
      </Modal>

      {/* Modal de confirmación de eliminación */}
      <Modal isOpen={deleteModal} toggle={() => setDeleteModal(false)}>
        <ModalHeader toggle={() => setDeleteModal(false)}>
          Confirmar Eliminación
        </ModalHeader>
        <ModalBody>
          ¿Está seguro de que desea eliminar el permiso{" "}
          <strong>{permissionToDelete?.code}</strong>? Esta acción no se puede
          deshacer.
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
            {deleting ? "Eliminando..." : "Eliminar"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default PermissionsList;



