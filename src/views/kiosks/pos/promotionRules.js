/**
 * Promociones dinámicas (discountType = RULES): plantillas, resumen en palabras y armado del payload.
 * El cálculo real lo hace el back (PromotionRuleEngine); aquí solo se arma y se explica la regla.
 */

export const RULES_TYPE = "RULES";

export const isRulesPromotion = (promo) =>
  String(promo?.discountType || "").toUpperCase().includes("RULE");

export const isDraftPromotion = (promo) => String(promo?.status || "").toUpperCase() === "DRAFT";

export const ACTION_TYPE_OPTIONS = [
  {
    value: "POSITION",
    label: "Por posición de precio",
    help: "Ordena las piezas por precio y da un % a cada posición (ej. la más cara 15%, la siguiente 30%).",
  },
  { value: "PERCENT", label: "% a cada pieza", help: "Mismo porcentaje para todas las piezas que entran." },
  { value: "QTY_TIERS", label: "Escalones por cantidad", help: "Más piezas, más descuento (ej. 2 piezas 10%, 3+ 15%)." },
  {
    value: "AMOUNT_TIERS",
    label: "Escalones por monto",
    help: "Según cuánto suman las piezas (ej. desde Q1,000 te descuentan Q150).",
  },
  {
    value: "BUY_GET",
    label: "Compra A, descuento en B",
    help: "Al comprar ciertas piezas, otras llevan descuento (ej. compra un cincho y la billetera va al 30%).",
  },
  { value: "AMOUNT_EACH", label: "Q menos por pieza", help: "Resta un monto fijo a cada pieza." },
  { value: "FIXED_PRICE", label: "Precio fijo por pieza", help: "Cada pieza queda en un precio (ej. billeteras a Q199)." },
];

export const DAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
];
const DAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export const PAYMENT_OPTIONS = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "TRANSFERENCIA", label: "Transferencia" },
  { value: "MIXTO", label: "Mixto" },
];

export const AUDIENCE_OPTIONS = [
  { value: "DAMA", label: "Dama" },
  { value: "CABALLERO", label: "Caballero" },
  { value: "UNISEX", label: "Unisex" },
];

export const emptyFilter = () => ({
  audiences: [],
  categoryIds: [],
  productIds: [],
  colorIds: [],
  sizes: [],
  minUnitPrice: "",
  maxUnitPrice: "",
  excludeCategoryIds: [],
  excludeProductIds: [],
});

export const emptyRuleConfig = () => ({
  version: 1,
  template: "",
  conditions: { daysOfWeek: [], timeFrom: "", timeTo: "", paymentMethods: [], minQty: "", minAmount: "" },
  filter: emptyFilter(),
  action: {
    type: "POSITION",
    value: "",
    order: "DESC",
    groupSize: 2,
    positions: ["", ""],
    remainderPercent: "",
    incompleteGroup: "POSITIONS",
    positionsMinQty: "",
    qtyTiers: [{ minQty: 2, percent: "" }],
    amountTiers: [{ minAmount: "", percent: "", amount: "" }],
    buyFilter: emptyFilter(),
    buyQty: 1,
    getQty: 1,
    getPercent: "",
  },
  limits: { maxDiscount: "", maxApplications: "" },
});

const withAction = (template, action, conditions = {}, limits = {}) => {
  const base = emptyRuleConfig();
  return {
    ...base,
    template,
    conditions: { ...base.conditions, ...conditions },
    action: { ...base.action, ...action },
    limits: { ...base.limits, ...limits },
  };
};

