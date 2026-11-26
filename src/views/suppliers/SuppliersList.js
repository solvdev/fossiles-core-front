import React, { useState, useEffect, useMemo, useRef } from "react";
import { Button, Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Alert, Badge, Input, Label, FormGroup } from "reactstrap";
import { getSuppliers, deleteSupplier, normalizeSupplierCode } from "services/supplierService";
import SuppliersForm from "./SuppliersForm";
import SupplierCodesImport from "./SupplierCodesImport";
import { Kbd, useHotkeys } from "hooks/useKeyboard";

const codeNumber = (code) => {
  const n = parseInt(String(code || "").replace(/^PV/i, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

function SuppliersList() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState(null);
  const [filterSearch, setFilterSearch] = useState("");
  const [sortField, setSortField] = useState("code");
  const [sortDirection, setSortDirection] = useState("asc");
  const [active, setActive] = useState(0);
  const searchRef = useRef(null);
  const rowRefs = useRef({});

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
    const searchLower = filterSearch.trim().toLowerCase();
    const asCode = normalizeSupplierCode(filterSearch);
    let filtered = suppliers.filter((s) => {
      if (!searchLower) return true;
      if (asCode && s.code === asCode) return true;
      return (
        (s.code && s.code.toLowerCase().includes(searchLower)) ||
        (s.name && s.name.toLowerCase().includes(searchLower)) ||
        (s.nit && s.nit.toLowerCase().includes(searchLower)) ||
        (s.phone && s.phone.toLowerCase().includes(searchLower)) ||
        (s.email && s.email.toLowerCase().includes(searchLower))
      );
    });
    // Si se escribió un código exacto, ese va primero.
    if (asCode) {
      filtered = [...filtered].sort((a, b) => (b.code === asCode) - (a.code === asCode));
    }
    if (sortField && !asCode) {
      const value = (s) => {
        switch (sortField) {
          case "code":
            return codeNumber(s.code);
          case "creditDays":
            return Number(s.creditDays) || 0;
          default:
            return (s[sortField] || "").toString().toLowerCase();
        }
      };
      filtered = [...filtered].sort((a, b) => {
        const av = value(a);
        const bv = value(b);
        if (av < bv) return sortDirection === "asc" ? -1 : 1;
        if (av > bv) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }
    return filtered;
  }, [suppliers, filterSearch, sortField, sortDirection]);

  useEffect(() => {
    setActive(0);
  }, [filterSearch, sortField, sortDirection]);

  const move = (step) => {
    if (filteredSuppliers.length === 0) return;
    const next = Math.min(filteredSuppliers.length - 1, Math.max(0, active + step));
    setActive(next);
    rowRefs.current[filteredSuppliers[next]?.id]?.scrollIntoView({ block: "nearest" });
  };

  const formOpen = showForm || showCodes;
  useHotkeys(
    {
      "/": () => searchRef.current?.focus(),
      n: () => handleNew(),
      c: () => setShowCodes(true),
      arrowdown: () => move(1),
      j: () => move(1),
      arrowup: () => move(-1),
      k: () => move(-1),
      pagedown: () => move(10),
      pageup: () => move(-10),
      enter: (e) => {
        // Si el foco está en un botón o un enlace, Enter hace lo de ese botón.
        if (e.target.closest?.("button, a, th")) return false;
        const s = filteredSuppliers[active];
        if (s) handleEdit(s.id);
      },
    },
    { enabled: !formOpen }
  );

  // En el buscador: flechas bajan a la lista, Enter abre el primero, Esc limpia.
  const onSearchKey = (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.currentTarget.blur();
      move(0);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const s = filteredSuppliers[active];
      if (s) handleEdit(s.id);
    } else if (e.key === "Escape") {
      setFilterSearch("");
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
    if (sortField !== field) {
      return <i className="nc-icon nc-minimal-up" style={{ opacity: 0.3 }} />;
    }
    return sortDirection === "asc" ? <i className="nc-icon nc-minimal-up" /> : <i className="nc-icon nc-minimal-down" />;
  };

  const sortable = (field, label) => (
    <th
      style={{ cursor: "pointer", userSelect: "none" }}
      onClick={() => handleSort(field)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), handleSort(field))}
      tabIndex={0}
      aria-sort={sortField === field ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}
    >
      {label} {getSortIcon(field)}
    </th>
  );

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Proveedores</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button color="primary" outline onClick={() => setShowCodes(true)} className="btn-round mr-2">
                    Cargar códigos
                  </Button>
                  <Button color="primary" onClick={handleNew} className="btn-round">
                    <i className="nc-icon nc-simple-add" /> Nuevo Proveedor
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-2">
                <Col md="6">
                  <FormGroup>
                    <Label for="sup-search">Buscar</Label>
                    <Input
                      id="sup-search"
                      innerRef={searchRef}
                      type="text"
                      placeholder="Código (13 o PV013), nombre, NIT, teléfono o email…"
                      value={filterSearch}
                      onChange={(e) => setFilterSearch(e.target.value)}
                      onKeyDown={onSearchKey}
                      autoComplete="off"
                    />
                  </FormGroup>
                </Col>
                <Col md="6" className="d-flex align-items-end pb-3">
                  <span className="kbd-bar">
                    <span><Kbd>/</Kbd> buscar</span>
                    <span><Kbd>↑</Kbd><Kbd>↓</Kbd> moverse</span>
                    <span><Kbd>Enter</Kbd> editar</span>
                    <span><Kbd>N</Kbd> nuevo</span>
                    <span><Kbd>C</Kbd> cargar códigos</span>
                  </span>
                </Col>
              </Row>
              {loading ? (
                <div className="text-center">
                  <p>Cargando proveedores...</p>
                </div>
              ) : suppliers.length === 0 ? (
                <div className="text-center">
                  <p>No hay proveedores registrados.</p>
                </div>
              ) : filteredSuppliers.length === 0 ? (
                <Alert color="info">
                  No se encontraron proveedores que coincidan con la búsqueda.
                  <Button color="link" onClick={() => setFilterSearch("")} className="p-0 ml-2">
                    Limpiar filtro
                  </Button>
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
                        {sortable("code", "Código")}
                        {sortable("name", "Nombre")}
                        {sortable("nit", "NIT")}
                        {sortable("phone", "Teléfono")}
                        {sortable("creditDays", "Crédito")}
                        {sortable("status", "Estado")}
                        <th className="text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSuppliers.map((s, i) => (
                        <tr
                          key={s.id}
                          ref={(el) => {
                            rowRefs.current[s.id] = el;
                          }}
                          className={i === active ? "kbd-row-active" : ""}
                          onClick={() => setActive(i)}
                          onDoubleClick={() => handleEdit(s.id)}
                        >
                          <td style={{ fontFamily: "ui-monospace, Consolas, monospace", fontWeight: 600, color: "#0f7478" }}>
                            {s.code || "—"}
                          </td>
                          <td>
                            {s.name}
                            {s.payeeName && <div className="small text-muted">Cheque a nombre de {s.payeeName}</div>}
                          </td>
                          <td>{s.nit}</td>
                          <td>{s.phone}</td>
                          <td>{s.creditDays ?? 30} días</td>
                          <td>
                            {s.status === "active" ? <Badge color="success">Activo</Badge> : <Badge color="secondary">Inactivo</Badge>}
                          </td>
                          <td className="text-right">
                            <Button color="info" size="sm" onClick={() => handleEdit(s.id)} className="btn-round mr-1">
                              <i className="nc-icon nc-ruler-pencil" /> Editar
                            </Button>
                            <Button color="danger" size="sm" onClick={() => handleDelete(s.id)} className="btn-round">
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
      <SuppliersForm
        supplierId={selectedSupplierId}
        isOpen={showForm}
        suppliers={suppliers}
        toggle={() => {
          setShowForm(false);
          setSelectedSupplierId(null);
        }}
        onSuccess={handleFormSuccess}
      />
      <SupplierCodesImport isOpen={showCodes} toggle={() => setShowCodes(false)} onApplied={loadSuppliers} suppliers={suppliers} />
    </div>
  );
}

export default SuppliersList;
