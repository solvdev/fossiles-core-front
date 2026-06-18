import React, { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Button, Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Alert, Badge, Input, Label, FormGroup } from "reactstrap";
import { getCustomers, deleteCustomer } from "services/customerService";
import { parseRouteLocationCode } from "utils/deliveryRouteCatalog";
import CustomersForm from "./CustomersForm";

function RouteCell({ code }) {
  const parsed = parseRouteLocationCode(code);
  if (!parsed) {
    return <Badge color="warning">Sin ruta</Badge>;
  }
  return (
    <span>
      <code>{parsed.code}</code>
      <div className="text-muted small">{parsed.label}</div>
    </span>
  );
}

function CustomersList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [filterRoute, setFilterRoute] = useState("all");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && customers.length > 0) {
      const exists = customers.some((c) => String(c.id) === String(editId));
      if (exists) {
        setSelectedCustomerId(Number(editId));
        setShowForm(true);
        const next = new URLSearchParams(searchParams);
        next.delete("edit");
        setSearchParams(next, { replace: true });
      }
    }
  }, [searchParams, customers, setSearchParams]);

  const handleNew = () => {
    setSelectedCustomerId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedCustomerId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadCustomers();
    setShowForm(false);
    setSelectedCustomerId(null);
  };

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await getCustomers();
      setCustomers(data);
    } catch (err) {
      setError(err.message || "Error al cargar los clientes");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar este cliente?")) {
      try {
        await deleteCustomer(id);
        loadCustomers();
      } catch (err) {
        setError(err.message || "Error al eliminar el cliente");
      }
    }
  };

  const filteredCustomers = useMemo(() => {
    let filtered = customers.filter((c) => {
      const searchLower = filterSearch.toLowerCase();
      const routeCode = (c.routeLocationCode || "").toLowerCase();
      const routeLabel = (parseRouteLocationCode(c.routeLocationCode)?.label || "").toLowerCase();
      const matchesSearch =
        !filterSearch ||
        (c.name && c.name.toLowerCase().includes(searchLower)) ||
        (c.nit && c.nit.toLowerCase().includes(searchLower)) ||
        (c.phone && c.phone.toLowerCase().includes(searchLower)) ||
        (c.email && c.email.toLowerCase().includes(searchLower)) ||
        routeCode.includes(searchLower) ||
        routeLabel.includes(searchLower);

      const hasRoute = Boolean(c.routeLocationCode && String(c.routeLocationCode).trim());
      const matchesRoute =
        filterRoute === "all" ||
        (filterRoute === "assigned" && hasRoute) ||
        (filterRoute === "missing" && !hasRoute);

      return matchesSearch && matchesRoute;
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
          case "route":
            aValue = (a.routeLocationCode || "").toLowerCase();
            bValue = (b.routeLocationCode || "").toLowerCase();
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
  }, [customers, filterSearch, filterRoute, sortField, sortDirection]);

  const missingRouteCount = useMemo(
    () => customers.filter((c) => !c.routeLocationCode || !String(c.routeLocationCode).trim()).length,
    [customers]
  );

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
        <Card><CardHeader><Row><Col md="6">
          <CardTitle tag="h4">Clientes</CardTitle>
          <small className="text-muted">Edite un cliente para asignar región, ruta y ubicación LF</small>
        </Col>
          <Col md="6" className="text-right"><Button color="primary" onClick={handleNew} className="btn-round"><i className="nc-icon nc-simple-add" /> Nuevo Cliente</Button></Col></Row>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}
          {missingRouteCount > 0 && (
            <Alert color="warning">
              {missingRouteCount} cliente(s) sin ruta asignada. Use <strong>Editar</strong> o el filtro
              {" "}
              <Button color="link" className="p-0 align-baseline" onClick={() => setFilterRoute("missing")}>
                Solo sin ruta
              </Button>
              {" "}para asignarlas.
            </Alert>
          )}
          
          <Row className="mb-3">
            <Col md="5">
              <FormGroup>
                <Label>Buscar</Label>
                <Input
                  type="text"
                  placeholder="Nombre, NIT, teléfono, email o código de ruta..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Ruta LF</Label>
                <Input type="select" value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}>
                  <option value="all">Todos</option>
                  <option value="assigned">Con ruta asignada</option>
                  <option value="missing">Solo sin ruta</option>
                </Input>
              </FormGroup>
            </Col>
            {(filterSearch || filterRoute !== "all") && (
              <Col md="4" className="d-flex align-items-end">
                <Button
                  color="secondary"
                  size="sm"
                  onClick={() => {
                    setFilterSearch("");
                    setFilterRoute("all");
                  }}
                  className="btn-round"
                >
                  <i className="nc-icon nc-simple-remove" /> Limpiar filtros
                </Button>
              </Col>
            )}
          </Row>

          {loading ? <div className="text-center"><p>Cargando clientes...</p></div> :
            customers.length === 0 ? <div className="text-center"><p>No hay clientes registrados.</p></div> :
              filteredCustomers.length === 0 ? (
                <Alert color="info">
                  No se encontraron clientes que coincidan con la búsqueda.
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
                      Mostrando {filteredCustomers.length} de {customers.length} cliente(s)
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
                          onClick={() => handleSort("route")}
                        >
                          Ruta LF {getSortIcon("route")}
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
                      {filteredCustomers.map((c) => {
                        const missingRoute = !c.routeLocationCode || !String(c.routeLocationCode).trim();
                        return (
                          <tr key={c.id} className={missingRoute ? "table-warning" : undefined}>
                            <td>{c.id}</td>
                            <td>{c.name}</td>
                            <td>{c.nit}</td>
                            <td>{c.phone}</td>
                            <td>{c.email}</td>
                            <td><RouteCell code={c.routeLocationCode} /></td>
                            <td>{c.status === "active" ? <Badge color="success">Activo</Badge> : <Badge color="secondary">Inactivo</Badge>}</td>
                            <td className="text-right">
                              {missingRoute && (
                                <Button color="warning" size="sm" onClick={() => handleEdit(c.id)} className="btn-round mr-1">
                                  Asignar ruta
                                </Button>
                              )}
                              <Button color="info" size="sm" onClick={() => handleEdit(c.id)} className="btn-round mr-1">
                                <i className="nc-icon nc-ruler-pencil" /> Editar
                              </Button>
                              <Button color="danger" size="sm" onClick={() => handleDelete(c.id)} className="btn-round">
                                <i className="nc-icon nc-simple-remove" /> Eliminar
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </>
              )}
        </CardBody>
      </Card></Col></Row>
      <CustomersForm
        customerId={selectedCustomerId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedCustomerId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}
export default CustomersList;