export const RULE_TEMPLATES = [
  {
    id: "BF_CHEAPEST",
    label: "Black Friday: la más barata 30%, el resto 15%",
    description: "1 pieza: 15%. Desde 2 piezas: solo la más barata lleva 30% y todas las demás 15%.",
    build: () =>
      withAction("BF_CHEAPEST", {
        type: "POSITION",
        order: "ASC",
        groupSize: 0,
        positions: [30],
        remainderPercent: 15,
        positionsMinQty: 2,
      }),
  },
  {
    id: "BF_PAIRS",
    label: "La cara 15%, la barata 30% (en pares)",
    description: "De cada par (de la más cara a la más barata): la 1.ª 15%, la 2.ª 30%. La que sobra, 15%.",
    build: () =>
      withAction(
        "BF_PAIRS",
        { type: "POSITION", order: "DESC", groupSize: 2, positions: [15, 30], incompleteGroup: "REMAINDER", remainderPercent: 15 },
        { minQty: 2 }
      ),
  },
  {
    id: "TWO_FOR_ONE",
    label: "2x1",
    description: "De cada par, la más barata gratis.",
    build: () => withAction("TWO_FOR_ONE", { type: "POSITION", order: "DESC", groupSize: 2, positions: [0, 100] }),
  },
  {
    id: "THREE_FOR_TWO",
    label: "3x2",
    description: "De cada 3 piezas, la más barata gratis.",
    build: () => withAction("THREE_FOR_TWO", { type: "POSITION", order: "DESC", groupSize: 3, positions: [0, 0, 100] }),
  },
  {
    id: "SECOND_HALF",
    label: "Segunda a mitad de precio",
    description: "De cada par, la más barata al 50%.",
    build: () => withAction("SECOND_HALF", { type: "POSITION", order: "DESC", groupSize: 2, positions: [0, 50] }),
  },
  {
    id: "QTY_TIERS",
    label: "Más piezas, más descuento",
    description: "2 piezas 10%, 3 piezas 15%, 4 o más 20%.",
    build: () =>
      withAction("QTY_TIERS", {
        type: "QTY_TIERS",
        qtyTiers: [
          { minQty: 2, percent: 10 },
          { minQty: 3, percent: 15 },
          { minQty: 4, percent: 20 },
        ],
      }),
  },
  {
    id: "AMOUNT_TIERS",
    label: "Por monto de compra",
    description: "Desde Q1,000 te descuentan Q150.",
    build: () => withAction("AMOUNT_TIERS", { type: "AMOUNT_TIERS", amountTiers: [{ minAmount: 1000, percent: "", amount: 150 }] }),
  },
  {
    id: "BUY_GET",
    label: "Compra A, descuento en B",
    description: "Compra una pieza de la categoría A y una de la categoría B va al 30% (elige las categorías).",
    build: () => withAction("BUY_GET", { type: "BUY_GET", buyQty: 1, getQty: 1, getPercent: 30, order: "ASC" }),
  },
  {
    id: "PERCENT",
    label: "% a todo",
    description: "Un mismo porcentaje a todas las piezas que entran.",
    build: () => withAction("PERCENT", { type: "PERCENT", value: 20 }),
  },
];

// ---------------------------------------------------------------- limpieza para el back

const num = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const ids = (list) => (list || []).map((v) => Number(v)).filter((v) => Number.isFinite(v) && v > 0);
const strs = (list) => (list || []).map((v) => String(v || "").trim()).filter(Boolean);

const cleanFilter = (filter) => {
  const f = filter || {};
  return {
    audiences: strs(f.audiences),
    categoryIds: ids(f.categoryIds),
    productIds: ids(f.productIds),
    colorIds: ids(f.colorIds),
    sizes: strs(f.sizes),
    minUnitPrice: num(f.minUnitPrice),
    maxUnitPrice: num(f.maxUnitPrice),
    excludeCategoryIds: ids(f.excludeCategoryIds),
    excludeProductIds: ids(f.excludeProductIds),
  };
};

