import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, Col, Input, Progress, Row, Spinner,
} from "reactstrap";
import {
  closeWarehouseReceipt,
  dispatchCustomerShipment,
  cancelCustomerDispatch,
  getWarehouseWorkspace,
  updateWarehouseUnitsReceipt,
} from "../../../services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseUnitGroupRow from "./WarehouseUnitGroupRow";
import {
  DISPATCH_TYPE_LABELS,
  DISPATCH_TYPE_STYLES,
  SALE_STATUS_STYLES,
  DEFAULT_BADGE_STYLE,
  getOrderQtyProgress,
  groupWarehouseUnits,
} from "./warehouseUtils";
import DispatchModal from "./DispatchModal";

const WarehouseOrderDetail = ({
  order,
  mode = "receipt",
  onRefresh,
}) => {
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dispatchModal, setDispatchModal] = useState({ open: false, sale: null });
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState(mode === "receipt" ? "PENDING" : "ALL");

  const loadWorkspace = useCallback(async () => {
    if (!order?.productionOrderId) return;
    setLoading(true);
    try {
      const data = await getWarehouseWorkspace(order.productionOrderId);
      setWorkspace(data);
    } catch (err) {
      showError(err.message || "Error al cargar piezas de la orden");
    } finally {
      setLoading(false);
    }
  }, [order?.productionOrderId]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  useEffect(() => {
    setUnitSearch("");
    setUnitStatusFilter(mode === "receipt" ? "PENDING" : "ALL");
  }, [order?.productionOrderId, mode]);

  const units = workspace?.units || [];
  const summary = workspace?.summary;
  const receiptClosed = summary?.receiptClosed || !!order?.warehouseReceiptClosedAt;
  const progress = getOrderQtyProgress(order, summary);

  const pendingUnits = useMemo(
    () => units.filter((u) => (u.receiptStatus || "PENDING") === "PENDING" && !u.shippedAt),
    [units]
  );

  const visibleUnits = useMemo(() => {
    const term = String(unitSearch || "").trim().toLowerCase();
    return units.filter((u) => {
      const status = u.receiptStatus || "PENDING";
      if (unitStatusFilter === "PENDING" && (status !== "PENDING" || u.shippedAt)) return false;
      if (unitStatusFilter === "RECEIVED" && status !== "RECEIVED") return false;
      if (unitStatusFilter === "REJECTED" && status !== "REJECTED") return false;
      if (!term) return true;
      const hay = `${u.unitLabel || ""} ${u.productCode || ""} ${u.productName || ""} ${u.colorName || ""}`
        .toLowerCase();
      return hay.includes(term);
    });
  }, [units, unitSearch, unitStatusFilter]);

  const visibleGroups = useMemo(() => groupWarehouseUnits(visibleUnits), [visibleUnits]);

  const applyUnitStatus = async (unitList, receiptStatus, rejectionReason) => {
    if (!unitList?.length) return;
    setSaving(true);
    try {
      await updateWarehouseUnitsReceipt(order.productionOrderId, {
        units: unitList.map((u) => ({
          unitId: u.id,
          receiptStatus,
          rejectionReason: receiptStatus === "REJECTED" ? rejectionReason : undefined,
        })),
      });
      const label = receiptStatus === "REJECTED" ? "rechazada(s)" : "recibida(s)";
      showSuccess(`${unitList.length} pieza(s) ${label}.`);
      await loadWorkspace();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "Error al actualizar recepción");
    } finally {
      setSaving(false);
    }
  };

  const receiveGroupQty = async (group, qty) => {
    const n = Math.min(Math.max(Number(qty) || 0, 0), group.pendingUnits.length);
    if (n <= 0) {
      showError("Indique cuántas piezas recibir.");
      return;
    }
    await applyUnitStatus(group.pendingUnits.slice(0, n), "RECEIVED");
  };

  const rejectGroupQty = async (group, qty, rejectionReason) => {
    const n = Math.min(Math.max(Number(qty) || 0, 0), group.pendingUnits.length);
    if (n <= 0) {
      showError("Indique cuántas piezas rechazar.");
      return;
    }
    if (!rejectionReason) {
      showError("Seleccione el motivo de rechazo.");
      return;
    }
    await applyUnitStatus(group.pendingUnits.slice(0, n), "REJECTED", rejectionReason);
  };

  const receiveAllPending = async () => {
    if (pendingUnits.length === 0) return;
    await applyUnitStatus(pendingUnits, "RECEIVED");
  };

  const handleCloseReceipt = async () => {
    setSaving(true);
    try {
      await closeWarehouseReceipt(order.productionOrderId);
      showSuccess("Recepción en bodega cerrada.");
      await loadWorkspace();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "No se pudo cerrar la recepción");
    } finally {
      setSaving(false);
    }
  };

  const handleCancelDispatch = async (shipment) => {
    if (!shipment?.onlineSaleId || !order?.productionOrderId) return;
    const ok = window.confirm(
      `¿Anular el envío de la venta #${shipment.saleNumber || shipment.onlineSaleId}? El stock regresará a bodega de devoluciones.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await cancelCustomerDispatch(order.productionOrderId, shipment.onlineSaleId, {
        reason: "Anulación de envío desde bodega PT",
      });
      showSuccess("Envío anulado. Stock en bodega de devoluciones.");
      await loadWorkspace();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "No se pudo anular el envío");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-center py-3"><Spinner size="sm" /> Cargando piezas...</div>;
  }

  return (
    <div className="mt-2">
      <Alert color={progress.pending > 0 ? "warning" : "success"} className="py-2">
        <strong>{formatProductionOrderCodeDate(order)}</strong>
        {" · "}
        <span style={DISPATCH_TYPE_STYLES[order.dispatchType] || DISPATCH_TYPE_STYLES.DIRECT}>
          {DISPATCH_TYPE_LABELS[order.dispatchType] || order.dispatchType}
        </span>
        <br />
        Piezas: {progress.produced}/{progress.total} contabilizadas · pendientes {progress.pending}
        {receiptClosed && <Badge color="dark" className="ml-2">Recepción cerrada</Badge>}
        {order.observations && (
          <>
            <br />
            <small>
              <strong>Observaciones:</strong> {order.observations}
            </small>
          </>
        )}
      </Alert>

      <Progress value={progress.pct} color={progress.pct >= 100 ? "success" : "info"} className="mb-3" style={{ height: 8 }} />

      {mode === "receipt" && !receiptClosed && (
        <div className="d-flex flex-wrap mb-3" style={{ gap: 8 }}>
          <Button size="sm" color="success" outline disabled={saving || pendingUnits.length === 0} onClick={() => void receiveAllPending()}>
            Recibir todas pendientes ({pendingUnits.length})
          </Button>
          <Button size="sm" color="dark" outline disabled={saving || progress.pending > 0} onClick={() => void handleCloseReceipt()}>
            Cerrar recepción en bodega
          </Button>
        </div>
      )}

      {mode === "orders" && !receiptClosed && progress.pending === 0 && (
        <Button size="sm" color="dark" className="mb-3" disabled={saving} onClick={() => void handleCloseReceipt()}>
          Cerrar recepción en bodega
        </Button>
      )}

      <Row className="align-items-end mb-2">
        <Col md="6" className="mb-2 mb-md-0">
          <h6 className="mb-1">
            Lotes ({visibleGroups.length}
            {visibleUnits.length !== units.length ? ` · ${visibleUnits.length} de ${units.length} piezas` : ` · ${units.length} piezas`})
          </h6>
          {mode === "receipt" && (
            <Input
              type="search"
              bsSize="sm"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Filtrar por código, producto o color…"
            />
          )}
        </Col>
        {mode === "receipt" && (
          <Col md="6">
            <div className="d-flex flex-wrap justify-content-md-end" style={{ gap: 6 }}>
              {[
                { value: "PENDING", label: `Pendientes (${pendingUnits.length})` },
                { value: "ALL", label: "Todas" },
                { value: "RECEIVED", label: "Recibidas" },
                { value: "REJECTED", label: "Rechazadas" },
              ].map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  color={unitStatusFilter === opt.value ? "info" : "secondary"}
                  outline={unitStatusFilter !== opt.value}
                  onClick={() => setUnitStatusFilter(opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </div>
          </Col>
        )}
      </Row>

      {visibleGroups.length === 0 ? (
        <Alert color="info" className="py-2">
          No hay piezas con este filtro. Prueba “Todas” o limpia la búsqueda.
        </Alert>
      ) : (
        visibleGroups.map((group) => (
          <WarehouseUnitGroupRow
            key={group.key}
            group={group}
            readOnly={mode === "orders" || receiptClosed}
            receiptClosed={receiptClosed}
            saving={saving}
            onReceiveQty={receiveGroupQty}
            onRejectQty={rejectGroupQty}
          />
        ))
      )}

      {mode === "orders" && order.dispatchType === "CUSTOMER_SHIPMENTS" && order.customerShipments?.length > 0 && (
        <div className="mt-4">
          <h6>Envíos a clientes</h6>
          {order.customerShipments.map((shipment, idx) => (
            <Card key={idx} className="mb-2 border-left border-primary" style={{ borderLeftWidth: 3 }}>
              <CardBody className="py-2">
                <Row className="align-items-center">
                  <Col md="8">
                    <strong>{shipment.customerName}</strong>
                    <br />
                    <small>Venta #{shipment.saleNumber} · {shipment.address}</small>
                    {shipment.observations && (
                      <>
                        <br />
                        <small className="text-warning">
                          <strong>Obs.:</strong> {shipment.observations}
                        </small>
                      </>
                    )}
                    <br />
                    <span style={SALE_STATUS_STYLES[shipment.saleStatus] || DEFAULT_BADGE_STYLE}>
                      {shipment.saleStatus}
                    </span>
                  </Col>
                  <Col md="4" className="text-right">
                    {shipment.saleStatus !== "ENVIADO" && shipment.saleStatus !== "ENTREGADO" && (
                      <Button
                        size="sm"
                        color="success"
                        disabled={progress.pending > 0 || receiptClosed}
                        onClick={() => setDispatchModal({ open: true, sale: shipment })}
                      >
                        Despachar
                      </Button>
                    )}
                    {shipment.saleStatus === "ENVIADO" && (
                      <Button
                        size="sm"
                        color="warning"
                        outline
                        disabled={saving}
                        onClick={() => void handleCancelDispatch(shipment)}
                      >
                        Anular envío
                      </Button>
                    )}
                  </Col>
                </Row>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {mode === "orders" && order.kioskShipments?.length > 0 && (
        <div className="mt-4">
          <h6>Envíos a kioscos</h6>
          {order.kioskShipments.map((shipment) => (
            <Card key={shipment.id} className="mb-2">
              <CardBody className="py-2">
                <strong>{shipment.shipmentNumber}</strong>
                {" · "}
                <Badge color={shipment.status === "CONFIRMED" ? "success" : "secondary"}>{shipment.status}</Badge>
                {shipment.locationName && <small className="d-block text-muted">{shipment.locationName}</small>}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      <DispatchModal
        isOpen={dispatchModal.open}
        sale={dispatchModal.sale}
        productionOrderId={order.productionOrderId}
        onClose={() => setDispatchModal({ open: false, sale: null })}
        onSuccess={async () => {
          setDispatchModal({ open: false, sale: null });
          await loadWorkspace();
          if (onRefresh) onRefresh();
        }}
        dispatchCustomerShipment={dispatchCustomerShipment}
      />
    </div>
  );
};

export default WarehouseOrderDetail;
