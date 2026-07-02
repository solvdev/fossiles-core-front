import {
  filterCartLinesForPromotion,
  productMatchesAudienceFilter,
  buildPromotionTierMap,
  normalizeAudienceCategory,
} from "utils/productAudienceHelper";
import { hasInventorySizeBreakdown } from "utils/inventoryVariantHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";

export const POS_CATALOG_VIEWS = [
  { value: "PRODUCTS", label: "Productos" },
  { value: "PACKAGING", label: "Empaques" },
];

export const POS_CATEGORY_ORDER = [
  "Billeteras",
  "Bolsos dama",
  "Bolsos teen",
  "Accesorios",
  "Maletines",
  "Manos libres",
  "Mariconeras",
  "Monederos",
  "Pulseras",
  "Tarjeteros",
  "Artículos minimalistas",
];

export const POS_COLOR_ORDER = [
  "Azul",
  "Café",
  "Coñac",
  "Negro",
  "Negro acabado flores",
  "Rojo",
  "Rojo acabado flores",
  "Salmón acabado flores",
  "Tostado",
  "Whisky",
];

export const POS_COLOR_SWATCHES = {
  Azul: "#2563EB",
  Café: "#6B4423",
  Coñac: "#8B4513",
  Negro: "#1A1A1A",
  "Negro acabado flores": "#2D2D2D",
  Rojo: "#DC2626",
  "Rojo acabado flores": "#B91C1C",
  "Salmón acabado flores": "#F87171",
  Tostado: "#C4A882",
  Whisky: "#92400E",
};

export const formatCurrency = (value) => `Q ${Number(value || 0).toFixed(2)}`;
export const formatQty = (value) => Number(value || 0).toFixed(2);

export const lineKeyFor = (productId, colorId, size) => {
  const base = `${productId}:${colorId || "none"}`;
  const normalizedSize = String(size || "").trim();
  return normalizedSize ? `${base}:${normalizedSize}` : base;
};

export const colorLineKeyFor = (productId, colorId) => lineKeyFor(productId, colorId);

export const sortPosSizeKeys = (keys) =>
  [...(keys || [])].sort((a, b) => {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
    return String(a).localeCompare(String(b), "es", { numeric: true });
  });

export const posVariantNeedsSizePick = (variant) => hasInventorySizeBreakdown(variant?.sizes);

export const posVariantSizeEntries = (variant) => {
  const sizes = variant?.sizes;
  if (!sizes || typeof sizes !== "object") return [];
  return sortPosSizeKeys(Object.keys(sizes))
    .map((size) => ({ size, quantity: Number(sizes[size] || 0) }))
    .filter((entry) => entry.quantity > 0);
};

export const posVariantStockQty = (variant) => {
  if (posVariantNeedsSizePick(variant)) {
    return posVariantSizeEntries(variant).reduce((sum, entry) => sum + entry.quantity, 0);
  }
  return Number(variant?.quantity || 0);
};

export const getColorSwatch = (colorName) => {
  const name = String(colorName || "").trim();
  if (POS_COLOR_SWATCHES[name]) return POS_COLOR_SWATCHES[name];
  const norm = normalizePosLabel(name);
  const matched = POS_COLOR_ORDER.find((c) => {
    const cNorm = normalizePosLabel(c);
    return cNorm === norm || norm.includes(cNorm) || cNorm.includes(norm);
  });
  return matched ? POS_COLOR_SWATCHES[matched] : "#9CA3AF";
};

/** Normaliza etiquetas para comparar categorías/colores sin depender de mayúsculas o tildes. */
export const normalizePosLabel = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

export const itemMatchesCategory = (item, categoryFilter) => {
  if (!categoryFilter) return true;
  return String(item.categoryId) === String(categoryFilter);
};

