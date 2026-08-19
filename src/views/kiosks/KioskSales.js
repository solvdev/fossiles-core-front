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
  deleteKioskPromotion,
  getCurrentCashSession,
  getKioskPosContext,
  getKioskPromotions,
  getKioskProductAvailability,
  getKioskSaleById,
  getMyKioskSales,
  getOldestPendingFelSale,
  getPendingDepositSummary,
  updateKioskSaleInvoiceContact,
} from "services/kioskPosService";
import { issueTaxInvoiceFromKioskSale } from "services/taxInvoiceService";
import { countShipmentsInTransit } from "services/productDistributionService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { filterVisibleKioskStockRows } from "utils/productCinchoHelper";
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
import PosCashClosuresTab from "./pos/PosCashClosuresTab";
import PosManagerDashboard from "./pos/PosManagerDashboard";
import PosInventoryTab from "./pos/PosInventoryTab";
import { useAuth } from "contexts/AuthContext";
import FilterableSelect from "components/distribution/FilterableSelect";
import {
  variantLineKeyFor,
  resolveCartDiscount,
  formatCurrency,
  formatQty,
  lineKeyFor,
  normalizePosHardwareCondition,
  posVariantNeedsSizePick,
  posVariantSizeEntries,
  mergePosPromotions,
  parseCheckoutPromotionPayload,
  resolveSelectedPromotion,
  saleNeedsFelCertification,
  isKioskSalePendingFel,
  getSaleInternalNumber,
  normalizeFelReceptorEmail,
} from "./pos/posUtils";
import { getHardwareConditionLabel } from "utils/productCinchoHelper";
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
  const [promotions, setPromotions] = useState([]);
  const [adminPromotions, setAdminPromotions] = useState([]);
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
  const [felCertModalOpen, setFelCertModalOpen] = useState(false);
  const [promoForm, setPromoForm] = useState({
    name: "",
    description: "",
    discountType: "PERCENT",
    discountValue: "",
    comboBuyQty: "2",
    comboPayQty: "1",
    kioskLocationId: "",
    audienceCategory: "",
    tiers: [{ audienceCategory: "CABALLERO", categoryId: "", discountValue: "" }],
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
  const [deletingPromotionId, setDeletingPromotionId] = useState(null);

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

  const loadPendingFelSale = async (kioskLocationId) => {
    const locationId = kioskLocationId || selectedKioskId || undefined;
    if (!locationId) {
      setPendingFelSale(null);
      return null;
    }
    try {
      const pending = await getOldestPendingFelSale(locationId);
      if (pending && isKioskSalePendingFel(pending, locationId)) {
        setPendingFelSale(pending);
        return pending;
      }
      setPendingFelSale(null);
      return null;
    } catch {
      return null;
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

  const loadReportData = async (kioskLocationId, fromDate, toDate) => {
    const from = fromDate || getTodayYmdGuatemala();
    const to = toDate || from;
    const kioskSales = await getMyKioskSales(from, to, kioskLocationId);
    setSales(Array.isArray(kioskSales) ? kioskSales : []);
    return { from, to };
  };

  const loadInitial = async (kioskIdOverride) => {
    try {
      setLoading(true);
      const kioskLocationId = kioskIdOverride || selectedKioskId || undefined;
      const today = getTodayYmdGuatemala();
      const ctx = await getKioskPosContext(kioskLocationId, {});
      await loadReportData(kioskLocationId, startDate || today, endDate || today);
      const promoRows = await getKioskPromotions(true, kioskLocationId);
      setContext(ctx ? { ...ctx, inventory: filterVisibleKioskStockRows(ctx.inventory) } : null);
      if (ctx?.kioskId) setSelectedKioskId(String(ctx.kioskId));
      setPromotions(Array.isArray(promoRows) ? promoRows : []);
      await Promise.all([
        loadCashSession(kioskLocationId || ctx?.kioskId),
        loadPendingDepositSummary(kioskLocationId || ctx?.kioskId),
        loadPendingReceiptCount(kioskLocationId || ctx?.kioskId),
        loadPendingFelSale(kioskLocationId || ctx?.kioskId),
      ]);
    } catch (err) {
      showError(err.message || "No se pudo cargar la pantalla POS.");
    } finally {
      setLoading(false);
    }
  };

  const loadAdminPromotions = async () => {
    try {
      const promoRows = await getKioskPromotions(false);
      setAdminPromotions(Array.isArray(promoRows) ? promoRows : []);
    } catch {
      setAdminPromotions([]);
    }
  };

  useEffect(() => {
    loadInitial();
  }, []);

  useEffect(() => {
    if (activeTab === "PROMOS" && context?.admin) {
      loadAdminPromotions();
    }
  }, [activeTab, context?.admin]);

  useEffect(() => {
    if (!selectedKioskId || activeTab !== "POS") return;
    const timer = setTimeout(async () => {
      try {
        const ctx = await getKioskPosContext(selectedKioskId, {
          search: productSearch,
        });
        setContext((prev) =>
          prev ? { ...prev, inventory: filterVisibleKioskStockRows(ctx?.inventory) } : ctx
        );
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
    setPendingFelSale(null);
    setFelCertModalOpen(false);
    await loadInitial(nextKioskId || undefined);
  };

  const addToCart = (inventoryItem, size = null) => {
    if (posVariantNeedsSizePick(inventoryItem) && !size) {
      setCinchoPickVariant(inventoryItem);
      return;
    }

    const key = lineKeyFor(
      inventoryItem.productId,
      inventoryItem.colorId,
      size,
      inventoryItem.hardwareCondition
    );
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
      const catalogUnitPrice = Number(inventoryItem.suggestedUnitPrice || 0);
      return [
        ...prev,
        {
          key,
          productId: inventoryItem.productId,
          productCode: inventoryItem.productCode,
          productName: inventoryItem.productName,
          colorId: inventoryItem.colorId,
          colorName: inventoryItem.colorName,
          hardwareCondition: normalizePosHardwareCondition(inventoryItem.hardwareCondition),
          hardwareLabel: inventoryItem.hardwareLabel || getHardwareConditionLabel(inventoryItem.hardwareCondition),
          size: size || null,
          audienceCategory: inventoryItem.audienceCategory || "UNISEX",
          categoryId: inventoryItem.categoryId ?? null,
          categoryName: inventoryItem.categoryName || "",
          isPackaging: isPackagingProductCode(inventoryItem.productCode),
          availableQty,
          quantity: 1,
          catalogUnitPrice,
          unitPrice: catalogUnitPrice,
          priceEdited: false,
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
        if (patch.quantity != null && Number(patch.quantity) > Number(line.availableQty || 0)) {
          showError(`Cantidad máxima disponible: ${formatQty(line.availableQty)}.`);
          return line;
        }
        const isPackaging = Boolean(line.isPackaging) || isPackagingProductCode(line.productCode);
        // Empaques SUM: sin edición de precio ni modo Final/Con desc. (pueden ir en 0).
        if (isPackaging && (patch.unitPrice != null || patch.priceEdited != null)) {
          return line;
        }
        if (patch.unitPrice != null) {
          if (!canEditPosPrices) {
            return line;
          }
          const nextPrice = Number(patch.unitPrice);
          const catalogZero = !(Number(line.catalogUnitPrice) > 0);
          // Catálogo en 0 (ej. llaveros promocionales): permiten 0; el resto exige > 0.
          if (!Number.isFinite(nextPrice) || nextPrice < 0 || (!catalogZero && !(nextPrice > 0))) {
            showError(
              catalogZero
                ? "El precio unitario no puede ser negativo."
                : "El precio unitario debe ser mayor a cero."
            );
            return line;
          }
          // Cambiar el monto no decide el descuento: eso lo controla el botón Final / Con desc.
          return {
            ...line,
            unitPrice: nextPrice,
          };
        }
        if (patch.priceEdited != null) {
          if (!canEditPosPrices) {
            return line;
          }
          return { ...line, priceEdited: Boolean(patch.priceEdited) };
        }
        return { ...line, ...patch };
      })
    );
  };

  const removeCartLine = (key) => setCart((prev) => prev.filter((line) => line.key !== key));


  const cartQtyByColorKey = useMemo(() => {
    const map = {};
    cart.forEach((line) => {
      const variantKey = variantLineKeyFor(line.productId, line.colorId, line.hardwareCondition);
      map[variantKey] = (map[variantKey] || 0) + Number(line.quantity || 0);
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
        normalizePosHardwareCondition(line.hardwareCondition)
          === normalizePosHardwareCondition(cinchoPickVariant.hardwareCondition) &&
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

    // Líneas priceEdited no entran al descuento (precio final); el resto sí.
    const resolved = resolveCartDiscount(cart, {
      selectedPromotion,
      promotions,
      subtotal: subtotal.total,
    });

    return {
      items: subtotal.items,
      total: subtotal.total,
      discount: resolved.discount,
      estimated: Math.max(0, subtotal.total - resolved.discount),
      autoApplied: resolved.autoApplied,
      promotionName: resolved.promotionName,
    };
  }, [cart, selectedPromotion, promotions]);

  const applyReportFilters = async (fromOverride, toOverride) => {
    const from = fromOverride || startDate || getTodayYmdGuatemala();
    const to = toOverride || endDate || from;
    if (!fromOverride) {
      if (!startDate) setStartDate(from);
      if (!endDate) setEndDate(to);
    } else {
      setStartDate(from);
      setEndDate(to);
    }
    if (from > to) {
      showError("La fecha de inicio no puede ser posterior a la fecha fin.");
      return;
    }
    try {
      setLoading(true);
      await loadReportData(selectedKioskId || context?.kioskId, from, to);
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
    const locationId = selectedKioskId || context?.kioskId;
    const pendingBefore = await loadPendingFelSale(locationId);
    if (pendingBefore) {
      setCheckoutOpen(false);
      showError(
        `Hay una venta pendiente de certificar FEL (${pendingBefore.saleNumber || `#${pendingBefore.id}`}). Certifícala antes de continuar.`
      );
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
      const isPackaging = Boolean(line.isPackaging) || isPackagingProductCode(line.productCode);
      // Empaques y productos con precio de catálogo 0 pueden ir en 0; el resto exige > 0.
      const catalogZero = !(Number(line.catalogUnitPrice) > 0);
      if (canEditPosPrices && !isPackaging && !catalogZero && !(Number(line.unitPrice) > 0)) {
        showError(`Precio inválido para ${line.productName}.`);
        return;
      }
    }
    try {
      setSaving(true);
      const promoPayload = checkoutData.chargeWithoutDiscount
        ? { promotionId: null, manualDiscountPercent: null }
        : parseCheckoutPromotionPayload(checkoutData.promotionId ?? selectedPromotionId);
      const invoiceEmail = normalizeFelReceptorEmail(checkoutData.invoiceEmail);
      const invoicePhone = String(checkoutData.invoicePhone || "").trim() || null;
      let sale = await createKioskPosSale({
        kioskLocationId: selectedKioskId ? Number(selectedKioskId) : null,
        customerTaxId: normalizedTaxId,
        customerName: invoiceName || null,
        address: null,
        phone: invoicePhone,
        email: invoiceEmail || null,
        paymentMethod: checkoutData.paymentMethod || "EFECTIVO",
        amountReceived: checkoutData.amountReceived,
        cashAmount: checkoutData.cashAmount,
        cardAmount: checkoutData.cardAmount,
        cardAuthNumber: checkoutData.cardAuthNumber,
        cardLast4: checkoutData.cardLast4,
        cardBrand: checkoutData.cardBrand,
        cardVoucherAmount: checkoutData.cardVoucherAmount,
        card2Amount: checkoutData.card2Amount,
        card2AuthNumber: checkoutData.card2AuthNumber,
        card2Last4: checkoutData.card2Last4,
        card2Brand: checkoutData.card2Brand,
        card2VoucherAmount: checkoutData.card2VoucherAmount,
        notes: checkoutData.notes,
        comments: checkoutData.comments,
        promotionId: promoPayload.promotionId,
        manualDiscountPercent: promoPayload.manualDiscountPercent,
        chargeWithoutDiscount: Boolean(checkoutData.chargeWithoutDiscount),
        requestInvoice: true,
        saleDate: today,
        items: cart.map((line) => {
          const item = {
            productId: line.productId,
            colorId: line.colorId || null,
            size: line.size || null,
            hardwareCondition: line.hardwareCondition || "NUEVO",
            quantity: Number(line.quantity || 0),
          };
          // Precio final sin descuento: modo Final, o catálogo en 0 con monto capturado en caja.
          const catalogZero = !(Number(line.catalogUnitPrice) > 0);
          if (
            Number(line.unitPrice) > 0
            && (line.priceEdited || catalogZero)
          ) {
            item.unitPrice = Number(line.unitPrice);
          }
          return item;
        }),
      });

      if (saleNeedsFelCertification(sale)) {
        try {
          await updateKioskSaleInvoiceContact(sale.id, locationId, {
            email: invoiceEmail || null,
            phone: invoicePhone,
          });
          await issueTaxInvoiceFromKioskSale(sale.id);
          let refreshed = await getKioskSaleById(sale.id, locationId);
          if (!getSaleInternalNumber(refreshed)) {
            await new Promise((resolve) => setTimeout(resolve, 400));
            refreshed = await getKioskSaleById(sale.id, locationId);
          }
          sale = refreshed || sale;
          if (invoiceEmail) {
            showSuccess("Venta registrada y factura certificada. Se enviará copia al correo.");
          } else {
            showSuccess("Venta registrada y factura electrónica certificada.");
          }
        } catch (felErr) {
          setCheckoutOpen(false);
          setCart([]);
          setNotes("");
          setComments("");
          setSelectedPromotionId("");
          upsertSaleInList(sale);
          setPendingFelSale(sale);
          setFelCertModalOpen(true);
          await loadInitial(selectedKioskId || undefined);
          showError(
            felErr.message
              || "La venta quedó registrada pero no se pudo certificar. Completa la certificación para continuar."
          );
          return;
        }
      } else {
        showSuccess(`Venta ${sale.saleNumber || ""} registrada correctamente.`.trim());
      }

      setCheckoutOpen(false);
      setCart([]);
      setNotes("");
      setComments("");
      setSelectedPromotionId("");
      setPendingFelSale(null);
      setLastSale(sale);
      upsertSaleInList(sale);
      await loadInitial(selectedKioskId || undefined);
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
        const rawTiers = (promoForm.tiers || [])
          .map((tier) => ({
            audienceCategory: tier.audienceCategory,
            categoryId: tier.categoryId ? Number(tier.categoryId) : null,
            discountValue: Number(tier.discountValue || 0),
          }))
          .filter((tier) => tier.categoryId && tier.discountValue > 0);
        if (!rawTiers.length) {
          showError("Indique al menos un tier con categoría y porcentaje mayor a cero.");
          return;
        }
        const tierKeys = rawTiers.map((tier) => `${tier.audienceCategory}:${tier.categoryId}`);
        if (new Set(tierKeys).size !== tierKeys.length) {
          showError("No puede repetir la misma audiencia y categoría en dos tiers.");
          return;
        }
        payload.tiers = rawTiers;
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
        tiers: [{ audienceCategory: "CABALLERO", categoryId: "", discountValue: "" }],
        startDate: "",
        endDate: "",
        active: true,
      });
      showSuccess("Promoción creada correctamente.");
      await Promise.all([
        loadAdminPromotions(),
        getKioskPromotions(true, selectedKioskId || undefined).then((rows) =>
          setPromotions(Array.isArray(rows) ? rows : [])
        ),
      ]);
    } catch (err) {
      showError(err.message || "No se pudo crear la promoción.");
    }
  };

  const deletePromotion = async (promo) => {
    if (!promo?.id) return;
    const promoName = promo.name || "esta promoción";
    if (!window.confirm(`¿Eliminar "${promoName}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    try {
      setDeletingPromotionId(promo.id);
      await deleteKioskPromotion(promo.id);
      if (String(selectedPromotionId) === String(promo.id)) {
        setSelectedPromotionId("");
      }
      showSuccess("Promoción eliminada correctamente.");
      await Promise.all([
        loadAdminPromotions(),
        getKioskPromotions(true, selectedKioskId || undefined).then((rows) =>
          setPromotions(Array.isArray(rows) ? rows : [])
        ),
      ]);
    } catch (err) {
      showError(err.message || "No se pudo eliminar la promoción.");
    } finally {
      setDeletingPromotionId(null);
    }
  };

  const resetNewSale = () => {
    setLastSale(null);
    void loadPendingFelSale(selectedKioskId || context?.kioskId);
  };

  /** Tras certificar / anular / editar: fusiona la venta en la lista para que NO. INTERNO y FEL se vean al instante. */
  const upsertSaleInList = (sale) => {
    if (!sale?.id) return;
    setSales((prev) => {
      const list = Array.isArray(prev) ? [...prev] : [];
      const idx = list.findIndex((row) => Number(row.id) === Number(sale.id));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...sale };
        return list;
      }
      return [sale, ...list];
    });
  };

  const refreshSalesList = async () => {
    const locationId = selectedKioskId || context?.kioskId;
    await loadReportData(locationId, startDate, endDate);
  };

  const openCheckout = async () => {
    if (!cashSessionOpen || saving) return;
    const locationId = selectedKioskId || context?.kioskId;
    const pending = await loadPendingFelSale(locationId);
    if (pending) {
      showError(
        `Hay una venta pendiente de certificar FEL (${pending.saleNumber || `#${pending.id}`}). Certifícala antes de continuar.`
      );
      return;
    }
    setCheckoutOpen(true);
  };

  const handleFelInvoiceComplete = async (sale) => {
    setFelCertModalOpen(false);
    if (cart.length === 0) {
      setLastSale(sale);
    }
    upsertSaleInList(sale);
    const locationId = selectedKioskId || context?.kioskId;
    try {
      await refreshSalesList();
      const nextPending = await loadPendingFelSale(locationId);
      if (nextPending) {
        showSuccess("Factura certificada. Queda otra venta pendiente de FEL.");
        return;
      }
      setPendingFelSale(null);
    } catch {
      setPendingFelSale(null);
    }
  };

  const cancelSale = () => {
    setCart([]);
    setSelectedPromotionId("");
  };

  const availabilityOptions = useMemo(
    () =>
      (context?.inventory || []).map((item) => ({
        value: lineKeyFor(item.productId, item.colorId, null, item.hardwareCondition),
        label: `${item.productCode} - ${item.productName} (${item.colorName || "Sin color"}${
          item.hardwareLabel ? ` · ${item.hardwareLabel}` : ""
        })`,
        searchText: `${item.productCode} ${item.productName} ${item.colorName || ""} ${item.hardwareLabel || ""}`,
      })),
    [context?.inventory]
  );

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

  const canEditPosPrices = useMemo(() => {
    const code = String(selectedKioskCode || "").trim().toUpperCase();
    const name = String(selectedKioskName || "").trim().toUpperCase();
    return code === "A15" || name.includes("MIRAFLORES");
  }, [selectedKioskCode, selectedKioskName]);

  const selectedKioskOpeningCash = useMemo(() => {
    if (!context) return 300;
    if (context.admin && Array.isArray(context.kiosks)) {
      const match = context.kiosks.find((k) => String(k.kioskId) === String(selectedKioskId));
      if (match?.posOpeningCashAmount != null) return Number(match.posOpeningCashAmount);
    }
    return Number(context.posOpeningCashAmount ?? 300);
  }, [context, selectedKioskId]);

  const tabItems = useMemo(() => {
    const items = [
      { id: "RESUMEN", label: "Resumen" },
      { id: "POS", label: "POS" },
      { id: "CAJA", label: "Caja" },
      { id: "CIERRES", label: "Cierres" },
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
                          Debes <strong>abrir caja</strong> (pestaña Caja, fondo {formatCurrency(selectedKioskOpeningCash)}) antes de registrar ventas.
                        </Alert>
                      )}
                      {isKioskSalePendingFel(pendingFelSale, selectedKioskId || context?.kioskId) && (
                        <Alert color="warning" className="mb-3 kiosk-pos-pending-fel-alert">
                          <div>
                            Venta pendiente de certificar FEL:{" "}
                            <strong>{pendingFelSale.saleNumber || `#${pendingFelSale.id}`}</strong>
                            . Debes certificarla antes de cobrar otra venta (correlativo).
                          </div>
                          <Button
                            color="danger"
                            className="kiosk-pos-pending-fel-btn"
                            onClick={() => setFelCertModalOpen(true)}
                          >
                            Certificar factura
                          </Button>
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
                              onCheckout={() => void openCheckout()}
                              onCancelSale={cancelSale}
                              onApplyPromotion={() => void openCheckout()}
                              disabled={!cashSessionOpen || saving}
                              canEditPrices={canEditPosPrices}
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
                              <FilterableSelect
                                value={availabilityKey}
                                onChange={setAvailabilityKey}
                                options={availabilityOptions}
                                placeholder="Buscar producto..."
                                emptyLabel="Selecciona producto"
                                inputClassName="kiosk-pos-input-lg"
                              />
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
                    </>
                  )}

                  {activeTab === "CAJA" && (
                    <PosCashTab
                      cashSession={cashSession}
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      posOpeningCashAmount={selectedKioskOpeningCash}
                      loading={cashSessionLoading}
                      pendingDepositSummary={pendingDepositSummary}
                      onSessionChange={async () => {
                        const locationId = selectedKioskId || context?.kioskId;
                        await loadCashSession(locationId);
                        await loadPendingDepositSummary(locationId);
                        await loadReportData(locationId, startDate, endDate);
                      }}
                    />
                  )}

                  {activeTab === "CIERRES" && (
                    <PosCashClosuresTab
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      isAdmin={Boolean(context?.admin)}
                      kiosks={context?.kiosks || []}
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
                      sales={sales}
                      kioskLocationId={selectedKioskId || context?.kioskId}
                      kioskName={selectedKioskName || context?.kioskName}
                      kioskCode={selectedKioskCode || context?.kioskCode}
                      generatedByName={
                        context?.fullName ||
                        [context?.firstName, context?.lastName].filter(Boolean).join(" ").trim() ||
                        context?.username
                      }
                      cashSession={cashSession}
                      cashSessionOpen={cashSessionOpen}
                      onSaleUpdated={async (updated) => {
                        upsertSaleInList(updated);
                        const locationId = selectedKioskId || context?.kioskId;
                        await loadCashSession(locationId);
                        await loadReportData(locationId, startDate, endDate);
                        await loadPendingDepositSummary(locationId);
                        await loadPendingFelSale(locationId);
                        // Anulaciones / cambios de pago pueden afectar inventario del turno.
                        if (updated == null || String(updated.status || "").toUpperCase() === "VOID") {
                          await loadInitial(selectedKioskId || undefined);
                        }
                      }}
                    />
                  )}

                  {activeTab === "PROMOS" && Boolean(context?.admin) && (
                    <PosPromotionsTab
                      promoForm={promoForm}
                      onPromoFormChange={(patch) => setPromoForm((prev) => ({ ...prev, ...patch }))}
                      promotions={adminPromotions}
                      onCreatePromotion={createPromotion}
                      onDeletePromotion={deletePromotion}
                      deletingPromotionId={deletingPromotionId}
                      kiosks={context.kiosks}
                    />
                  )}

                  <PosInvoiceEmailModal
                    isOpen={
                      felCertModalOpen
                      && isKioskSalePendingFel(pendingFelSale, selectedKioskId || context?.kioskId)
                    }
                    sale={pendingFelSale}
                    kioskLocationId={selectedKioskId || context?.kioskId}
                    onComplete={handleFelInvoiceComplete}
                    onClose={() => setFelCertModalOpen(false)}
                  />
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
