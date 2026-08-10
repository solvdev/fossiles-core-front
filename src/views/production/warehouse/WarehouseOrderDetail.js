import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Card, CardBody, Col, Input, Progress, Row, Spinner,
} from "reactstrap";
import {
  closeWarehouseReceipt,
  dispatchCustomerShipment,
  getWarehouseWorkspace,
  updateWarehouseUnitsReceipt,
} from "../../../services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatProductionOrderCodeDate } from "utils/productionOrderDisplayHelper";
import WarehouseUnitRow from "./WarehouseUnitRow";
import {
  DISPATCH_TYPE_LABELS,
  DISPATCH_TYPE_STYLES,
  SALE_STATUS_STYLES,
  DEFAULT_BADGE_STYLE,
  getOrderQtyProgress,
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
  const [unitDrafts, setUnitDrafts] = useState({});
  const [dispatchModal, setDispatchModal] = useState({ open: false, sale: null });
  const [unitSearch, setUnitSearch] = useState("");
  const [unitStatusFilter, setUnitStatusFilter] = useState(mode === "receipt" ? "PENDING" : "ALL");

  const loadWorkspace = useCallback(async () => {
    if (!order?.productionOrderId) return;
    setLoading(true);
    try {
      const data = await getWarehouseWorkspace(order.productionOrderId);
      setWorkspace(data);
      setUnitDrafts({});
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
    const filtered = units.filter((u) => {
      const status = u.receiptStatus || "PENDING";
      if (unitStatusFilter === "PENDING" && (status !== "PENDING" || u.shippedAt)) return false;
      if (unitStatusFilter === "RECEIVED" && status !== "RECEIVED") return false;
      if (unitStatusFilter === "REJECTED" && status !== "REJECTED") return false;
      if (!term) return true;
      const hay = `${u.unitLabel || ""} ${u.productCode || ""} ${u.productName || ""} ${u.colorName || ""}`
        .toLowerCase();
      return hay.includes(term);
    });
    return [...filtered].sort((a, b) => {
      const sa = (a.receiptStatus || "PENDING") === "PENDING" && !a.shippedAt ? 0 : 1;
      const sb = (b.receiptStatus || "PENDING") === "PENDING" && !b.shippedAt ? 0 : 1;
      if (sa !== sb) return sa - sb;
      return String(a.unitLabel || "").localeCompare(String(b.unitLabel || ""), "es", { numeric: true });
    });
  }, [units, unitSearch, unitStatusFilter]);

  const draftUpdates = useMemo(() => {
    return Object.values(unitDrafts).filter((d) => d?.receiptStatus && d.receiptStatus !== "PENDING");
  }, [unitDrafts]);

  const handleDraftChange = (unitId, draft) => {
    setUnitDrafts((prev) => ({ ...prev, [unitId]: draft }));
  };

  const buildReceiptPayload = (unitList) => ({
    units: unitList.map((u) => ({
      unitId: u.id,
      receiptStatus: unitDrafts[u.id]?.receiptStatus || "RECEIVED",
      rejectionReason: unitDrafts[u.id]?.rejectionReason,
    })),
  });

  const saveDrafts = async (unitList) => {
    const toSave = unitList.filter((u) => {
      const d = unitDrafts[u.id];
      return d?.receiptStatus && d.receiptStatus !== "PENDING";
    });
    if (toSave.length === 0) {
      showError("Seleccione al menos una pieza para actualizar.");
      return;
    }
    for (const u of toSave) {
      const d = unitDrafts[u.id];
      if (d.receiptStatus === "REJECTED" && !d.rejectionReason) {
        showError(`Indique motivo de rechazo para ${u.unitLabel}`);
        return;
      }
    }
    setSaving(true);
    try {
      await updateWarehouseUnitsReceipt(order.productionOrderId, buildReceiptPayload(toSave));
      showSuccess("Recepción actualizada.");
      await loadWorkspace();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "Error al guardar recepción");
    } finally {
      setSaving(false);
    }
  };

  const receiveAllPending = async () => {
    const updates = pendingUnits.map((u) => ({
      unitId: u.id,
      receiptStatus: "RECEIVED",
    }));
    if (updates.length === 0) return;
    setSaving(true);
    try {
      await updateWarehouseUnitsReceipt(order.productionOrderId, { units: updates });
      showSuccess(`${updates.length} pieza(s) recibidas.`);
      await loadWorkspace();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "Error al recibir piezas");
    } finally {
      setSaving(false);
    }
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
      </Alert>

      <Progress value={progress.pct} color={progress.pct >= 100 ? "success" : "info"} className="mb-3" style={{ height: 8 }} />

      {mode === "receipt" && !receiptClosed && (
        <div className="d-flex flex-wrap mb-3" style={{ gap: 8 }}>
          <Button size="sm" color="success" disabled={saving || draftUpdates.length === 0} onClick={() => saveDrafts(units.filter((u) => unitDrafts[u.id]))}>
            Guardar selección ({draftUpdates.length})
          </Button>
          <Button size="sm" color="success" outline disabled={saving || pendingUnits.length === 0} onClick={receiveAllPending}>
            Recibir todas pendientes ({pendingUnits.length})
          </Button>
          <Button size="sm" color="dark" outline disabled={saving || progress.pending > 0} onClick={handleCloseReceipt}>
            Cerrar recepción en bodega
          </Button>
        </div>
      )}

      {mode === "orders" && !receiptClosed && progress.pending === 0 && (
        <Button size="sm" color="dark" className="mb-3" disabled={saving} onClick={handleCloseReceipt}>
          Cerrar recepción en bodega
        </Button>
      )}

      <Row className="align-items-end mb-2">
        <Col md="6" className="mb-2 mb-md-0">
          <h6 className="mb-1">
            Piezas ({visibleUnits.length}
            {visibleUnits.length !== units.length ? ` de ${units.length}` : ""})
          </h6>
          {mode === "receipt" && (
            <Input
              type="search"
              bsSize="sm"
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
              placeholder="Filtrar piezas por código o producto…"
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

      {visibleUnits.length === 0 ? (
        <Alert color="info" className="py-2">
          No hay piezas con este filtro. Prueba “Todas” o limpia la búsqueda.
        </Alert>
      ) : (
        visibleUnits.map((unit) => (
          <WarehouseUnitRow
            key={unit.id}
            unit={{ ...unit, receiptClosed }}
            draft={unitDrafts[unit.id]}
            readOnly={mode === "orders" || receiptClosed}
            onDraftChange={(draft) => handleDraftChange(unit.id, draft)}
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
