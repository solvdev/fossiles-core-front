import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Row,
  Table,
  Badge,
  CustomInput,
} from "reactstrap";
import { getProductionOrderById } from "services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import { classifyPrepareOrder } from "utils/prepareShipmentsOrderHelper";
import {
  downloadProductionOrdersBatchExcel,
  getTypeLabel,
  openProductionOrdersBatchPrintWindow,
  parseOpCodeParts,
  sortProductionOrdersByCode,
} from "utils/productionOrderBatchPrintHtml";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import { projectOrdersToOrganizerDay } from "utils/organizerDayTasks";
import { formatDateGt } from "utils/dateTimeHelper";

const orderKey = (id) => String(id);

const TYPE_FILTER_OPTIONS = [
  { value: "ALL", label: "Todos los tipos" },
  { value: "OPCK", label: "OPCK (kiosko)" },
  { value: "OPC", label: "OPC (cinchos)" },
  { value: "OPI", label: "OPI (interna)" },
  { value: "OPV", label: "OPV (vendedor)" },
  { value: "OPK", label: "OPK" },
  { value: "OPL", label: "OPL (en línea)" },
  { value: "OPD", label: "OPD (distribución)" },
];

function displayTipo(order) {
  const code = String(order?.code || "").toUpperCase();
  if (code.startsWith("OPK-")) return "OPK";
  if (code.startsWith("OPL-")) return "OPL";
  if (code.startsWith("OPD-")) return "OPD";
  const kind = classifyPrepareOrder(order);
  if (kind) return kind;
  return getTypeLabel(order?.orderType) || "—";
}

function matchesTypeFilter(order, typeFilter) {
  if (typeFilter === "ALL") return true;
  const code = String(order?.code || "").toUpperCase();
  if (typeFilter === "OPK") return code.startsWith("OPK");
  if (typeFilter === "OPL") return code.startsWith("OPL") || order?.orderType === "VENTA_EN_LINEA";
  if (typeFilter === "OPD") return code.startsWith("OPD") || order?.orderType === "DISTRIBUTION";
  return classifyPrepareOrder(order) === typeFilter;
}

