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
  Input,
  Label,
  FormGroup,
} from "reactstrap";
import { getDepartments, deleteDepartment } from "services/departmentService";
import DepartmentsForm from "./DepartmentsForm";

function DepartmentsList() {
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadDepartments();
  }, []);

  const loadDepartments = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getDepartments();
      setDepartments(data);
    } catch (err) {
      setError(err.message || "Error al cargar los departamentos");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedDepartmentId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedDepartmentId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadDepartments();
    setShowForm(false);
    setSelectedDepartmentId(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este departamento?")) {
      try {
        await deleteDepartment(id);
        loadDepartments();
      } catch (err) {
        setError(err.message || "Error al eliminar el departamento");
      }
    }
  };

  const filteredDepartments = useMemo(() => {
    let filtered = departments.filter((dept) => {
      const searchLower = filterSearch.toLowerCase();
      return (
        !filterSearch ||
        (dept.code && dept.code.toLowerCase().includes(searchLower)) ||
        (dept.name && dept.name.toLowerCase().includes(searchLower)) ||
        (dept.description && dept.description.toLowerCase().includes(searchLower))
      );
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
          case "code":
            aValue = (a.code || "").toLowerCase();
            bValue = (b.code || "").toLowerCase();
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
  }, [departments, filterSearch, sortField, sortDirection]);

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

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Departamentos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nuevo Departamento
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {/* Filtros */}
              <Row className="mb-3">
                <Col md="6">
                  <FormGroup>
                    <Label>Buscar</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por código, nombre o descripción..."
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
                  <p>Cargando departamentos...</p>
                </div>
              ) : departments.length === 0 ? (
                <div className="text-center">
                  <p>No hay departamentos registrados.</p>
                </div>
              ) : filteredDepartments.length === 0 ? (
                <Alert color="info">
                  No se encontraron departamentos que coincidan con la búsqueda.
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
                      Mostrando {filteredDepartments.length} de {departments.length} departamento(s)
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
                        onClick={() => handleSort("code")}
                      >
                        Código {getSortIcon("code")}
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
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDepartments.map((dept) => (
                      <tr key={dept.id}>
                        <td>{dept.id}</td>
                        <td>{dept.code}</td>
                        <td>{dept.name}</td>
                        <td>{dept.description}</td>
                        <td className="text-right">
                          <Button color="info" size="sm" onClick={() => handleEdit(dept.id)} className="btn-round mr-1">
                            <i className="nc-icon nc-ruler-pencil" /> Editar
                          </Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(dept.id)} className="btn-round">
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
      <DepartmentsForm
        departmentId={selectedDepartmentId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedDepartmentId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default DepartmentsList;

