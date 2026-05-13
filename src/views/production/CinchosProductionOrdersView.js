import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getProductionOrders, updateManagedCinchoOrderStatus } from "services/productionOrderService";
import { formatDateDdMmYyGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { isFossCinchosProductCode, isManagedCinchoOrderType } from "utils/cinchoProductionHelper";

const STATUS_LABELS = {
  PENDING: "Pendiente",
  IN_PROGRESS: "En progreso",
  IN_QA: "En QA",
  COMPLETED: "Completada",
  CANCELLED: "Cancelada",
  DRAFT: "Borrador",
};

const MANAGED_STATUS_OPTIONS = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"];

function itemTotalQty(item) {
  if (!item) return 0;
  if (item.sizes && typeof item.sizes === "object") {
    return Object.values(item.sizes).reduce((sum, q) => sum + (Number(q) || 0), 0);
  }
  return Number(item.quantity || 0);
}

function orderTotalQty(order) {
  return (order?.items || []).reduce((sum, it) => sum + itemTotalQty(it), 0);
}

function formatSizesText(item) {
  if (!item?.sizes || typeof item.sizes !== "object") return "—";
  const parts = Object.entries(item.sizes)
    .filter(([, q]) => Number(q) > 0)
    .map(([size, q]) => `${size}: ${q}`);
  return parts.length ? parts.join(" · ") : "—";
}

function buildRows(orders) {
  const list = [];
  (orders || []).forEach((order) => {
    const type = String(order?.orderType || "").trim().toUpperCase();
    if (isManagedCinchoOrderType(type)) {
      list.push({ key: `op-${order.id}`, kind: "MANAGED_OP", order });
      return;
    }
    if (type !== "VENTA_EN_LINEA") return;
    (order.items || []).forEach((item) => {
      if (!isFossCinchosProductCode(item?.productCode)) return;
      list.push({ key: `opl-${order.id}-${item.id}`, kind: "OPL_FOSS", order, item });
    });
  });
  return list;
}

function CinchosProductionOrdersView() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [detail, setDetail] = useState(null);
  const [draftStatus, setDraftStatus] = useState("PENDING");
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getProductionOrders();
      setOrders(data || []);
    } catch (e) {
      setError(e.message || "No se pudieron cargar las órdenes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo(() => buildRows(orders), [orders]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (sourceFilter === "OPCF_OPCM" && row.kind !== "MANAGED_OP") return false;
      if (sourceFilter === "OPL_FOSS" && row.kind !== "OPL_FOSS") return false;
      if (row.kind === "MANAGED_OP") {
        const st = String(row.order?.status || "").toUpperCase();
        if (statusFilter !== "ALL" && st !== statusFilter) return false;
      }
      if (!term) return true;
      const o = row.order;
      const i = row.item;
      const blob = [
        o?.code,
        o?.customerName,
        o?.sellerName,
        o?.orderType,
        o?.observations,
        i?.productCode,
        i?.productName,
        i?.colorName,
        i?.observations,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [rows, search, sourceFilter, statusFilter]);

  const openDetail = (row) => {
    setDetail(row);
    if (row.kind === "MANAGED_OP") {
      setDraftStatus(String(row.order?.status || "PENDING").toUpperCase());
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setSavingStatus(false);
  };

  const saveManagedStatus = async () => {
    if (!detail || detail.kind !== "MANAGED_OP") return;
    const id = detail.order?.id;
    if (!id) return;
    setSavingStatus(true);
    try {
      const updated = await updateManagedCinchoOrderStatus(id, draftStatus);
      setOrders((prev) => prev.map((o) => (Number(o.id) === Number(id) ? { ...o, ...updated } : o)));
      showSuccess("Estado actualizado");
      closeDetail();
    } catch (e) {
      showError(e.message || "No se pudo actualizar el estado");
    } finally {
      setSavingStatus(false);
    }
  };

  const statusBadge = (status) => {
    const s = String(status || "").toUpperCase();
    const map = {
      PENDING: "warning",
      IN_PROGRESS: "info",
      IN_QA: "info",
      COMPLETED: "success",
      CANCELLED: "danger",
      DRAFT: "secondary",
    };
    return <Badge color={map[s] || "secondary"}>{STATUS_LABELS[s] || s || "—"}</Badge>;
  };

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-end">
                <Col md="6">
                  <CardTitle tag="h4" className="mb-0">
                    Cinchos en producción
                  </CardTitle>
                  <small className="text-muted">
                    Órdenes OPCF/OPCM y prioridad de items FOSS en ventas en línea (OPL).
                  </small>
                </Col>
                <Col md="6" className="text-md-right mt-2 mt-md-0">
                  <Button color="primary" outline size="sm" onClick={load} disabled={loading}>
                    Actualizar
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              <Row className="mb-3">
                <Col md="4">
                  <FormGroup className="mb-2">
                    <Label className="small text-muted">Buscar</Label>
                    <Input
                      bsSize="sm"
                      placeholder="Código, cliente, producto…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup className="mb-2">
                    <Label className="small text-muted">Origen</Label>
                    <Input
                      type="select"
                      bsSize="sm"
                      value={sourceFilter}
                      onChange={(e) => setSourceFilter(e.target.value)}
                    >
                      <option value="ALL">Todos</option>
                      <option value="OPCF_OPCM">OP cinchos (OPCF / OPCM)</option>
                      <option value="OPL_FOSS">Prioridad venta en línea (FOSS)</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup className="mb-2">
                    <Label className="small text-muted">Estado OP (solo OPCF/OPCM)</Label>
                    <Input
                      type="select"
                      bsSize="sm"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      disabled={sourceFilter === "OPL_FOSS"}
                    >
                      <option value="ALL">Todos</option>
                      <option value="PENDING">Pendiente</option>
                      <option value="IN_PROGRESS">En progreso</option>
                      <option value="IN_QA">En QA</option>
                      <option value="COMPLETED">Completada</option>
                      <option value="CANCELLED">Cancelada</option>
                      <option value="DRAFT">Borrador</option>
                    </Input>
                  </FormGroup>
                </Col>
              </Row>

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                </div>
              ) : (
                <Table responsive hover size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Origen</th>
                      <th>OP</th>
                      <th>Tipo / Cliente</th>
                      <th>Producto</th>
                      <th>Estado OP</th>
                      <th className="text-right">Cant.</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan="7" className="text-center text-muted py-4">
                          No hay registros con los filtros actuales.
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row) => {
                        const o = row.order;
                        const isOp = row.kind === "MANAGED_OP";
                        const label = isOp ? (
                          <Badge color="dark">OP cinchos</Badge>
                        ) : (
                          <Badge color="info">Prioridad venta en línea</Badge>
                        );
                        const productLabel = isOp ? "—" : `${row.item?.productCode || ""} · ${row.item?.productName || ""}`;
                        return (
                          <tr key={row.key}>
                            <td>{label}</td>
                            <td>
                              <strong>{o?.code || o?.id}</strong>
                            </td>
                            <td>
                              <div>{o?.orderType}</div>
                              <small className="text-muted">{o?.customerName || "—"}</small>
                            </td>
                            <td style={{ maxWidth: 260 }}>
                              <span className="d-block text-truncate" title={productLabel}>
                                {productLabel}
                              </span>
                            </td>
                            <td>{statusBadge(o?.status)}</td>
                            <td className="text-right">
                              {isOp ? orderTotalQty(o) : itemTotalQty(row.item)}
                            </td>
                            <td className="text-right">
                              <Button color="primary" size="sm" outline onClick={() => openDetail(row)}>
                                Detalle
                              </Button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal isOpen={!!detail} toggle={closeDetail} size="lg">
        <ModalHeader toggle={closeDetail}>
          {detail?.kind === "MANAGED_OP" ? "Orden cinchos" : "Prioridad cincho (venta en línea)"}
        </ModalHeader>
        <ModalBody>
          {!detail ? null : (
            <>
              <Row className="mb-2">
                <Col sm="6">
                  <div className="text-muted small">Código OP</div>
                  <div className="font-weight-bold">{detail.order?.code}</div>
                </Col>
                <Col sm="6">
                  <div className="text-muted small">Tipo</div>
                  <div>{detail.order?.orderType}</div>
                </Col>
              </Row>
              <Row className="mb-2">
                <Col sm="6">
                  <div className="text-muted small">Cliente</div>
                  <div>{detail.order?.customerName || "—"}</div>
                </Col>
                <Col sm="6">
                  <div className="text-muted small">Vendedor</div>
                  <div>{detail.order?.sellerName || "—"}</div>
                </Col>
              </Row>
              <Row className="mb-2">
                <Col sm="6">
                  <div className="text-muted small">Inicio / entrega</div>
                  <div>
                    {formatDateDdMmYyGt(detail.order?.startDate)} → {formatDateDdMmYyGt(detail.order?.deliveryDate)}
                  </div>
                </Col>
                <Col sm="6">
                  <div className="text-muted small">Creada</div>
                  <div>{formatDateDdMmYyGt(detail.order?.createdAt)}</div>
                </Col>
              </Row>
              <Row className="mb-3">
                <Col>
                  <div className="text-muted small">Observación general</div>
                  <div>{detail.order?.observations || "—"}</div>
                </Col>
              </Row>

              {detail.kind === "OPL_FOSS" && detail.item && (
                <>
                  <hr />
                  <h6 className="text-muted">Item FOSS (OPL)</h6>
                  <p className="small text-info">
                    El estado de la OPL no se modifica desde esta vista; el resto del pedido sigue en el centro de
                    producción habitual.
                  </p>
                  <Table bordered size="sm" className="mb-0">
                    <tbody>
                      <tr>
                        <th scope="row">Producto</th>
                        <td>
                          {detail.item.productCode} — {detail.item.productName}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Color</th>
                        <td>{detail.item.colorName || "—"}</td>
                      </tr>
                      <tr>
                        <th scope="row">Tallas / cantidades</th>
                        <td>{formatSizesText(detail.item)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Total unidades</th>
                        <td>{itemTotalQty(detail.item)}</td>
                      </tr>
                      <tr>
                        <th scope="row">Obs. ítem</th>
                        <td>{detail.item.observations || "—"}</td>
                      </tr>
                    </tbody>
                  </Table>
                </>
              )}

              {detail.kind === "MANAGED_OP" && (
                <>
                  <hr />
                  <h6 className="text-muted">Ítems de la orden</h6>
                  <Table size="sm" responsive bordered className="mb-0">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Color</th>
                        <th>Tallas</th>
                        <th className="text-right">Cant.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.order.items || []).length === 0 ? (
                        <tr>
                          <td colSpan="4" className="text-muted text-center">
                            Sin ítems
                          </td>
                        </tr>
                      ) : (
                        detail.order.items.map((it) => (
                          <tr key={it.id}>
                            <td>
                              {it.productCode} — {it.productName}
                            </td>
                            <td>{it.colorName || "—"}</td>
                            <td>{formatSizesText(it)}</td>
                            <td className="text-right">{itemTotalQty(it)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </Table>
                  <FormGroup className="mt-3">
                    <Label for="cincho-status">Estado de la OP</Label>
                    <Input
                      id="cincho-status"
                      type="select"
                      value={draftStatus}
                      onChange={(e) => setDraftStatus(e.target.value)}
                    >
                      {MANAGED_STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABELS[s] || s}
                        </option>
                      ))}
                    </Input>
                  </FormGroup>
                </>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={closeDetail}>
            Cerrar
          </Button>
          {detail?.kind === "MANAGED_OP" && (
            <Button color="primary" onClick={saveManagedStatus} disabled={savingStatus}>
              {savingStatus ? <Spinner size="sm" /> : "Guardar estado"}
            </Button>
          )}
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default CinchosProductionOrdersView;