export const cleanRuleConfig = (config) => {
  const c = config || emptyRuleConfig();
  const a = c.action || {};
  const type = a.type || "POSITION";
  const action = { type };
  if (["PERCENT", "AMOUNT_EACH", "FIXED_PRICE"].includes(type)) {
    action.value = num(a.value);
  }
  if (type === "POSITION") {
    action.order = a.order || "DESC";
    action.groupSize = num(a.groupSize) ?? 0;
    action.positions = (a.positions || []).map((p) => num(p) ?? 0);
    action.remainderPercent = num(a.remainderPercent);
    action.incompleteGroup = a.incompleteGroup || "POSITIONS";
    action.positionsMinQty = num(a.positionsMinQty);
  }
  if (type === "QTY_TIERS") {
    action.qtyTiers = (a.qtyTiers || [])
      .map((t) => ({ minQty: num(t.minQty), percent: num(t.percent) }))
      .filter((t) => t.minQty !== null || t.percent !== null);
  }
  if (type === "AMOUNT_TIERS") {
    action.amountTiers = (a.amountTiers || [])
      .map((t) => ({ minAmount: num(t.minAmount), percent: num(t.percent), amount: num(t.amount) }))
      .filter((t) => t.minAmount !== null || t.percent !== null || t.amount !== null);
  }
  if (type === "BUY_GET") {
    action.order = a.order || "ASC";
    action.buyFilter = cleanFilter(a.buyFilter);
    action.buyQty = num(a.buyQty);
    action.getQty = num(a.getQty);
    action.getPercent = num(a.getPercent);
  }
  const cond = c.conditions || {};
  return {
    version: 1,
    template: c.template || null,
    conditions: {
      daysOfWeek: (cond.daysOfWeek || []).map(Number).filter((d) => d >= 1 && d <= 7),
      timeFrom: cond.timeFrom || null,
      timeTo: cond.timeTo || null,
      paymentMethods: strs(cond.paymentMethods),
      minQty: num(cond.minQty),
      minAmount: num(cond.minAmount),
    },
    filter: cleanFilter(c.filter),
    action,
    limits: {
      maxDiscount: num(c.limits?.maxDiscount),
      maxApplications: num(c.limits?.maxApplications),
    },
  };
};

/** Config que viene del back → estado editable del formulario (rellena lo que falte). */
export const ruleConfigToForm = (config) => {
  const base = emptyRuleConfig();
  if (!config) return base;
  const fill = (f) => ({ ...emptyFilter(), ...(f || {}) });
  return {
    ...base,
    ...config,
    conditions: { ...base.conditions, ...(config.conditions || {}) },
    filter: fill(config.filter),
    action: {
      ...base.action,
      ...(config.action || {}),
      positions: config.action?.positions?.length ? config.action.positions : base.action.positions,
      qtyTiers: config.action?.qtyTiers?.length ? config.action.qtyTiers : base.action.qtyTiers,
      amountTiers: config.action?.amountTiers?.length ? config.action.amountTiers : base.action.amountTiers,
      buyFilter: fill(config.action?.buyFilter),
    },
    limits: { ...base.limits, ...(config.limits || {}) },
  };
};

// ---------------------------------------------------------------- formulario completo

export const EMPTY_PROMO_FORM = () => ({
  name: "",
  description: "",
  discountType: RULES_TYPE,
  discountValue: "",
  comboBuyQty: "2",
  comboPayQty: "1",
  kioskLocationIds: [],
  audienceCategory: "",
  tiers: [{ audienceCategory: "CABALLERO", categoryId: "", discountValue: "" }],
  ruleConfig: emptyRuleConfig(),
  startDate: "",
  endDate: "",
  active: true,
});

/** Kioscos de una promoción (lista nueva o kiosco único viejo), como texto. Vacío = todos. */
export const promoKioskIds = (promo) => {
  const list = Array.isArray(promo?.kioskLocationIds) ? promo.kioskLocationIds : [];
  const ids = list.length ? list : promo?.kioskLocationId ? [promo.kioskLocationId] : [];
  return ids.map((id) => String(id));
};

