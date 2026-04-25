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
import { getLocations, deleteLocation } from "services/locationService";
import LocationsForm from "./LocationsForm";

function LocationsList() {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategoria, setFilterCategoria] = useState("");
  const [filterDepartamento, setFilterDepartamento] = useState("");
  const [filterMunicipio, setFilterMunicipio] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("asc");

  useEffect(() => {
    loadLocations();
  }, []);

  const loadLocations = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getLocations();
      setLocations(data);
    } catch (err) {
      setError(err.message || "Error al cargar las ubicaciones");
    } finally {
      setLoading(false);
    }
  };

  const handleNew = () => {
    setSelectedLocationId(null);
    setShowForm(true);
  };

  const handleEdit = (id) => {
    setSelectedLocationId(id);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    loadLocations();
    setShowForm(false);
    setSelectedLocationId(null);
  };

  const handleDelete = async (id) => {
    if (window.confirm("¿Está seguro de eliminar esta ubicación?")) {
      try {
        await deleteLocation(id);
        loadLocations();
      } catch (err) {
        setError(err.message || "Error al eliminar la ubicación");
      }
    }
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
    if (sortField !== field) return "⇅";
    return sortDirection === "asc" ? "↑" : "↓";
  };

  const filteredAndSortedLocations = useMemo(() => {
    let filtered = locations.filter((location) => {
      const matchesSearch =
        !searchTerm ||
        (location.name && location.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (location.code && location.code.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (location.encargadoNombre && location.encargadoNombre.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchesCategoria =
        !filterCategoria ||
        (location.categoria && location.categoria.toLowerCase() === filterCategoria.toLowerCase());

      const matchesDepartamento =
        !filterDepartamento ||
        (location.departamento && location.departamento.toLowerCase() === filterDepartamento.toLowerCase());

      const matchesMunicipio =
        !filterMunicipio ||
        (location.municipio && location.municipio.toLowerCase() === filterMunicipio.toLowerCase());

      return matchesSearch && matchesCategoria && matchesDepartamento && matchesMunicipio;
    });

    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortField] || "";
        let bValue = b[sortField] || "";

        if (typeof aValue === "string") {
          aValue = aValue.toLowerCase();
          bValue = bValue.toLowerCase();
        }

        if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
        if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [locations, searchTerm, filterCategoria, filterDepartamento, filterMunicipio, sortField, sortDirection]);

  const uniqueCategorias = useMemo(() => {
    const categorias = locations
      .map((loc) => loc.categoria)
      .filter((cat) => cat && cat.trim() !== "");
    return [...new Set(categorias)].sort();
  }, [locations]);

  const uniqueDepartamentos = useMemo(() => {
    const departamentos = locations
      .map((loc) => loc.departamento)
      .filter((dept) => dept && dept.trim() !== "");
    return [...new Set(departamentos)].sort();
  }, [locations]);

  const uniqueMunicipios = useMemo(() => {
    const municipios = locations
      .map((loc) => loc.municipio)
      .filter((mun) => mun && mun.trim() !== "");
    return [...new Set(municipios)].sort();
  }, [locations]);

  const handleClearFilters = () => {
    setSearchTerm("");
    setFilterCategoria("");
    setFilterDepartamento("");
    setFilterMunicipio("");
    setSortField(null);
    setSortDirection("asc");
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Catálogo de Kioscos</CardTitle>
                  <p className="text-muted small mb-0">Gestión de ubicaciones físicas de kioscos</p>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nuevo Kiosco
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              
              {/* Filtros de búsqueda */}
              <Row className="mb-3">
                <Col md="12">
                  <FormGroup>
                    <Label>Búsqueda general</Label>
                    <Input
                      type="text"
                      placeholder="Buscar por nombre, código o encargado..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </FormGroup>
                </Col>
              </Row>
              <Row className="mb-3">
                <Col md="3">
                  <FormGroup>
                    <Label>Categoría</Label>
                    <Input
                      type="select"
                      value={filterCategoria}
                      onChange={(e) => setFilterCategoria(e.target.value)}
                    >
                      <option value="">Todas las categorías</option>
                      {uniqueCategorias.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Departamento</Label>
                    <Input
                      type="select"
                      value={filterDepartamento}
                      onChange={(e) => setFilterDepartamento(e.target.value)}
                    >
                      <option value="">Todos los departamentos</option>
                      {uniqueDepartamentos.map((dept) => (
                        <option key={dept} value={dept}>
                          {dept}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Municipio</Label>
                    <Input
                      type="select"
                      value={filterMunicipio}
                      onChange={(e) => setFilterMunicipio(e.target.value)}
                    >
                      <option value="">Todos los municipios</option>
                      {uniqueMunicipios.map((mun) => (
                        <option key={mun} value={mun}>
                          {mun}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>&nbsp;</Label>
                    <Button
                      color="secondary"
                      block
                      onClick={handleClearFilters}
                      className="btn-round"
                    >
                      <i className="nc-icon nc-simple-remove" /> Limpiar filtros
                    </Button>
                  </FormGroup>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center"><p>Cargando ubicaciones...</p></div>
              ) : locations.length === 0 ? (
                <div className="text-center">
                  <p>No hay kioscos registrados.</p>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    Crear primer kiosco
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mb-2">
                    <small className="text-muted">
                      Mostrando {filteredAndSortedLocations.length} de {locations.length} kioscos
                    </small>
                  </div>
                  <Table responsive>
                    <thead className="text-primary">
                      <tr>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("id")}
                        >
                          ID {getSortIcon("id")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("code")}
                        >
                          Código {getSortIcon("code")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("name")}
                        >
                          Nombre {getSortIcon("name")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("categoria")}
                        >
                          Categoría {getSortIcon("categoria")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("encargadoNombre")}
                        >
                          Encargado {getSortIcon("encargadoNombre")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("departamento")}
                        >
                          Departamento {getSortIcon("departamento")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("municipio")}
                        >
                          Municipio {getSortIcon("municipio")}
                        </th>
                        <th 
                          style={{ cursor: "pointer" }}
                          onClick={() => handleSort("zona")}
                        >
                          Zona {getSortIcon("zona")}
                        </th>
                        <th className="text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAndSortedLocations.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="text-center">
                            <p className="text-muted">No se encontraron kioscos con los filtros aplicados.</p>
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedLocations.map((location) => (
                          <tr key={location.id}>
                            <td>{location.id}</td>
                            <td>{location.code}</td>
                            <td>{location.name}</td>
                            <td>{location.categoria || "-"}</td>
                            <td>{location.encargadoNombre || "-"}</td>
                            <td>{location.departamento}</td>
                            <td>{location.municipio}</td>
                            <td>{location.zona}</td>
                            <td className="text-right">
                              <Button color="info" size="sm" onClick={() => handleEdit(location.id)} className="btn-round mr-1">
                                <i className="nc-icon nc-ruler-pencil" /> Editar
                              </Button>
                              <Button color="danger" size="sm" onClick={() => handleDelete(location.id)} className="btn-round">
                                <i className="nc-icon nc-simple-remove" /> Eliminar
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <LocationsForm
        locationId={selectedLocationId}
        isOpen={showForm}
        toggle={() => {
          setShowForm(false);
          setSelectedLocationId(null);
        }}
        onSuccess={handleFormSuccess}
      />
    </div>
  );
}

export default LocationsList;

