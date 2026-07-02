import React, { useEffect, useMemo, useState } from "react";
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
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { ColorSelector, ProductSelector } from "components/catalog/FilterableCatalogSelectors";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { getLocations } from "services/locationService";
import KioskInventoryCountReport from "./KioskInventoryCountReport";
import KioskInventoryKardexPanel from "./KioskInventoryKardexPanel";
import { getProducts } from "services/productService";
import { getColors } from "services/colorService";
import {
  getKioscoConsolidado,
  getKioscoMovimientos,
  getKioscoStock,
  getKioscoStockBajo,
  initializeKioscoInventory,
  registrarKioscoAjuste,
  registrarKioscoAnulacion,
  registrarKioscoDevolucionCliente,
  registrarKioscoDevolucionDeposito,
  registrarKioscoEntrada,
  registrarKioscoMerma,
  registrarKioscoCambio,
  registrarKioscoTraslado,
  registrarKioscoVenta,
} from "services/kioscoInventoryService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import {
  formatKioscoMovementReference,
  formatKioscoMovementRoute,
  getKioscoMovementSignedQuantity,
  getKioscoMovementTypeLabel,
} from "utils/kioskMovementHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  canSell,
  isSaleBelowMinimum,
  OPERATION_OPTIONS,
  sortMovementsDesc,
  validateAnulacionForm,
  validateCommonStockForm,
  validateTransferForm,
} from "./kioskInventoryFormHelper";

const INITIAL_FORM = {
  operation: "ENTRADA",
  locationId: "",
  locationOriginId: "",
  locationDestinationId: "",
  productId: "",
  colorId: "",
  returnedProductId: "",
  returnedColorId: "",
  quantity: "",
  referenceId: "",
  invoiceId: "",
  originalInvoiceId: "",
  apto: true,
  reason: "",
  realQuantity: "",
  productLeftKiosk: false,
  userId: "",
};