export const promotionToForm = (promo) => ({
  ...EMPTY_PROMO_FORM(),
  name: promo?.name || "",
  description: promo?.description || "",
  discountType: promo?.discountType || RULES_TYPE,
  discountValue: promo?.discountValue ?? "",
  comboBuyQty: promo?.comboBuyQty != null ? String(promo.comboBuyQty) : "2",
  comboPayQty: promo?.comboPayQty != null ? String(promo.comboPayQty) : "1",
  kioskLocationIds: promoKioskIds(promo),
  audienceCategory: promo?.audienceCategory || "",
  tiers: promo?.tiers?.length
    ? promo.tiers.map((t) => ({
        audienceCategory: t.audienceCategory || "CABALLERO",
        categoryId: t.categoryId ? String(t.categoryId) : "",
        discountValue: t.discountValue ?? "",
      }))
    : EMPTY_PROMO_FORM().tiers,
  ruleConfig: ruleConfigToForm(promo?.ruleConfig),
  startDate: promo?.startDate || "",
  endDate: promo?.endDate || "",
  active: promo?.active !== false,
});

/** Payload para POST/PUT /kiosk-pos/promotions (y para simular lo que se está armando). */
export const buildPromotionPayload = (promoForm) => {
  const payload = {
    name: String(promoForm.name || "").trim(),
    description: promoForm.description,
    discountType: promoForm.discountType,
    startDate: promoForm.startDate || null,
    endDate: promoForm.endDate || null,
    active: Boolean(promoForm.active),
    // Vacío = todos los kioscos (incluidos los nuevos).
    kioskLocationIds: promoKioskIds(promoForm).map(Number).filter((id) => Number.isFinite(id) && id > 0),
    kioskLocationId: null,
    audienceCategory: promoForm.audienceCategory || null,
  };
  if (promoForm.discountType === RULES_TYPE) {
    payload.audienceCategory = null;
    payload.discountValue = 0;
    payload.ruleConfig = cleanRuleConfig(promoForm.ruleConfig);
  } else if (promoForm.discountType === "COMBO") {
    payload.comboBuyQty = Number(promoForm.comboBuyQty || 0);
    payload.comboPayQty = Number(promoForm.comboPayQty || 0);
    payload.discountValue = 0;
  } else if (promoForm.discountType === "TIERED_PERCENT") {
    payload.audienceCategory = null;
    payload.discountValue = 0;
    payload.tiers = (promoForm.tiers || [])
      .filter((tier) => tier.categoryId && Number(tier.discountValue) > 0)
      .map((tier) => ({
        audienceCategory: tier.audienceCategory || "CABALLERO",
        categoryId: Number(tier.categoryId),
        discountValue: Number(tier.discountValue),
      }));
  } else {
    payload.discountValue = Number(promoForm.discountValue || 0);
  }
  return payload;
};

// ---------------------------------------------------------------- resumen en palabras

const pct = (v) => `${Number(v || 0).toLocaleString("es-GT", { maximumFractionDigits: 2 })}%`;
const q = (v) => `Q${Number(v || 0).toLocaleString("es-GT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const listText = (items) => {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean.join("");
  return `${clean.slice(0, -1).join(", ")} y ${clean[clean.length - 1]}`;
};
const orText = (items) => {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean.join("");
  return `${clean.slice(0, -1).join(", ")} o ${clean[clean.length - 1]}`;
};
const ordinal = (n) => `${n}.ª`;

/**
 * Dónde aplica en palabras: "Todos los kioscos", "Todos los kioscos menos X", "Miraflores y Oakland".
 * @param {string[]} ids   kioscos marcados (vacío = todos)
 * @param {Object<string,string>} kioskNameById
 * @param {{compact?: boolean}} [opts]  compact: recorta listas largas ("A, B y 3 más")
 */
export const describeKioskScope = (ids, kioskNameById = {}, { compact = false } = {}) => {
  const allIds = Object.keys(kioskNameById);
  const picked = (ids || []).map(String);
  const nameOf = (id) => kioskNameById[String(id)] || `#${id}`;
  if (picked.length === 0 || (allIds.length > 0 && allIds.every((id) => picked.includes(id)))) {
    return "Todos los kioscos";
  }
  const missing = allIds.filter((id) => !picked.includes(id));
  if (allIds.length > 3 && missing.length > 0 && missing.length <= 3 && missing.length < picked.length) {
    return `Todos los kioscos menos ${listText(missing.map(nameOf))}`;
  }
  const names = picked.map(nameOf);
  if (compact && names.length > 3) {
    return `${names.slice(0, 2).join(", ")} y ${names.length - 2} más`;
  }
  return listText(names);
};

