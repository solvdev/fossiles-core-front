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
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import ShipmentDispatchStockModal from "components/distribution/ShipmentDispatchStockModal";
import { getColors } from "services/colorService";
import { getCustomers } from "services/customerService";
import { getCustomerAccountSummary } from "services/customerAccountService";
import {
  createDirectSaleShipment,
  getDirectSaleShipment,
  listDirectSaleShipments,
} from "services/directSaleShipmentService";
import { getProducts } from "services/productService";
import {
  cancelShipment,
  checkShipmentDispatchStock,
  previewDispatchStock,
  sendShipment,
} from "services/productDistributionService";
import { isCinchoInventoryProductByCodeAndName } from "utils/cinchoProductionHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const money = (value) =>
  `Q ${Number(value || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyLine = () => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: "",
  colorId: "",
  size: "",
  quantity: 1,
  unitPrice: "",
  stockHint: "",
  stockLoading: false,
});

const STATUS_META = {
  CONFIRMED: { color: "warning", label: "Por enviar" },
  SENT: { color: "success", label: "Enviado" },
  DELIVERED: { color: "success", label: "Entregado" },
  CANCELLED: { color: "secondary", label: "Anulado" },
};

const defaultPrice = (product) => {
  const seller = Number(product?.sellerPrice);
  if (Number.isFinite(seller) && seller > 0) return seller;
  const sale = Number(product?.salePrice);
  return Number.isFinite(sale) && sale > 0 ? sale : "";
};

/**
 * Envío directo a un cliente de Luis Felipe: se arma con lo que hay en Bodega PT o Devoluciones, sin OP, sin
 * recepción en bodega ni cajas. Al enviarlo descarga la bodega y carga el total a la cuenta por cobrar del cliente
 * (cartera OPV u OPC), igual que el despacho de una orden de Luis Felipe.
 */
function DirectSaleShipments() {
  const [customers, setCustomers] = useState([]);
  const [lfCustomerIds, setLfCustomerIds] = useState(new Set());
  const [onlyLf, setOnlyLf] = useState(true);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);

  const [customerId, setCustomerId] = useState("");
  const [kind, setKind] = useState("OPV");
  const [kindTouched, setKindTouched] = useState(false);
  const [source, setSource] = useState("PT");
  const [shippingCost, setShippingCost] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [saving, setSaving] = useState(false);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyDays, setHistoryDays] = useState(60);
  const [busyId, setBusyId] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const [dispatchCheck, setDispatchCheck] = useState(null);
  const [sendingWithFallback, setSendingWithFallback] = useState(false);

  useEffect(() => {
    setLoadingCatalog(true);
    Promise.all([
      getCustomers(),
      getCustomerAccountSummary({ luisFelipeOnly: true }).catch(() => []),
      getProducts(),
      getColors(),
    ])
      .then(([custs, lfSummary, prods, cols]) => {
        setCustomers(Array.isArray(custs) ? custs : []);
        setLfCustomerIds(new Set((Array.isArray(lfSummary) ? lfSummary : []).map((row) => Number(row.customerId))));
        setProducts(Array.isArray(prods) ? prods : []);
        setColors(Array.isArray(cols) ? cols : []);
      })
      .catch((err) => showError(err.message || "No se pudo cargar el catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      setHistory(await listDirectSaleShipments({ days: historyDays }));
    } catch (err) {
      showError(err.message);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyDays]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const customerOptions = useMemo(
    () =>
      customers
        .filter((c) => !onlyLf || lfCustomerIds.size === 0 || lfCustomerIds.has(Number(c.id)))
        .map((c) => ({
          value: String(c.id),
          label: `${c.legacyCode ? `${c.legacyCode} — ` : ""}${c.name || ""}${c.nit ? ` (NIT ${c.nit})` : ""}`,
          searchText: `${c.legacyCode || ""} ${c.name || ""} ${c.nit || ""}`,
        })),
    [customers, lfCustomerIds, onlyLf]
  );

  const productsById = useMemo(() => {
    const map = new Map();
    products.forEach((p) => map.set(Number(p.id), p));
    return map;
  }, [products]);

  const isCincho = (row) => {
    const product = productsById.get(Number(row.productId));
    return Boolean(product && isCinchoInventoryProductByCodeAndName(product.code, product.name));
  };

  const patchLine = (key, patch) =>
    setLines((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const refreshStock = async (row) => {
    const pid = Number(row.productId);
    if (!Number.isFinite(pid) || pid <= 0) return;
    patchLine(row.key, { stockLoading: true, stockHint: "Consultando…" });
    try {
      const preview = await previewDispatchStock({
        productId: pid,
        colorId: row.colorId || null,
        size: row.size || "",
      });
      const breakdown = (preview?.breakdown || [])
        .map((b) => `${b.locationName || b.locationCode}: ${Number(b.quantity || 0)}`)
        .join(" · ");
      patchLine(row.key, { stockLoading: false, stockHint: breakdown || "Sin stock" });
    } catch (err) {
      patchLine(row.key, { stockLoading: false, stockHint: err.message || "Sin stock" });
    }
  };

  const onProductSelected = (row, product) => {
    const next = {
      ...row,
      productId: product ? String(product.id) : "",
      unitPrice: product ? defaultPrice(product) : "",
      stockHint: "",
    };
    patchLine(row.key, next);
    if (product) {
      refreshStock(next);
      // Todo cincho → cartera GCF (OPC), mientras el usuario no haya elegido a mano.
      if (!kindTouched) {
        const all = lines.map((l) => (l.key === row.key ? next : l)).filter((l) => l.productId);
        setKind(all.length > 0 && all.every((l) => isCincho(l)) ? "OPC" : "OPV");
      }
    }
  };

  const onColorSelected = (row, color) => {
    const next = { ...row, colorId: color ? String(color.id) : "", stockHint: "" };
    patchLine(row.key, next);
    if (next.productId) refreshStock(next);
  };

  const validLines = lines.filter((row) => Number(row.productId) > 0 && Number(row.quantity) > 0);
  const productsTotal = validLines.reduce(
    (sum, row) => sum + Number(row.quantity || 0) * Number(row.unitPrice || 0),
    0
  );
  const shipping = Number(shippingCost) > 0 ? Number(shippingCost) : 0;
  const totalUnits = validLines.reduce((sum, row) => sum + Number(row.quantity || 0), 0);

  const resetForm = () => {
    setCustomerId("");
    setKind("OPV");
    setKindTouched(false);
    setShippingCost("");
    setNotes("");
    setLines([emptyLine()]);
  };

  /** Envía: si la bodega elegida no alcanza, muestra el desglose para elegir por línea. */
  const sendCreated = async (shipmentId) => {
    let check = null;
    try {
      check = await checkShipmentDispatchStock(shipmentId);
    } catch (err) {
      check = null;
    }
    if (check?.hasShortage && check?.fallbackAvailable) {
      setDispatchCheck(check);
      return false;
    }
    await sendShipment(shipmentId);
    return true;
  };

  const handleCreate = async (andSend) => {
    if (!customerId) {
      showError("Elija el cliente");
      return;
    }
    if (validLines.length === 0) {
      showError("Agregue al menos un producto con cantidad");
      return;
    }
    const missingSize = validLines.find((row) => isCincho(row) && !String(row.size || "").trim());
    if (missingSize) {
      showError("Los cinchos necesitan talla");
      return;
    }
    const noPrice = validLines.find((row) => !(Number(row.unitPrice) > 0));
    if (noPrice) {
      showError("Todas las líneas necesitan precio");
      return;
    }
    setSaving(true);
    try {
      const created = await createDirectSaleShipment({
        customerId: Number(customerId),
        kind,
        source,
        shippingCost: shipping > 0 ? shipping : null,
        notes: notes.trim() || null,
        lines: validLines.map((row) => ({
          productId: Number(row.productId),
          colorId: row.colorId ? Number(row.colorId) : null,
          size: String(row.size || "").trim().toUpperCase() || null,
          quantity: Number(row.quantity),
          unitPrice: Number(row.unitPrice),
        })),
      });
      resetForm();
      if (andSend) {
        try {
          const sent = await sendCreated(created.id);
          if (sent) showSuccess(`${created.shipmentNumber} enviado y cargado a cuentas por cobrar.`);
        } catch (err) {
          showError(`${created.shipmentNumber} quedó creado pero no se envió: ${err.message}`);
        }
      } else {
        showSuccess(`${created.shipmentNumber} creado. Envíelo desde la lista para descargar y cobrar.`);
      }
      await loadHistory();
    } catch (err) {
      showError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (row) => {
    setBusyId(row.id);
    try {
      const sent = await sendCreated(row.id);
      if (sent) {
        showSuccess(`${row.shipmentNumber} enviado y cargado a cuentas por cobrar.`);
        await loadHistory();
      }
    } catch (err) {
      showError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmSendWithFallback = async (sources) => {
    if (!dispatchCheck?.shipmentId) return;
    setSendingWithFallback(true);
    try {
      await sendShipment(dispatchCheck.shipmentId, sources);
      showSuccess(`${dispatchCheck.shipmentNumber || "Envío"} enviado y cargado a cuentas por cobrar.`);
      setDispatchCheck(null);
      await loadHistory();
    } catch (err) {
      showError(err.message);
    } finally {
      setSendingWithFallback(false);
    }
  };

  const handleCancel = async (row) => {
    const sent = row.status === "SENT";
    const message = sent
      ? `¿Anular ${row.shipmentNumber}? El producto regresa a la bodega y se anula el cargo en cuentas por cobrar (si ya tiene pagos aplicados no se puede).`
      : `¿Anular ${row.shipmentNumber}?`;
    if (!window.confirm(message)) return;
    setBusyId(row.id);
    try {
      await cancelShipment(row.id);
      showSuccess(`${row.shipmentNumber} anulado.`);
      await loadHistory();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const toggleDetail = async (row) => {
    if (expanded?.id === row.id) {
      setExpanded(null);
      return;
    }
    try {
      setExpanded(await getDirectSaleShipment(row.id));
    } catch (err) {
      showError(err.message);
    }
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Envío directo Luis Felipe</CardTitle>
          <p className="text-muted mb-0">
            Para mandar a un cliente de Luis Felipe lo que ya hay en bodega, sin OPV/OPC, sin recepción ni cajas. Al
            enviarlo sale de la bodega elegida y el total entra a la cuenta por cobrar del cliente.
          </p>
        </CardHeader>
        <CardBody>
          {loadingCatalog ? (
            <div className="text-muted py-3">
              <Spinner size="sm" /> Cargando clientes y productos…
            </div>
          ) : (
            <>
              <Row>
                <Col md="5">
                  <FormGroup>
                    <Label>Cliente</Label>
                    <FilterableSelect
                      value={customerId}
                      onChange={setCustomerId}
                      options={customerOptions}
                      placeholder="Buscar cliente…"
                      emptyLabel="— Elija el cliente —"
                    />
                    <FormGroup check className="mt-1">
                      <Label check className="small">
                        <Input type="checkbox" checked={onlyLf} onChange={(e) => setOnlyLf(e.target.checked)} />{" "}
                        Solo clientes de Luis Felipe
                      </Label>
                    </FormGroup>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Cartera</Label>
                    <Input
                      type="select"
                      value={kind}
                      onChange={(e) => {
                        setKind(e.target.value);
                        setKindTouched(true);
                      }}
                    >
                      <option value="OPV">OPV · Fossiles</option>
                      <option value="OPC">OPC · GCF (cinchos y marcas)</option>
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup>
                    <Label>Sale de</Label>
                    <Input type="select" value={source} onChange={(e) => setSource(e.target.value)}>
                      <option value="PT">Bodega PT</option>
                      <option value="RETURNS">Devoluciones</option>
                    </Input>
                    <small className="text-muted">Los cinchos salen siempre de Bodega PT.</small>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Costo de envío (opcional)</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={shippingCost}
                      onChange={(e) => setShippingCost(e.target.value)}
                      placeholder="0.00"
                    />
                  </FormGroup>
                </Col>
              </Row>

              <Table size="sm" responsive className="mb-2">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Producto</th>
                    <th style={{ minWidth: 150 }}>Color</th>
                    <th style={{ width: 90 }}>Talla</th>
                    <th style={{ width: 80 }}>Cant.</th>
                    <th style={{ width: 110 }}>Precio</th>
                    <th className="text-right" style={{ width: 110 }}>
                      Subtotal
                    </th>
                    <th>Stock</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((row) => {
                    const cincho = isCincho(row);
                    return (
                      <tr key={row.key}>
                        <td>
                          <ProductSelector
                            products={products}
                            value={row.productId}
                            onChange={(product) => onProductSelected(row, product)}
                            fluid
                          />
                        </td>
                        <td>
                          <ColorSelector
                            colors={colors}
                            value={row.colorId}
                            disabled={!row.productId}
                            onChange={(color) => onColorSelected(row, color)}
                            fluid
                          />
                        </td>
                        <td>
                          <Input
                            bsSize="sm"
                            value={row.size}
                            disabled={!row.productId}
                            placeholder={cincho ? "Ej: 34" : "Opcional"}
                            onChange={(e) => patchLine(row.key, { size: e.target.value.toUpperCase() })}
                            onBlur={() => refreshStock(row)}
                          />
                        </td>
                        <td>
                          <Input
                            bsSize="sm"
                            type="number"
                            min={1}
                            step={1}
                            value={row.quantity}
                            onChange={(e) => patchLine(row.key, { quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <Input
                            bsSize="sm"
                            type="number"
                            min={0}
                            step="0.01"
                            value={row.unitPrice}
                            disabled={!row.productId}
                            onChange={(e) => patchLine(row.key, { unitPrice: e.target.value })}
                          />
                        </td>
                        <td className="text-right">
                          {money(Number(row.quantity || 0) * Number(row.unitPrice || 0))}
                        </td>
                        <td className="small text-muted">
                          {row.stockLoading ? <Spinner size="sm" /> : row.stockHint || "—"}
                        </td>
                        <td>
                          <Button
                            close
                            title="Quitar"
                            onClick={() =>
                              setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== row.key)))
                            }
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
              <Button size="sm" color="link" className="px-0" onClick={() => setLines((p) => [...p, emptyLine()])}>
                + Agregar producto
              </Button>

              <Row className="mt-3 align-items-end">
                <Col md="6">
                  <FormGroup className="mb-0">
                    <Label>Observaciones</Label>
                    <Input
                      type="textarea"
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Opcional"
                    />
                  </FormGroup>
                </Col>
                <Col md="6" className="text-right">
                  <div className="mb-2">
                    <div className="text-muted small">
                      {totalUnits} unidades · productos {money(productsTotal)}
                      {shipping > 0 ? ` · envío ${money(shipping)}` : ""}
                    </div>
                    <div>
                      <strong>Cargo a cuentas por cobrar: {money(productsTotal + shipping)}</strong>
                    </div>
                  </div>
                  <Button color="secondary" outline disabled={saving} onClick={() => handleCreate(false)}>
                    Solo crear
                  </Button>{" "}
                  <Button color="primary" disabled={saving} onClick={() => handleCreate(true)}>
                    {saving ? <Spinner size="sm" /> : "Crear y enviar"}
                  </Button>
                </Col>
              </Row>
            </>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="d-flex justify-content-between align-items-center flex-wrap">
          <CardTitle tag="h5" className="mb-0">
            Envíos directos
          </CardTitle>
          <div className="d-flex align-items-center">
            <Input
              type="select"
              bsSize="sm"
              style={{ width: 160 }}
              value={historyDays}
              onChange={(e) => setHistoryDays(Number(e.target.value))}
            >
              <option value={30}>Últimos 30 días</option>
              <option value={60}>Últimos 60 días</option>
              <option value={180}>Últimos 6 meses</option>
              <option value={365}>Último año</option>
            </Input>
            <Button size="sm" color="link" onClick={loadHistory} disabled={loadingHistory}>
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardBody>
          {loadingHistory ? (
            <Spinner size="sm" />
          ) : history.length === 0 ? (
            <Alert color="light" className="mb-0">
              No hay envíos directos en este periodo.
            </Alert>
          ) : (
            <Table size="sm" responsive hover>
              <thead>
                <tr>
                  <th>Envío</th>
                  <th>Cliente</th>
                  <th>Cartera</th>
                  <th>Sale de</th>
                  <th className="text-right">Unid.</th>
                  <th className="text-right">Productos</th>
                  <th className="text-right">Cargo CxC</th>
                  <th>Estado</th>
                  <th>Creado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((row) => {
                  const meta = STATUS_META[row.status] || { color: "light", label: row.status };
                  const busy = busyId === row.id;
                  return (
                    <React.Fragment key={row.id}>
                      <tr>
                        <td>
                          <Button color="link" size="sm" className="p-0" onClick={() => toggleDetail(row)}>
                            {row.shipmentNumber}
                          </Button>
                        </td>
                        <td>{row.customerName}</td>
                        <td>{row.kind === "OPC" ? "OPC · GCF" : "OPV · Fossiles"}</td>
                        <td>{row.sourceLabel}</td>
                        <td className="text-right">{row.units}</td>
                        <td className="text-right">{money(row.productsTotal)}</td>
                        <td className="text-right">{row.chargeAmount != null ? money(row.chargeAmount) : "—"}</td>
                        <td>
                          <Badge color={meta.color}>{meta.label}</Badge>
                        </td>
                        <td className="small">
                          {formatDateTimeGt(row.createdAt)}
                          {row.createdByName ? <div className="text-muted">{row.createdByName}</div> : null}
                        </td>
                        <td className="text-nowrap">
                          {row.status === "CONFIRMED" ? (
                            <Button size="sm" color="primary" disabled={busy} onClick={() => handleSend(row)}>
                              Enviar
                            </Button>
                          ) : null}{" "}
                          {row.status === "CONFIRMED" || row.status === "SENT" ? (
                            <Button size="sm" color="danger" outline disabled={busy} onClick={() => handleCancel(row)}>
                              Anular
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                      {expanded?.id === row.id ? (
                        <tr>
                          <td colSpan={10} className="bg-light">
                            <Table size="sm" className="mb-1">
                              <thead>
                                <tr>
                                  <th>Producto</th>
                                  <th>Color</th>
                                  <th>Talla</th>
                                  <th className="text-right">Cant.</th>
                                  <th className="text-right">Precio</th>
                                  <th className="text-right">Subtotal</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(expanded.lines || []).map((line) => (
                                  <tr key={line.detailId}>
                                    <td>
                                      {line.productCode} — {line.productName}
                                    </td>
                                    <td>{line.colorName || "—"}</td>
                                    <td>{line.size || "—"}</td>
                                    <td className="text-right">{Number(line.quantity)}</td>
                                    <td className="text-right">{money(line.unitPrice)}</td>
                                    <td className="text-right">{money(line.subtotal)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                            {expanded.shippingCost ? (
                              <div className="small">Costo de envío: {money(expanded.shippingCost)}</div>
                            ) : null}
                            {expanded.notes ? <div className="small text-muted">{expanded.notes}</div> : null}
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <ShipmentDispatchStockModal
        isOpen={Boolean(dispatchCheck)}
        check={dispatchCheck}
        sending={sendingWithFallback}
        onCancel={() => {
          setDispatchCheck(null);
          loadHistory();
        }}
        onConfirm={handleConfirmSendWithFallback}
      />
    </div>
  );
}

export default DirectSaleShipments;
