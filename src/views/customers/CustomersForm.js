import React, { useEffect, useMemo, useState } from "react";
import {
  Button,
  Label,
  FormGroup,
  Input,
  Alert,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Row,
  Col,
} from "reactstrap";
import { getCustomerById, createCustomer, updateCustomer } from "services/customerService";
import {
  listLocations,
  listRegions,
  listRoutes,
  parseRouteLocationCode,
  suggestRouteLocationCode,
} from "utils/deliveryRouteCatalog";

function CustomersForm({ customerId, isOpen, toggle, onSuccess }) {
  const [formData, setFormData] = useState({
    name: "",
    nit: "",
    legacyCode: "",
    phone: "",
    email: "",
    address: "",
    status: "active",
    routeLocationCode: "",
  });
  const [routeRegionCode, setRouteRegionCode] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [routeManual, setRouteManual] = useState(false);
  const [routeSuggestion, setRouteSuggestion] = useState(null);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customerName, setCustomerName] = useState("");

  const regions = useMemo(() => listRegions(), []);
  const routes = useMemo(
    () => (routeRegionCode ? listRoutes(routeRegionCode) : []),
    [routeRegionCode]
  );
  const locations = useMemo(
    () => (routeNumber ? listLocations(Number(routeNumber)) : []),
    [routeNumber]
  );

  const syncRouteFromCode = (code) => {
    const parsed = parseRouteLocationCode(code);
    if (parsed) {
      setRouteRegionCode(parsed.regionCode || "");
      setRouteNumber(String(parsed.routeNumber || ""));
      setFormData((prev) => ({ ...prev, routeLocationCode: parsed.code }));
    } else {
      setRouteRegionCode("");
      setRouteNumber("");
      setFormData((prev) => ({ ...prev, routeLocationCode: code || "" }));
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (customerId) {
        loadCustomer();
      } else {
        resetForm();
      }
    }
  }, [isOpen, customerId]);

  useEffect(() => {
    if (!isOpen || routeManual) return;
    const suggestion = suggestRouteLocationCode(formData.address, formData.name);
    setRouteSuggestion(suggestion);
  }, [formData.address, formData.name, isOpen, routeManual]);

  const loadCustomer = async () => {
    try {
      setLoading(true);
      const customer = await getCustomerById(customerId);
      setFormData({
        name: customer.name || "",
        nit: customer.nit || "",
        legacyCode: customer.legacyCode || "",
        phone: customer.phone || "",
        email: customer.email || "",
        address: customer.address || "",
        status: customer.status || "active",
        routeLocationCode: customer.routeLocationCode || "",
      });
      setCustomerName(customer.name || "");
      syncRouteFromCode(customer.routeLocationCode || "");
      setRouteManual(Boolean(customer.routeLocationCode));
      setRouteSuggestion(null);
    } catch (err) {
      setError(err.message || "Error al cargar el cliente");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      nit: "",
      legacyCode: "",
      phone: "",
      email: "",
      address: "",
      status: "active",
      routeLocationCode: "",
    });
    setRouteRegionCode("");
    setRouteNumber("");
    setRouteManual(false);
    setRouteSuggestion(null);
    setCustomerName("");
    setErrors({});
    setError("");
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.name.trim()) newErrors.name = "El nombre es requerido";
    if (!formData.nit.trim()) newErrors.nit = "El NIT es requerido";
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "El email no es válido";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const applySuggestion = () => {
    if (!routeSuggestion?.code) return;
    setRouteManual(true);
    syncRouteFromCode(routeSuggestion.code);
    setRouteSuggestion(null);
  };

  const handleRegionChange = (value) => {
    setRouteManual(true);
    setRouteRegionCode(value);
    setRouteNumber("");
    setFormData((prev) => ({ ...prev, routeLocationCode: "" }));
  };

  const handleRouteChange = (value) => {
    setRouteManual(true);
    setRouteNumber(value);
    setFormData((prev) => ({ ...prev, routeLocationCode: "" }));
  };

  const handleLocationChange = (code) => {
    setRouteManual(true);
    setFormData((prev) => ({ ...prev, routeLocationCode: code }));
  };

  const clearRoute = () => {
    setRouteManual(true);
    setRouteRegionCode("");
    setRouteNumber("");
    setRouteSuggestion(null);
    setFormData((prev) => ({ ...prev, routeLocationCode: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    try {
      setLoading(true);
      setError("");
      const payload = {
        ...formData,
        routeLocationCode: formData.routeLocationCode || "",
      };
      if (customerId) {
        await updateCustomer(customerId, payload);
      } else {
        await createCustomer(payload);
      }
      onSuccess();
      toggle();
      resetForm();
    } catch (err) {
      setError(err.message || "Error al guardar el cliente");
    } finally {
      setLoading(false);
    }
  };

  const selectedLocation = parseRouteLocationCode(formData.routeLocationCode);

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        {customerId ? `Editar cliente${customerName ? `: ${customerName}` : ""}` : "Nuevo Cliente"}
      </ModalHeader>
      <form onSubmit={handleSubmit}>
        <ModalBody>
          {error && <Alert color="danger">{error}</Alert>}
          <FormGroup>
            <Label>Nombre *</Label>
            <Input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              invalid={!!errors.name}
            />
            {errors.name && <div className="text-danger small">{errors.name}</div>}
          </FormGroup>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>NIT *</Label>
                <Input
                  type="text"
                  value={formData.nit}
                  onChange={(e) => setFormData({ ...formData, nit: e.target.value })}
                  invalid={!!errors.nit}
                />
                {errors.nit && <div className="text-danger small">{errors.nit}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Teléfono</Label>
                <Input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Clave CxC (legacy)</Label>
                <Input
                  type="text"
                  placeholder="Ej. CB490"
                  value={formData.legacyCode}
                  onChange={(e) => setFormData({ ...formData, legacyCode: e.target.value.toUpperCase() })}
                />
                <small className="text-muted">Opcional. Única por cliente; usada para buscar en cuentas por cobrar.</small>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Email</Label>
                <Input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  invalid={!!errors.email}
                />
                {errors.email && <div className="text-danger small">{errors.email}</div>}
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Estado</Label>
                <Input
                  type="select"
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                >
                  <option value="active">Activo</option>
                  <option value="inactive">Inactivo</option>
                </Input>
              </FormGroup>
            </Col>
          </Row>
          <FormGroup>
            <Label>Dirección</Label>
            <Input
              type="textarea"
              rows="2"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
            />
          </FormGroup>

          {routeSuggestion && !formData.routeLocationCode && (
            <Alert color="info" className="py-2">
              Sugerencia de ruta: <strong>{routeSuggestion.code}</strong> — {routeSuggestion.label}
              <Button color="link" size="sm" className="p-0 ml-2" type="button" onClick={applySuggestion}>
                Aplicar
              </Button>
            </Alert>
          )}

          <div className="border rounded p-3 mb-2 bg-light">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h6 className="text-primary mb-0">Ruta de entrega (cuentas por cobrar LF)</h6>
              {formData.routeLocationCode && (
                <Button color="link" size="sm" className="p-0" type="button" onClick={clearRoute}>
                  Quitar ruta
                </Button>
              )}
            </div>
            <Row form>
              <Col md="4">
                <FormGroup>
                  <Label>Región</Label>
                  <Input
                    type="select"
                    value={routeRegionCode}
                    onChange={(e) => handleRegionChange(e.target.value)}
                  >
                    <option value="">— Sin asignar —</option>
                    {regions.map((r) => (
                      <option key={r.code} value={r.code}>
                        {r.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label>Ruta</Label>
                  <Input
                    type="select"
                    value={routeNumber}
                    onChange={(e) => handleRouteChange(e.target.value)}
                    disabled={!routeRegionCode}
                  >
                    <option value="">— Seleccione —</option>
                    {routes.map((r) => (
                      <option key={r.routeNumber} value={r.routeNumber}>
                        Ruta {r.routeNumber}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
              <Col md="4">
                <FormGroup>
                  <Label>Ubicación</Label>
                  <Input
                    type="select"
                    value={formData.routeLocationCode}
                    onChange={(e) => handleLocationChange(e.target.value)}
                    disabled={!routeNumber}
                  >
                    <option value="">— Seleccione —</option>
                    {locations.map((loc) => (
                      <option key={loc.code} value={loc.code}>
                        {loc.code} — {loc.label}
                      </option>
                    ))}
                  </Input>
                </FormGroup>
              </Col>
            </Row>
            {selectedLocation && (
              <small className="text-muted">
                Código: <code>{selectedLocation.code}</code> · {selectedLocation.label}
              </small>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={toggle} disabled={loading}>
            Cancelar
          </Button>
          <Button color="primary" type="submit" disabled={loading}>
            {loading ? "Guardando..." : customerId ? "Actualizar" : "Crear"}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export default CustomersForm;
