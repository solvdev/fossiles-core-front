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
import { getRoles, deleteRole } from "services/roleService";
import RolesForm from "./RolesForm";

function RolesList() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [deleteModal, setDeleteModal] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [filterSearch, setFilterSearch] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getRoles();
      setRoles(data);
    } catch (err) {
      setError(err.message || "Error al cargar los roles");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedRoleId(null);
    setShowForm(true);
  };

  const handleEdit = (roleId) => {
    setSelectedRoleId(roleId);
    setShowForm(true);
  };

  const handleDelete = (role) => {
    setRoleToDelete(role);
    setDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!roleToDelete) return;

    try {
      setDeleting(true);
      await deleteRole(roleToDelete.id);
      setDeleteModal(false);
      setRoleToDelete(null);
      loadRoles(); // Recargar la lista
    } catch (err) {
      setError(err.message || "Error al eliminar el rol");
      setDeleteModal(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setSelectedRoleId(null);
    loadRoles(); // Recargar la lista
  };

  const handleFormCancel = () => {
    setShowForm(false);
    setSelectedRoleId(null);
  };

  const filteredRoles = useMemo(() => {
    let filtered = roles.filter((role) => {
      const searchLower = filterSearch.toLowerCase();
      return (
        !filterSearch ||
        (role.name && role.name.toLowerCase().includes(searchLower)) ||
        (role.description && role.description.toLowerCase().includes(searchLower))
      );
    });

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue, bValue;
        switch (sortField) {
          case "id":
            aValue = a.id || 0;
            bValue = b.id || 0;
            break;
          case "name":
            aValue = (a.name || "").toLowerCase();
            bValue = (b.name || "").toLowerCase();
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
  }, [roles, filterSearch, sortField, sortDirection]);

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
      <RolesForm
        roleId={selectedRoleId}
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
                  <CardTitle tag="h4">Gestión de Roles</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    onClick={handleNew}
                    className="btn-round"
                  >
                    <i className="nc-icon nc-simple-add" /> Nuevo Rol
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              <Row className="mb-3">
                <Col md="6">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por nombre o descripción..."
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                {filterSearch && (
                  <Col md="6" className="d-flex align-items-end">
                    <Button
                      color="secondary"
                      size="sm"
                      onClick={() => setFilterSearch("")}
                      className="btn-round"
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar
                    </Button>
                  </Col>
                )}
              </Row>

              {loading ? (
                <div className="text-center">
                  <p>Cargando roles...</p>
                </div>
              ) : roles.length === 0 ? (
                <div className="text-center">
                  <p>No hay roles registrados.</p>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    Crear primer rol
                  </Button>
                </div>
              ) : filteredRoles.length === 0 ? (
                <Alert color="info">
                  No se encontraron roles que coincidan con la búsqueda.
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
                      Mostrando {filteredRoles.length} de {roles.length} rol(es)
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
                        onClick={() => handleSort("name")}
                      >
                        Nombre {getSortIcon("name")}
                      </th>
                      <th 
                        style={{ cursor: "pointer", userSelect: "none" }}
                        onClick={() => handleSort("description")}
                      >
                        Descripción {getSortIcon("description")}
                      </th>
                      <th>Permisos</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoles.map((role) => (
                      <tr key={role.id}>
                        <td>{role.id}</td>
                        <td>
                          <strong>{role.name}</strong>
                          <br />
                          <small className="text-muted"><code>{role.code}</code></small>
                        </td>
                        <td>{role.description || "-"}</td>
                        <td>
                          {role.permissions && role.permissions.length > 0 ? (
                            <div>
                              <Badge color="info">{role.permissions.length} permisos</Badge>
                              <div className="mt-1">
                                <small className="text-muted">
                                  {role.permissions.slice(0, 2).map(p => p.code).join(", ")}
                                  {role.permissions.length > 2 && ` ... +${role.permissions.length - 2} más`}
                                </small>
                              </div>
                            </div>
                          ) : (
                            <Badge color="secondary">Sin permisos</Badge>
                          )}
                        </td>
                        <td className="text-right">
                          <Button
                            color="info"
                            size="sm"
                            onClick={() => handleEdit(role.id)}
                            className="btn-round mr-1"
                          >
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button
                            color="danger"
                            size="sm"
                            onClick={() => handleDelete(role)}
                            className="btn-round"
                          >
                            <i className="nc-icon nc-simple-remove" /> Eliminar
                          </Button>
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
          Confirmar Eliminación
        </ModalHeader>
        <ModalBody>
          ¿Está seguro de que desea eliminar el rol{" "}
          <strong>{roleToDelete?.name}</strong>? Esta acción no se puede
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

export default RolesList;



