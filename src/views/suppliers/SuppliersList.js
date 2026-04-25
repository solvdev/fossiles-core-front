import React, { useState, useEffect, useMemo } from "react";
import { Button, Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Alert, Badge, Input, Label, FormGroup } from "reactstrap";
import { getSuppliers, deleteSupplier } from "services/supplierService";
import SuppliersForm from "./SuppliersForm";

function SuppliersList() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleNew = () => {
    setSelectedSupplierId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedSupplierId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadSuppliers();
    setShowForm(false);
    setSelectedSupplierId(null);
  };

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (err) {
      setError(err.message || "Error al cargar los proveedores");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este proveedor?")) {
      try {
        await deleteSupplier(id);
        loadSuppliers();
      } catch (err) {
        setError(err.message || "Error al eliminar el proveedor");
      }
    }
  };

  const filteredSuppliers = useMemo(() => {
    let filtered = suppliers.filter((s) => {
      const searchLower = filterSearch.toLowerCase();
      return (
        !filterSearch ||
        (s.name && s.name.toLowerCase().includes(searchLower)) ||
        (s.nit && s.nit.toLowerCase().includes(searchLower)) ||
        (s.phone && s.phone.toLowerCase().includes(searchLower)) ||
        (s.email && s.email.toLowerCase().includes(searchLower))
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
          case "nit":
            aValue = (a.nit || "").toLowerCase();
            bValue = (b.nit || "").toLowerCase();
            break;
          case "phone":
            aValue = (a.phone || "").toLowerCase();
            bValue = (b.phone || "").toLowerCase();
            break;
          case "email":
            aValue = (a.email || "").toLowerCase();
            bValue = (b.email || "").toLowerCase();
            break;
          case "status":
            aValue = (a.status || "").toLowerCase();
            bValue = (b.status || "").toLowerCase();
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
  }, [suppliers, filterSearch, sortField, sortDirection]);

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
      <Row><Col md="12">
        <Card><CardHeader><Row><Col md="6"><CardTitle tag="h4">Proveedores</CardTitle></Col>
          <Col md="6" className="text-right"><Button color="primary" onClick={handleNew} className="btn-round"><i className="nc-icon nc-simple-add" /> Nuevo Proveedor</Button></Col></Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}
          
          <Row className="mb-3">
            <Col md="6">
              <FormGroup>
                <Label>Buscar</Label>
                <Input
                  type="text"
                  placeholder="Buscar por nombre, NIT, teléfono o email..."
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

          {loading ? <div className="text-center"><p>Cargando proveedores...</p></div> :
            suppliers.length === 0 ? <div className="text-center"><p>No hay proveedores registrados.</p></div> :
              filteredSuppliers.length === 0 ? (
                <Alert color="info">
                  No se encontraron proveedores que coincidan con la búsqueda.
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
                      Mostrando {filteredSuppliers.length} de {suppliers.length} proveedor(es)
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
                          onClick={() => handleSort("nit")}
                        >
                          NIT {getSortIcon("nit")}
                        </th>
                        <th 
                          style={{ cursor: "pointer", userSelect: "none" }}
                          onClick={() => handleSort("phone")}
                        >
                          Teléfono {getSortIcon("phone")}
                        </th>
                        <th 
                          style={{ cursor: "pointer", userSelect: "none" }}
                          onClick={() => handleSort("email")}
                        >
                          Email {getSortIcon("email")}
                        </th>
                        <th 
                          style={{ cursor: "pointer", userSelect: "none" }}
                          onClick={() => handleSort("status")}
                        >
                          Estado {getSortIcon("status")}
                        </th>
                        <th className="text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSuppliers.map(s => <tr key={s.id}><td>{s.id}</td><td>{s.name}</td><td>{s.nit}</td><td>{s.phone}</td><td>{s.email}</td>
                        <td>{s.status === "active" ? <Badge color="success">Activo</Badge> : <Badge color="secondary">Inactivo</Badge>}</td>
                        <td className="text-right"><Button color="info" size="sm" onClick={() => handleEdit(s.id)} className="btn-round mr-1"><i className="nc-icon nc-ruler-pencil" /> Editar</Button>
                          <Button color="danger" size="sm" onClick={() => handleDelete(s.id)} className="btn-round"><i className="nc-icon nc-simple-remove" /> Eliminar</Button></td></tr>)}
                    </tbody>
                  </Table>
                </>
              )}
        </CardBody>
      </Card></Col></Row>
      <SuppliersForm
        supplierId={selectedSupplierId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedSupplierId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
export default SuppliersList;

