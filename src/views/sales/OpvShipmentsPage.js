import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  FormGroup,
  Input,
  Label,
  Row,
  Table,
} from "reactstrap";
import { getOpvShipments } from "services/salesDashboardService";
import { CHARGE_STATUS_LABELS } from "services/customerAccountService";

const fmtMoney = (value) =>
  `Q ${Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En proceso",
  IN_QA: "En QA",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
};

const SHIPMENT_STATUS_LABELS = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  RECEIVED: "Recibido",
  COMPLETED: "Completado",
};

function statusBadgeColor(status) {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED" || s === "PAID" || s === "DELIVERED" || s === "RECEIVED") return "success";
  if (s === "IN_PROGRESS" || s === "SENT" || s === "PARTIAL" || s === "CHARGED") return "info";
  if (s === "PENDING" || s === "CONFIRMED" || s === "DRAFT") return "warning";
  if (s === "CANCELLED" || s === "NONE") return "secondary";
  return "light";
}

function ShipmentRow({ row, expanded, onToggle }) {
  const chargeLabel = CHARGE_STATUS_LABELS[row.chargeStatus] || row.chargeStatus || "—";
  const orderLabel = ORDER_STATUS_LABELS[row.orderStatus] || row.orderStatus || "—";
  const shipLabel = row.shipmentStatus
    ? SHIPMENT_STATUS_LABELS[row.shipmentStatus] || row.shipmentStatus
    : "—";

  return (
    <>
      <tr>
        <td>
          <Button color="link" size="sm" className="p-0 mr-1" onClick={onToggle}>
            {expanded ? "▾" : "▸"}
          </Button>
          <strong>{row.shipmentNumber || row.vendorShipmentNumber || "—"}</strong>
          {row.vendorShipmentVoided && (
            <Badge color="danger" className="ml-1">Anulado</Badge>
          )}
          {row.documentLevel === "ORDER" && (
            <Badge color="secondary" className="ml-1">Documento OP</Badge>
          )}
        </td>
        <td>
          <Link to={`/admin/production-orders`} className="font-weight-bold">
            {row.productionOrderCode}
          </Link>
          {row.partialReleaseLabel && (
            <div className="small text-muted">{row.partialReleaseLabel}</div>
          )}
        </td>
        <td>
          <div>{row.customerName || "—"}</div>
          {row.customerLegacyCode && (
            <small className="text-muted"><code>{row.customerLegacyCode}</code></small>
          )}
        </td>
        <td>{row.deliveryDate || row.startDate || "—"}</td>
        <td>
          <Badge color={statusBadgeColor(row.orderStatus)}>{orderLabel}</Badge>
        </td>
        <td>
          {row.shipmentStatus ? (
            <Badge color={statusBadgeColor(row.shipmentStatus)}>{shipLabel}</Badge>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
        <td>
          <Badge color={statusBadgeColor(row.chargeStatus)}>{chargeLabel}</Badge>
        </td>
        <td className="text-right">{fmtMoney(row.itemsSubtotal)}</td>
        <td className="text-right">{fmtMoney(row.packingSubtotal)}</td>
        <td className="text-right">{fmtMoney(row.shippingCost)}</td>
        <td className="text-right">
          <strong>{fmtMoney(row.estimatedTotal)}</strong>
        </td>
        <td className="text-right">
          {row.customerId && (
            <Link
              to={`/admin/customer-accounts/${row.customerId}`}
              className="btn btn-info btn-sm btn-round"
            >
              Cuenta
            </Link>
          )}
        </td>
      </tr>
      <tr>
        <td colSpan={12} className="p-0 border-0">
          <Collapse isOpen={expanded}>
            <div className="p-3 bg-light">
              <Table size="sm" className="mb-0 bg-white">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Producto / Material</th>
                    <th>Color</th>
                    <th>Talla</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">Precio unit.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(row.lines || []).map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <Badge color={line.lineType === "PACKING" ? "secondary" : "primary"}>
                          {line.lineType === "PACKING" ? "Empaque" : "Producto"}
                        </Badge>
                      </td>
                      <td>
                        {line.lineType === "PACKING"
                          ? line.materialName || "—"
                          : `${line.productCode || ""} ${line.productName || ""}`.trim() || "—"}
                      </td>
                      <td>{line.colorName || "—"}</td>
                      <td>{line.sizeLabel || "—"}</td>
                      <td className="text-right">{line.quantity ?? "—"}</td>
                      <td className="text-right">{fmtMoney(line.unitPrice)}</td>
                      <td className="text-right">{fmtMoney(line.lineTotal)}</td>
                    </tr>
                  ))}
                  {(row.lines || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="text-muted text-center">Sin detalle de líneas</td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Collapse>
        </td>
      </tr>
    </>
  );
}

function OpvShipmentsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [orderStatus, setOrderStatus] = useState("");
  const [shipmentStatus, setShipmentStatus] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [hasShipment, setHasShipment] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [expandedRows, setExpandedRows] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getOpvShipments({
        search: search.trim(),
        orderStatus: orderStatus || undefined,
        shipmentStatus: shipmentStatus || undefined,
        customerId: customerId ? Number(customerId) : undefined,
        from: fromDate || undefined,
        to: toDate || undefined,
        hasShipment: hasShipment === "" ? undefined : hasShipment === "yes",
      });
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || "Error al cargar envíos OPV");
    } finally {
      setLoading(false);
    }
  }, [search, orderStatus, shipmentStatus, customerId, hasShipment, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const customerOptions = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      if (row.customerId && !map.has(row.customerId)) {
        map.set(row.customerId, {
          id: row.customerId,
          label: [row.customerName, row.customerLegacyCode].filter(Boolean).join(" · "),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const totals = useMemo(() => {
    let estimated = 0;
    let withCharge = 0;
    rows.forEach((r) => {
      estimated += Number(r.estimatedTotal) || 0;
      if (r.hasCharge) withCharge += 1;
    });
    return { count: rows.length, estimated, withCharge };
  }, [rows]);

  const toggleRow = (key) => {
    setExpandedRows((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const rowKey = (row) =>
    `${row.productionOrderId}-${row.productShipmentId || "doc"}-${row.partialReleaseId || "x"}`;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="8">
                  <CardTitle tag="h4">Envíos OPV — Catálogo y precios</CardTitle>
                  <p className="text-muted mb-0" style={{ fontSize: "0.9rem" }}>
                    Órdenes MARCAS (Luis Felipe) con números de envío, productos, empaque, flete y estado de cobro.
                  </p>
                </Col>
                <Col md="4" className="text-right">
                  <Button color="secondary" size="sm" className="btn-round" onClick={load} disabled={loading}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Row className="mb-3">
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Buscar</Label>
                    <Input
                      placeholder="Envío, OP, cliente, parcial..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Estado OP</Label>
                    <Input type="select" value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
                      <option value="">Todos</option>
                      {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Estado envío</Label>
                    <Input type="select" value={shipmentStatus} onChange={(e) => setShipmentStatus(e.target.value)}>
                      <option value="">Todos</option>
                      {Object.entries(SHIPMENT_STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>¿Tiene envío físico?</Label>
                    <Input type="select" value={hasShipment} onChange={(e) => setHasShipment(e.target.value)}>
                      <option value="">Todos</option>
                      <option value="yes">Sí</option>
                      <option value="no">Solo documento OP</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Cliente</Label>
                    <Input type="select" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                      <option value="">Todos</option>
                      {customerOptions.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Entrega desde</Label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-md-0">
                    <Label>Entrega hasta</Label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="8" className="d-flex align-items-end">
                  <div className="d-flex flex-wrap" style={{ gap: 12 }}>
                    <div className="border rounded px-3 py-2 text-center bg-light">
                      <div className="small text-muted">Envíos / documentos</div>
                      <strong>{totals.count}</strong>
                    </div>
                    <div className="border rounded px-3 py-2 text-center bg-light">
                      <div className="small text-muted">Total estimado</div>
                      <strong className="text-primary">{fmtMoney(totals.estimated)}</strong>
                    </div>
                    <div className="border rounded px-3 py-2 text-center bg-light">
                      <div className="small text-muted">Con cargo registrado</div>
                      <strong>{totals.withCharge}</strong>
                    </div>
                  </div>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-4">Cargando envíos OPV...</div>
              ) : rows.length === 0 ? (
                <Alert color="info">No hay envíos OPV que coincidan con los filtros.</Alert>
              ) : (
                <div className="table-responsive">
                  <Table hover className="mb-0">
                    <thead className="text-primary">
                      <tr>
                        <th>Nº envío</th>
                        <th>OP / Parcial</th>
                        <th>Cliente</th>
                        <th>Entrega</th>
                        <th>Estado OP</th>
                        <th>Estado envío</th>
                        <th>Cobro</th>
                        <th className="text-right">Productos</th>
                        <th className="text-right">Empaque</th>
                        <th className="text-right">Flete</th>
                        <th className="text-right">Total</th>
                        <th className="text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const key = rowKey(row);
                        return (
                          <ShipmentRow
                            key={key}
                            row={row}
                            expanded={!!expandedRows[key]}
                            onToggle={() => toggleRow(key)}
                          />
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default OpvShipmentsPage;