export const itemMatchesColor = (item, colorFilter) => {
  if (!colorFilter) return true;
  const itemNorm = normalizePosLabel(item.colorName);
  const filterNorm = normalizePosLabel(colorFilter);
  if (!itemNorm || !filterNorm) return false;
  return itemNorm === filterNorm || itemNorm.includes(filterNorm) || filterNorm.includes(itemNorm);
};

export const buildCategoryOptions = (inventory) => {
  const inventoryCategories = new Map();
  (inventory || []).forEach((item) => {
    if (item.categoryId == null || !item.categoryName) return;
    const norm = normalizePosLabel(item.categoryName);
    if (!inventoryCategories.has(norm)) {
      inventoryCategories.set(norm, {
        id: item.categoryId,
        name: String(item.categoryName).trim(),
      });
    }
  });

  const options = [];
  const usedNorms = new Set();

  POS_CATEGORY_ORDER.forEach((label) => {
    const norm = normalizePosLabel(label);
    const exact = inventoryCategories.get(norm);
    if (exact) {
      options.push({ id: exact.id, label, disabled: false });
      usedNorms.add(norm);
      return;
    }
    let matched = null;
    inventoryCategories.forEach((cat, invNorm) => {
      if (matched || usedNorms.has(invNorm)) return;
      if (invNorm.includes(norm) || norm.includes(invNorm)) {
        matched = cat;
        usedNorms.add(invNorm);
      }
    });
    if (matched) {
      options.push({ id: matched.id, label, disabled: false });
      return;
    }
    options.push({ id: null, label, disabled: true });
  });

  inventoryCategories.forEach((cat, norm) => {
    if (usedNorms.has(norm)) return;
    options.push({ id: cat.id, label: cat.name, disabled: false });
  });

  return options;
};

export const buildColorOptions = (inventory) => {
  const availableNorms = new Set();
  (inventory || []).forEach((item) => {
    const name = String(item.colorName || "").trim();
    if (name) availableNorms.add(normalizePosLabel(name));
  });

  return POS_COLOR_ORDER.map((color) => {
    const norm = normalizePosLabel(color);
    const disabled = ![...availableNorms].some(
      (available) => available === norm || available.includes(norm) || norm.includes(available)
    );
    return { color, disabled };
  });
};

export const filterPosInventory = (inventory, { search, categoryFilter, colorFilter, audienceFilter, catalogView }) => {
  const query = normalizePosLabel(search);
  return (inventory || []).filter((item) => {
    const isPackaging = isPackagingProductCode(item.productCode);
    if (catalogView === "PACKAGING" && !isPackaging) return false;
    if (catalogView === "PRODUCTS" && isPackaging) return false;
    if (catalogView === "PACKAGING") {
      if (!query) return true;
      const text = normalizePosLabel(`${item.productCode || ""} ${item.productName || ""}`);
      return text.includes(query);
    }
    if (!itemMatchesCategory(item, categoryFilter)) return false;
    if (!productMatchesAudienceFilter(item, audienceFilter)) return false;
    if (!itemMatchesColor(item, colorFilter)) return false;
    if (!query) return true;
    const text = normalizePosLabel(
      `${item.productCode || ""} ${item.productName || ""} ${item.colorName || ""}`
    );
    return text.includes(query);
  });
};

export const sortPackagingInventory = (items) =>
  [...(items || [])].sort((a, b) =>
    String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", { numeric: true })
  );

export const sortVariantsByColor = (variants) => {
  const colorIndex = (name) => {
    const idx = POS_COLOR_ORDER.indexOf(String(name || "").trim());
    return idx >= 0 ? idx : POS_COLOR_ORDER.length;
  };
  return [...(variants || [])].sort((a, b) => {
    const byOrder = colorIndex(a.colorName) - colorIndex(b.colorName);
    if (byOrder !== 0) return byOrder;
    return String(a.colorName || "").localeCompare(String(b.colorName || ""), "es", {
      sensitivity: "base",
    });
  });
};

