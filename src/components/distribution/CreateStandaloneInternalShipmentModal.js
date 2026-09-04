import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Spinner,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getColors } from "services/colorService";
import { getEmployees } from "services/employeeService";
import { getProducts } from "services/productService";
import {
  createInternalShipmentRequest,
  getInternalShipmentEligibility,
} from "services/internalShipmentRequestService";
import { previewDispatchStock } from "services/productDistributionService";
import { isCinchoInventoryProductByCodeAndName } from "utils/cinchoProductionHelper";
import {
  computeInternalEnviUnitPrice,
  PAYMENT_METHOD_LABELS,
} from "utils/standaloneInternalShipmentHelper";
import { getDefaultShipmentDocumentDate } from "utils/prepareShipmentsOrderHelper";
import { showError, showSuccess } from "utils/notificationHelper";

const ADMIN_PAYMENT_METHODS = ["EFECTIVO", "TRANSFERENCIA", "DEPOSITO", "DESCUENTO_PLANILLA"];

const emptyLine = () => ({
  key: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  productId: "",
  colorId: "",
  size: "",
  quantity: 1,
  stockHint: "",
  stockLoading: false,
});

function CreateStandaloneInternalShipmentModal({ isOpen, toggle, onCreated }) {
  const [slipNumber, setSlipNumber] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [planillaEligibility, setPlanillaEligibility] = useState(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [recipientTaxId, setRecipientTaxId] = useState("");
  const [notes, setNotes] = useState("");
  const [documentDate, setDocumentDate] = useState(() => getDefaultShipmentDocumentDate());
  const [area, setArea] = useState("PRODUCCION");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [lines, setLines] = useState([emptyLine()]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [colors, setColors] = useState([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [saving, setSaving] = useState(false);

  const resetForm = useCallback(() => {
    setSlipNumber("");
    setRecipientName("");
    setEmployeeId("");
    setPlanillaEligibility(null);
    setRecipientPhone("");
    setRecipientTaxId("");
    setNotes("");
    setDocumentDate(getDefaultShipmentDocumentDate());
    setArea("PRODUCCION");
    setPaymentMethod("");
    setLines([emptyLine()]);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    resetForm();
    setLoadingCatalog(true);
    Promise.all([getProducts(), getColors(), getEmployees()])
      .then(([prods, cols, emps]) => {
        setProducts(prods || []);
        setColors(cols || []);
        setEmployees(emps || []);
      })
      .catch((err) => showError(err.message || "No se pudo cargar catálogo"))
      .finally(() => setLoadingCatalog(false));
  }, [isOpen, resetForm]);

  const employeeOptions = useMemo(
    () => (employees || []).map((emp) => ({
      value: String(emp.id),
      label: `${emp.firstName || ""} ${emp.lastName || ""}`.trim() || `Empleado #${emp.id}`,
    })),
    [employees]
  );

  useEffect(() => {
    if (!employeeId) {
      setPlanillaEligibility(null);
      return;
    }
    const month = documentDate ? String(documentDate).slice(0, 7) : undefined;
    let cancelled = false;
    setCheckingEligibility(true);
    getInternalShipmentEligibility(Number(employeeId), month)
      .then((data) => {
        if (!cancelled) setPlanillaEligibility(data);
      })
      .catch(() => {
        if (!cancelled) setPlanillaEligibility(null);
      })
      .finally(() => {
        if (!cancelled) setCheckingEligibility(false);
      });
    return () => {
      cancelled = true;
    };
  }, [employeeId, documentDate]);

  const refreshLineStock = async (line) => {
    const pid = Number(line.productId);
    if (!Number.isFinite(pid) || pid <= 0) {
      return { ...line, stockHint: "", stockLoading: false };
    }
    try {
      const preview = await previewDispatchStock({
        productId: pid,
        colorId: line.colorId || null,
        size: line.size || "",
      });
      const breakdown = (preview?.breakdown || [])
        .map((b) => `${b.locationName || b.locationCode}: ${Number(b.quantity || 0)}`)
        .join(" · ");
      const hint = `Disp. ${Number(preview?.availableTotal || 0)} (${breakdown || "PT/Devoluciones"})`;
      return { ...line, stockHint: hint, stockLoading: false };
    } catch (err) {
      return { ...line, stockHint: err.message || "Sin stock", stockLoading: false };
    }
  };

  const patchLine = (key, patch) => {
    setLines((prev) =>
      prev.map((row) => (row.key === key ? { ...row, ...patch } : row))
    );
  };

  const productsById = useMemo(() => {
    const map = new Map();
    (products || []).forEach((p) => map.set(Number(p.id), p));
    return map;
  }, [products]);

  const getLineProduct = (row) => productsById.get(Number(row.productId));

  const isLineCincho = (row) => {
    const product = getLineProduct(row);
    if (!product) return false;
    return isCinchoInventoryProductByCodeAndName(product.code, product.name);
  };

  const refreshLineStockByKey = async (key, rowOverride) => {
    const row = rowOverride || lines.find((l) => l.key === key);
    if (!row) return;
    patchLine(key, { stockLoading: true, stockHint: "Consultando…" });
    const updated = await refreshLineStock(row);
    patchLine(key, { stockHint: updated.stockHint, stockLoading: updated.stockLoading });
  };

  const onProductSelected = async (key, product) => {
    const productId = product ? String(product.id) : "";
    const nextRow = {
      ...(lines.find((l) => l.key === key) || {}),
      productId,
      stockHint: "",
    };
    patchLine(key, { productId, stockHint: "" });
    if (product) await refreshLineStockByKey(key, nextRow);
  };

  const onColorSelected = async (key, color) => {
    const colorId = color ? String(color.id) : "";
    const row = lines.find((l) => l.key === key);
    if (!row) return;
    const nextRow = { ...row, colorId, stockHint: "" };
    patchLine(key, { colorId, stockHint: "" });
    if (row.productId) await refreshLineStockByKey(key, nextRow);
  };

  const onLineFieldBlur = async (key) => {
    const row = lines.find((l) => l.key === key);
    if (!row) return;
    patchLine(key, { stockLoading: true, stockHint: "Consultando…" });
    const updated = await refreshLineStock(row);
    patchLine(key, { stockHint: updated.stockHint, stockLoading: updated.stockLoading });
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);

  const removeLine = (key) => {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.key !== key)));
  };

  const getPricingMeta = () =>
    area === "PRODUCCION"
      ? { requestType: "PLANILLA", discountPercent: 50 }
      : { requestType: "ADMINISTRACION", discountPercent: 100 };

  const handleSubmit = async () => {
    if (!employeeId) {
      showError("Seleccione un colaborador");
      return;
    }
    if (planillaEligibility && planillaEligibility.eligible === false) {
      showError(planillaEligibility.message || "El colaborador ya tiene una solicitud este mes.");
      return;
    }
    if (area === "ADMINISTRACION" && !paymentMethod) {
      showError("Seleccione la forma de pago");
      return;
    }

    if (!String(slipNumber || "").trim()) {
      showError("Debe ingresar el número de boleta física de solicitud (BLS).");
      return;
    }
    const payloadLines = lines
      .map((row) => ({
        productId: Number(row.productId),
        colorId: row.colorId ? Number(row.colorId) : null,
        size: String(row.size || "").trim().toUpperCase(),
        quantity: Number(row.quantity) || 0,
        rowKey: row.key,
      }))
      .filter((row) => Number.isFinite(row.productId) && row.productId > 0 && row.quantity > 0);

    if (payloadLines.length === 0) {
      showError("Agregue al menos un producto con cantidad mayor a cero");
      return;
    }

    for (const row of payloadLines) {
      const source = lines.find((l) => l.key === row.rowKey);
      if (source && isLineCincho(source) && !row.size) {
        const product = getLineProduct(source);
        showError(`Indique talla para ${product?.code || "cincho"} — ${product?.name || "producto"}`);
        return;
      }
    }

    const productsPayload = payloadLines.map(({ rowKey, ...rest }) => rest);
    const pricingMeta = getPricingMeta();
    setSaving(true);
    try {
      const created = await createInternalShipmentRequest({
        requestType: pricingMeta.requestType,
        area,
        paymentMethod: area === "PRODUCCION" ? "DESCUENTO_PLANILLA" : paymentMethod,
        slipNumber: String(slipNumber).trim(),
        employeeId: Number(employeeId),
        recipientPhone: recipientPhone.trim() || null,
        recipientTaxId: recipientTaxId.trim() || null,
        notes: notes.trim() || null,
        documentDate: documentDate || null,
        products: productsPayload,
      });
      showSuccess(
        created?.productionOrderCode
          ? `Solicitud #${created?.id || ""} enviada a Contabilidad. Se generó ${created.productionOrderCode} por faltante de stock.`
          : `Solicitud #${created?.id || ""} enviada a Contabilidad para autorización`
      );
      toggle();
      if (onCreated) onCreated(created);
    } catch (err) {
      showError(err.message || "No se pudo crear la solicitud");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>Solicitud de envío interno (ENVI)</ModalHeader>
      <ModalBody>
        <Alert color="info" className="py-2">
          La solicitud queda <strong>pendiente</strong> hasta que Contabilidad la autorice. Al aprobarse se genera el
          número <strong>ENVI</strong> y se descuenta de Devoluciones / Bodega PT. Si no hay stock disponible, se crea
          automáticamente una <strong>OPI</strong> para producir el faltante.
        </Alert>
        {loadingCatalog && (
          <div className="text-center py-3">
            <Spinner size="sm" /> Cargando catálogo…
          </div>
        )}
        <Row>
          <Col md="12">
            <FormGroup tag="fieldset" className="mb-2">
              <Label>Área *</Label>
              <div className="d-flex gap-4">
                {[
                  { value: "PRODUCCION", label: "Producción" },
                  { value: "ADMINISTRACION", label: "Administración" },
                ].map((opt) => (
                  <FormGroup check key={opt.value}>
                    <Label check>
                      <Input
                        type="radio"
                        name="area"
                        checked={area === opt.value}
                        onChange={() => {
                          setArea(opt.value);
                          setPaymentMethod(opt.value === "PRODUCCION" ? "" : "");
                        }}
                      />{" "}
                      {opt.label}
                    </Label>
                  </FormGroup>
                ))}
              </div>
              <small className="text-muted">
                Producción: se descuenta directo de planilla (sin más opciones). Administración: puede pagar en
                efectivo, transferencia, depósito o descuento de planilla, a precio completo de catálogo.
              </small>
            </FormGroup>
          </Col>
        </Row>
        <Row>
          <Col md="3">
            <FormGroup>
              <Label>No. Boleta física (BLS) *</Label>
              <Input
                placeholder="Ej. BLS-00001"
                value={slipNumber}
                onChange={(e) => setSlipNumber(e.target.value.toUpperCase())}
              />
            </FormGroup>
          </Col>
          <Col md="5">
            <FormGroup>
              <Label>Colaborador *</Label>
              <FilterableSelect
                options={employeeOptions}
                value={employeeId}
                onChange={(value) => {
                  setEmployeeId(value);
                  const emp = employees.find((e) => String(e.id) === String(value));
                  if (emp) {
                    setRecipientName(`${emp.firstName || ""} ${emp.lastName || ""}`.trim());
                    setRecipientPhone(emp.phone || "");
                    setRecipientTaxId(emp.dpi || "");
                  }
                }}
                placeholder="Buscar empleado..."
              />
              {checkingEligibility && (
                <small className="text-muted d-block mt-1">Verificando elegibilidad…</small>
              )}
              {planillaEligibility && !planillaEligibility.eligible && (
                <Alert color="warning" className="py-1 px-2 mt-2 mb-0" style={{ fontSize: 12 }}>
                  {planillaEligibility.message}
                </Alert>
              )}
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup>
              <Label>Teléfono</Label>
              <Input value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup>
              <Label>DPI / NIT</Label>
              <Input value={recipientTaxId} onChange={(e) => setRecipientTaxId(e.target.value)} />
            </FormGroup>
          </Col>
        </Row>
        <Row>
          <Col md="4">
            <FormGroup>
              <Label>Forma de pago</Label>
              {area === "PRODUCCION" ? (
                <Input value="Descuento de planilla" disabled />
              ) : (
                <Input
                  type="select"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                >
                  <option value="">Seleccione…</option>
                  {ADMIN_PAYMENT_METHODS.map((method) => (
                    <option key={method} value={method}>
                      {PAYMENT_METHOD_LABELS[method]}
                    </option>
                  ))}
                </Input>
              )}
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Fecha documento</Label>
              <Input type="date" value={documentDate} onChange={(e) => setDocumentDate(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md="4">
            <FormGroup>
              <Label>Observaciones</Label>
              <Input
                type="textarea"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Salen impresas en el documento del envío"
              />
            </FormGroup>
          </Col>
        </Row>

        <div className="d-flex justify-content-between align-items-center mb-2">
          <strong>Productos</strong>
          <Button color="secondary" size="sm" outline onClick={addLine}>
            + Línea
          </Button>
        </div>
        <Table size="sm" bordered responsive className="mb-0">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Color</th>
              <th>Talla</th>
              <th style={{ width: 90 }}>Cant.</th>
              <th>Stock PT/Dev.</th>
              <th style={{ width: 44 }} />
            </tr>
          </thead>
          <tbody>
            {lines.map((row) => {
              const cincho = isLineCincho(row);
              return (
                <tr key={row.key}>
                  <td style={{ minWidth: 260 }}>
                    <ProductSelector
                      products={products}
                      value={row.productId}
                      disabled={loadingCatalog}
                      onChange={(product) => onProductSelected(row.key, product)}
                      renderOptionExtra={(p) => {
                        const salePrice = Number(p?.salePrice ?? p?.price ?? 0);
                        const displayPrice = computeInternalEnviUnitPrice(salePrice, getPricingMeta());
                        if (!(displayPrice > 0)) return null;
                        return (
                          <span style={{ float: "right", color: "#666" }}>
                            Q{displayPrice.toFixed(2)}
                          </span>
                        );
                      }}
                    />
                  </td>
                  <td style={{ minWidth: 150 }}>
                    <ColorSelector
                      colors={colors}
                      value={row.colorId}
                      disabled={loadingCatalog || !row.productId}
                      onChange={(color) => onColorSelected(row.key, color)}
                    />
                  </td>
                  <td style={{ minWidth: 100 }}>
                    <Input
                      value={row.size}
                      disabled={!row.productId}
                      onChange={(e) =>
                        patchLine(row.key, {
                          size: e.target.value.toUpperCase(),
                          stockHint: "",
                        })
                      }
                      onBlur={() => onLineFieldBlur(row.key)}
                      placeholder={cincho ? "Ej: 34" : "Opcional"}
                      bsSize="sm"
                    />
                  </td>
                  <td>
                    <Input
                      type="number"
                      min={1}
                      bsSize="sm"
                      value={row.quantity}
                      onChange={(e) => patchLine(row.key, { quantity: e.target.value })}
                    />
                  </td>
                  <td className="small text-muted">
                    {row.stockLoading ? <Spinner size="sm" /> : row.stockHint || "—"}
                  </td>
                  <td>
                    <Button close onClick={() => removeLine(row.key)} title="Quitar" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle} disabled={saving}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handleSubmit} disabled={saving || loadingCatalog}>
          {saving ? <Spinner size="sm" /> : "Enviar solicitud"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CreateStandaloneInternalShipmentModal;
