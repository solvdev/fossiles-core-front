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
  Input,
  Label,
  Nav,
  NavItem,
  NavLink,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import {
  createKioskPosSale,
  createKioskPromotion,
  getCurrentCashSession,
  getKioskPosContext,
  getKioskPromotions,
  getKioskProductAvailability,
  getMyKioskReport,
  getMyKioskSales,
  getPendingDepositSummary,
} from "services/kioskPosService";
import { countShipmentsInTransit } from "services/productDistributionService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import PosAdminKioskPicker from "./pos/PosAdminKioskPicker";
import PosCatalogPanel from "./pos/PosCatalogPanel";
import PosCinchoPickModal from "./pos/PosCinchoPickModal";
import PosCartPanel from "./pos/PosCartPanel";
import PosCheckoutModal from "./pos/PosCheckoutModal";
import PosInvoiceEmailModal from "./pos/PosInvoiceEmailModal";
import PosSuccessScreen from "./pos/PosSuccessScreen";
import PosReportsTab from "./pos/PosReportsTab";
import PosPromotionsTab from "./pos/PosPromotionsTab";
import PosReceiptTab from "./pos/PosReceiptTab";
import PosCashTab from "./pos/PosCashTab";
import PosManagerDashboard from "./pos/PosManagerDashboard";
import PosInventoryTab from "./pos/PosInventoryTab";
import { useAuth } from "contexts/AuthContext";
import {
  colorLineKeyFor,
  estimatePromotionDiscount,
  formatCurrency,
  formatQty,
  lineKeyFor,
  posVariantNeedsSizePick,
  posVariantSizeEntries,
  mergePosPromotions,
  parseCheckoutPromotionPayload,
  resolveSelectedPromotion,
  saleNeedsFelCertification,
} from "./pos/posUtils";
import "./KioskSales.css";

