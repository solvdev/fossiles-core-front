import crypto from "crypto";
import fs from "fs";
import path from "path";
import table from "../../pricing/entrecueros-wholesale-cases.json";
import { isPackagingProductCode } from "../utils/kioskPackagingHelper";
import {
  ENTRECUEROS_PRICE_KIND,
  entrecuerosCartQuantities,
  entrecuerosPriceKind,
  sumEntrecuerosLineTotals,
} from "../utils/entrecuerosPriceLists";
import {
  applyEntrecuerosCartPrices,
  lineKeyFor,
  normalizePosHardwareCondition,
} from "../views/kiosks/pos/posUtils";

/**
 * Cart lines carry the same fields KioskSales.addToCart copies before
 * applyEntrecuerosCartPrices. triggerType is not returned by that path.
 */
const PINNED_SHA256 = "6e4a105cd91b6b395f4596dcdfee9853b3ada66e71bd7161dd7ca43a37397396";
const CASES_PATH = path.resolve(__dirname, "../../pricing/entrecueros-wholesale-cases.json");
const HASH_PATH = path.resolve(__dirname, "../../pricing/entrecueros-wholesale-cases.json.sha256");

const TABLE_KIND = {
  [ENTRECUEROS_PRICE_KIND.PACKAGING]: "packaging",
  [ENTRECUEROS_PRICE_KIND.CASUAL]: "casual",
  [ENTRECUEROS_PRICE_KIND.REVERSIBLE]: "reversible",
  [ENTRECUEROS_PRICE_KIND.NINO]: "nino",
  [ENTRECUEROS_PRICE_KIND.DAMA]: "dama",
  [ENTRECUEROS_PRICE_KIND.WALLET_LEATHER]: "billetera",
  [ENTRECUEROS_PRICE_KIND.WALLET_SYNTHETIC]: "sintetica",
  [ENTRECUEROS_PRICE_KIND.CARDHOLDER_SYNTHETIC]: "tarjetero",
  [ENTRECUEROS_PRICE_KIND.PRODUCT]: "untyped",
};

const PRODUCT_BY_TYPE = {
  casual: { productCode: "C-1", productName: "Cincho casual", cinchoType: "CASUAL" },
  billetera: { productCode: "BL-1", productName: "Billetera caballero" },
  nino: {
    productCode: "C-N",
    productName: "Cincho niño",
    cinchoType: "CASUAL",
    hardwareCondition: "NINO",
  },
  dama: {
    productCode: "C-D",
    productName: "Cincho dama",
    cinchoType: "CASUAL",
    hardwareCondition: "DAMA",
  },
  sintetica: { productCode: "B-20", productName: "Billetera", hardwareCondition: "SINTETICO" },
  tarjetero: { productCode: "T-1", productName: "Tarjetero" },
  reversible: { productCode: "R-1", productName: "Cincho reversible", cinchoType: "REVERSIBLE" },
  packaging: { productCode: "SUM-BOLSA", productName: "Bolsa" },
  untyped: { productName: "Monedero piel" },
};

const TIER_FIELDS = [
  ["1", "entrecuerosPriceUnit"],
  ["3", "entrecuerosPriceQty3"],
  ["6", "entrecuerosPriceQty6"],
  ["12", "entrecuerosPriceQty12"],
];

function recordedSha256() {
  return fs.readFileSync(HASH_PATH, "utf8").trim().split(/\s+/)[0] || "";
}

function pricingSkipReason(entry) {
  if ((entry.tags || []).includes("packaging-rejected")) {
    return "server rejection, covered by backend";
  }
  if (entry.status === "pending") return entry.note || "pending";
  return "";
}

function productCodeFor(caseLine) {
  if (caseLine.sku_hint !== "generic") return caseLine.sku_hint;
  return PRODUCT_BY_TYPE[caseLine.type].productCode;
}