function KioskInventory() {
  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [selectedLocation, setSelectedLocation] = useState("");
  const [stockRows, setStockRows] = useState([]);
  const [lowStockRows, setLowStockRows] = useState([]);
  const [movements, setMovements] = useState([]);
  const [consolidated, setConsolidated] = useState(null);
  const [form, setForm] = useState(INITIAL_FORM);
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [initializingStock, setInitializingStock] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("INVENTARIO");
  const [stockViewFilter, setStockViewFilter] = useState("ALL");

  const kiosks = useMemo(
    () =>
      (locations || []).filter((location) => {
        const category = String(location?.categoria || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const name = String(location?.name || "")
          .toUpperCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const code = String(location?.code || "").toUpperCase();
        return category.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
      }),
    [locations]
  );

  const packagingProducts = useMemo(
    () => (products || []).filter((product) => isPackagingProductCode(product?.code)),
    [products]
  );

  const renderProductOptionExtra = (product) =>
    isPackagingProductCode(product?.code) ? (
      <Badge color="secondary" className="ml-1">Empaque</Badge>
    ) : null;

  const filteredStockRows = useMemo(() => {
    if (stockViewFilter === "PACKAGING") {
      return stockRows.filter((row) => isPackagingProductCode(row.productCode));
    }
    if (stockViewFilter === "PRODUCTS") {
      return stockRows.filter((row) => !isPackagingProductCode(row.productCode));
    }
    return stockRows;
  }, [stockRows, stockViewFilter]);

  const packagingStockCount = useMemo(
    () => stockRows.filter((row) => isPackagingProductCode(row.productCode)).length,
    [stockRows]
  );

  const kioskOptions = useMemo(
    () =>
      kiosks.map((k) => ({
        value: String(k.id),
        label: `${k.name || ""}${k.code ? ` (${k.code})` : ""}`.trim(),
        searchText: `${k.code || ""} ${k.name || ""}`,
      })),
    [kiosks]
  );

  const operationOptions = useMemo(
    () =>
      OPERATION_OPTIONS.map((opt) => ({
        value: opt.value,
        label: opt.label,
        searchText: opt.label,
      })),
    []
  );

  const productLeftKioskOptions = useMemo(
    () => [
      { value: "false", label: "No, sigue en kiosko", searchText: "no sigue kiosko" },
      { value: "true", label: "Sí, ya salió", searchText: "si salio" },
    ],
    []
  );

  const selectedStockRow = useMemo(() => {
    if (!form.productId) return null;
    const colorCandidate = form.colorId ? Number(form.colorId) : null;
    return stockRows.find((row) => {
      const sameProduct = Number(row.productId) === Number(form.productId);
      const sameColor =
        colorCandidate == null ? row.colorId == null : Number(row.colorId) === colorCandidate;
      return sameProduct && sameColor;
    });
  }, [form.productId, form.colorId, stockRows]);

  useEffect(() => {
    void loadCatalogs();
    void loadConsolidated();
  }, []);

  useEffect(() => {
    if (!selectedLocation) {
      setStockRows([]);
      setLowStockRows([]);
      setMovements([]);
      return;
    }
    void refreshLocationData(selectedLocation);
  }, [selectedLocation]);

  const loadCatalogs = async () => {
    try {
      setLoadingCatalogs(true);
      const [locationsData, productsData, colorsData] = await Promise.all([
        getLocations(),
        getProducts(),
        getColors(),
      ]);
      setLocations(locationsData || []);
      setProducts(productsData || []);
      setColors(colorsData || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar catálogos.");
    } finally {
      setLoadingCatalogs(false);
    }
  };

  const loadConsolidated = async () => {
    try {
      const data = await getKioscoConsolidado();
      setConsolidated(data || null);
    } catch (_err) {
      // no bloquear pantalla por resumen
    }
  };

  const refreshLocationData = async (locationId) => {
    try {
      setLoadingData(true);
      setError("");
      const [stock, lowStock, movementList] = await Promise.all([
        getKioscoStock(locationId),
        getKioscoStockBajo(locationId),
        getKioscoMovimientos(locationId),
      ]);
      setStockRows(stock || []);
      setLowStockRows(lowStock || []);
      setMovements(sortMovementsDesc(movementList || []));
    } catch (err) {
      setError(err.message || "No se pudo cargar el inventario del kiosko.");
      setStockRows([]);
      setLowStockRows([]);
      setMovements([]);
    } finally {
      setLoadingData(false);
    }
  };

  const onFormChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const validateForm = () => {
    if (form.operation === "CAMBIO") {
      if (!form.locationId) return "Debes seleccionar un kiosko.";
      if (!form.returnedProductId) return "Debes seleccionar el producto que devuelve el cliente.";
      if (!form.productId) return "Debes seleccionar el producto que se entrega al cliente.";
      if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) {
        return "La cantidad debe ser un entero mayor a cero.";
      }
      return "";
    }
    if (form.operation === "TRASLADO") {
      return validateTransferForm({
        locationOriginId: form.locationOriginId,
        locationDestinationId: form.locationDestinationId,
        productId: form.productId,
        quantity: form.quantity,
      });
    }
    if (form.operation === "ANULACION") {
      return validateAnulacionForm({
        locationId: form.locationId,
        productId: form.productId,
        quantity: form.quantity,
        reason: form.reason,
        productLeftKiosk: form.productLeftKiosk,
      });
    }
    if (form.operation === "AJUSTE") {
      if (!form.locationId || !form.productId) {
        return "Debes seleccionar kiosko y producto.";
      }
      if (!Number.isInteger(Number(form.realQuantity)) || Number(form.realQuantity) < 0) {
        return "La cantidad real debe ser un entero >= 0.";
      }
      if (!String(form.reason || "").trim()) {
        return "El motivo del ajuste es obligatorio.";
      }
      return "";
    }
    const commonError = validateCommonStockForm({
      locationId: form.locationId,
      productId: form.productId,
      quantity: form.quantity,
    });
    if (commonError) {
      return commonError;
    }
    if (form.operation === "MERMA" && !String(form.reason || "").trim()) {
      return "El motivo de merma es obligatorio.";
    }
    if (form.operation === "VENTA" && !form.invoiceId) {
      return "La referencia de factura es obligatoria.";
    }
    if (form.operation === "DEVOLUCION_CLIENTE" && !form.originalInvoiceId) {
      return "La factura original es obligatoria.";
    }
    return "";
  };

  const buildPayload = () => {
    const base = {
      productId: Number(form.productId),
      colorId: form.colorId ? Number(form.colorId) : null,
      userId: form.userId ? Number(form.userId) : null,
      quantity: Number(form.quantity),
    };
    switch (form.operation) {
      case "ENTRADA":
        return { ...base, referenceId: form.referenceId ? Number(form.referenceId) : null };
      case "VENTA":
        return { ...base, invoiceId: Number(form.invoiceId) };
      case "DEVOLUCION_DEPOSITO":
        return { ...base, referenceId: form.referenceId ? Number(form.referenceId) : null };
      case "DEVOLUCION_CLIENTE":
        return {
          ...base,
          originalInvoiceId: Number(form.originalInvoiceId),
          apto: Boolean(form.apto),
        };
      case "MERMA":
        return { ...base, reason: String(form.reason || "").trim() };
      case "AJUSTE":
        return {
          productId: Number(form.productId),
          colorId: form.colorId ? Number(form.colorId) : null,
          userId: form.userId ? Number(form.userId) : null,
          realQuantity: Number(form.realQuantity),
          reason: String(form.reason || "").trim(),
        };
      case "ANULACION":
        return {
          ...base,
          invoiceId: Number(form.invoiceId),
          reason: String(form.reason || "").trim(),
          productLeftKiosk: Boolean(form.productLeftKiosk),
        };
      case "CAMBIO":
        return {
          returnedProductId: Number(form.returnedProductId),
          returnedColorId: form.returnedColorId ? Number(form.returnedColorId) : null,
          givenProductId: Number(form.productId),
          givenColorId: form.colorId ? Number(form.colorId) : null,
          quantity: Number(form.quantity),
          referenceId: form.referenceId ? Number(form.referenceId) : null,
          reason: String(form.reason || "").trim() || null,
          userId: form.userId ? Number(form.userId) : null,
        };
      case "TRASLADO":
        return {
          locationOriginId: Number(form.locationOriginId),
          locationDestinationId: Number(form.locationDestinationId),
          productId: Number(form.productId),
          colorId: form.colorId ? Number(form.colorId) : null,
          quantity: Number(form.quantity),
          userId: form.userId ? Number(form.userId) : null,
        };
      default:
        return base;
    }
  };

  const submitOperation = async () => {
    const validationError = validateForm();
    if (validationError) {
      showError(validationError);
      return;
    }
    try {
      setSubmitting(true);
      const payload = buildPayload();
      if (form.operation === "ENTRADA") {
        await registrarKioscoEntrada(Number(form.locationId), payload);
      } else if (form.operation === "VENTA") {
        await registrarKioscoVenta(Number(form.locationId), payload);
      } else if (form.operation === "DEVOLUCION_DEPOSITO") {
        await registrarKioscoDevolucionDeposito(Number(form.locationId), payload);
      } else if (form.operation === "DEVOLUCION_CLIENTE") {
        await registrarKioscoDevolucionCliente(Number(form.locationId), payload);
      } else if (form.operation === "TRASLADO") {
        await registrarKioscoTraslado(payload);
      } else if (form.operation === "MERMA") {
        await registrarKioscoMerma(Number(form.locationId), payload);
      } else if (form.operation === "AJUSTE") {
        await registrarKioscoAjuste(Number(form.locationId), payload);
      } else if (form.operation === "ANULACION") {
        await registrarKioscoAnulacion(Number(form.locationId), payload);
      } else if (form.operation === "CAMBIO") {
        await registrarKioscoCambio(Number(form.locationId), payload);
      }
      showSuccess("Movimiento registrado correctamente.");
      await loadConsolidated();
      if (selectedLocation) {
        await refreshLocationData(selectedLocation);
      }
      setForm((prev) => ({
        ...INITIAL_FORM,
        operation: prev.operation,
        locationId: prev.locationId,
        locationOriginId: prev.locationOriginId,
        locationDestinationId: prev.locationDestinationId,
      }));
    } catch (err) {
      showError(err.message || "No se pudo registrar el movimiento.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInitializeInventory = async () => {
    const targetLocationId = selectedLocation ? Number(selectedLocation) : null;
    const confirmationMessage = targetLocationId
      ? "¿Inicializar inventario para este kiosko? Se crearán los productos faltantes en 0."
      : "¿Inicializar inventario para TODOS los kioskos? Se crearán los productos faltantes en 0.";
    if (!window.confirm(confirmationMessage)) {
      return;
    }
    try {
      setInitializingStock(true);
      const result = await initializeKioscoInventory(targetLocationId);
      showSuccess(
        `${result.message} Creados: ${result.createdCount || 0}, existentes: ${result.existingCount || 0}.`
      );
      await loadConsolidated();
      if (selectedLocation) {
        await refreshLocationData(selectedLocation);
      }
    } catch (err) {
      showError(err.message || "No se pudo inicializar el inventario de kiosko.");
    } finally {
      setInitializingStock(false);
    }
  };

  const saleWouldHitMin = form.operation === "VENTA" && isSaleBelowMinimum(selectedStockRow, form.quantity);
  const saleCanSubmit = form.operation !== "VENTA" || canSell(selectedStockRow, form.quantity);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Inventario de Kioskos (módulo dedicado)</CardTitle>
              <Nav tabs className="mt-2">
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "INVENTARIO" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("INVENTARIO");
                    }}
                  >
                    Inventario y movimientos
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "KARDEX" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("KARDEX");
                    }}
                  >
                    Kardex (periodo)
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    href="#"
                    className={activeTab === "CONTEO" ? "active" : ""}
                    onClick={(e) => {
                      e.preventDefault();
                      setActiveTab("CONTEO");
                    }}
                  >
                    Conteo físico
                  </NavLink>
                </NavItem>
              </Nav>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}
              {consolidated && (
                <Row className="mb-3">
                  <Col md="3"><Alert color="light" className="mb-0 border">Kioskos: <strong>{consolidated.totalKiosks}</strong></Alert></Col>
                  <Col md="3"><Alert color="light" className="mb-0 border">Unidades: <strong>{consolidated.totalUnits}</strong></Alert></Col>
                  <Col md="3"><Alert color="light" className="mb-0 border">Items stock bajo: <strong>{consolidated.totalLowStockRows}</strong></Alert></Col>
                  <Col md="3"><Alert color="light" className="mb-0 border">Filas inventario: <strong>{consolidated.totalStockRows}</strong></Alert></Col>
                </Row>
              )}

              <Row className="mb-3">
                <Col md="4">
                  <FormGroup>
                    <Label>Kiosko para consulta</Label>
                    <FilterableSelect
                      value={selectedLocation}
                      onChange={(value) => {
                        setSelectedLocation(value);
                        onFormChange("locationId", value);
                      }}
                      options={kioskOptions}
                      placeholder="Buscar kiosko…"
                      emptyLabel="Selecciona kiosko"
                      disabled={loadingCatalogs}
                    />
                  </FormGroup>
                </Col>
                <Col md="4" className="d-flex align-items-end">
                  <Button
                    color="primary"
                    outline
                    onClick={() => void handleInitializeInventory()}
                    disabled={loadingCatalogs || initializingStock}
                  >
                    {initializingStock ? (
                      <>
                        <Spinner size="sm" className="mr-2" />
                        Generando...
                      </>
                    ) : (
                      <>
                        <i className="nc-icon nc-refresh-69 mr-1" />
                        Generar inventario en kioskos
                      </>
                    )}
                  </Button>
                </Col>
              </Row>

              {activeTab === "INVENTARIO" && (
              <Row>
                <Col md="5">
                  <Card className="border">
                    <CardHeader>
                      <CardTitle tag="h6">Registrar movimiento</CardTitle>
                    </CardHeader>
                    <CardBody>
                      <FormGroup>
                        <Label>Operación</Label>
                        <FilterableSelect
                          value={form.operation}
                          onChange={(value) => onFormChange("operation", value)}
                          options={operationOptions}
                          placeholder="Buscar operación…"
                          allowEmpty={false}
                        />
                      </FormGroup>

                      {form.operation === "TRASLADO" ? (
                        <>
                          <FormGroup>
                            <Label>Origen</Label>
                            <FilterableSelect
                              value={form.locationOriginId}
                              onChange={(value) => onFormChange("locationOriginId", value)}
                              options={kioskOptions}
                              placeholder="Buscar origen…"
                              emptyLabel="Selecciona origen"
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Destino</Label>
                            <FilterableSelect
                              value={form.locationDestinationId}
                              onChange={(value) => onFormChange("locationDestinationId", value)}
                              options={kioskOptions}
                              placeholder="Buscar destino…"
                              emptyLabel="Selecciona destino"
                            />
                          </FormGroup>
                        </>
                      ) : (
                        <FormGroup>
                          <Label>Kiosko</Label>
                          <FilterableSelect
                            value={form.locationId}
                            onChange={(value) => onFormChange("locationId", value)}
                            options={kioskOptions}
                            placeholder="Buscar kiosko…"
                            emptyLabel="Selecciona kiosko"
                          />
                        </FormGroup>
                      )}

                      {form.operation === "CAMBIO" ? (
                        <>
                          <FormGroup>
                            <Label>Producto devuelto por el cliente</Label>
                            <ProductSelector
                              products={products}
                              value={form.returnedProductId}
                              onChange={(product) => onFormChange("returnedProductId", product ? String(product.id) : "")}
                              placeholder="Buscar producto devuelto…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Color devuelto (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.returnedColorId}
                              onChange={(color) => onFormChange("returnedColorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Producto entregado al cliente</Label>
                            <ProductSelector
                              products={products}
                              value={form.productId}
                              onChange={(product) => onFormChange("productId", product ? String(product.id) : "")}
                              placeholder="Buscar producto entregado…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          <FormGroup>
                            <Label>Color entregado (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.colorId}
                              onChange={(color) => onFormChange("colorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                        </>
                      ) : (
                        <>
                          <FormGroup>
                            <Label>Producto</Label>
                            <ProductSelector
                              products={products}
                              value={form.productId}
                              onChange={(product) => onFormChange("productId", product ? String(product.id) : "")}
                              placeholder="Buscar producto o empaque SUM-…"
                              disabled={loadingCatalogs}
                              renderOptionExtra={renderProductOptionExtra}
                            />
                          </FormGroup>
                          {form.operation === "ENTRADA" && packagingProducts.length > 0 ? (
                            <Alert color="info" className="py-2">
                              Los empaques <strong>SUM-</strong> son suministros (materiales). Al recibir envíos
                              o sincronizar inventario se cargan al kiosko automáticamente; configure el precio
                              en catálogo o use <strong>Entrada de stock</strong> para ajustes manuales.
                            </Alert>
                          ) : null}
                          <FormGroup>
                            <Label>Color (opcional)</Label>
                            <ColorSelector
                              colors={colors}
                              value={form.colorId}
                              onChange={(color) => onFormChange("colorId", color ? String(color.id) : "")}
                              placeholder="Buscar color…"
                              disabled={loadingCatalogs}
                            />
                          </FormGroup>
                        </>
                      )}

                      {form.operation === "AJUSTE" ? (
                        <FormGroup>
                          <Label>Cantidad real contada</Label>
                          <Input
                            type="number"
                            min="0"
                            step="1"
                            value={form.realQuantity}
                            onChange={(e) => onFormChange("realQuantity", e.target.value)}
                          />
                        </FormGroup>
                      ) : (
                        <FormGroup>
                          <Label>Cantidad</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.quantity}
                            onChange={(e) => onFormChange("quantity", e.target.value)}
                          />
                        </FormGroup>
                      )}

                      {form.operation === "ENTRADA" ||
                      form.operation === "DEVOLUCION_DEPOSITO" ||
                      form.operation === "CAMBIO" ? (
                        <FormGroup>
                          <Label>Referencia (opcional)</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.referenceId}
                            onChange={(e) => onFormChange("referenceId", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "VENTA" || form.operation === "ANULACION" ? (
                        <FormGroup>
                          <Label>Factura / referencia</Label>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={form.invoiceId}
                            onChange={(e) => onFormChange("invoiceId", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "DEVOLUCION_CLIENTE" ? (
                        <>
                          <FormGroup>
                            <Label>Factura original</Label>
                            <Input
                              type="number"
                              min="1"
                              step="1"
                              value={form.originalInvoiceId}
                              onChange={(e) => onFormChange("originalInvoiceId", e.target.value)}
                            />
                          </FormGroup>
                          <FormGroup check className="mb-2">
                            <Label check>
                              <Input
                                type="checkbox"
                                checked={Boolean(form.apto)}
                                onChange={(e) => onFormChange("apto", e.target.checked)}
                              />{" "}
                              Producto apto para reventa
                            </Label>
                          </FormGroup>
                        </>
                      ) : null}

                      {form.operation === "MERMA" ||
                      form.operation === "AJUSTE" ||
                      form.operation === "ANULACION" ||
                      form.operation === "CAMBIO" ? (
                        <FormGroup>
                          <Label>{form.operation === "CAMBIO" ? "Motivo (opcional)" : "Motivo"}</Label>
                          <Input
                            type="text"
                            value={form.reason}
                            onChange={(e) => onFormChange("reason", e.target.value)}
                          />
                        </FormGroup>
                      ) : null}

                      {form.operation === "ANULACION" ? (
                        <FormGroup>
                          <Label>¿El producto salió del kiosko?</Label>
                          <FilterableSelect
                            value={String(form.productLeftKiosk)}
                            onChange={(value) => onFormChange("productLeftKiosk", value === "true")}
                            options={productLeftKioskOptions}
                            placeholder="Buscar…"
                            allowEmpty={false}
                          />
                        </FormGroup>
                      ) : null}

                      {saleWouldHitMin && (
                        <Alert color="warning">
                          Esta venta deja el stock en mínimo o por debajo del mínimo de reposición.
                        </Alert>
                      )}
                      {form.operation === "VENTA" && form.quantity && !saleCanSubmit && (
                        <Alert color="danger">
                          La cantidad supera el stock disponible para el producto/color seleccionado.
                        </Alert>
                      )}

                      <FormGroup>
                        <Label>Usuario (opcional, auditoría)</Label>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={form.userId}
                          onChange={(e) => onFormChange("userId", e.target.value)}
                          placeholder="Si se deja vacío usa usuario autenticado"
                        />
                      </FormGroup>

                      <Button
                        color="primary"
                        block
                        onClick={() => void submitOperation()}
                        disabled={submitting || (form.operation === "VENTA" && !saleCanSubmit)}
                      >
                        {submitting ? (
                          <>
                            <Spinner size="sm" className="mr-2" />
                            Guardando...
                          </>
                        ) : (
                          "Registrar movimiento"
                        )}
                      </Button>
                    </CardBody>
                  </Card>
                </Col>

                <Col md="7">
                  <Card className="border mb-3">
                    <CardHeader className="d-flex justify-content-between align-items-center flex-wrap">
                      <CardTitle tag="h6" className="mb-0">
                        Stock por kiosko {selectedLocation ? <Badge color="info">{filteredStockRows.length}</Badge> : null}
                      </CardTitle>
                      {selectedLocation && stockRows.length > 0 ? (
                        <div className="btn-group btn-group-sm mt-2 mt-md-0">
                          <Button
                            color={stockViewFilter === "ALL" ? "primary" : "outline-primary"}
                            onClick={() => setStockViewFilter("ALL")}
                          >
                            Todo
                          </Button>
                          <Button
                            color={stockViewFilter === "PRODUCTS" ? "primary" : "outline-primary"}
                            onClick={() => setStockViewFilter("PRODUCTS")}
                          >
                            Productos
                          </Button>
                          <Button
                            color={stockViewFilter === "PACKAGING" ? "primary" : "outline-primary"}
                            onClick={() => setStockViewFilter("PACKAGING")}
                          >
                            Empaques {packagingStockCount > 0 ? `(${packagingStockCount})` : ""}
                          </Button>
                        </div>
                      ) : null}
                    </CardHeader>
                    <CardBody>
                      {loadingData ? (
                        <div className="text-center py-3"><Spinner /> Cargando stock...</div>
                      ) : stockRows.length === 0 ? (
                        <Alert color="light" className="border mb-0">Selecciona un kiosko para ver stock.</Alert>
                      ) : filteredStockRows.length === 0 ? (
                        <Alert color="light" className="border mb-0">
                          {stockViewFilter === "PACKAGING"
                            ? "No hay empaques SUM- registrados en este kiosko. Use Entrada de stock para agregarlos."
                            : "No hay filas para el filtro seleccionado."}
                        </Alert>
                      ) : (
                        <Table responsive size="sm">
                          <thead>
                            <tr>
                              <th>Producto</th>
                              <th>Color</th>
                              <th className="text-right">Actual</th>
                              <th className="text-right">Mínimo</th>
                              <th>Estado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredStockRows.map((row) => {
                              const low = Number(row.currentStock || 0) <= Number(row.minimumStock || 0);
                              const isPackaging = isPackagingProductCode(row.productCode);
                              return (
                                <tr key={row.id} className={low ? "table-danger" : ""}>
                                  <td>
                                    {row.productCode} - {row.productName}
                                    {isPackaging ? <Badge color="secondary" className="ml-1">Empaque</Badge> : null}
                                  </td>
                                  <td>{row.colorName || "—"}</td>
                                  <td className="text-right">{row.currentStock}</td>
                                  <td className="text-right">{row.minimumStock}</td>
                                  <td>{low ? <Badge color="danger">Bajo</Badge> : <Badge color="success">Normal</Badge>}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </Table>
                      )}
                      {lowStockRows.length > 0 && (
                        <Alert color="warning" className="mb-0">
                          Hay <strong>{lowStockRows.length}</strong> producto(s) en stock bajo para este kiosko.
                        </Alert>
                      )}
                    </CardBody>
                  </Card>

                  <Card className="border">
                    <CardHeader>
                      <CardTitle tag="h6">Historial de movimientos (más recientes primero)</CardTitle>
                    </CardHeader>
                    <CardBody>
                      {loadingData ? (
                        <div className="text-center py-3"><Spinner /> Cargando movimientos...</div>
                      ) : movements.length === 0 ? (
                        <Alert color="light" className="border mb-0">No hay movimientos para mostrar.</Alert>
                      ) : (
                        <Table responsive size="sm">
                          <thead>
                            <tr>
                              <th>Fecha</th>
                              <th>Tipo</th>
                              <th>Origen → Destino</th>
                              <th>Producto</th>
                              <th className="text-right">Cant.</th>
                              <th className="text-right">Antes</th>
                              <th className="text-right">Después</th>
                              <th>Ref.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {movements.map((movement) => (
                              <tr key={movement.id}>
                                <td>{movement.createdAt ? formatDateTimeGt(movement.createdAt) : "—"}</td>
                                <td><Badge color="secondary">{getKioscoMovementTypeLabel(movement.movementType)}</Badge></td>
                                <td style={{ whiteSpace: "nowrap" }}>{formatKioscoMovementRoute(movement)}</td>
                                <td>{movement.productCode || movement.productId}</td>
                                <td className="text-right">{getKioscoMovementSignedQuantity(movement)}</td>
                                <td className="text-right">{movement.stockBefore}</td>
                                <td className="text-right">{movement.stockAfter}</td>
                                <td>{formatKioscoMovementReference(movement)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      )}
                    </CardBody>
                  </Card>
                </Col>
              </Row>
              )}

              {activeTab === "KARDEX" && (
                <KioskInventoryKardexPanel locationId={selectedLocation} />
              )}

              {activeTab === "CONTEO" && (
                <KioskInventoryCountReport locationId={selectedLocation} />
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskInventory;

