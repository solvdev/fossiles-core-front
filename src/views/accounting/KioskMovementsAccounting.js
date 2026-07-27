import React, { useCallback, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getLocations } from "services/locationService";
import { getKioskMovementsAccounting } from "services/kioscoInventoryService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  getKioscoMovementTypeLabel,
  KIOSCO_MOVEMENT_TYPE_LABELS,
} from "utils/kioskMovementHelper";
import { showError } from "utils/notificationHelper";

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos los tipos", searchText: "todos" },
  ...Object.entries(KIOSCO_MOVEMENT_TYPE_LABELS).map(([value, label]) => ({
    value,
    label,
    searchText: label,
  })),
];

const TYPE_BADGE = {
  ENTRADA: "success",
  TRASLADO_ENTRADA: "success",
  VENTA: "primary",
  DEVOLUCION_CLIENTE: "info",
  DEVOLUCION_DEPOSITO: "info",
  TRASLADO_SALIDA: "warning",
  MERMA: "danger",
  AJUSTE: "secondary",
  ANULACION: "danger",
  CAMBIO: "warning",
};

const INITIAL_FILTERS = {
  locationId: "",
  type: "",
  from: "",
  to: "",
  referenceTerm: "",
  reason: "",
  sizeKey: "",
};

export default function KioskMovementsAccounting() {
  const [locations, setLocations] = useState([]);
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [movements, setMovements] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getLocations()
      .then((data) => setLocations(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const locationOptions = [
    { value: "", label: "Todos los kioskos", searchText: "todos" },
    ...locations.map((l) => ({
      value: String(l.id),
      label: l.name || l.code || String(l.id),
      searchText: `${l.name || ""} ${l.code || ""}`,
    })),
  ];

  const setFilter = (key, value) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const loadMovements = useCallback(async () => {
    if (!filters.locationId) {
      showError("Selecciona un kiosko para consultar movimientos.");
      return;
    }
    setLoading(true);
    try {
      const params = {
        locationId: filters.locationId || undefined,
        type: filters.type || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        referenceTerm: filters.referenceTerm || undefined,
        reason: filters.reason || undefined,
        sizeKey: filters.sizeKey || undefined,
      };
      const data = await getKioskMovementsAccounting(params);
      setMovements(Array.isArray(data) ? data : []);
    } catch (err) {
      showError(err.message || "Error al cargar movimientos.");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const handleClear = () => {
    setFilters(INITIAL_FILTERS);
    setMovements([]);
  };

  return (
    <div className="content">
      <h4 className="mb-3">Movimientos de Kioscos</h4>
      <p className="text-muted small mb-3">Vista de consulta y auditoría. Solo lectura.</p>

      {/* — FILTROS — */}
      <Row className="mb-3 g-2 align-items-end">
        <Col md={3}>
          <Label className="mb-1 small fw-semibold">Kiosko</Label>
          <FilterableSelect
            options={locationOptions}
            value={String(filters.locationId)}
            onChange={(v) => setFilter("locationId", v)}
            placeholder="Selecciona kiosko..."
          />
        </Col>
        <Col md={2}>
          <Label className="mb-1 small fw-semibold">Tipo de movimiento</Label>
          <FilterableSelect
            options={MOVEMENT_TYPE_OPTIONS}
            value={filters.type}
            onChange={(v) => setFilter("type", v)}
            placeholder="Tipo..."
          />
        </Col>
        <Col md={2}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Fecha desde</Label>
            <Input
              type="date"
              bsSize="sm"
              value={filters.from}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={2}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Fecha hasta</Label>
            <Input
              type="date"
              bsSize="sm"
              value={filters.to}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={2}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Referencia / No. factura</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="Buscar referencia..."
              value={filters.referenceTerm}
              onChange={(e) => setFilter("referenceTerm", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={1}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Talla</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="Ej: 32"
              value={filters.sizeKey}
              onChange={(e) => setFilter("sizeKey", e.target.value)}
            />
          </FormGroup>
        </Col>
      </Row>
      <Row className="mb-3 g-2 align-items-end">
        <Col md={3}>
          <FormGroup className="mb-0">
            <Label className="mb-1 small fw-semibold">Motivo contiene</Label>
            <Input
              type="text"
              bsSize="sm"
              placeholder="Buscar motivo..."
              value={filters.reason}
              onChange={(e) => setFilter("reason", e.target.value)}
            />
          </FormGroup>
        </Col>
        <Col md={2} className="d-flex gap-2">
          <Button color="primary" size="sm" onClick={loadMovements} disabled={loading}>
            {loading ? <Spinner size="sm" /> : "Consultar"}
          </Button>
          <Button color="secondary" size="sm" outline onClick={handleClear}>
            Limpiar
          </Button>
        </Col>
        {movements.length > 0 && (
          <Col md={2} className="text-muted small d-flex align-items-end">
            {movements.length} movimiento{movements.length !== 1 ? "s" : ""}
          </Col>
        )}
      </Row>

      {/* — TABLA — */}
      <div style={{ overflowX: "auto" }}>
        <Table striped hover size="sm" className="mb-0" style={{ fontSize: "0.82rem" }}>
          <thead className="table-dark sticky-top">
            <tr>
              <th>Fecha</th>
              <th>Kiosko</th>
              <th>Tipo</th>
              <th>Producto</th>
              <th>Color</th>
              <th>Talla</th>
              <th className="text-end">Cantidad</th>
              <th>No. Interno Factura</th>
              <th>No. Venta</th>
              <th className="text-end">Total venta</th>
              <th>Forma de pago</th>
              <th>Cliente</th>
              <th>NIT</th>
              <th>FEL UUID</th>
              <th>Motivo</th>
              <th>Usuario</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={16} className="text-center py-3">
                  <Spinner size="sm" /> Cargando...
                </td>
              </tr>
            )}
            {!loading && movements.length === 0 && (
              <tr>
                <td colSpan={16} className="text-center text-muted py-3">
                  {filters.locationId
                    ? "Sin movimientos con los filtros aplicados."
                    : "Selecciona un kiosko para comenzar."}
                </td>
              </tr>
            )}
            {movements.map((m) => (
              <tr key={m.id}>
                <td style={{ whiteSpace: "nowrap" }}>{formatDateTimeGt(m.fecha)}</td>
                <td>{m.kiosko || "—"}</td>
                <td>
                  <Badge color={TYPE_BADGE[m.tipoMovimiento] || "secondary"} pill>
                    {getKioscoMovementTypeLabel(m.tipoMovimiento)}
                  </Badge>
                </td>
                <td>
                  <div className="fw-semibold">{m.codigoProducto}</div>
                  <small className="text-muted">{m.producto}</small>
                </td>
                <td>{m.color || "—"}</td>
                <td>{m.talla || "—"}</td>
                <td className="text-end">
                  <span
                    style={{
                      color:
                        m.cantidad > 0
                          ? "#28a745"
                          : m.cantidad < 0
                          ? "#dc3545"
                          : undefined,
                      fontWeight: 600,
                    }}
                  >
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </span>
                </td>
                <td>
                  {m.numeroInternoFactura ? (
                    <span className="fw-semibold text-dark">{m.numeroInternoFactura}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>{m.numeroVenta || "—"}</td>
                <td className="text-end">
                  {m.totalVenta != null ? `Q ${Number(m.totalVenta).toFixed(2)}` : "—"}
                </td>
                <td>{m.formaPago || "—"}</td>
                <td>{m.cliente || "—"}</td>
                <td>{m.nit || "—"}</td>
                <td>
                  {m.felUuid ? (
                    <span
                      title={m.felUuid}
                      style={{
                        fontFamily: "monospace",
                        fontSize: "0.72rem",
                        cursor: "help",
                      }}
                    >
                      {m.felUuid.slice(0, 12)}…
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  <small className="text-muted">{m.motivo || "—"}</small>
                </td>
                <td>{m.usuario || "—"}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
}