function posCartLine(caseLine, index) {
  const template = PRODUCT_BY_TYPE[caseLine.type];
  if (!template) {
    throw new Error(`${caseLine.type} is not a POS line type`);
  }
  const productCode = productCodeFor(caseLine);
  const productId = caseLine.type === "untyped"
    ? caseLine.sku_hint
    : `${caseLine.type}:${caseLine.sku_hint}:${index}`;
  const hardwareCondition = normalizePosHardwareCondition(template.hardwareCondition);
  const catalog = caseLine.catalogPrice != null ? Number(caseLine.catalogPrice) : 0;
  const line = {
    key: lineKeyFor(productId, null, null, hardwareCondition),
    productId,
    productCode,
    productName: template.productName,
    colorId: null,
    hardwareCondition,
    size: null,
    isPackaging: isPackagingProductCode(productCode),
    quantity: caseLine.quantity,
    catalogPrice: catalog,
    catalogUnitPrice: catalog,
    suggestedUnitPrice: catalog,
    unitPrice: caseLine.clientUnitPrice != null ? Number(caseLine.clientUnitPrice) : catalog,
    cinchoType: template.cinchoType,
  };
  TIER_FIELDS.forEach(([tier, field]) => {
    const price = caseLine.configuredTiers?.[tier];
    if (price != null) line[field] = price;
  });
  return line;
}

function tableKind(input) {
  const kind = entrecuerosPriceKind({
    productId: input.productId,
    productCode: input.code,
    productName: input.name,
    cinchoType: input.cinchoType,
    hardwareCondition: input.hardware,
    cinchoForKids: input.cinchoForKids,
    isPackaging: isPackagingProductCode(input.code),
  });
  return TABLE_KIND[kind] || kind;
}

const activePricing = table.cases.filter((entry) => !pricingSkipReason(entry));
const skippedPricing = table.cases
  .filter((entry) => pricingSkipReason(entry))
  .map((entry) => ({ id: entry.id, skipReason: pricingSkipReason(entry) }));
const activeClassification = table.classification.filter((entry) => entry.status === "active");
const skippedClassification = table.classification
  .filter((entry) => entry.status !== "active")
  .map((entry) => ({ id: entry.id, skipReason: entry.note || entry.status }));

describe("Entrecueros wholesale case table", () => {
  test("sha256 of entrecueros-wholesale-cases.json matches the pinned digest and the .sha256 file", () => {
    const computed = crypto.createHash("sha256").update(fs.readFileSync(CASES_PATH)).digest("hex");
    const recorded = recordedSha256();
    if (computed !== PINNED_SHA256 || recorded !== PINNED_SHA256) {
      throw new Error(
        [
          "entrecueros-wholesale-cases.json sha256 does not match the pinned digest or the .sha256 file.",
          `computed: ${computed}`,
          `pinned:   ${PINNED_SHA256}`,
          `.sha256:  ${recorded}`,
        ].join("\n")
      );
    }
    expect(table.version).toBe("1.0.0-draft.3");
  });

  test.each(activePricing)("$id", (entry) => {
    const cart = entry.lines.map(posCartLine);
    const priced = applyEntrecuerosCartPrices(cart);
    expect({
      unitPrice: priced.map((line) => line.unitPrice),
      lineTotal: priced.map((line) => line.lineTotal),
      total: sumEntrecuerosLineTotals(priced),
      courtesyActive: entrecuerosCartQuantities(cart).courtesyActive,
    }).toEqual({
      unitPrice: entry.expected.lines.map((line) => line.unitPrice),
      lineTotal: entry.expected.lines.map((line) => line.lineTotal),
      total: entry.expected.total,
      courtesyActive: entry.expected.courtesyActive,
    });
  });

  test.skip.each(skippedPricing)("$id — $skipReason", () => {});

  test.each(activeClassification)("$id", (entry) => {
    expect(tableKind(entry.input)).toBe(entry.expectedKind);
  });

  test.skip.each(skippedClassification)("$id — $skipReason", () => {});
});