export const groupInventoryByProduct = (items) => {
  const groups = new Map();
  (items || []).forEach((item) => {
    const productId = item.productId;
    if (!groups.has(productId)) {
      groups.set(productId, {
        productId,
        productCode: item.productCode,
        productName: item.productName,
        productImageUrl: item.productImageUrl,
        suggestedUnitPrice: item.suggestedUnitPrice,
        categoryId: item.categoryId,
        categoryName: item.categoryName,
        variants: [],
      });
    }
    groups.get(productId).variants.push(item);
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    variants: sortVariantsByColor(group.variants),
  }));
};

export const resolveImageUrl = (rawValue) => {
  const value = String(rawValue || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value) || value.startsWith("data:")) {
    return value;
  }
  const apiBase = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
  try {
    const origin = new URL(apiBase).origin;
    return `${origin}${value.startsWith("/") ? value : `/${value}`}`;
  } catch {
    return value;
  }
};

/** FEL: apellidos,,nombres o razón social con comas → texto legible para factura */
export const formatFelCustomerName = (raw) => {
  const trimmed = String(raw || "").trim();
  if (!trimmed) return "";
  const joinParts = (text) =>
    text
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .join(" ");
  if (trimmed.includes(",,")) {
    const [apellidosRaw = "", nombresRaw = ""] = trimmed.split(",,");
    const apellidos = joinParts(apellidosRaw);
    const nombres = joinParts(nombresRaw);
    if (nombres && apellidos) return `${nombres} ${apellidos}`;
    return nombres || apellidos;
  }
  return joinParts(trimmed);
};

export const normalizeNit = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/-/g, "");

export const isValidGuatemalaNit = (rawNit) => {
  const nit = normalizeNit(rawNit);
  if (!nit || nit === "CF") return true;
  if (nit.length < 2) return false;
  const body = nit.slice(0, -1);
  const verifier = nit.slice(-1);
  if (!/^\d+$/.test(body) || !/^[0-9K]$/.test(verifier)) return false;
  let factor = body.length + 1;
  let total = 0;
  for (const char of body) {
    total += Number(char) * factor;
    factor -= 1;
  }
  const modulus = (11 - (total % 11)) % 11;
  const expected = modulus === 10 ? "K" : String(modulus);
  return verifier === expected;
};

export const QUICK_PERCENT_PROMOS = [
  { id: "__percent_10", name: "Descuento 10%", discountType: "PERCENT", discountValue: 10, isQuickPercent: true },
  { id: "__percent_15", name: "Descuento 15%", discountType: "PERCENT", discountValue: 15, isQuickPercent: true },
  { id: "__percent_20", name: "Descuento 20%", discountType: "PERCENT", discountValue: 20, isQuickPercent: true },
];

export const mergePosPromotions = (promotions) => [
  ...QUICK_PERCENT_PROMOS,
  ...(promotions || []).filter(
    (p) => !QUICK_PERCENT_PROMOS.some((q) => String(q.name).toLowerCase() === String(p.name || "").toLowerCase())
  ),
];

export const resolveSelectedPromotion = (promotionId, promotions) => {
  const quick = QUICK_PERCENT_PROMOS.find((p) => String(p.id) === String(promotionId));
  if (quick) return quick;
  return (promotions || []).find((p) => String(p.id) === String(promotionId));
};

export const parseCheckoutPromotionPayload = (promotionId) => {
  if (String(promotionId) === "__percent_10") {
    return { promotionId: null, manualDiscountPercent: 10 };
  }
  if (String(promotionId) === "__percent_15") {
    return { promotionId: null, manualDiscountPercent: 15 };
  }
  if (String(promotionId) === "__percent_20") {
    return { promotionId: null, manualDiscountPercent: 20 };
  }
  return {
    promotionId: promotionId ? Number(promotionId) : null,
    manualDiscountPercent: null,
  };
};