function KioskSales() {
  const { hasPermission } = useAuth();
  const canConfirmReceipt = hasPermission("DISTRIBUCION.CONFIRMACION_RECEPCION.CREAR");
  const [activeTab, setActiveTab] = useState("POS");
  const [context, setContext] = useState(null);
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [cart, setCart] = useState([]);
  const [cinchoPickVariant, setCinchoPickVariant] = useState(null);
  const [sales, setSales] = useState([]);
  const [myReport, setMyReport] = useState(null);
  const [promotions, setPromotions] = useState([]);
  const [selectedPromotionId, setSelectedPromotionId] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [catalogView, setCatalogView] = useState("PRODUCTS");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [startDate, setStartDate] = useState(() => getTodayYmdGuatemala());
  const [endDate, setEndDate] = useState(() => getTodayYmdGuatemala());
  const [notes, setNotes] = useState("");
  const [comments, setComments] = useState("");
  const [availabilityKey, setAvailabilityKey] = useState("");
  const [availabilityRows, setAvailabilityRows] = useState([]);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [lastSale, setLastSale] = useState(null);
  const [pendingFelSale, setPendingFelSale] = useState(null);
  const [promoForm, setPromoForm] = useState({
    name: "",
    description: "",
    discountType: "PERCENT",
    discountValue: "",
    comboBuyQty: "2",
    comboPayQty: "1",
    kioskLocationId: "",
    audienceCategory: "",
    tierPercents: { DAMA: "", CABALLERO: "", UNISEX: "" },
    startDate: "",
    endDate: "",
    active: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [cashSession, setCashSession] = useState(null);
  const [cashSessionLoading, setCashSessionLoading] = useState(false);
  const [pendingDepositSummary, setPendingDepositSummary] = useState(null);
  const [pendingReceiptCount, setPendingReceiptCount] = useState(0);

  const today = useMemo(() => getTodayYmdGuatemala(), []);

  const loadPendingReceiptCount = async (kioskLocationId) => {
    if (!canConfirmReceipt) {
      setPendingReceiptCount(0);
      return;
    }
    const locationId = kioskLocationId || selectedKioskId || undefined;
    if (!locationId) {
      setPendingReceiptCount(0);
      return;
    }
    try {
      const count = await countShipmentsInTransit(locationId);
      setPendingReceiptCount(Number(count) || 0);
    } catch {
      setPendingReceiptCount(0);
    }
  };

  const loadPendingDepositSummary = async (kioskLocationId) => {
    const locationId = kioskLocationId || selectedKioskId || undefined;
    if (!locationId) {
      setPendingDepositSummary(null);
      return null;
    }
    try {
      const summary = await getPendingDepositSummary(locationId);
      setPendingDepositSummary(summary || null);
      return summary || null;
    } catch (err) {
      setPendingDepositSummary(null);
      return null;
    }
  };

  const loadCashSession = async (kioskLocationId) => {
    const locationId = kioskLocationId || selectedKioskId || undefined;
    if (!locationId) {
      setCashSession(null);
      return null;
    }
    try {
      setCashSessionLoading(true);
      const session = await getCurrentCashSession(locationId);
      setCashSession(session || null);
      return session || null;
    } catch (err) {
      setCashSession(null);
      return null;
    } finally {
      setCashSessionLoading(false);
    }
  };

  const cashSessionOpen =
    cashSession && String(cashSession.status || "").toUpperCase() === "OPEN";

  const loadInitial = async (kioskIdOverride) => {
    try {
      setLoading(true);
      const kioskLocationId = kioskIdOverride || selectedKioskId || undefined;
      const [ctx, kioskSales, kioskReport, promoRows] = await Promise.all([
        getKioskPosContext(kioskLocationId, {}),
        getMyKioskSales(undefined, undefined, kioskLocationId),
        getMyKioskReport(undefined, undefined, kioskLocationId),
        getKioskPromotions(true, kioskLocationId),
      ]);
      setContext(ctx || null);
      if (ctx?.kioskId) setSelectedKioskId(String(ctx.kioskId));
      setSales(Array.isArray(kioskSales) ? kioskSales : []);
      setMyReport(kioskReport || null);
      setPromotions(Array.isArray(promoRows) ? promoRows : []);
      await Promise.all([
        loadCashSession(kioskLocationId || ctx?.kioskId),
        loadPendingDepositSummary(kioskLocationId || ctx?.kioskId),
        loadPendingReceiptCount(kioskLocationId || ctx?.kioskId),
      ]);
    } catch (err) {
      showError(err.message || "No se pudo cargar la pantalla POS.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (!selectedKioskId || activeTab !== "POS") return;
    const timer = setTimeout(async () => {
      try {
        const ctx = await getKioskPosContext(selectedKioskId, {
          search: productSearch,
        });
        setContext((prev) => (prev ? { ...prev, inventory: ctx?.inventory || [] } : ctx));
      } catch (err) {
        showError(err.message || "No se pudo actualizar el catálogo.");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [productSearch, selectedKioskId, activeTab]);

  const handleKioskChange = async (nextKioskId) => {
    setSelectedKioskId(nextKioskId);
    setCart([]);
    setAvailabilityKey("");
    setAvailabilityRows([]);
    setLastSale(null);
    await loadInitial(nextKioskId || undefined);
  };

  const addToCart = (inventoryItem, size = null) => {
    if (posVariantNeedsSizePick(inventoryItem) && !size) {
      setCinchoPickVariant(inventoryItem);
      return;
    }

    const key = lineKeyFor(inventoryItem.productId, inventoryItem.colorId, size);
    const sizeEntry = size
      ? posVariantSizeEntries(inventoryItem).find((entry) => entry.size === size)
      : null;
    const availableQty = sizeEntry
      ? sizeEntry.quantity
      : Number(inventoryItem.quantity || 0);

    setCart((prev) => {
      const existing = prev.find((line) => line.key === key);
      const nextQty = existing ? Number(existing.quantity || 0) + 1 : 1;
      if (nextQty > availableQty) {
        const sizeHint = size ? ` talla ${size}` : "";
        showError(
          `Stock insuficiente para ${inventoryItem.productName}${sizeHint}. Disponible: ${formatQty(availableQty)}.`
        );
        return prev;
      }
      if (existing) {
        return prev.map((line) =>
          line.key === key ? { ...line, quantity: nextQty } : line
        );
      }
      return [
        ...prev,
        {
          key,
          productId: inventoryItem.productId,
          productCode: inventoryItem.productCode,
          productName: inventoryItem.productName,
          colorId: inventoryItem.colorId,
          colorName: inventoryItem.colorName,
          size: size || null,
          audienceCategory: inventoryItem.audienceCategory || "UNISEX",
          availableQty,
          quantity: 1,
          unitPrice: Number(inventoryItem.suggestedUnitPrice || 0),
        },
      ];
    });
  };

  const handlePickCinchoSize = (variant, size) => {
    addToCart(variant, size);
  };

  const updateCartLine = (key, patch) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line;
        const updated = { ...line, ...patch };
        if (patch.quantity != null && Number(patch.quantity) > Number(line.availableQty || 0)) {
          showError(`Cantidad máxima disponible: ${formatQty(line.availableQty)}.`);
          return line;
        }
        return updated;
      })
    );
  };

  const removeCartLine = (key) => setCart((prev) => prev.filter((line) => line.key !== key));


  const cartQtyByColorKey = useMemo(() => {
    const map = {};
    cart.forEach((line) => {
      const colorKey = colorLineKeyFor(line.productId, line.colorId);
      map[colorKey] = (map[colorKey] || 0) + Number(line.quantity || 0);
    });
    return map;
  }, [cart]);

  const cinchoPickCartQtyBySize = useMemo(() => {
    if (!cinchoPickVariant) return {};
    const map = {};
    cart.forEach((line) => {
      if (
        line.productId === cinchoPickVariant.productId &&
        (line.colorId || null) === (cinchoPickVariant.colorId || null) &&
        line.size
      ) {
        map[line.size] = Number(line.quantity || 0);
      }
    });
    return map;
  }, [cart, cinchoPickVariant]);

  const checkoutPromotions = useMemo(() => mergePosPromotions(promotions), [promotions]);

  const selectedPromotion = useMemo(
    () => resolveSelectedPromotion(selectedPromotionId, checkoutPromotions),
    [checkoutPromotions, selectedPromotionId]
  );

  const cartTotals = useMemo(() => {
    const subtotal = cart.reduce((acc, line) => {
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || 0);
      acc.items += qty;
      acc.total += qty * price;
      return acc;
    }, { items: 0, total: 0 });
    const discount = estimatePromotionDiscount(subtotal.total, selectedPromotion, cart);
    return {
      items: subtotal.items,
      total: subtotal.total,
      discount,
      estimated: Math.max(0, subtotal.total - discount),
    };
  }, [cart, selectedPromotion]);

  const applyReportFilters = async () => {
    try {
      setLoading(true);
      const [kioskSales, kioskReport] = await Promise.all([
        getMyKioskSales(startDate || undefined, endDate || undefined, selectedKioskId || undefined),
        getMyKioskReport(startDate || undefined, endDate || undefined, selectedKioskId || undefined),
      ]);
      setSales(Array.isArray(kioskSales) ? kioskSales : []);
      setMyReport(kioskReport || null);
    } catch (err) {
      showError(err.message || "No se pudieron filtrar los reportes.");
    } finally {
      setLoading(false);
    }
  };

  const submitSale = async (checkoutData) => {
    if (cart.length === 0) {
      showError("Agrega al menos un producto al carrito.");
      return;
    }
    const normalizedTaxId = checkoutData.customerTaxId || "CF";
    const invoiceName = checkoutData.customerName || (normalizedTaxId === "CF" ? "CONSUMIDOR FINAL" : "");
    if (normalizedTaxId !== "CF" && !invoiceName) {
      showError("Consulte el NIT para obtener el nombre en factura.");
      return;
    }
    for (const line of cart) {
      const qty = Number(line.quantity || 0);
      if (!Number.isFinite(qty) || qty <= 0) {
        showError(`Cantidad inválida para ${line.productName}.`);
        return;
      }
      if (qty > Number(line.availableQty || 0)) {
        showError(`Stock insuficiente para ${line.productName}.`);
        return;
      }
    }
    try {
      setSaving(true);
      const promoPayload = parseCheckoutPromotionPayload(checkoutData.promotionId ?? selectedPromotionId);
      const sale = await createKioskPosSale({
        kioskLocationId: selectedKioskId ? Number(selectedKioskId) : null,
        customerTaxId: normalizedTaxId,
        customerName: invoiceName || null,
        address: null,
        phone: null,
        email: null,
        paymentMethod: checkoutData.paymentMethod || "EFECTIVO",
        amountReceived: checkoutData.amountReceived,
        cashAmount: checkoutData.cashAmount,
        cardAmount: checkoutData.cardAmount,
        cardAuthNumber: checkoutData.cardAuthNumber,
        cardLast4: checkoutData.cardLast4,
        notes: checkoutData.notes,
        comments: checkoutData.comments,
        promotionId: promoPayload.promotionId,
        manualDiscountPercent: promoPayload.manualDiscountPercent,
        requestInvoice: checkoutData.requestInvoice === true,
        saleDate: today,
        items: cart.map((line) => ({
          productId: line.productId,
          colorId: line.colorId || null,
          size: line.size || null,
          quantity: Number(line.quantity || 0),
        })),
      });

      setCheckoutOpen(false);
      setCart([]);
      setNotes("");
      setComments("");
      setSelectedPromotionId("");
      await loadInitial(selectedKioskId || undefined);

      if (saleNeedsFelCertification(sale, checkoutData.requestInvoice) && !sale?.invoice?.felUuid && !sale?.felUuid) {
        setPendingFelSale(sale);
      } else {
        setLastSale(sale);
        showSuccess(`Venta ${sale.saleNumber || ""} registrada correctamente.`.trim());
      }
    } catch (err) {
      showError(err.message || "No se pudo registrar la venta.");
    } finally {
      setSaving(false);
    }
  };

  const checkAvailability = async () => {
    if (!availabilityKey) {
      showError("Selecciona un producto para consultar disponibilidad.");
      return;
    }
    const [productIdRaw, colorIdRaw] = availabilityKey.split(":");
    try {
      setAvailabilityLoading(true);
      const rows = await getKioskProductAvailability(
        Number(productIdRaw),
        colorIdRaw === "none" ? null : Number(colorIdRaw),
        selectedKioskId ? Number(selectedKioskId) : null
      );
      setAvailabilityRows(Array.isArray(rows) ? rows : []);
    } catch (err) {
      showError(err.message || "No se pudo consultar disponibilidad.");
      setAvailabilityRows([]);
    } finally {
      setAvailabilityLoading(false);
    }
  };

  const createPromotion = async () => {
    try {
      if (!promoForm.name.trim()) {
        showError("El nombre de la promoción es obligatorio.");
        return;
      }
      const payload = {
        name: promoForm.name,
        description: promoForm.description,
        discountType: promoForm.discountType,
        startDate: promoForm.startDate || null,
        endDate: promoForm.endDate || null,
        active: Boolean(promoForm.active),
        kioskLocationId: promoForm.kioskLocationId ? Number(promoForm.kioskLocationId) : null,
        audienceCategory: promoForm.audienceCategory || null,
      };
      if (promoForm.discountType === "COMBO") {
        payload.comboBuyQty = Number(promoForm.comboBuyQty || 0);
        payload.comboPayQty = Number(promoForm.comboPayQty || 0);
        payload.discountValue = 0;
      } else if (promoForm.discountType === "TIERED_PERCENT") {
        const tierPercents = promoForm.tierPercents || {};
        payload.tiers = ["DAMA", "CABALLERO", "UNISEX"]
          .map((audienceCategory) => ({
            audienceCategory,
            discountValue: Number(tierPercents[audienceCategory] || 0),
          }))
          .filter((tier) => tier.discountValue > 0);
        if (!payload.tiers.length) {
          showError("Indique al menos un porcentaje por línea mayor a cero.");
          return;
        }
        payload.discountValue = 0;
        payload.audienceCategory = null;
      } else {
        payload.discountValue = Number(promoForm.discountValue || 0);
      }
      await createKioskPromotion(payload);
      setPromoForm({
        name: "",
        description: "",
        discountType: "PERCENT",
        discountValue: "",
        comboBuyQty: "2",
        comboPayQty: "1",
        kioskLocationId: "",
        audienceCategory: "",
        tierPercents: { DAMA: "", CABALLERO: "", UNISEX: "" },
        startDate: "",
        endDate: "",
        active: true,
      });
      showSuccess("Promoción creada correctamente.");
      const promoRows = await getKioskPromotions(true, selectedKioskId || undefined);
      setPromotions(Array.isArray(promoRows) ? promoRows : []);
    } catch (err) {
      showError(err.message || "No se pudo crear la promoción.");
    }
  };

  const resetNewSale = () => {
    setLastSale(null);
    setPendingFelSale(null);
  };

  const handleFelInvoiceComplete = (sale) => {
    setPendingFelSale(null);
    setLastSale(sale);
  };

  const cancelSale = () => {
    setCart([]);
    setSelectedPromotionId("");
  };

  const selectedKioskName = useMemo(() => {
    if (!context) return "";
    if (context.admin && Array.isArray(context.kiosks)) {
      const match = context.kiosks.find((k) => String(k.kioskId) === String(selectedKioskId));
      if (match) return match.kioskName;
    }
    return context.kioskName || "";
  }, [context, selectedKioskId]);

  const selectedKioskCode = useMemo(() => {
    if (!context) return "";
    if (context.admin && Array.isArray(context.kiosks)) {
      const match = context.kiosks.find((k) => String(k.kioskId) === String(selectedKioskId));
      if (match) return match.kioskCode || "";
    }
    return context.kioskCode || "";
  }, [context, selectedKioskId]);

  const tabItems = useMemo(() => {
    const items = [
      { id: "RESUMEN", label: "Resumen" },
      { id: "POS", label: "POS" },
      { id: "CAJA", label: "Caja" },
      { id: "INVENTORY", label: "Inventario" },
    ];
    if (canConfirmReceipt) {
      items.push({ id: "RECEIPT", label: "Recibir distribución" });
    }
    items.push({ id: "REPORTS", label: "Reportes de ventas" });
    if (context?.admin) {
      items.push({ id: "PROMOS", label: "Promociones" });
    }
    return items;
  }, [canConfirmReceipt, context?.admin]);

  return (
    <div className="content kiosk-pos-page">
      <Row>
        <Col md="12">
          <Card className="kiosk-pos-block">
            <CardBody>
              {loading && (
                <div className="text-center py-3">
                  <Spinner /> Cargando POS...
                </div>
              )}

              {!loading && context && (
                <>
                  {context.posTestMode && (
                    <Alert color="warning" className="mb-3">
                      Kiosko en <strong>modo piloto</strong>: las ventas aparecen en este resumen del kiosko,
                      pero <strong>no cuentan</strong> en reportes corporativos de producción.
                    </Alert>
                  )}
                  <div className="kiosk-pos-topbar">
                    <div className="kiosk-pos-topbar-left">
                      {Boolean(context?.admin) &&
                      Array.isArray(context?.kiosks) &&
                      context.kiosks.length > 0 ? (
                        <PosAdminKioskPicker
                          kiosks={context.kiosks}
                          selectedKioskId={selectedKioskId}
                          selectedLabel={selectedKioskName || "Kiosko"}
                          onSelect={handleKioskChange}
                        />
                      ) : (
                        <span className="kiosk-pos-kiosk-badge">{selectedKioskName || context.kioskName}</span>
                      )}
                      <span className="kiosk-pos-topbar-user">
                        <strong>{context.fullName || context.username}</strong>
                      </span>
                      {cashSessionOpen ? (
                        <span className="badge badge-success ml-2">Caja abierta</span>
                      ) : (
                        <span className="badge badge-secondary ml-2">Caja cerrada</span>
                      )}
                      {Number(pendingDepositSummary?.pendingCount || 0) > 0 && (
                        <span
                          className="badge badge-warning ml-2 kiosk-pos-pending-deposit-badge"
                          title={`${pendingDepositSummary.pendingCount} venta(s) sin boleta · ${formatCurrency(pendingDepositSummary.pendingAmount || 0)} en efectivo`}
                        >
                          {pendingDepositSummary.pendingCount} depósito
                          {pendingDepositSummary.pendingCount === 1 ? "" : "s"} pendiente
                          {pendingDepositSummary.pendingCount === 1 ? "" : "s"}
                        </span>
                      )}
                    </div>
                    <div className="kiosk-pos-topbar-tabs">
                      <Nav tabs className="kiosk-pos-tabs">
                        {tabItems.map((tab) => (
                          <NavItem key={tab.id}>
                            <NavLink
                              href="#"
                              className={activeTab === tab.id ? "active" : ""}
                              onClick={(e) => {
                                e.preventDefault();
                                setActiveTab(tab.id);
                              }}
                            >
                              {tab.label}
                              {tab.id === "RECEIPT" && pendingReceiptCount > 0 && (
                                <Badge color="warning" pill className="ml-1">
                                  {pendingReceiptCount}
                                </Badge>
                              )}
                            </NavLink>
                          </NavItem>
                        ))}
                      </Nav>
                    </div>
                  </div>

                  {activeTab === "RESUMEN" && (
                    <PosManagerDashboard
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      active={activeTab === "RESUMEN"}
                    />
                  )}

                  {activeTab === "POS" && (
                    <>
                      {!cashSessionOpen && !cashSessionLoading && (
                        <Alert color="warning" className="mb-3">
                          Debes <strong>abrir caja</strong> (pestaña Caja, fondo Q300) antes de registrar ventas.
                        </Alert>
                      )}
                      {lastSale ? (
                        <PosSuccessScreen sale={lastSale} onNewSale={resetNewSale} />
                      ) : (
                        <div className={`kiosk-pos-layout${cashSessionOpen ? "" : " kiosk-pos-layout-blocked"}`}>
                          <div className="kiosk-pos-layout-catalog">
                            <PosCatalogPanel
                              inventory={context.inventory}
                              productSearch={productSearch}
                              onSearchChange={setProductSearch}
                              catalogView={catalogView}
                              onCatalogViewChange={setCatalogView}
                              categoryFilter={categoryFilter}
                              onCategoryFilterChange={setCategoryFilter}
                              audienceFilter={audienceFilter}
                              onAudienceFilterChange={setAudienceFilter}
                              colorFilter={colorFilter}
                              onColorFilterChange={setColorFilter}
                              cartQtyByColorKey={cartQtyByColorKey}
                              onAddProduct={cashSessionOpen ? addToCart : () => {}}
                              onPickSizedVariant={cashSessionOpen ? setCinchoPickVariant : () => {}}
                            />
                          </div>
                          <div className="kiosk-pos-layout-cart">
                            <PosCartPanel
                              cart={cart}
                              cartTotals={cartTotals}
                              estimatedTotal={cartTotals.estimated}
                              onUpdateLine={updateCartLine}
                              onRemoveLine={removeCartLine}
                              onCheckout={() => setCheckoutOpen(true)}
                              onCancelSale={cancelSale}
                              onApplyPromotion={() => setCheckoutOpen(true)}
                              disabled={!cashSessionOpen || saving}
                            />
                          </div>
                        </div>
                      )}

                      <Card className="kiosk-pos-block mt-3">
                        <CardHeader>
                          <CardTitle tag="h5">Disponibilidad en otros kioskos</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row>
                            <Col md="6">
                              <Label className="kiosk-pos-label">Producto / color</Label>
                              <Input
                                className="kiosk-pos-input-lg"
                                type="select"
                                value={availabilityKey}
                                onChange={(e) => setAvailabilityKey(e.target.value)}
                              >
                                <option value="">Selecciona producto</option>
                                {(context.inventory || []).map((item) => (
                                  <option
                                    key={`opt-${lineKeyFor(item.productId, item.colorId)}`}
                                    value={lineKeyFor(item.productId, item.colorId)}
                                  >
                                    {item.productCode} - {item.productName} ({item.colorName || "Sin color"})
                                  </option>
                                ))}
                              </Input>
                            </Col>
                            <Col md="3" className="d-flex align-items-end mt-2 mt-md-0">
                              <Button
                                color="info"
                                className="kiosk-pos-btn-lg"
                                onClick={checkAvailability}
                                disabled={availabilityLoading}
                              >
                                {availabilityLoading ? "Consultando..." : "Consultar"}
                              </Button>
                            </Col>
                          </Row>
                          {availabilityRows.length > 0 && (
                            <Table responsive className="mt-3">
                              <thead className="text-primary">
                                <tr>
                                  <th>Kiosko</th>
                                  <th>Código</th>
                                  <th>Stock</th>
                                </tr>
                              </thead>
                              <tbody>
                                {availabilityRows.map((row) => (
                                  <tr key={`av-${row.kioskId}`}>
                                    <td>{row.kioskName}</td>
                                    <td>{row.kioskCode || "-"}</td>
                                    <td>{formatQty(row.quantity)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          )}
                        </CardBody>
                      </Card>

                      <PosCinchoPickModal
                        isOpen={Boolean(cinchoPickVariant)}
                        variant={cinchoPickVariant}
                        cartQtyBySize={cinchoPickCartQtyBySize}
                        onPickSize={handlePickCinchoSize}
                        onClose={() => setCinchoPickVariant(null)}
                      />

                      <PosCheckoutModal
                        isOpen={checkoutOpen}
                        onClose={() => setCheckoutOpen(false)}
                        cartItemCount={cartTotals.items}
                        estimatedSubtotal={cartTotals.total}
                        estimatedDiscount={cartTotals.discount}
                        estimatedTotal={cartTotals.estimated}
                        promotions={checkoutPromotions}
                        selectedPromotionId={selectedPromotionId}
                        onPromotionChange={setSelectedPromotionId}
                        notes={notes}
                        onNotesChange={setNotes}
                        comments={comments}
                        onCommentsChange={setComments}
                        saving={saving}
                        onConfirm={submitSale}
                      />

                      <PosInvoiceEmailModal
                        isOpen={Boolean(pendingFelSale)}
                        sale={pendingFelSale}
                        kioskLocationId={selectedKioskId || context?.kioskId}
                        onComplete={handleFelInvoiceComplete}
                        onClose={() => {
                          if (pendingFelSale) {
                            setLastSale(pendingFelSale);
                            setPendingFelSale(null);
                          }
                        }}
                      />
                    </>
                  )}

                  {activeTab === "CAJA" && (
                    <PosCashTab
                      cashSession={cashSession}
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      loading={cashSessionLoading}
                      pendingDepositSummary={pendingDepositSummary}
                      onSessionChange={async () => {
                        await loadCashSession(selectedKioskId || context?.kioskId);
                        await loadPendingDepositSummary(selectedKioskId || context?.kioskId);
                      }}
                    />
                  )}

                  {activeTab === "INVENTORY" && (
                    <PosInventoryTab
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      active={activeTab === "INVENTORY"}
                    />
                  )}

                  {activeTab === "RECEIPT" && canConfirmReceipt && (
                    <PosReceiptTab
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context.kioskName}
                      onReceiptConfirmed={() => loadInitial(selectedKioskId || undefined)}
                      onPendingCountChange={setPendingReceiptCount}
                    />
                  )}

                  {activeTab === "REPORTS" && (
                    <PosReportsTab
                      startDate={startDate}
                      endDate={endDate}
                      onStartDateChange={setStartDate}
                      onEndDateChange={setEndDate}
                      onApplyFilters={applyReportFilters}
                      myReport={myReport}
                      sales={sales}
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      kioskCode={selectedKioskCode || context?.kioskCode}
                      cashSession={cashSession}
                      cashSessionOpen={cashSessionOpen}
                      onSaleUpdated={async () => {
                        await loadCashSession(selectedKioskId || context?.kioskId);
                        await loadInitial(selectedKioskId || undefined);
                        await loadPendingDepositSummary(selectedKioskId || context?.kioskId);
                      }}
                    />
                  )}

                  {activeTab === "PROMOS" && Boolean(context?.admin) && (
                    <PosPromotionsTab
                      promoForm={promoForm}
                      onPromoFormChange={(patch) => setPromoForm((prev) => ({ ...prev, ...patch }))}
                      promotions={promotions}
                      onCreatePromotion={createPromotion}
                      kiosks={context.kiosks}
                    />
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskSales;