/** Productos que solo se venden en Entrecueros: habilitados allá y sin ningún precio de POS normal. */
export const isEntrecuerosOnlyProduct = (product) =>
  Boolean(product?.entrecuerosEnabled) &&
  !["salePrice", "discountedPrice", "sellerPrice"].some((key) => Number(product?.[key]) > 0);

/** Ids de productos usados en una regla (para no ocultar lo que ya está elegido). */
export const collectRuleProductIds = (config) => {
  const out = new Set();
  const add = (f) => {
    (f?.productIds || []).forEach((id) => out.add(String(id)));
    (f?.excludeProductIds || []).forEach((id) => out.add(String(id)));
  };
  add(config?.filter);
  add(config?.action?.buyFilter);
  return out;
};

const describeFilter = (filter, { categoryName, productName }) => {
  const f = filter || {};
  const parts = [];
  if (f.audiences?.length) {
    parts.push(`línea ${orText(f.audiences.map((a) => AUDIENCE_OPTIONS.find((o) => o.value === a)?.label || a))}`);
  }
  if (f.categoryIds?.length) parts.push(`categoría ${orText(f.categoryIds.map(categoryName))}`);
  if (f.productIds?.length) parts.push(`producto ${orText(f.productIds.map(productName))}`);
  if (f.sizes?.length) parts.push(`talla ${orText(f.sizes)}`);
  if (num(f.minUnitPrice) !== null && num(f.maxUnitPrice) !== null) {
    parts.push(`precio entre ${q(f.minUnitPrice)} y ${q(f.maxUnitPrice)}`);
  } else if (num(f.minUnitPrice) !== null) {
    parts.push(`precio desde ${q(f.minUnitPrice)}`);
  } else if (num(f.maxUnitPrice) !== null) {
    parts.push(`precio hasta ${q(f.maxUnitPrice)}`);
  }
  let text = parts.length ? `piezas de ${listText(parts)}` : "todas las piezas";
  const excl = [];
  if (f.excludeCategoryIds?.length) excl.push(`categoría ${orText(f.excludeCategoryIds.map(categoryName))}`);
  if (f.excludeProductIds?.length) excl.push(`producto ${orText(f.excludeProductIds.map(productName))}`);
  if (excl.length) text += `, menos ${listText(excl)}`;
  return text;
};

/**
 * Resumen en palabras de una promoción (form o respuesta del back).
 * @returns {string[]} frases cortas
 */