function DownloadOpsModal({ isOpen, toggle, orders, tasks, dayDeskTasks = null, workDateYmd = null }) {
  const [prefixFilter, setPrefixFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [fromNum, setFromNum] = useState("");
  const [toNum, setToNum] = useState("");
  const [selectedIds, setSelectedIds] = useState({});
  const [printOrientation, setPrintOrientation] = useState("portrait");
  const [includeSummaryBox, setIncludeSummaryBox] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const scopeToOrganizerDay = Array.isArray(dayDeskTasks);
  const dayOrderIdSet = useMemo(() => {
    if (!scopeToOrganizerDay) return null;
    return new Set(
      dayDeskTasks
        .map((t) => Number(t.productionOrderId))
        .filter((id) => Number.isFinite(id))
    );
  }, [scopeToOrganizerDay, dayDeskTasks]);

  const scopedOrders = useMemo(() => {
    if (!dayOrderIdSet) return orders || [];
    return (orders || []).filter((o) => dayOrderIdSet.has(Number(o.id)));
  }, [orders, dayOrderIdSet]);

  const sortedOrders = useMemo(() => sortProductionOrdersByCode(scopedOrders), [scopedOrders]);

  const prefixOptions = useMemo(() => {
    const set = new Set();
    sortedOrders.forEach((o) => {
      const { prefix } = parseOpCodeParts(o.code);
      if (prefix) set.add(prefix);
    });
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b, "es"))];
  }, [sortedOrders]);

  const filteredOrders = useMemo(() => {
    const from = fromNum.trim() === "" ? null : Number(fromNum);
    const to = toNum.trim() === "" ? null : Number(toNum);
    return sortedOrders.filter((o) => {
      const { prefix, number } = parseOpCodeParts(o.code);
      if (prefixFilter !== "ALL" && prefix !== prefixFilter) return false;
      if (!matchesTypeFilter(o, typeFilter)) return false;
      if (from != null && Number.isFinite(from) && (number == null || number < from)) return false;
      if (to != null && Number.isFinite(to) && (number == null || number > to)) return false;
      return true;
    });
  }, [sortedOrders, prefixFilter, typeFilter, fromNum, toNum]);

  useEffect(() => {
    if (!isOpen) return;
    setPrefixFilter("ALL");
    setTypeFilter("ALL");
    setFromNum("");
    setToNum("");
    setPrintOrientation("portrait");
    setIncludeSummaryBox(true);
    if (scopeToOrganizerDay) {
      const next = {};
      sortedOrders.forEach((o) => {
        next[orderKey(o.id)] = true;
      });
      setSelectedIds(next);
    } else {
      setSelectedIds({});
    }
  }, [isOpen, scopeToOrganizerDay, sortedOrders]);

  const selectedCount = Object.keys(selectedIds).filter((k) => selectedIds[k]).length;
  const visibleSelectedCount = filteredOrders.filter((o) => selectedIds[orderKey(o.id)]).length;
  const allVisibleSelected =
    filteredOrders.length > 0 && filteredOrders.every((o) => selectedIds[orderKey(o.id)]);

  const toggleOrder = (id) => {
    const k = orderKey(id);
    setSelectedIds((prev) => ({ ...prev, [k]: !prev[k] }));
  };

  const setVisibleSelection = (checked) => {
    setSelectedIds((prev) => {
      const copy = { ...prev };
      filteredOrders.forEach((o) => {
        copy[orderKey(o.id)] = checked;
      });
      return copy;
    });
  };

  const toggleAllVisible = () => setVisibleSelection(!allVisibleSelected);

  const resolveSelectedOrders = async () => {
    const picked = sortedOrders.filter((o) => selectedIds[orderKey(o.id)]);
    if (!picked.length) return [];
    const enriched = await Promise.all(
      picked.map(async (o) => {
        if (Array.isArray(o.items) && o.items.length > 0) return o;
        try {
          return await getProductionOrderById(o.id);
        } catch {
          return o;
        }
      })
    );
    if (scopeToOrganizerDay) {
      return projectOrdersToOrganizerDay(enriched, dayDeskTasks);
    }
    return enriched;
  };

  const handlePrint = async () => {
    if (selectedCount === 0) {
      showError("Marque al menos una orden en la lista.");
      return;
    }
    setLoadingAction(true);
    try {
      const list = await resolveSelectedOrders();
      const ok = openProductionOrdersBatchPrintWindow(list, {
        tasks,
        orientation: printOrientation,
        includeSummary: includeSummaryBox,
      });
      if (!ok) {
        showError("Permita ventanas emergentes para imprimir.");
        return;
      }
      showSuccess(`${list.length} orden(es) listas para imprimir.`);
    } catch (err) {
      showError(err.message || "No se pudo preparar la impresión");
    } finally {
      setLoadingAction(false);
    }
  };

  const handleExcel = async () => {
    if (selectedCount === 0) {
      showError("Marque al menos una orden en la lista.");
      return;
    }
    setLoadingAction(true);
    try {
      const list = await resolveSelectedOrders();
      downloadProductionOrdersBatchExcel(list, tasks);
      showSuccess(`Excel generado (${list.length} OP).`);
    } catch (err) {
      showError(err.message || "No se pudo generar el Excel");
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Descargar / imprimir OPs</ModalHeader>
      <ModalBody>
        <Alert color="light" className="py-2 mb-3">
          {scopeToOrganizerDay ? (
            <>
              Solo OPs con tareas del <strong>organizador</strong> para{" "}
              <strong>{workDateYmd ? formatDateGt(workDateYmd) : "la fecha de trabajo"}</strong>.
              Excel e impresión incluyen únicamente las líneas/cantidades asignadas a mesa ese día
              (no la OP completa).
            </>
          ) : (
            <>
              Filtre por prefijo y rango, marque las OP y use <strong>Imprimir</strong>: un documento con tabla
              <strong> consolidada</strong> (mismo código/color/talla entre órdenes se suma en una fila). El resumen de
              clientes es opcional.
            </>
          )}
        </Alert>

        <div className="border rounded p-3 mb-3" style={{ backgroundColor: "#f8f9fa" }}>
          <div className="mb-2 text-primary">
            <strong>Opciones de impresión</strong>
          </div>
          <Row>
            <Col md="5">
              <FormGroup className="mb-md-0">
                <Label className="mb-1">
                  <strong>Orientación</strong>
                </Label>
                <Input
                  type="select"
                  value={printOrientation}
                  onChange={(e) => setPrintOrientation(e.target.value)}
                >
                  <option value="portrait">Vertical</option>
                  <option value="landscape">Horizontal</option>
                </Input>
              </FormGroup>
            </Col>
            <Col md="7" className="d-flex align-items-center">
              <CustomInput
                type="checkbox"
                id="download-ops-include-summary"
                label="Incluir cuadro de resumen (cliente, vendedor, entrega, total uds.)"
                checked={includeSummaryBox}
                onChange={(e) => setIncludeSummaryBox(e.target.checked)}
                className="mb-0"
              />
            </Col>
          </Row>
        </div>

        <Row className="mb-3">
          <Col md="3">
            <FormGroup className="mb-0">
              <Label className="mb-1">
                <strong>Prefijo OP</strong>
              </Label>
              <Input type="select" value={prefixFilter} onChange={(e) => setPrefixFilter(e.target.value)}>
                {prefixOptions.map((p) => (
                  <option key={p} value={p}>
                    {p === "ALL" ? "Todos" : p}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup className="mb-0">
              <Label className="mb-1">
                <strong>Desde N°</strong>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="5"
                value={fromNum}
                onChange={(e) => setFromNum(e.target.value)}
              />
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup className="mb-0">
              <Label className="mb-1">
                <strong>Hasta N°</strong>
              </Label>
              <Input
                type="number"
                min="0"
                placeholder="18"
                value={toNum}
                onChange={(e) => setToNum(e.target.value)}
              />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup className="mb-0">
              <Label className="mb-1">
                <strong>Tipo</strong>
              </Label>
              <Input type="select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                {TYPE_FILTER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="2" className="d-flex align-items-end">
            <Button color="info" outline size="sm" block className="mb-0" onClick={() => setVisibleSelection(true)}>
              + Visibles
            </Button>
          </Col>
        </Row>

        <div className="d-flex flex-wrap align-items-center mb-2" style={{ gap: 8 }}>
          <span className="text-muted small">
            Listado: <strong>{filteredOrders.length}</strong> de {sortedOrders.length} · Marcadas:{" "}
            <strong>{selectedCount}</strong>
            {filteredOrders.length > 0 ? ` (${visibleSelectedCount} en filtro)` : ""}
          </span>
          <Button color="secondary" outline size="sm" onClick={toggleAllVisible} disabled={!filteredOrders.length}>
            {allVisibleSelected ? "Quitar visibles" : "Marcar visibles"}
          </Button>
          <Button color="secondary" outline size="sm" onClick={() => setSelectedIds({})}>
            Limpiar selección
          </Button>
        </div>

        <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid #dee2e6", borderRadius: 4 }}>
          <Table size="sm" hover className="mb-0">
            <thead className="text-primary" style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
              <tr>
                <th style={{ width: 44 }} className="text-center">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={!filteredOrders.length}
                    title="Marcar o quitar todas las visibles"
                    style={{ width: 18, height: 18, cursor: "pointer" }}
                  />
                </th>
                <th>Código</th>
                <th>Tipo</th>
                <th>Cliente</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted text-center py-4">
                    {scopeToOrganizerDay
                      ? "No hay OPs con tareas del organizador (mesa + fecha) para este día."
                      : "No hay órdenes con ese prefijo/rango/tipo."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const checked = Boolean(selectedIds[orderKey(order.id)]);
                  return (
                    <tr
                      key={order.id}
                      onClick={() => toggleOrder(order.id)}
                      style={{ cursor: "pointer", backgroundColor: checked ? "#e8f4fd" : undefined }}
                    >
                      <td className="text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOrder(order.id)}
                          style={{ width: 18, height: 18, cursor: "pointer" }}
                          aria-label={`Seleccionar ${order.code}`}
                        />
                      </td>
                      <td>
                        <strong>{order.code || order.id}</strong>
                      </td>
                      <td>
                        <Badge color={isCinchoOrderType(order.orderType) ? "primary" : "info"}>
                          {displayTipo(order)}
                        </Badge>
                      </td>
                      <td>{order.customerName || order.distributionNumber || "—"}</td>
                      <td>{order.status || "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </Table>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={loadingAction}>
          Cerrar
        </Button>
        <Button color="info" onClick={handleExcel} disabled={loadingAction || selectedCount === 0}>
          Descargar Excel ({selectedCount})
        </Button>
        <Button color="primary" onClick={handlePrint} disabled={loadingAction || selectedCount === 0}>
          Imprimir ({selectedCount})
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function mergeOrdersForDownload(centerOrders, cinchoOrders) {
  const map = new Map();
  [...(centerOrders || []), ...(cinchoOrders || [])].forEach((o) => {
    if (o?.id != null) map.set(Number(o.id), o);
  });
  return sortProductionOrdersByCode(Array.from(map.values()));
}

export default DownloadOpsModal;