/** Correo(s) FEL: varios separados por ';' sin espacios. */
export const normalizeFelReceptorEmail = (raw) =>
  String(raw || "")
    .split(/[;,]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .join(";");

export const saleNeedsFelCertification = (sale, requestInvoice) => {
  const taxId = String(sale?.customerTaxId || "CF")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  if (taxId && taxId !== "CF" && taxId !== "C/F") return true;
  return requestInvoice === true;
};

export const estimatePromotionDiscount = (subtotal, promotion, cartLines) => {
  if (!promotion || subtotal <= 0) return 0;
  const type = String(promotion.discountType || "").toUpperCase();
  if (type.includes("TIERED")) {
    const tierMap = buildPromotionTierMap(promotion);
    if (!Object.keys(tierMap).length) return 0;
    const discount = (cartLines || []).reduce((sum, line) => {
      const audience = normalizeAudienceCategory(line?.audienceCategory);
      const pct = Number(tierMap[audience] || 0);
      if (pct <= 0) return sum;
      const qty = Number(line.quantity || 0);
      const price = Number(line.unitPrice || 0);
      return sum + (qty * price * pct) / 100;
    }, 0);
    return Math.min(subtotal, discount);
  }
  const eligibleLines = promotion.isQuickPercent
    ? cartLines || []
    : filterCartLinesForPromotion(cartLines, promotion.audienceCategory);
  const eligibleSubtotal = (eligibleLines || []).reduce((sum, line) => {
    const qty = Number(line.quantity || 0);
    const price = Number(line.unitPrice || 0);
    return sum + qty * price;
  }, 0);
  if (eligibleSubtotal <= 0) return 0;
  const value = Number(promotion.discountValue || 0);
  if (type.includes("COMBO")) {
    const buy = Number(promotion.comboBuyQty || 0);
    const pay = Number(promotion.comboPayQty || 0);
    if (buy <= 0 || pay <= 0 || pay >= buy) return 0;
    const freePerGroup = buy - pay;
    const units = [];
    eligibleLines.forEach((line) => {
      const qty = Math.floor(Number(line.quantity || 0));
      const price = Number(line.unitPrice || 0);
      for (let i = 0; i < qty; i++) units.push(price);
    });
    units.sort((a, b) => a - b);
    const freeUnits = Math.floor(units.length / buy) * freePerGroup;
    return units.slice(0, freeUnits).reduce((sum, p) => sum + p, 0);
  }
  if (type.includes("PERCENT")) {
    return Math.min(subtotal, (eligibleSubtotal * value) / 100);
  }
  return Math.min(subtotal, value);
};

export const normalizeSalePaymentMethod = (value) => {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!normalized || normalized.includes("EFECTIVO") || normalized === "CASH") {
    return "EFECTIVO";
  }
  if (normalized.includes("TARJETA") || normalized.includes("CARD")) {
    return "TARJETA";
  }
  if (normalized.includes("MIXTO") || normalized.includes("MIXED")) {
    return "MIXTO";
  }
  return normalized;
};

export const getSaleCashAmount = (sale) => {
  if (!sale) return 0;
  const method = normalizeSalePaymentMethod(sale.paymentMethod);
  if (method === "EFECTIVO") {
    const cash = Number(sale.cashAmount ?? sale.amountReceived ?? sale.totalAmount ?? 0);
    return Number.isFinite(cash) ? cash : 0;
  }
  if (method === "MIXTO") {
    const cash = Number(sale.cashAmount ?? 0);
    if (cash > 0) return cash;
    const total = Number(sale.totalAmount ?? 0);
    const card = Number(sale.cardAmount ?? 0);
    return Math.max(total - card, 0);
  }
  return 0;
};

export const isDepositApplicable = (sale) => {
  if (!sale) return false;
  if (String(sale.status || "").toUpperCase() === "VOID") return false;
  const status = String(sale.status || "COMPLETED").toUpperCase();
  if (status !== "COMPLETED") return false;
  return getSaleCashAmount(sale) > 0;
};

export const isSalePendingDeposit = (sale) => {
  if (!sale || sale.depositSlipNumber) return false;
  return isDepositApplicable(sale);
};