export const describePromotionRule = (promoForm, { categoriesById = {}, productsById = {}, kioskNameById = {} } = {}) => {
  const config = promoForm?.ruleConfig || emptyRuleConfig();
  const categoryName = (id) => categoriesById[String(id)] || `#${id}`;
  const productName = (id) => productsById[String(id)] || `#${id}`;
  const lines = [];

  const when = [];
  if (promoForm?.startDate && promoForm?.endDate) when.push(`del ${promoForm.startDate} al ${promoForm.endDate}`);
  else if (promoForm?.startDate) when.push(`desde el ${promoForm.startDate}`);
  else if (promoForm?.endDate) when.push(`hasta el ${promoForm.endDate}`);
  const c = config.conditions || {};
  if (c.daysOfWeek?.length) {
    when.push(`solo los ${listText([...c.daysOfWeek].sort().map((d) => DAY_NAMES[Number(d)]))}`);
  }
  if (c.timeFrom && c.timeTo) when.push(`de ${c.timeFrom} a ${c.timeTo}`);
  else if (c.timeFrom) when.push(`desde las ${c.timeFrom}`);
  else if (c.timeTo) when.push(`hasta las ${c.timeTo}`);
  const kiosk = `en ${describeKioskScope(promoKioskIds(promoForm), kioskNameById).toLowerCase()}`;
  lines.push(`${when.length ? `${when.join(", ")}, ` : ""}${kiosk}.`.replace(/^./, (m) => m.toUpperCase()));

  const filterText = describeFilter(config.filter, { categoryName, productName });
  const mins = [];
  if (num(c.minQty)) mins.push(`${num(c.minQty)} o más piezas`);
  if (num(c.minAmount)) mins.push(`compras de ${q(c.minAmount)} o más`);
  lines.push(`Entran ${filterText}${mins.length ? `; necesita ${listText(mins)}` : ""}.`);
  if (c.paymentMethods?.length) {
    lines.push(`Solo pagando con ${orText(c.paymentMethods.map((m) => PAYMENT_OPTIONS.find((o) => o.value === m)?.label || m))}.`);
  }

  const a = config.action || {};
  switch (a.type) {
    case "PERCENT":
      lines.push(`Cada pieza lleva ${pct(a.value)} de descuento.`);
      break;
    case "AMOUNT_EACH":
      lines.push(`A cada pieza se le restan ${q(a.value)}.`);
      break;
    case "FIXED_PRICE":
      lines.push(`Cada pieza queda en ${q(a.value)} (si cuesta más).`);
      break;
    case "POSITION": {
      const order = a.order === "ASC" ? "de la más barata a la más cara" : "de la más cara a la más barata";
      const positions = (a.positions || []).map((p, i) => `la ${ordinal(i + 1)} ${num(p) ? pct(p) : "sin descuento"}`);
      const group = num(a.groupSize) > 0 ? `De cada ${num(a.groupSize)} piezas (${order})` : `Ordenadas ${order}`;
      let text = `${group}: ${listText(positions)}`;
      if (num(a.remainderPercent) !== null) {
        text += num(a.groupSize) > 0 && a.incompleteGroup === "REMAINDER"
          ? `; las que sobran ${pct(a.remainderPercent)}`
          : `; el resto ${pct(a.remainderPercent)}`;
      }
      if (num(a.positionsMinQty) > 1) {
        text += num(a.remainderPercent)
          ? `. Con menos de ${num(a.positionsMinQty)} piezas, cada una lleva ${pct(a.remainderPercent)}`
          : `. Con menos de ${num(a.positionsMinQty)} piezas no hay descuento`;
      }
      lines.push(`${text}.`);
      break;
    }
    case "QTY_TIERS": {
      const tiers = [...(a.qtyTiers || [])]
        .filter((t) => num(t.minQty))
        .sort((x, y) => num(x.minQty) - num(y.minQty))
        .map((t) => `${num(t.minQty)} piezas ${pct(t.percent)}`);
      lines.push(`Según cuántas piezas lleva: ${listText(tiers)} (gana el escalón más alto alcanzado).`);
      break;
    }
    case "AMOUNT_TIERS": {
      const tiers = [...(a.amountTiers || [])]
        .filter((t) => num(t.minAmount))
        .sort((x, y) => num(x.minAmount) - num(y.minAmount))
        .map((t) => `desde ${q(t.minAmount)} ${num(t.percent) ? pct(t.percent) : `−${q(t.amount)}`}`);
      lines.push(`Según el monto de las piezas: ${listText(tiers)}.`);
      break;
    }
    case "BUY_GET": {
      const buyText = describeFilter(a.buyFilter, { categoryName, productName });
      lines.push(
        `Al comprar ${num(a.buyQty) || 1} de ${buyText}, ${num(a.getQty) || 1} de las piezas que entran ` +
          `(${a.order === "DESC" ? "la más cara" : "la más barata"} primero) lleva ${pct(a.getPercent)}.`
      );
      break;
    }
    default:
      lines.push("Falta elegir qué descuento hace.");
  }

  const limits = config.limits || {};
  const lim = [];
  if (num(limits.maxDiscount)) lim.push(`máximo ${q(limits.maxDiscount)} de descuento por venta`);
  if (num(limits.maxApplications)) lim.push(`máximo ${num(limits.maxApplications)} veces por venta`);
  if (lim.length) lines.push(`${listText(lim).replace(/^./, (m) => m.toUpperCase())}.`);
  lines.push("Empaque y precios editados como finales nunca llevan descuento. Si hay varias promociones, gana la que da más.");
  return lines;
};
