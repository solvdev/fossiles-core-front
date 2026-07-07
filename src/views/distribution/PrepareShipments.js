import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Col,
  Row,
  Spinner,
  Table,
  Badge,
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "reactstrap";
import {
  getDistributions,
  getShipmentsByDistribution,
  sendShipment,
  revertSentShipment,
  cancelShipment,
  updateShipmentPackingItems,
  listStandaloneInternalShipments,
  listStandaloneKioskShipments,
  getShipmentById,
  repairDeliveredShipmentReceiptInventory,
} from "services/productDistributionService";
import * as XLSX from "xlsx-js-style";
import { getProducts } from "services/productService";
import { getAuthHeader } from "services/authService";
import {
  getProductionOrderById,
  getProductionOrders,
  getProductionOrderShipments,
  getProductionOrderPartialReleases,
  searchPartialReleasesForPrepare,
  voidVendorShipmentDocument,
} from "services/productionOrderService";
import { showError, showSuccess, showWarning } from "utils/notificationHelper";
import { formatShipmentReceiptRepairMessage } from "utils/shipmentReceiptRepairHelper";
import { isCinchoOrderType, isOpcFamilyProductionOrderCode } from "utils/cinchoProductionHelper";
import { isLuisFelipeVendorFlow } from "utils/luisFelipeVendorHelper";
import { extractDestinationFromShipmentNotes } from "utils/opcShipmentHelper";
import {
  PRINT_FONT_FAMILY,
  PRINT_PAPER_HEIGHT_MM,
  PRINT_PAPER_WIDTH_MM,
  applyOrderItemPricesToShipmentProducts,
  buildPartialPanelOrder,
  classifyPrepareOrder,
  isDirectPrepareOrder,
  isEntreCuerosCustomerOpv,
  mapShipmentProductsForOpvPrint,
  orderIsPendingForPrepare,
  orderItemsHaveBrand,
} from "utils/prepareShipmentsOrderHelper";
import {
  findLinkedPartialRelease,
  orderAllowsPartialReleases,
  resolvePartialReleaseShipmentProducts,
  resolveShipmentLinesForPrint,
} from "utils/partialReleaseHelper";
import PrepareShipmentsCustomerBlock from "components/distribution/PrepareShipmentsCustomerBlock";
import CreateStandaloneKioskShipmentModal from "components/distribution/CreateStandaloneKioskShipmentModal";
import EditShipmentProductsModal from "components/distribution/EditShipmentProductsModal";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import OpvShipmentPriceReviewModal from "components/production/OpvShipmentPriceReviewModal";
import ProductionOrderPartialReleasesPanel from "components/production/ProductionOrderPartialReleasesPanel";
import ProductionOrderShipmentGenerateModal, {
  canGenerateShipmentForOrder,
} from "components/production/ProductionOrderShipmentGenerateModal";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { assertDispatchStockForProducts } from "utils/dispatchStockValidationHelper";
import { formatDateGt, getTodayYmdGuatemala } from "utils/dateTimeHelper";
import {
  buildShipmentDocumentInnerHtml,
  getShipmentDocumentStyles,
} from "utils/shipmentPrintDocumentHtml";
import {
  buildOpShipmentPrintDocumentHtml,
  openOpShipmentPrintWindow,
} from "utils/productionOrderOpShipmentPrintHtml";
import {
  buildPseudoOrderFromStandaloneShipment,
  getStandaloneInternalUserNotes,
  parseStandaloneInternalMeta,
  computeInternalEnviUnitPrice,
} from "utils/standaloneInternalShipmentHelper";
import QRCode from "qrcode";
import { getPublicFrontBaseUrl, buildPtDispatchDistributionUrl, buildPtDispatchOnlineUrl } from "utils/ptDispatchQr";

const STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
  CANCELLED: "Anulado",
};

const tStatus = (status) => STATUS_ES[status] || status || "N/A";

const partialReleaseOptionKey = (item) =>
  item?.productionOrderId && item?.id ? `${item.productionOrderId}:${item.id}` : "";

const partialReleaseStatusLabel = (status) => {
  const key = String(status || "").toUpperCase();
  if (key === "SHIPPED") return "Enviado";
  if (key === "CONFIRMED") return "Confirmado";
  return tStatus(key);
};

const PACKING_TAG = "__PACKING_SUM__:";
const BELT_SIZE_TAG = "__BELT_SIZE__:";
const DOCUMENT_DATE_TAG = "DOCUMENT_DATE:";

const buildPrepareShipmentProductsExtra = (order) => (shipment, linked) => {
  const partialProducts = resolvePartialReleaseShipmentProducts(
    shipment,
    linked,
    order?.orderType
  );
  if (partialProducts) {
    const priced = applyOrderItemPricesToShipmentProducts(order, partialProducts);
    return { products: priced, _printProducts: priced };
  }
  if (classifyPrepareOrder(order) === "OPV") {
    return {
      products: applyOrderItemPricesToShipmentProducts(
        order,
        mapShipmentProductsForOpvPrint(shipment)
      ),
      packingItems: order.packingItems,
      shippingCost: order.shippingCost,
    };
  }
  return {};
};

const isPartialReleaseShipmentDoc = (shipment) =>
  Boolean(shipment?.partialReleaseId || shipment?.partialReleaseLabel);

const resolveBeltSizesSource = (shipment, hasApiSizes, beltSizeLines, notesPayload) => {
  if (hasApiSizes) return beltSizeLines;
  if (isPartialReleaseShipmentDoc(shipment)) return [];
  return notesPayload?.beltSizes || [];
};

const enrichShipmentsWithPartialMeta = (printable, partialList, mapExtra) =>
  (printable || []).map((s) => {
    const linked = findLinkedPartialRelease(s, partialList?.releases);
    return {
      ...s,
      partialReleaseLabel: linked?.label || (s.partialReleaseId ? "Parcial" : null),
      partialReleaseCreatedByName: linked?.createdByName || null,
      ...(typeof mapExtra === "function" ? mapExtra(s, linked) : {}),
    };
  });
const PROCESSED_SHIPMENT_STATUSES = new Set(["SENT", "DELIVERED", "COMPLETED", "RECEIVED", "CANCELLED"]);
/** Ocultar solo entregados/cancelados; SENT sigue visible para reimprimir. */
const HIDDEN_FROM_PREPARE_LIST_STATUSES = new Set(["DELIVERED", "COMPLETED", "RECEIVED", "CANCELLED"]);
const MAX_PRODUCT_ROWS_PER_SHIPMENT = 10;
/** OPV cliente Entre Cueros: más líneas por hoja sin partir en bloques de 10. */
const MAX_ENTRECUEROS_ROWS_PER_SHIPMENT = 20;

const normalizeShipmentStatus = (status) => String(status || "").trim().toUpperCase();
const isShipmentAlreadyProcessed = (status) => PROCESSED_SHIPMENT_STATUSES.has(normalizeShipmentStatus(status));
const isShipmentHiddenFromPrepareList = (status) =>
  HIDDEN_FROM_PREPARE_LIST_STATUSES.has(normalizeShipmentStatus(status));
const isShipmentRowForPrepareList = (shipment) => {
  const st = normalizeShipmentStatus(shipment?.status);
  return Boolean(st) && st !== "DRAFT" && st !== "CANCELLED";
};
const isShipmentSendable = (status) => normalizeShipmentStatus(status) === "CONFIRMED";
const isShipmentCancellable = (status) => {
  const st = normalizeShipmentStatus(status);
  return st === "DRAFT" || st === "CONFIRMED";
};
const isShipmentProductsEditable = (status) => {
  const st = normalizeShipmentStatus(status);
  return st === "DRAFT" || st === "CONFIRMED" || st === "SENT";
};
const isShipmentRevertible = (status) => normalizeShipmentStatus(status) === "SENT";

const isShipmentReceiptRepairable = (status, locationId) =>
  normalizeShipmentStatus(status) === "DELIVERED" && locationId != null;
const isSyntheticShipmentId = (id) => /^(opv|opi)-/i.test(String(id || ""));
const syntheticShipmentOrderId = (id) => {
  const m = String(id || "").match(/^(?:opv|opi)-(\d+)$/i);
  return m ? m[1] : null;
};
const chunkArray = (items, chunkSize) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [[]];
  const chunks = [];
  for (let idx = 0; idx < source.length; idx += chunkSize) {
    chunks.push(source.slice(idx, idx + chunkSize));
  }
  return chunks;
};

/** Solo auto-selecciona al imprimir si hay un único envío (evita imprimir todos los parciales a la vez). */
const initShipmentCopiesAndSelection = (docList) => {
  const copies = {};
  const selected = {};
  const autoSelect = (docList || []).length === 1;
  (docList || []).forEach((d) => {
    copies[d.id] = 1;
    if (autoSelect) selected[d.id] = true;
  });
  return { copies, selected };
};

const parseShipmentMetaNotes = (rawNotes) => {
  const lines = String(rawNotes || "").split("\n");
  const baseLines = [];
  let packingRaw = "";
  let beltSizeRaw = "";
  let documentDate = "";

  lines.forEach((line) => {
    if (line.startsWith(PACKING_TAG)) {
      packingRaw = line.slice(PACKING_TAG.length).trim();
    } else if (line.startsWith(BELT_SIZE_TAG)) {
      beltSizeRaw = line.slice(BELT_SIZE_TAG.length).trim();
    } else if (line.startsWith(DOCUMENT_DATE_TAG)) {
      documentDate = line.slice(DOCUMENT_DATE_TAG.length).trim();
    } else {
      baseLines.push(line);
    }
  });

  let packing = [];
  try {
    const parsed = JSON.parse(packingRaw || "[]");
    packing = (Array.isArray(parsed) ? parsed : [])
      .map((item) => {
        const unitPrice = Number(item?.unitPrice || item?.price || 0);
        return {
          materialId: Number(item?.materialId),
          quantity: Number(item?.quantity),
          unitPrice: Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0,
        };
      })
      .filter((item) => item.materialId > 0 && item.quantity > 0);
  } catch (_err) {
    packing = [];
  }

  let beltSizes = [];
  try {
    const parsed = JSON.parse(beltSizeRaw || "[]");
    beltSizes = (Array.isArray(parsed) ? parsed : [])
      .map((item) => ({
        productId: Number(item?.productId),
        colorId: item?.colorId === null || item?.colorId === undefined || item?.colorId === "" ? null : Number(item.colorId),
        size: String(item?.size || "").trim().toUpperCase(),
        quantity: Number(item?.quantity),
      }))
      .filter((item) => item.productId > 0 && item.quantity > 0 && item.size);
  } catch (_err) {
    beltSizes = [];
  }

  return {
    baseNotes: baseLines.join("\n").trim(),
    packing,
    beltSizes,
    documentDate,
  };
};

const parsePackingNotes = (rawNotes) => parseShipmentMetaNotes(rawNotes).packing;
const isCinchoProduct = (productCode, productName) =>
  `${productCode || ""} ${productName || ""}`.toUpperCase().includes("CINCHO");

const getShipmentPackingItems = (shipment, localState) => {
  const apiItems = Array.isArray(shipment?.packingItems) ? shipment.packingItems : [];
  const normalizedApi = apiItems
    .map((item) => ({
      materialId: Number(item?.materialId),
      quantity: Number(item?.quantity),
      unitPrice: Number(item?.unitPrice || 0),
    }))
    .filter((item) => item.materialId > 0 && item.quantity > 0);
  if (normalizedApi.length > 0) {
    return normalizedApi;
  }
  const fromNotes = parsePackingNotes(shipment?.notes);
  if (fromNotes.length > 0) {
    return fromNotes;
  }
  if (localState && shipment?.id) {
    const { packingQtyByShipment = {}, packingMaterials = [] } = localState;
    const fromLocal = packingMaterials
      .map((material) => {
        const key = `${shipment.id}:${material.id}`;
        const qty = Number(packingQtyByShipment[key] || 0);
        return {
          materialId: Number(material.id),
          quantity: qty,
          unitPrice: Number(material.unitCost || material.purchasePrice || 0),
        };
      })
      .filter((item) => item.materialId > 0 && item.quantity > 0);
    if (fromLocal.length > 0) {
      return fromLocal;
    }
  }
  return [];
};

const resolveMaterialUnitPrice = (item, material) => {
  const candidates = [
    item?.unitPrice,
    item?.purchasePrice,
    item?.unitCost,
    material?.unitCost,
    material?.purchasePrice,
    material?.cost,
    material?.unit_cost,
    material?.purchase_price,
    material?.costoCompra,
    material?.costo,
  ];
  for (const candidate of candidates) {
    const parsed = Number(candidate);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 0;
};

const buildOpvShipmentFromOrder = (order) => {
  const items = Array.isArray(order?.items) ? order.items : [];
  return {
    id: `opv-${order?.id}`,
    shipmentNumber: order?.vendorShipmentNumber || order?.code || `OPV-${order?.id}`,
    locationId: null,
    locationCode: "",
    locationName: order?.customerName || "Cliente OPV",
    status: order?.status || "CONFIRMED",
    notes: order?.observations || "",
    products: (() => {
      const rows = [];
      items.forEach((item, idx) => {
        const sizesMap = item?.sizes && typeof item.sizes === "object" ? item.sizes : null;
        const entries = sizesMap ? Object.entries(sizesMap).filter(([, q]) => Number(q) > 0) : [];
        const base = {
          productId: item?.productId,
          productCode: item?.productCode,
          productName: item?.productName,
          colorId: item?.colorId,
          colorName: item?.colorName,
          brandName: item?.brandName || "",
          unitPrice: item?.unitPrice || 0,
          uomName: "Unidad",
          unitName: "Unidad",
        };
        if (entries.length > 0) {
          entries.forEach(([sizeKey, qty]) => {
            rows.push({
              ...base,
              id: item?.id != null ? `${item.id}-${sizeKey}` : `opi-${idx}-${sizeKey}`,
              size: String(sizeKey),
              quantity: Number(qty) || 0,
            });
          });
        } else {
          rows.push({
            ...base,
            id: item?.id || `opi-${idx}`,
            size: item?.size || "",
            quantity: Number(item?.quantity || 0),
          });
        }
      });
      return rows;
    })(),
    packingItems: Array.isArray(order?.packingItems) ? order.packingItems : [],
    shippingCost: Number(order?.shippingCost || 0),
  };
};

/** Documento de entrega interna (OPI): mismo detalle de líneas que OPV, sin kiosko ni empaque en este flujo. */
const buildOpiShipmentFromOrder = (order) => {
  const base = buildOpvShipmentFromOrder(order);
  const who = String(order?.customerName || "").trim();
  return {
    ...base,
    id: `opi-${order?.id}`,
    shipmentNumber: order?.vendorShipmentNumber || order?.code || `OPI-${order?.id}`,
    locationId: null,
    locationCode: "",
    locationName: who
      ? `Personal interno — ${who} (sin movimiento de inventario PT / kiosko)`
      : "Personal interno / colaborador (sin movimiento de inventario PT / kiosko)",
    packingItems: [],
    shippingCost: 0,
    status: "CONFIRMED",
  };
};

const buildOpiPrintRows = (shipment, pricingMeta, saleRefById) => {
  const meta =
    pricingMeta && typeof pricingMeta === "object"
      ? pricingMeta
      : { applyHalfPrice: pricingMeta !== false, requestType: "PLANILLA", discountPercent: 50 };
  const list = shipment._printProducts || shipment.products || [];
  return list
    .map((p) => {
      const pid = Number(p.productId);
      let refNum = null;
      if (Number.isFinite(pid) && pid > 0) {
        const fromCat = Number(saleRefById[pid]);
        if (Number.isFinite(fromCat) && fromCat > 0) {
          refNum = fromCat;
        }
      }
      if (refNum == null || refNum <= 0) {
        const fromLine = Number(p.unitPrice || 0);
        refNum = Number.isFinite(fromLine) && fromLine > 0 ? fromLine : null;
      }
      const display = refNum != null ? computeInternalEnviUnitPrice(refNum, meta) : null;
      return {
        productCode: p.productCode || "",
        productName: p.productName || "",
        colorName: p.colorName || "",
        size: p.size || "",
        quantity: p.quantity,
        refPrice: refNum,
        displayPrice: display,
      };
    })
    .filter((r) => Number(r.quantity) > 0);
};

/**
 * Ítems alineados al documento de venta en línea (descripción = producto + color + talla).
 */
const buildOnlineSaleItemsFromShipmentDoc = (
  shipment,
  { resolveProductUnitPrice, resolveMaterialUnitPrice, packingMaterials, getShipmentPackingItems }
) => {
  const shipmentProducts = shipment._printProducts || shipment.products || [];
  const notesPayload = parseShipmentMetaNotes(shipment.notes);
  const beltSizeLines = shipmentProducts
    .filter((item) => String(item.size || "").trim() !== "")
    .map((item) => ({
      productId: Number(item.productId),
      colorId: item.colorId === null || item.colorId === undefined ? null : Number(item.colorId),
      size: String(item.size || "").trim().toUpperCase(),
      quantity: Number(item.quantity || 0),
    }));
  const hasApiSizes = beltSizeLines.length > 0;
  const beltSizesSource = resolveBeltSizesSource(
    shipment,
    hasApiSizes,
    beltSizeLines,
    notesPayload
  );
  const beltSizesByProductColor = {};
  beltSizesSource.forEach((line) => {
    const mapKey = `${line.productId}:${line.colorId === null ? "null" : line.colorId}`;
    if (!beltSizesByProductColor[mapKey]) beltSizesByProductColor[mapKey] = [];
    beltSizesByProductColor[mapKey].push(line);
  });

  const productRows = shipmentProducts
    .flatMap((item) => {
      const qty = Number(item.quantity || 0);
      const unitPrice = resolveProductUnitPrice(item);
      const rowPrice = unitPrice > 0 ? unitPrice : 0;
      const detailKey = `${item.productId}:${
        item.colorId === null || item.colorId === undefined ? "null" : item.colorId
      }`;
      const isCincho = isCinchoProduct(item.productCode, item.productName);

      if (String(item.size || "").trim()) {
        const lineTotal = qty * rowPrice;
        return [
          {
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            colorName: item.colorName || "",
            brandName: item.brandName || "",
            size: String(item.size || "").trim().toUpperCase(),
            quantity: qty,
            unitPrice: rowPrice,
            subtotal: rowPrice > 0 ? lineTotal : 0,
          },
        ];
      }
      const beltLines = !hasApiSizes && isCincho ? beltSizesByProductColor[detailKey] || [] : [];
      if (beltLines.length > 0) {
        return beltLines.map((belt) => {
          const beltQty = Number(belt.quantity || 0);
          return {
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            colorName: item.colorName || "",
            brandName: item.brandName || "",
            size: belt.size,
            quantity: beltQty,
            unitPrice: rowPrice,
            subtotal: rowPrice > 0 ? beltQty * rowPrice : 0,
          };
        });
      }
      const lineTotal = qty * rowPrice;
      return [
        {
          productCode: item.productCode || "-",
          productName: item.productName || "-",
          colorName: item.colorName || "",
          brandName: item.brandName || "",
          size: "",
          quantity: qty,
          unitPrice: rowPrice,
          subtotal: rowPrice > 0 ? lineTotal : 0,
        },
      ];
    })
    .filter((row) => row.quantity > 0);

  const packingItems = shipment._printPackingItems || getShipmentPackingItems(shipment);
  const packingRows = packingItems
    .map((item) => {
      const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
      const qty = Number(item.quantity || 0);
      const unitPrice = resolveMaterialUnitPrice(item, material);
      const safeUnit = Number.isFinite(unitPrice) ? unitPrice : 0;
      const lineTotal = qty * safeUnit;
      return {
        productCode: material?.sku || `SUM-${item.materialId}`,
        productName: material?.name || "Empaque",
        colorName: "",
        size: "",
        quantity: qty,
        unitPrice: safeUnit,
        subtotal: lineTotal,
      };
    })
    .filter((row) => row.quantity > 0);

  return [...productRows, ...packingRows];
};

const buildOpvOnlineSalePayload = (printDoc, productionOrder, deps) => {
  const printSource =
    productionOrder?.items?.length
      ? {
          ...printDoc,
          _printProducts: applyOrderItemPricesToShipmentProducts(
            productionOrder,
            printDoc._printProducts || printDoc.products || []
          ),
        }
      : printDoc;
  const items = buildOnlineSaleItemsFromShipmentDoc(printSource, deps);
  const netAmount = items.reduce((s, it) => s + Number(it.subtotal || 0), 0);
  const order = productionOrder || {};
  const shippingCost = Number(
    printDoc.shippingCost ?? order.shippingCost ?? 0
  );
  const totalAmount = netAmount + shippingCost;
  const destFromNotes = extractDestinationFromShipmentNotes(printDoc?.notes);
  const address =
    (order.customerAddress && String(order.customerAddress).trim()) ||
    destFromNotes ||
    "—";
  const customerName =
    (order.customerName && String(order.customerName).trim()) ||
    printDoc.locationName ||
    "—";
  const dateStr = getTodayYmdGuatemala();

  return {
    customerName,
    address,
    phone: order.customerPhone || "—",
    phone2: order.customerPhone || "—",
    saleNumber: order.code || String(order.id || ""),
    shipmentNumber:
      order.vendorShipmentNumber ||
      printDoc.shipmentNumber ||
      order.code ||
      String(order.id || ""),
    saleDate: dateStr,
    shippingCarrier: null,
    guideNumber: "",
    invoiceTaxId: order.customerTaxId || order.invoiceTaxId || "CF",
    salesperson: order.sellerName || "—",
    paymentMethod: "",
    items,
    netAmount,
    totalAmount,
    shippingCost,
  };
};

function buildOrderSelectOptions(orders, labelFn) {
  return (orders || []).map((order) => {
    const label = labelFn(order);
    return {
      value: String(order.id),
      label,
      searchText: `${order.code || ""} ${order.customerName || ""} ${order.sellerName || ""} ${order.status || ""} ${label}`,
    };
  });
}

function PrepareShipments() {
  const navigate = useNavigate();
  const [distributions, setDistributions] = useState([]);
  const [distributionId, setDistributionId] = useState("");
  const [shipments, setShipments] = useState([]);
  const [selectedRows, setSelectedRows] = useState({});
  const [copiesByShipment, setCopiesByShipment] = useState({});
  const [search, setSearch] = useState("");
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [sendingShipmentId, setSendingShipmentId] = useState(null);
  const [revertingShipmentId, setRevertingShipmentId] = useState(null);
  const [repairingReceiptShipmentId, setRepairingReceiptShipmentId] = useState(null);
  const [cancellingShipmentId, setCancellingShipmentId] = useState(null);
  const [error, setError] = useState("");
  const [partialPendingCount, setPartialPendingCount] = useState(0);
  const [orderPartialReleases, setOrderPartialReleases] = useState(null);
  const [opvOrders, setOpvOrders] = useState([]);
  const [opiOrders, setOpiOrders] = useState([]);
  const [selectedOpvOrderId, setSelectedOpvOrderId] = useState("");
  const [selectedOpiOrderId, setSelectedOpiOrderId] = useState("");
  const [selectedOpcOrderId, setSelectedOpcOrderId] = useState("");
  const [selectedOpckOrderId, setSelectedOpckOrderId] = useState("");
  const [selectedOpkOrderId, setSelectedOpkOrderId] = useState("");
  const [opcOrders, setOpcOrders] = useState([]);
  const [opckOrders, setOpckOrders] = useState([]);
  const [opkOrders, setOpkOrders] = useState([]);
  const [loadingOpvOrders, setLoadingOpvOrders] = useState(false);
  const [loadingOpiOrders, setLoadingOpiOrders] = useState(false);
  const [loadingOpcOrders, setLoadingOpcOrders] = useState(false);
  const [loadingOpckOrders, setLoadingOpckOrders] = useState(false);
  const [loadingOpkOrders, setLoadingOpkOrders] = useState(false);
  const [applyOpiHalfPrice, setApplyOpiHalfPrice] = useState(true);
  const [standaloneInternalList, setStandaloneInternalList] = useState([]);
  const [selectedStandaloneInternalId, setSelectedStandaloneInternalId] = useState("");
  const [loadingStandaloneInternalList, setLoadingStandaloneInternalList] = useState(false);
  const [standaloneKioskList, setStandaloneKioskList] = useState([]);
  const [selectedStandaloneKioskId, setSelectedStandaloneKioskId] = useState("");
  const [loadingStandaloneKioskList, setLoadingStandaloneKioskList] = useState(false);
  const [standaloneKioskModalOpen, setStandaloneKioskModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState("shipments");
  const [pendingOrders, setPendingOrders] = useState([]);
  const [loadingPending, setLoadingPending] = useState(false);
  const [pendingKindFilter, setPendingKindFilter] = useState("ALL");
  const [generateModalOrder, setGenerateModalOrder] = useState(null);
  const [productPriceById, setProductPriceById] = useState({});
  const [sellerPriceById, setSellerPriceById] = useState({});
  const [salePriceRefById, setSalePriceRefById] = useState({});
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [loadingPackingMaterials, setLoadingPackingMaterials] = useState(false);
  const [packingModalShipment, setPackingModalShipment] = useState(null);
  const [editProductsShipment, setEditProductsShipment] = useState(null);
  const [opvPriceReviewOpen, setOpvPriceReviewOpen] = useState(false);
  const [opvPendingPrint, setOpvPendingPrint] = useState(false);
  const [packingQtyByShipment, setPackingQtyByShipment] = useState({});
  const [savingPacking, setSavingPacking] = useState(false);
  const [selectedProductionOrder, setSelectedProductionOrder] = useState(null);
  const [partialReleaseCatalog, setPartialReleaseCatalog] = useState([]);
  const [selectedPartialReleaseKey, setSelectedPartialReleaseKey] = useState("");
  const [loadingPartialReleases, setLoadingPartialReleases] = useState(false);
  const focusedPartialReleaseIdRef = useRef("");

  const filterShipmentsForFocusedPartial = useCallback((docs, partialList) => {
    const focusId = focusedPartialReleaseIdRef.current;
    if (!focusId || !docs?.length) return docs;
    const filtered = docs.filter((s) => {
      if (String(s.partialReleaseId || "") === String(focusId)) return true;
      const linked = findLinkedPartialRelease(s, partialList?.releases);
      return linked && String(linked.id) === String(focusId);
    });
    return filtered.length ? filtered : docs;
  }, []);

  const commitEnrichedShipments = useCallback(
    (printable, partialList, order) => {
      const docs = enrichShipmentsWithPartialMeta(
        printable,
        partialList,
        order ? buildPrepareShipmentProductsExtra(order) : undefined
      );
      const visible = filterShipmentsForFocusedPartial(docs, partialList);
      setShipments(visible);
      const { copies, selected } = initShipmentCopiesAndSelection(visible);
      setCopiesByShipment(copies);
      setSelectedRows(selected);
    },
    [filterShipmentsForFocusedPartial]
  );

  const clearPartialReleaseFocus = () => {
    setSelectedPartialReleaseKey("");
    focusedPartialReleaseIdRef.current = "";
  };

  useEffect(() => {
    loadDistributions();
    loadProductPrices();
    loadPackingMaterials();
    loadOpvOrders();
    loadOpiOrders();
    loadOpcOrders();
    loadOpckOrders();
    loadOpkOrders();
    loadStandaloneInternalShipments();
    loadStandaloneKioskShipments();
    loadPartialReleaseCatalog();
  }, []);

  const loadPartialReleaseCatalog = async () => {
    try {
      setLoadingPartialReleases(true);
      const rows = await searchPartialReleasesForPrepare("", 200);
      setPartialReleaseCatalog(Array.isArray(rows) ? rows : []);
    } catch (_err) {
      setPartialReleaseCatalog([]);
    } finally {
      setLoadingPartialReleases(false);
    }
  };

  const loadPendingOrders = async () => {
    setLoadingPending(true);
    setError("");
    try {
      const orders = await getProductionOrders();
      const candidates = (orders || []).filter(isDirectPrepareOrder);
      const withStatus = await Promise.all(
        candidates.map(async (order) => {
          try {
            const shipments = await getProductionOrderShipments(order.id);
            return { order, shipments: shipments || [] };
          } catch (_e) {
            return { order, shipments: [] };
          }
        })
      );
      const pending = withStatus
        .filter(({ order, shipments }) => orderIsPendingForPrepare(order, shipments))
        .map(({ order }) => order);
      setPendingOrders(pending);
    } catch (err) {
      setError(err.message || "No se pudieron cargar órdenes pendientes");
      setPendingOrders([]);
    } finally {
      setLoadingPending(false);
    }
  };

  useEffect(() => {
    if (viewMode === "pending") {
      loadPendingOrders();
    }
  }, [viewMode]);

  const clearOrderSourceSelectors = () => {
    setSelectedOpvOrderId("");
    setSelectedOpiOrderId("");
    setSelectedOpcOrderId("");
    setSelectedOpckOrderId("");
    setSelectedOpkOrderId("");
    setSelectedStandaloneInternalId("");
    setSelectedStandaloneKioskId("");
    setSelectedProductionOrder(null);
    setOrderPartialReleases(null);
    clearPartialReleaseFocus();
  };

  const clearOrderSelectors = () => {
    setDistributionId("");
    clearOrderSourceSelectors();
    setShipments([]);
  };

  const activateOrderSource = (kind, orderId) => {
    const id = orderId ? String(orderId) : "";
    setViewMode("shipments");
    setDistributionId("");
    clearOrderSourceSelectors();
    setSelectedOpvOrderId(kind === "OPV" ? id : "");
    setSelectedOpiOrderId(kind === "OPI" ? id : "");
    setSelectedOpcOrderId(kind === "OPC" ? id : "");
    setSelectedOpckOrderId(kind === "OPCK" ? id : "");
    setSelectedOpkOrderId(kind === "OPK" ? id : "");
    if (!id) {
      setShipments([]);
    }
  };

  const openOrderInShipmentsView = (order, { keepPartialFocus = false } = {}) => {
    const kind = classifyPrepareOrder(order);
    if (!kind) return;
    setViewMode("shipments");
    if (keepPartialFocus) {
      setDistributionId("");
      setSelectedStandaloneInternalId("");
      setSelectedStandaloneKioskId("");
      setSelectedOpvOrderId("");
      setSelectedOpiOrderId("");
      setSelectedOpcOrderId("");
      setSelectedOpckOrderId("");
      setSelectedOpkOrderId("");
      setSelectedProductionOrder(null);
      setOrderPartialReleases(null);
    } else {
      clearOrderSelectors();
    }
    if (kind === "OPC") setSelectedOpcOrderId(String(order.id));
    else if (kind === "OPI") setSelectedOpiOrderId(String(order.id));
    else if (kind === "OPCK") setSelectedOpckOrderId(String(order.id));
    else if (kind === "OPK") setSelectedOpkOrderId(String(order.id));
    else if (kind === "OPV") setSelectedOpvOrderId(String(order.id));
  };

  const activatePartialReleaseSource = async (compositeKey) => {
    const key = compositeKey ? String(compositeKey) : "";
    if (!key) {
      clearPartialReleaseFocus();
      setShipments([]);
      setSelectedProductionOrder(null);
      return;
    }
    const item = (partialReleaseCatalog || []).find((row) => partialReleaseOptionKey(row) === key);
    if (!item?.productionOrderId) {
      showError("No se encontró la liberación parcial seleccionada.");
      return;
    }
    try {
      focusedPartialReleaseIdRef.current = String(item.id);
      setSelectedPartialReleaseKey(key);
      const order = await getProductionOrderById(item.productionOrderId);
      openOrderInShipmentsView(order, { keepPartialFocus: true });
    } catch (err) {
      clearPartialReleaseFocus();
      setError(err.message || "No se pudo abrir el envío parcial");
      showError(err.message || "No se pudo abrir el envío parcial");
    }
  };

  useEffect(() => {
    if (
      selectedOpvOrderId ||
      selectedOpiOrderId ||
      selectedOpcOrderId ||
      selectedOpckOrderId ||
      selectedOpkOrderId ||
      selectedStandaloneInternalId ||
      selectedStandaloneKioskId
    ) {
      return;
    }
    if (!distributionId) {
      setShipments([]);
      setSelectedRows({});
      setCopiesByShipment({});
      return;
    }
    loadShipments(distributionId);
  }, [
    distributionId,
    selectedOpvOrderId,
    selectedOpiOrderId,
    selectedOpcOrderId,
    selectedOpckOrderId,
    selectedOpkOrderId,
    selectedStandaloneInternalId,
    selectedStandaloneKioskId,
  ]);

  const reloadOpvShipmentsView = useCallback(async () => {
    if (!selectedOpvOrderId) return;
    try {
      setLoadingShipments(true);
      setError("");
      setPartialPendingCount(0);
      const order = await getProductionOrderById(selectedOpvOrderId);
      setSelectedProductionOrder(order);
      setOpvOrders((prev) =>
        (prev || []).map((o) =>
          String(o.id) === String(order.id)
            ? {
                ...o,
                vendorShipmentNumber: order.vendorShipmentNumber,
                customerAddress: order.customerAddress,
                customerPhone: order.customerPhone,
                customerTaxId: order.customerTaxId,
              }
            : o
        )
      );
      const realShipments = await getProductionOrderShipments(selectedOpvOrderId);
      const printable = (realShipments || []).filter(isShipmentRowForPrepareList);
      const partialList = await getProductionOrderPartialReleases(selectedOpvOrderId).catch(() => null);
      setOrderPartialReleases(partialList);
      const pendingConfirm = (partialList?.releases || []).filter(
        (r) => r.status === "CONFIRMED" && !r.shipmentNumber
      );
      setPartialPendingCount(pendingConfirm.length);

      if (printable.length > 0) {
        commitEnrichedShipments(printable, partialList, order);
      } else if (pendingConfirm.length > 0) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else if (order.vendorShipmentVoidedAt) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else {
        const synthetic = buildOpvShipmentFromOrder(order);
        setShipments([synthetic]);
        setCopiesByShipment({ [synthetic.id]: 1 });
        setSelectedRows({ [synthetic.id]: true });
      }
    } catch (err) {
      setError(err.message || "No se pudo cargar la orden OPV");
      setShipments([]);
      setPartialPendingCount(0);
    } finally {
      setLoadingShipments(false);
    }
  }, [selectedOpvOrderId, commitEnrichedShipments]);

  const reloadOpcShipmentsView = useCallback(async () => {
    if (!selectedOpcOrderId) return;
    try {
      setLoadingShipments(true);
      setError("");
      setPartialPendingCount(0);
      const order = await getProductionOrderById(selectedOpcOrderId);
      setSelectedProductionOrder(order);
      setOpcOrders((prev) =>
        (prev || []).map((o) => (String(o.id) === String(order.id) ? { ...o, ...order } : o))
      );
      const realShipments = await getProductionOrderShipments(selectedOpcOrderId);
      const printable = (realShipments || []).filter(isShipmentRowForPrepareList);
      const partialList = orderAllowsPartialReleases(order)
        ? await getProductionOrderPartialReleases(selectedOpcOrderId).catch(() => null)
        : null;
      setOrderPartialReleases(partialList);
      const pendingConfirm = (partialList?.releases || []).filter(
        (r) => r.status === "CONFIRMED" && !r.shipmentNumber
      );
      setPartialPendingCount(pendingConfirm.length);

      if (printable.length > 0) {
        commitEnrichedShipments(printable, partialList, order);
      } else if (pendingConfirm.length > 0) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else {
        setShipments(realShipments || []);
        const initialCopies = {};
        (realShipments || []).forEach((shipment) => {
          initialCopies[shipment.id] = 1;
        });
        setCopiesByShipment(initialCopies);
        setSelectedRows({});
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar los envíos de la orden OPC");
      setShipments([]);
      setPartialPendingCount(0);
    } finally {
      setLoadingShipments(false);
    }
  }, [selectedOpcOrderId, commitEnrichedShipments]);

  const reloadOpckShipmentsView = useCallback(async () => {
    if (!selectedOpckOrderId) return;
    try {
      setLoadingShipments(true);
      setError("");
      setPartialPendingCount(0);
      const order = await getProductionOrderById(selectedOpckOrderId);
      setSelectedProductionOrder(order);
      const realShipments = await getProductionOrderShipments(selectedOpckOrderId);
      const printable = (realShipments || []).filter(isShipmentRowForPrepareList);
      const partialList = orderAllowsPartialReleases(order)
        ? await getProductionOrderPartialReleases(selectedOpckOrderId).catch(() => null)
        : null;
      setOrderPartialReleases(partialList);
      const pendingConfirm = (partialList?.releases || []).filter(
        (r) => r.status === "CONFIRMED" && !r.shipmentNumber
      );
      setPartialPendingCount(pendingConfirm.length);

      if (printable.length > 0) {
        commitEnrichedShipments(printable, partialList, order);
      } else if (pendingConfirm.length > 0) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else {
        setShipments(realShipments || []);
        const initialCopies = {};
        (realShipments || []).forEach((shipment) => {
          initialCopies[shipment.id] = 1;
        });
        setCopiesByShipment(initialCopies);
        setSelectedRows({});
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar los envíos OPCK");
      setShipments([]);
      setPartialPendingCount(0);
    } finally {
      setLoadingShipments(false);
    }
  }, [selectedOpckOrderId, commitEnrichedShipments]);

  const reloadOpkShipmentsView = useCallback(async () => {
    if (!selectedOpkOrderId) return;
    try {
      setLoadingShipments(true);
      setError("");
      setPartialPendingCount(0);
      const order = await getProductionOrderById(selectedOpkOrderId);
      setSelectedProductionOrder(order);
      const realShipments = await getProductionOrderShipments(selectedOpkOrderId);
      const printable = (realShipments || []).filter(isShipmentRowForPrepareList);
      const partialList = orderAllowsPartialReleases(order)
        ? await getProductionOrderPartialReleases(selectedOpkOrderId).catch(() => null)
        : null;
      setOrderPartialReleases(partialList);
      const pendingConfirm = (partialList?.releases || []).filter(
        (r) => r.status === "CONFIRMED" && !r.shipmentNumber
      );
      setPartialPendingCount(pendingConfirm.length);

      if (printable.length > 0) {
        commitEnrichedShipments(printable, partialList, order);
      } else if (pendingConfirm.length > 0) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else {
        setShipments(realShipments || []);
        const initialCopies = {};
        (realShipments || []).forEach((shipment) => {
          initialCopies[shipment.id] = 1;
        });
        setCopiesByShipment(initialCopies);
        setSelectedRows({});
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar los envíos OPK");
      setShipments([]);
      setPartialPendingCount(0);
    } finally {
      setLoadingShipments(false);
    }
  }, [selectedOpkOrderId, commitEnrichedShipments]);

  const reloadPartialOrderShipmentsView = useCallback(async () => {
    if (selectedOpvOrderId) return reloadOpvShipmentsView();
    if (selectedOpcOrderId) return reloadOpcShipmentsView();
    if (selectedOpckOrderId) return reloadOpckShipmentsView();
    if (selectedOpkOrderId) return reloadOpkShipmentsView();
  }, [selectedOpvOrderId, selectedOpcOrderId, selectedOpckOrderId, selectedOpkOrderId, reloadOpvShipmentsView, reloadOpcShipmentsView, reloadOpckShipmentsView, reloadOpkShipmentsView]);

  useEffect(() => {
    if (!selectedOpvOrderId) {
      if (!selectedOpcOrderId && !selectedOpckOrderId && !selectedOpkOrderId) setPartialPendingCount(0);
      return;
    }
    reloadOpvShipmentsView();
  }, [selectedOpvOrderId, reloadOpvShipmentsView]);

  useEffect(() => {
    if (!selectedOpiOrderId) return;
    const loadOrderAsShipment = async () => {
      try {
        setLoadingShipments(true);
        setError("");
        const order = await getProductionOrderById(selectedOpiOrderId);
        setSelectedProductionOrder(order);
        setOpiOrders((prev) =>
          (prev || []).map((o) =>
            String(o.id) === String(order.id)
              ? {
                  ...o,
                  vendorShipmentNumber: order.vendorShipmentNumber,
                  customerAddress: order.customerAddress,
                  customerPhone: order.customerPhone,
                  customerTaxId: order.customerTaxId,
                }
              : o
          )
        );
        if (order.vendorShipmentVoidedAt) {
          setShipments([]);
          setCopiesByShipment({});
          setSelectedRows({});
        } else {
          const synthetic = buildOpiShipmentFromOrder(order);
          setShipments([synthetic]);
          setCopiesByShipment({ [synthetic.id]: 1 });
          setSelectedRows({ [synthetic.id]: true });
        }
      } catch (err) {
        setError(err.message || "No se pudo cargar la orden OPI");
        setShipments([]);
      } finally {
        setLoadingShipments(false);
      }
    };
    loadOrderAsShipment();
  }, [selectedOpiOrderId]);

  useEffect(() => {
    if (!selectedStandaloneInternalId) return;
    const loadStandaloneShipment = async () => {
      try {
        setLoadingShipments(true);
        setError("");
        const shipment = await getShipmentById(selectedStandaloneInternalId);
        const meta = parseStandaloneInternalMeta(shipment?.notes);
        const pseudoOrder = buildPseudoOrderFromStandaloneShipment(shipment);
        setSelectedProductionOrder(pseudoOrder);
        setApplyStandaloneHalfPrice(meta.applyHalfPrice !== false);
        const who = meta.recipientName || pseudoOrder.customerName || "Colaborador";
        const doc = {
          ...shipment,
          locationName: who ? `Personal interno — ${who}` : shipment.locationName,
          notes: getStandaloneInternalUserNotes(shipment?.notes),
          packingItems: [],
          shippingCost: 0,
        };
        setShipments([doc]);
        setCopiesByShipment({ [doc.id]: 1 });
        setSelectedRows({ [doc.id]: true });
      } catch (err) {
        setError(err.message || "No se pudo cargar el envío interno");
        setShipments([]);
      } finally {
        setLoadingShipments(false);
      }
    };
    loadStandaloneShipment();
  }, [selectedStandaloneInternalId]);

  useEffect(() => {
    if (!selectedStandaloneKioskId) return;
    const loadStandaloneKioskShipment = async () => {
      try {
        setLoadingShipments(true);
        setError("");
        setSelectedProductionOrder(null);
        const shipment = await getShipmentById(selectedStandaloneKioskId);
        setShipments([shipment]);
        setCopiesByShipment({ [shipment.id]: 1 });
        setSelectedRows({ [shipment.id]: true });
      } catch (err) {
        setError(err.message || "No se pudo cargar el envío directo a kiosko");
        setShipments([]);
      } finally {
        setLoadingShipments(false);
      }
    };
    loadStandaloneKioskShipment();
  }, [selectedStandaloneKioskId]);

  useEffect(() => {
    if (!selectedOpcOrderId) return;
    reloadOpcShipmentsView();
  }, [selectedOpcOrderId, reloadOpcShipmentsView]);

  useEffect(() => {
    if (!selectedOpckOrderId) return;
    reloadOpckShipmentsView();
  }, [selectedOpckOrderId, reloadOpckShipmentsView]);

  useEffect(() => {
    if (!selectedOpkOrderId) return;
    reloadOpkShipmentsView();
  }, [selectedOpkOrderId, reloadOpkShipmentsView]);

  const loadDistributions = async () => {
    try {
      setLoadingDistributions(true);
      setError("");
      const data = await getDistributions();
      setDistributions(data || []);
    } catch (err) {
      const message = err.message || "No se pudieron cargar las distribuciones";
      setError(message);
      showError(message);
    } finally {
      setLoadingDistributions(false);
    }
  };

  const loadOpvOrders = async () => {
    try {
      setLoadingOpvOrders(true);
      const orders = await getProductionOrders();
      const rows = (orders || []).filter((order) => classifyPrepareOrder(order) === "OPV");
      setOpvOrders(rows);
    } catch (_err) {
      setOpvOrders([]);
    } finally {
      setLoadingOpvOrders(false);
    }
  };

  const loadOpiOrders = async () => {
    try {
      setLoadingOpiOrders(true);
      const orders = await getProductionOrders();
      const rows = (orders || []).filter((order) => {
        const type = String(order?.orderType || "").trim().toUpperCase();
        return type === "INTERNA";
      });
      setOpiOrders(rows);
    } catch (_err) {
      setOpiOrders([]);
    } finally {
      setLoadingOpiOrders(false);
    }
  };

  const loadStandaloneInternalShipments = async () => {
    try {
      setLoadingStandaloneInternalList(true);
      const rows = await listStandaloneInternalShipments();
      setStandaloneInternalList(rows || []);
    } catch (_err) {
      setStandaloneInternalList([]);
    } finally {
      setLoadingStandaloneInternalList(false);
    }
  };

  const loadStandaloneKioskShipments = async () => {
    try {
      setLoadingStandaloneKioskList(true);
      const rows = await listStandaloneKioskShipments();
      setStandaloneKioskList(rows || []);
    } catch (_err) {
      setStandaloneKioskList([]);
    } finally {
      setLoadingStandaloneKioskList(false);
    }
  };

  const handleStandaloneKioskCreated = async (created) => {
    await loadStandaloneKioskShipments();
    setViewMode("shipments");
    setDistributionId("");
    setSelectedOpvOrderId("");
    setSelectedOpiOrderId("");
    setSelectedOpcOrderId("");
    setSelectedOpckOrderId("");
    setSelectedOpkOrderId("");
    setSelectedStandaloneInternalId("");
    setSelectedProductionOrder(null);
    if (created?.id != null) {
      setSelectedStandaloneKioskId(String(created.id));
    }
  };

  const loadOpcOrders = async () => {
    try {
      setLoadingOpcOrders(true);
      const orders = await getProductionOrders();
      const rows = (orders || []).filter((order) => {
        const type = String(order?.orderType || "").trim().toUpperCase();
        return isCinchoOrderType(type) || isOpcFamilyProductionOrderCode(order?.code);
      });
      setOpcOrders(rows);
    } catch (_err) {
      setOpcOrders([]);
    } finally {
      setLoadingOpcOrders(false);
    }
  };

  const loadOpckOrders = async () => {
    try {
      setLoadingOpckOrders(true);
      const orders = await getProductionOrders();
      const rows = (orders || []).filter((order) => {
        const type = String(order?.orderType || "").trim().toUpperCase();
        return type === "CLIENTE_KIOSKO";
      });
      setOpckOrders(rows);
    } catch (_err) {
      setOpckOrders([]);
    } finally {
      setLoadingOpckOrders(false);
    }
  };

  const loadOpkOrders = async () => {
    try {
      setLoadingOpkOrders(true);
      const orders = await getProductionOrders();
      const rows = (orders || []).filter((order) => classifyPrepareOrder(order) === "OPK");
      setOpkOrders(rows);
    } catch (_err) {
      setOpkOrders([]);
    } finally {
      setLoadingOpkOrders(false);
    }
  };

  const reloadCurrentShipments = async () => {
    if (selectedOpcOrderId) {
      await reloadOpcShipmentsView();
      return;
    }
    if (selectedOpckOrderId) {
      await reloadOpckShipmentsView();
      return;
    }
    if (selectedOpkOrderId) {
      await reloadOpkShipmentsView();
      return;
    }
    if (selectedStandaloneKioskId) {
      try {
        const shipment = await getShipmentById(selectedStandaloneKioskId);
        setShipments([shipment]);
        setCopiesByShipment({ [shipment.id]: 1 });
        setSelectedRows({ [shipment.id]: true });
      } catch (_err) {
        setShipments([]);
        setSelectedRows({});
      }
      return;
    }
    if (distributionId) {
      await loadShipments(distributionId);
    }
  };

  const loadShipments = async (id) => {
    try {
      setLoadingShipments(true);
      setError("");
      const dist = (distributions || []).find((row) => String(row.id) === String(id));
      let po = null;
      if (dist?.productionOrderId) {
        try {
          po = await getProductionOrderById(dist.productionOrderId);
        } catch (_err) {
          po = null;
        }
      }
      setSelectedProductionOrder(po);
      setOrderPartialReleases(null);
      const data = await getShipmentsByDistribution(id);
      const rawShipments = data || [];

      setShipments(rawShipments);
      const initialCopies = {};
      const initialSelected = {};
      rawShipments.forEach((shipment) => {
        initialCopies[shipment.id] = 1;
        if (isShipmentRowForPrepareList(shipment)) {
          initialSelected[shipment.id] = true;
        }
      });
      setCopiesByShipment(initialCopies);
      setSelectedRows(initialSelected);
    } catch (err) {
      const message = err.message || "No se pudieron cargar los envios de la distribucion";
      setError(message);
      showError(message);
      setShipments([]);
    } finally {
      setLoadingShipments(false);
    }
  };

  const loadProductPrices = async () => {
    try {
      const products = await getProducts();
      const priceMap = {};
      const sellerMap = {};
      const saleRefMap = {};
      (products || []).forEach((product) => {
        const discounted = Number(product.discountedPrice);
        const regular = Number(product.salePrice);
        const seller = Number(product.sellerPrice);
        const saleOnly = !Number.isNaN(regular) && regular > 0 ? regular : 0;
        saleRefMap[product.id] = saleOnly;
        if (!Number.isNaN(discounted) && discounted > 0) {
          priceMap[product.id] = discounted;
        } else if (!Number.isNaN(regular) && regular > 0) {
          priceMap[product.id] = regular;
        } else {
          priceMap[product.id] = 0;
        }
        sellerMap[product.id] = !Number.isNaN(seller) && seller > 0
          ? seller
          : priceMap[product.id] || 0;
      });
      setProductPriceById(priceMap);
      setSellerPriceById(sellerMap);
      setSalePriceRefById(saleRefMap);
    } catch (err) {
      console.error("Error loading product prices:", err);
      setProductPriceById({});
      setSellerPriceById({});
      setSalePriceRefById({});
    }
  };

  const loadPackingMaterials = async () => {
    try {
      setLoadingPackingMaterials(true);
      const response = await fetch(
        `${process.env.REACT_APP_API_URL || "http://localhost:8080/api"}/materials/search?query=SUM-&activeOnly=true`,
        {
          headers: {
            "Content-Type": "application/json",
            ...getAuthHeader(),
          },
        }
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los empaques SUM-");
      }
      const data = await response.json();
      const rows = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [];
      const filtered = rows.filter((item) =>
        String(item.sku || "").toUpperCase().startsWith("SUM-")
      );
      setPackingMaterials(filtered);
    } catch (err) {
      console.error("Error loading packing materials:", err);
      setPackingMaterials([]);
    } finally {
      setLoadingPackingMaterials(false);
    }
  };

  const getPackingKey = (shipmentId, materialId) => `${shipmentId}:${materialId}`;

  const resolveShipmentPackingItems = useCallback(
    (shipment) => getShipmentPackingItems(shipment, { packingQtyByShipment, packingMaterials }),
    [packingQtyByShipment, packingMaterials]
  );

  const buildPackingItemsPayloadForShipment = useCallback(
    (shipmentId) =>
      packingMaterials
        .map((material) => {
          const key = getPackingKey(shipmentId, material.id);
          const qty = Number(packingQtyByShipment[key] || 0);
          if (!Number.isFinite(qty) || qty <= 0) {
            return null;
          }
          return {
            materialId: Number(material.id),
            quantity: qty,
            unitPrice: resolveMaterialUnitPrice({ materialId: material.id }, material),
          };
        })
        .filter(Boolean),
    [packingMaterials, packingQtyByShipment]
  );

  const openPackingModal = (shipment) => {
    const items = getShipmentPackingItems(shipment, { packingQtyByShipment, packingMaterials });
    if (items.length > 0) {
      setPackingQtyByShipment((prev) => {
        const next = { ...prev };
        items.forEach((item) => {
          next[getPackingKey(shipment.id, item.materialId)] = item.quantity;
        });
        return next;
      });
    }
    setPackingModalShipment(shipment);
  };

  const handleSavePackingModal = async () => {
    const shipment = packingModalShipment;
    if (!shipment?.id) {
      return;
    }
    try {
      setSavingPacking(true);
      setError("");
      const payload = buildPackingItemsPayloadForShipment(shipment.id);
      const updated = await updateShipmentPackingItems(shipment.id, payload);
      setShipments((prev) =>
        prev.map((s) =>
          Number(s.id) === Number(shipment.id)
            ? { ...s, ...updated, packingItems: updated.packingItems || [] }
            : s
        )
      );
      showSuccess("Empaques guardados en el envío");
      setPackingModalShipment(null);
    } catch (err) {
      const message = err.message || "No se pudieron guardar los empaques";
      setError(message);
      showError(message);
    } finally {
      setSavingPacking(false);
    }
  };

  const getPackingCountForShipment = (shipmentId) => {
    return packingMaterials.reduce((count, material) => {
      const key = getPackingKey(shipmentId, material.id);
      const qty = Number(packingQtyByShipment[key] || 0);
      return qty > 0 ? count + 1 : count;
    }, 0);
  };

  const selectedDistribution = useMemo(
    () => distributions.find((dist) => String(dist.id) === String(distributionId)) || null,
    [distributions, distributionId]
  );

  const pendingFlow = viewMode === "pending";

  /** Distribución: listar todos los envíos (también SENT) para reimprimir / exportar. */
  const distributionFlow =
    Boolean(distributionId) &&
    !selectedOpvOrderId &&
    !selectedOpiOrderId &&
    !selectedOpcOrderId &&
    !selectedOpckOrderId &&
    !selectedOpkOrderId &&
    !selectedStandaloneInternalId &&
    !selectedStandaloneKioskId;

  const standaloneInternalFlow = Boolean(selectedStandaloneInternalId);
  const standaloneKioskFlow = Boolean(selectedStandaloneKioskId);

  const luisFelipePrintFlow = useMemo(() => {
    if (isLuisFelipeVendorFlow(selectedProductionOrder?.orderType, selectedProductionOrder?.sellerName)) {
      return true;
    }
    const fromOpc = (opcOrders || []).find((o) => String(o.id) === String(selectedOpcOrderId));
    if (fromOpc && isLuisFelipeVendorFlow(fromOpc.orderType, fromOpc.sellerName)) {
      return true;
    }
    const fromOpv = (opvOrders || []).find((o) => String(o.id) === String(selectedOpvOrderId));
    return Boolean(fromOpv && isLuisFelipeVendorFlow(fromOpv.orderType, fromOpv.sellerName));
  }, [selectedProductionOrder, selectedOpcOrderId, selectedOpvOrderId, opcOrders, opvOrders]);

  const opckFlow = Boolean(selectedOpckOrderId);
  const opkFlow = Boolean(selectedOpkOrderId);

  const opiInternalFlow =
    Boolean(selectedOpiOrderId) &&
    String(selectedProductionOrder?.orderType || "").trim().toUpperCase() === "INTERNA";

  /** Documento colaborador (50% opcional); OPCK usa formato distribución. */
  const opiReferenceFlow = opiInternalFlow || standaloneInternalFlow;

  const opcFlow = Boolean(selectedOpcOrderId);

  const productionOrderPrintFlow = opcFlow || opckFlow || opkFlow || standaloneKioskFlow;

  const showPartialReleasesPanel =
    !pendingFlow &&
    selectedProductionOrder &&
    orderAllowsPartialReleases(selectedProductionOrder) &&
    (selectedOpvOrderId || selectedOpcOrderId || selectedOpckOrderId || selectedOpkOrderId);

  const selectedStandaloneKioskShipment = useMemo(() => {
    if (!selectedStandaloneKioskId) return null;
    return (
      (standaloneKioskList || []).find((s) => String(s.id) === String(selectedStandaloneKioskId)) ||
      (shipments || []).find((s) => String(s.id) === String(selectedStandaloneKioskId)) ||
      null
    );
  }, [selectedStandaloneKioskId, standaloneKioskList, shipments]);

  const printContextLabels = useMemo(
    () => ({
      distributionNumber: opcFlow
        ? selectedProductionOrder?.code || "OPC"
        : opckFlow
          ? selectedProductionOrder?.code || "OPCK"
          : opkFlow
            ? selectedProductionOrder?.code || "OPK"
            : standaloneKioskFlow
              ? selectedStandaloneKioskShipment?.shipmentNumber || "Directo kiosko"
            : isEntreCuerosCustomerOpv(selectedProductionOrder)
              ? selectedProductionOrder?.code || "OPV"
              : selectedDistribution?.distributionNumber || "N/A",
      distributionDescription: opcFlow
        ? `Orden OPC${selectedProductionOrder?.customerName ? ` — ${selectedProductionOrder.customerName}` : ""}`
        : opckFlow
          ? `Orden OPCK${selectedProductionOrder?.customerName ? ` — ${selectedProductionOrder.customerName}` : ""}`
          : opkFlow
            ? `Orden OPK${selectedProductionOrder?.customerName ? ` — ${selectedProductionOrder.customerName}` : ""}`
            : standaloneKioskFlow
              ? `Envío directo kiosko${selectedStandaloneKioskShipment?.locationName ? ` — ${selectedStandaloneKioskShipment.locationName}` : ""}`
            : isEntreCuerosCustomerOpv(selectedProductionOrder)
              ? `Orden OPV${selectedProductionOrder?.customerName ? ` — ${selectedProductionOrder.customerName}` : ""}`
              : selectedDistribution?.description || "",
    }),
    [
      opcFlow,
      opckFlow,
      opkFlow,
      standaloneKioskFlow,
      selectedProductionOrder,
      selectedDistribution,
      selectedStandaloneKioskShipment,
    ]
  );

  const resolveProductUnitPrice = (item) => {
    const fromItem = Number(item?.unitPrice);
    if (Number.isFinite(fromItem) && fromItem > 0) {
      return fromItem;
    }
    const productId = Number(item?.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return Number(item?.price || 0);
    }
    if (luisFelipePrintFlow) {
      return Number(sellerPriceById[productId] || productPriceById[productId] || item?.price || 0);
    }
    return Number(productPriceById[productId] || item?.price || 0);
  };

  const productCatalogById = useMemo(() => {
    const map = {};
    const ids = new Set([
      ...Object.keys(productPriceById || {}),
      ...Object.keys(sellerPriceById || {}),
    ]);
    ids.forEach((id) => {
      map[id] = {
        salePrice: productPriceById[id],
        sellerPrice: sellerPriceById[id],
        price: productPriceById[id],
      };
    });
    return map;
  }, [productPriceById, sellerPriceById]);

  const handleOpvPricesSaved = (order) => {
    const updatedShipments = (shipments || []).map((s) => {
      const priced = applyOrderItemPricesToShipmentProducts(
        order,
        resolveShipmentLinesForPrint(s, order, orderPartialReleases)
      );
      return {
        ...s,
        products: priced,
        _printProducts: priced,
        shippingCost: order.shippingCost ?? s.shippingCost,
      };
    });
    setSelectedProductionOrder(order);
    setShipments(updatedShipments);
    if (opvPendingPrint) {
      setOpvPendingPrint(false);
      void executeOpvPrint(order, updatedShipments);
    }
  };

  const openOpvPriceReview = (forPrint) => {
    if (!selectedProductionOrder?.id) {
      showError("Seleccione una orden OPV u OPC (Luis Felipe)");
      return;
    }
    setOpvPendingPrint(Boolean(forPrint));
    setOpvPriceReviewOpen(true);
  };

  const normalizedQuery = (search || "").toLowerCase().trim();
  const visibleShipments = useMemo(() => {
    if (luisFelipePrintFlow || opiInternalFlow || standaloneInternalFlow || distributionFlow || productionOrderPrintFlow) {
      return shipments;
    }
    return shipments.filter((shipment) => !isShipmentHiddenFromPrepareList(shipment.status));
  }, [shipments, luisFelipePrintFlow, opiInternalFlow, standaloneInternalFlow, distributionFlow, productionOrderPrintFlow]);
  const hiddenProcessedCount = distributionFlow
    ? 0
    : Math.max(0, (shipments || []).length - visibleShipments.length);
  const filteredShipments = useMemo(() => {
    if (!normalizedQuery) return visibleShipments;
    return visibleShipments.filter((shipment) => {
      const headers = [
        shipment.shipmentNumber,
        shipment.locationName,
        shipment.locationCode,
        shipment.partialReleaseLabel,
      ]
        .join(" ")
        .toLowerCase();

      const products = (shipment.products || [])
        .map((p) => `${p.productCode || ""} ${p.productName || ""}`)
        .join(" ")
        .toLowerCase();

      return headers.includes(normalizedQuery) || products.includes(normalizedQuery);
    });
  }, [visibleShipments, normalizedQuery]);

  const filteredPendingOrders = useMemo(() => {
    return pendingOrders.filter((order) => {
      const kind = classifyPrepareOrder(order);
      if (pendingKindFilter !== "ALL" && kind !== pendingKindFilter) return false;
      if (!normalizedQuery) return true;
      const hay = `${order.code || ""} ${order.customerName || ""} ${order.sellerName || ""} ${kind || ""}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [pendingOrders, pendingKindFilter, normalizedQuery]);

  const distributionOptions = useMemo(
    () =>
      (distributions || []).map((dist) => ({
        value: String(dist.id),
        label: `${dist.distributionNumber} - ${dist.distributionDate ? formatDateGt(dist.distributionDate) : "Sin fecha"}`,
        searchText: `${dist.distributionNumber} ${dist.description || ""}`,
      })),
    [distributions]
  );

  const opvOrderOptions = useMemo(
    () =>
      buildOrderSelectOptions(
        opvOrders,
        (order) =>
          `${order.code}${order.vendorShipmentNumber ? ` · ${order.vendorShipmentNumber}` : ""} — ${order.customerName || "Cliente"} (${order.status})`
      ),
    [opvOrders]
  );

  const opiOrderOptions = useMemo(
    () =>
      buildOrderSelectOptions(
        opiOrders,
        (order) => `${order.code} — ${order.customerName || "Colaborador"} (${order.status})`
      ),
    [opiOrders]
  );

  const opcOrderOptions = useMemo(
    () =>
      buildOrderSelectOptions(opcOrders, (order) => {
        const lf = isLuisFelipeVendorFlow(order.orderType, order.sellerName) ? " · LF/OPV" : "";
        return `${order.code} — ${order.customerName || "Cliente"} (${order.status})${lf}`;
      }),
    [opcOrders]
  );

  const opckOrderOptions = useMemo(
    () =>
      buildOrderSelectOptions(
        opckOrders,
        (order) => `${order.code} — ${order.customerName || "Kiosko"} (${order.status})`
      ),
    [opckOrders]
  );

  const opkOrderOptions = useMemo(
    () =>
      buildOrderSelectOptions(
        opkOrders,
        (order) => `${order.code} — ${order.customerName || "Kiosko"} (${order.status})`
      ),
    [opkOrders]
  );

  const standaloneInternalOptions = useMemo(
    () =>
      (standaloneInternalList || []).map((shipment) => {
        const meta = parseStandaloneInternalMeta(shipment?.notes);
        const who = meta.recipientName || shipment.locationName || "Colaborador";
        const label = `${shipment.shipmentNumber} — ${who}`;
        return {
          value: String(shipment.id),
          label,
          searchText: `${shipment.shipmentNumber} ${who}`,
        };
      }),
    [standaloneInternalList]
  );

  const standaloneKioskOptions = useMemo(
    () =>
      (standaloneKioskList || []).map((shipment) => ({
        value: String(shipment.id),
        label: `${shipment.shipmentNumber || `#${shipment.id}`} — ${shipment.locationName || "Kiosko"} (${tStatus(shipment.status)})`,
        searchText: `${shipment.shipmentNumber || ""} ${shipment.locationName || ""} ${shipment.locationCode || ""} ${shipment.status || ""}`,
      })),
    [standaloneKioskList]
  );

  const partialReleaseOptions = useMemo(
    () =>
      (partialReleaseCatalog || []).map((item) => {
        const partialLabel = item.label || `Parcial ${item.sequence || ""}`;
        const shipmentPart = item.shipmentNumber
          ? item.shipmentNumber
          : "sin envío generado";
        const statusPart = partialReleaseStatusLabel(item.shipmentStatus || item.status);
        return {
          value: partialReleaseOptionKey(item),
          label: `${partialLabel} — ${item.orderCode || "OP"} — ${item.customerName || "Cliente"} · ${shipmentPart} (${statusPart})`,
          searchText: [
            partialLabel,
            item.orderCode,
            item.customerName,
            item.shipmentNumber,
            item.shipmentStatus,
            item.status,
            item.orderType,
            "parcial",
            "partial",
          ].join(" "),
        };
      }),
    [partialReleaseCatalog]
  );

  const pendingKindOptions = useMemo(
    () => [
      { value: "ALL", label: "Todos", searchText: "todos" },
      { value: "OPC", label: "OPC", searchText: "opc cinchos" },
      { value: "OPI", label: "OPI", searchText: "opi interna" },
      { value: "OPV", label: "OPV", searchText: "opv vendedor" },
      { value: "OPCK", label: "OPCK", searchText: "opck kiosko cliente" },
      { value: "OPK", label: "OPK", searchText: "opk kiosko" },
    ],
    []
  );

  const handleShipmentGenerated = async (_shipment, order) => {
    setGenerateModalOrder(null);
    if (viewMode === "pending") {
      await loadPendingOrders();
    }
    const target = order?.id ? order : _shipment;
    if (target?.id) {
      try {
        const full = await getProductionOrderById(target.id);
        openOrderInShipmentsView(full);
      } catch (_e) {
        openOrderInShipmentsView(target);
      }
    }
  };

  const selectedShipmentIds = Object.keys(selectedRows).filter((id) => selectedRows[id]);

  const toggleRow = (shipmentId) => {
    setSelectedRows((prev) => ({
      ...prev,
      [shipmentId]: !prev[shipmentId],
    }));
  };

  const toggleAllFiltered = () => {
    const allSelected = filteredShipments.length > 0 &&
      filteredShipments.every((shipment) => selectedRows[shipment.id]);

    const next = { ...selectedRows };
    filteredShipments.forEach((shipment) => {
      next[shipment.id] = !allSelected;
    });
    setSelectedRows(next);
  };

  const getStatusBadge = (status) => {
    const map = {
      DRAFT: { color: "secondary", text: "Borrador" },
      CONFIRMED: { color: "info", text: "Confirmado" },
      SENT: { color: "warning", text: "Enviado" },
      DELIVERED: { color: "success", text: "Entregado" },
      COMPLETED: { color: "success", text: "Completado" },
    };
    const config = map[status] || { color: "dark", text: tStatus(status) };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const formatCurrency = (amount) => {
    const parsed = Number(amount || 0);
    return `Q${parsed.toLocaleString("es-GT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getPrintedBy = () => {
    try {
      const userRaw = localStorage.getItem("user");
      if (!userRaw) return "Usuario";
      const user = JSON.parse(userRaw);
      return user?.fullName || user?.name || user?.username || user?.email || "Usuario";
    } catch (_e) {
      return "Usuario";
    }
  };

  const resolveShipmentPrintDate = () => formatDateGt(new Date());

  const resolveCreatedByName = (shipment) => {
    if (shipment?.partialReleaseCreatedByName) return shipment.partialReleaseCreatedByName;
    if (luisFelipePrintFlow && selectedProductionOrder?.sellerName) {
      return selectedProductionOrder.sellerName;
    }
    return "—";
  };

  const resolveGeneratedByName = (shipment) => {
    if (shipment?.createdByName) return shipment.createdByName;
    if (selectedDistribution?.createdByName) return selectedDistribution.createdByName;
    return getPrintedBy();
  };

  const resolvePrintAuthorName = (shipment) => resolveCreatedByName(shipment);

  const getShipmentPrintProducts = useCallback(
    (shipment, order = selectedProductionOrder) => {
      const lines = resolveShipmentLinesForPrint(shipment, order, orderPartialReleases);
      return applyOrderItemPricesToShipmentProducts(order, lines);
    },
    [selectedProductionOrder, orderPartialReleases]
  );

  const buildPrintableDocs = ({ shipmentsList, order } = {}) => {
    const activeShipments = shipmentsList ?? shipments;
    const activeOrder = order ?? selectedProductionOrder;
    const docs = [];
    activeShipments.forEach((shipment) => {
      if (!selectedRows[shipment.id]) return;
      const copies = Math.max(1, parseInt(copiesByShipment[shipment.id], 10) || 1);
      const printProducts = getShipmentPrintProducts(shipment, activeOrder);
      if (luisFelipePrintFlow || opiInternalFlow || standaloneInternalFlow) {
        const shipmentPacking = resolveShipmentPackingItems(shipment);
        const orderPacking = Array.isArray(selectedProductionOrder?.packingItems)
          ? selectedProductionOrder.packingItems
          : [];
        const printPacking = opiInternalFlow || standaloneInternalFlow
          ? []
          : isPartialReleaseShipmentDoc(shipment)
            ? shipmentPacking
            : shipmentPacking.length > 0
              ? shipmentPacking
              : orderPacking;
        for (let copyIdx = 0; copyIdx < copies; copyIdx += 1) {
          const copyLabel = copies > 1 ? `Copia ${copyIdx + 1} de ${copies}` : "";
          docs.push({
            ...shipment,
            shippingCost: Number(
              isPartialReleaseShipmentDoc(shipment)
                ? (shipment.shippingCost ?? 0)
                : (shipment.shippingCost ?? selectedProductionOrder?.shippingCost ?? 0)
            ),
            _printProducts: printProducts,
            _printPackingItems: printPacking,
            _partNumber: 1,
            _partTotal: 1,
            copyLabel,
          });
        }
        return;
      }
      const maxRowsPerPage = isEntreCuerosCustomerOpv(selectedProductionOrder)
        ? MAX_ENTRECUEROS_ROWS_PER_SHIPMENT
        : MAX_PRODUCT_ROWS_PER_SHIPMENT;
      const productChunks = chunkArray(printProducts, maxRowsPerPage);
      const packingItems = resolveShipmentPackingItems(shipment);
      const hasPacking = packingItems.length > 0;
      const shouldSeparatePackingPart = productChunks.length > 1 && hasPacking;
      const totalParts = shouldSeparatePackingPart ? productChunks.length + 1 : productChunks.length;

      for (let partIdx = 0; partIdx < totalParts; partIdx += 1) {
        const isPackingOnlyPart = shouldSeparatePackingPart && partIdx === totalParts - 1;
        const productsForPart = isPackingOnlyPart ? [] : (productChunks[partIdx] || []);
        const packingForPart = shouldSeparatePackingPart
          ? (isPackingOnlyPart ? packingItems : [])
          : packingItems;
        const entreCuerosPrint = isEntreCuerosCustomerOpv(selectedProductionOrder);
        const partLabel =
          totalParts > 1
            ? `${entreCuerosPrint ? "Hoja" : "Parte"} ${partIdx + 1} de ${totalParts}`
            : "";
        const isLastPart = partIdx === totalParts - 1;
        for (let copyIdx = 0; copyIdx < copies; copyIdx += 1) {
          const copyLabel = copies > 1 ? `Copia ${copyIdx + 1} de ${copies}` : "";
          const pageDoc = {
            ...shipment,
            _printProducts: productsForPart,
            _printPackingItems: packingForPart,
            _partNumber: partIdx + 1,
            _partTotal: totalParts,
            copyLabel: [partLabel, copyLabel].filter(Boolean).join(" - "),
          };
          if (entreCuerosPrint) {
            pageDoc.shippingCost =
              isLastPart && !isPackingOnlyPart
                ? Number(shipment.shippingCost ?? selectedProductionOrder?.shippingCost ?? 0)
                : 0;
          }
          docs.push(pageDoc);
        }
      }
    });
    return docs;
  };

  const executeOpvPrint = async (orderOverride, shipmentsOverride) => {
    const activeOrder = orderOverride || selectedProductionOrder;
    const docs = buildPrintableDocs({
      shipmentsList: shipmentsOverride,
      order: activeOrder,
    });
    if (docs.length === 0) {
      showError("Selecciona al menos un envio para imprimir");
      return;
    }
    const printWindowOpv = window.open("", "_blank");
    if (!printWindowOpv) {
      showError("No se pudo abrir la ventana de impresion");
      return;
    }
    const opvDeps = {
      packingMaterials,
      resolveProductUnitPrice,
      resolveMaterialUnitPrice,
      getShipmentPackingItems: resolveShipmentPackingItems,
    };
    const showBrandColumn =
      isEntreCuerosCustomerOpv(activeOrder) || orderItemsHaveBrand(activeOrder?.items);
    const frontBase = getPublicFrontBaseUrl();
    const bodyParts = await Promise.all(
      docs.map(async (shipmentDoc) => {
        const sale = buildOpvOnlineSalePayload(shipmentDoc, activeOrder, opvDeps);
        const docNo = String(sale.shipmentNumber || sale.saleNumber || "");
        const partialLabel = shipmentDoc.partialReleaseLabel
          ? `Parcial: ${shipmentDoc.partialReleaseLabel}`
          : "";
        let qrDataUrl = "";
        if (frontBase && activeOrder?.id) {
          try {
            qrDataUrl = await QRCode.toDataURL(
              buildPtDispatchOnlineUrl(frontBase, { productionOrderId: activeOrder.id }),
              { width: 160, margin: 1 }
            );
          } catch (_e) {
            qrDataUrl = "";
          }
        }
        return buildShipmentDocumentInnerHtml(sale, {
          docType: "ENVIO",
          docNo,
          netAmount: sale.netAmount,
          totalAmount: sale.totalAmount,
          shippingCost: sale.shippingCost,
          copyLabel: shipmentDoc.copyLabel || "",
          docSubtitle: partialLabel || undefined,
          businessTitle: "VENTA CLIENTES FOSSILES",
          showBrandColumn,
          createdByName: resolveCreatedByName(shipmentDoc),
          generatedByName: resolveGeneratedByName(shipmentDoc),
          qrDataUrl,
        });
      })
    );
    const bodyInner = bodyParts.join("");
    printWindowOpv.document.write(`<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>ENVIO Luis Felipe</title>
    <style>${getShipmentDocumentStyles()}</style>
  </head>
  <body>${bodyInner}</body>
</html>`);
    printWindowOpv.document.close();
    printWindowOpv.focus();
    setTimeout(() => {
      printWindowOpv.print();
    }, 300);
  };

  const printSelected = () => {
    const docs = buildPrintableDocs();
    if (docs.length === 0) {
      showError("Selecciona al menos un envio para imprimir");
      return;
    }

    if (luisFelipePrintFlow) {
      openOpvPriceReview(true);
      return;
    }

    if ((opiInternalFlow || standaloneInternalFlow) && !luisFelipePrintFlow) {
      for (const shipmentDoc of docs) {
        const order = standaloneInternalFlow
          ? buildPseudoOrderFromStandaloneShipment(shipmentDoc)
          : selectedProductionOrder;
        const standaloneMeta = standaloneInternalFlow
          ? parseStandaloneInternalMeta(shipmentDoc?.notes)
          : null;
        const rows = buildOpiPrintRows(
          shipmentDoc,
          standaloneMeta || { requestType: "PLANILLA", discountPercent: 50 },
          salePriceRefById
        );
        const html = buildOpShipmentPrintDocumentHtml({
          order,
          shipment: shipmentDoc,
          rows,
          pricingMeta: standaloneMeta || { requestType: "PLANILLA", discountPercent: 50 },
          requestType: standaloneMeta?.requestType,
        });
        if (!openOpShipmentPrintWindow(html)) {
          showError("Permita ventanas emergentes para imprimir.");
          return;
        }
      }
      return;
    }

    void (async () => {
      try {
    const distributionNumber = printContextLabels.distributionNumber;
    const distributionDescription = printContextLabels.distributionDescription;
    const sourceAddress = "Bodega Principal";
    const pageWidth = PRINT_PAPER_WIDTH_MM;
    const pageHeight = PRINT_PAPER_HEIGHT_MM;
    const printMarginTopMm = 5;
    const printMarginRightMm = 3;
    const printMarginBottomMm = 3;
    const printMarginLeftMm = 3;
    const hardwareSafeInsetMm = 5;
    const contentWidthMm = Math.max(
      90,
      pageWidth - printMarginLeftMm - printMarginRightMm - hardwareSafeInsetMm * 2
    );
    const printFontFamily = PRINT_FONT_FAMILY;

    const frontBase = getPublicFrontBaseUrl();
    let distributionQrDataUrl = "";
    if (frontBase && selectedDistribution?.id) {
      try {
        distributionQrDataUrl = await QRCode.toDataURL(
          buildPtDispatchDistributionUrl(frontBase, selectedDistribution.id),
          {
            width: 120,
            margin: 1,
          }
        );
      } catch (_e) {
        // omit QR if generation fails
      }
    }

    const entreCuerosPrint = isEntreCuerosCustomerOpv(selectedProductionOrder);
    const showBrandColumnPrint =
      entreCuerosPrint || orderItemsHaveBrand(selectedProductionOrder?.items);
    const gridColCount = showBrandColumnPrint ? 8 : 7;

    const docsHtml = docs
      .map((shipment, idx) => {
        const shipmentProducts = applyOrderItemPricesToShipmentProducts(
          selectedProductionOrder,
          shipment._printProducts || shipment.products || []
        );
        const notesPayload = parseShipmentMetaNotes(shipment.notes);
        const shipmentPackingItems = shipment._printPackingItems || resolveShipmentPackingItems(shipment);
        const packingRows = shipmentPackingItems
          .map((item) => {
            const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
            const qty = Number(item.quantity || 0);
            const unitPrice = resolveMaterialUnitPrice(item, material);
            const lineTotal = qty * (Number.isFinite(unitPrice) ? unitPrice : 0);
            return {
              rowType: "packing",
              productCode: material?.sku || `SUM-${item.materialId}`,
              productName: material?.name || "Empaque",
              brandName: "—",
              colorName: "-",
              quantity: qty,
              uomName: material?.uomName || material?.unitName || "Unidad",
              unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
              lineTotal,
            };
          })
          .filter((row) => row.quantity > 0);

        const beltSizeLines = shipmentProducts
          .filter((item) => String(item.size || "").trim() !== "")
          .map((item) => ({
            productId: Number(item.productId),
            colorId: item.colorId === null || item.colorId === undefined ? null : Number(item.colorId),
            size: String(item.size || "").trim().toUpperCase(),
            quantity: Number(item.quantity || 0),
          }));
        const hasApiSizes = beltSizeLines.length > 0;
        const beltSizesSource = resolveBeltSizesSource(
          shipment,
          hasApiSizes,
          beltSizeLines,
          notesPayload
        );
        const beltSizesByProductColor = {};
        beltSizesSource.forEach((line) => {
          const mapKey = `${line.productId}:${line.colorId === null ? "null" : line.colorId}`;
          if (!beltSizesByProductColor[mapKey]) {
            beltSizesByProductColor[mapKey] = [];
          }
          beltSizesByProductColor[mapKey].push(line);
        });

        const productRows = shipmentProducts
          .map((item) => {
            const qty = Number(item.quantity || 0);
            const unitPrice = resolveProductUnitPrice(item);
            const rowPrice = unitPrice > 0 ? unitPrice : 0;
            const detailKey = `${item.productId}:${item.colorId === null || item.colorId === undefined ? "null" : item.colorId}`;
            const isCincho = isCinchoProduct(item.productCode, item.productName);
            if (String(item.size || "").trim()) {
              const lineTotal = qty * rowPrice;
              return [{
                rowType: "product",
                productCode: item.productCode || "-",
                productName: `${item.productName || "-"} TALLA ${String(item.size || "").trim().toUpperCase()}`,
                brandName: item.brandName || "—",
                colorName: item.colorName || "-",
                quantity: qty,
                uomName: item.uomName || item.unitName || "Unidad",
                unitPrice: rowPrice,
                lineTotal: rowPrice > 0 ? lineTotal : 0,
              }];
            }
            const beltLines = !hasApiSizes && isCincho ? (beltSizesByProductColor[detailKey] || []) : [];
            if (beltLines.length > 0) {
              return beltLines.map((belt) => {
                const beltQty = Number(belt.quantity || 0);
                return {
                  rowType: "product",
                  productCode: item.productCode || "-",
                  productName: `${item.productName || "-"} TALLA ${belt.size}`,
                  brandName: item.brandName || "—",
                  colorName: item.colorName || "-",
                  quantity: beltQty,
                  uomName: item.uomName || item.unitName || "Unidad",
                  unitPrice: rowPrice,
                  lineTotal: rowPrice > 0 ? beltQty * rowPrice : 0,
                };
              });
            }
            const lineTotal = qty * rowPrice;
            return [{
              rowType: "product",
              productCode: item.productCode || "-",
              productName: item.productName || "-",
              brandName: item.brandName || "—",
              colorName: item.colorName || "-",
              quantity: qty,
              uomName: item.uomName || item.unitName || "Unidad",
              unitPrice: rowPrice,
              lineTotal: rowPrice > 0 ? lineTotal : 0,
            }];
          })
          .flat()
          .filter((row) => row.quantity > 0);

        const detailRows = [...productRows, ...packingRows];
        const brandCell = (row) =>
          showBrandColumnPrint
            ? `<td>${String(row.brandName || "").trim() || "—"}</td>`
            : "";
        const rows = detailRows
          .map((row) => `
            <tr>
              <td>${row.productCode}</td>
              <td>${row.productName}</td>
              ${brandCell(row)}
              <td>${row.colorName}</td>
              <td class="numeric">${row.quantity}</td>
              <td>${row.uomName}</td>
              <td class="numeric">${row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "-"}</td>
              <td class="numeric">${row.lineTotal > 0 ? formatCurrency(row.lineTotal) : "-"}</td>
            </tr>
          `)
          .join("");

        const totalQty = detailRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
        const totalAmount = detailRows.reduce((sum, row) => sum + Number(row.lineTotal || 0), 0);
        const shippingCost = Number(shipment.shippingCost || 0);
        const grandTotal = totalAmount + (shippingCost > 0 ? shippingCost : 0);
        const printedAt = resolveShipmentPrintDate(shipment);
        const createdByName = resolveCreatedByName(shipment);
        const generatedByName = resolveGeneratedByName(shipment);

        const metaRowsHtml = `
              <tr>
                <td colspan="3"><strong>Direccion Envio:</strong> ${sourceAddress}</td>
                <td colspan="2"><strong>Fecha:</strong> ${printedAt}</td>
              </tr>
              <tr>
                <td colspan="3"><strong>Direccion Recibido:</strong> ${shipment.locationName || "-"} ${shipment.locationCode ? `(${shipment.locationCode})` : ""}</td>
                <td colspan="2"><strong>${luisFelipePrintFlow ? "Orden No" : "Envio No"}:</strong> ${shipment.shipmentNumber || shipment.id}</td>
              </tr>
              <tr>
                <td colspan="3"><strong>Creado por:</strong> ${createdByName}</td>
                <td colspan="2"><strong>Distribucion:</strong> ${distributionNumber}</td>
              </tr>
              <tr>
                <td colspan="5"><strong>Generado por:</strong> ${generatedByName} ${shipment.copyLabel ? `- ${shipment.copyLabel}` : ""}</td>
              </tr>
              ${
                shipment.partialReleaseLabel
                  ? `<tr><td colspan="5"><strong>Liberación parcial:</strong> ${shipment.partialReleaseLabel}</td></tr>`
                  : ""
              }
            `;

        const metaHeaderHtml =
          idx === 0 && distributionQrDataUrl
            ? `<div class="doc-header">
                <div class="doc-header-main">
                  <table class="meta">${metaRowsHtml}</table>
                </div>
                <div class="doc-header-qr">
                  <img src="${String(distributionQrDataUrl).replace(/"/g, "&quot;")}" alt="QR" />
                  <div class="doc-header-qr-caption">Escanear en app Bodega PT — distribución</div>
                </div>
              </div>`
            : `<table class="meta">${metaRowsHtml}</table>`;

        return `
          <section class="doc">
            ${metaHeaderHtml}

            <table class="grid${showBrandColumnPrint ? " grid-with-brand" : ""}">
              <thead>
                <tr>
                  <th>Cod.</th>
                  <th>Producto</th>
                  ${showBrandColumnPrint ? "<th>Marca</th>" : ""}
                  <th>Color</th>
                  <th>Cantidad</th>
                  <th>Medida</th>
                  <th>Precio</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="${gridColCount}" class="empty">Sin productos</td></tr>`}
                <tr class="total-row">
                  <td colspan="${showBrandColumnPrint ? 4 : 3}"><strong>Total</strong></td>
                  <td class="numeric"><strong>${totalQty}</strong></td>
                  <td></td>
                  <td></td>
                  <td class="numeric"><strong>${totalAmount > 0 ? formatCurrency(totalAmount) : "-"}</strong></td>
                </tr>
                ${
                  luisFelipePrintFlow
                    ? `<tr class="total-row">
                        <td colspan="${gridColCount - 1}"><strong>Costo de envio</strong></td>
                        <td class="numeric"><strong>${shippingCost > 0 ? formatCurrency(shippingCost) : "Q0.00"}</strong></td>
                      </tr>
                      <tr class="total-row">
                        <td colspan="${gridColCount - 1}"><strong>Total con envio</strong></td>
                        <td class="numeric"><strong>${grandTotal > 0 ? formatCurrency(grandTotal) : "Q0.00"}</strong></td>
                      </tr>`
                    : ""
                }
              </tbody>
            </table>

            <table class="meta footer-meta">
              <tr>
                <td colspan="5"><strong>Observacion:</strong> ${notesPayload.baseNotes || distributionDescription || "-"}</td>
              </tr>
              <tr>
                <td colspan="2"><strong>Vo. Bo.:</strong></td>
                <td colspan="3"><strong>Recibido:</strong></td>
              </tr>
            </table>
          </section>
        `;
      })
      .join("");

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showError("No se pudo abrir la ventana de impresion");
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${luisFelipePrintFlow ? "Orden de Produccion" : "Preparacion de envios"}</title>
          <style>
            @page {
              size: ${pageWidth}mm ${pageHeight}mm;
              margin: 0;
            }
            * { box-sizing: border-box; }
            html, body {
              width: ${pageWidth}mm;
            }
            body {
              font-family: ${printFontFamily};
              font-size: 11.5px;
              font-weight: 700;
              color: #111;
              margin: 0;
              padding: ${printMarginTopMm}mm ${printMarginRightMm + hardwareSafeInsetMm}mm ${printMarginBottomMm}mm ${printMarginLeftMm + hardwareSafeInsetMm}mm;
              text-rendering: geometricPrecision;
            }
            table, th, td, strong, span, div {
              font-family: ${printFontFamily};
              font-weight: 700;
            }
            .doc {
              width: ${contentWidthMm}mm;
              min-height: auto;
              margin: 0 auto 2mm auto;
              break-inside: avoid-page;
              page-break-inside: avoid;
            }
            .doc-header {
              display: flex;
              flex-direction: row;
              align-items: flex-start;
              justify-content: space-between;
              gap: 3mm;
              width: 100%;
              margin-bottom: 1mm;
            }
            .doc-header-main {
              flex: 1 1 auto;
              min-width: 0;
            }
            .doc-header-qr {
              flex: 0 0 22mm;
              text-align: center;
              align-self: flex-start;
              padding-top: 1px;
            }
            .doc-header-qr img {
              width: 18mm;
              height: 18mm;
              display: block;
              margin: 0 auto;
            }
            .doc-header-qr-caption {
              font-size: 6.5px;
              margin-top: 1px;
              font-weight: 700;
              line-height: 1.05;
              max-width: 22mm;
            }
            .doc + .doc {
              break-before: page;
              page-break-before: always;
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            .meta,
            .grid {
              table-layout: fixed;
            }
            .meta td {
              border: 0.25mm solid #111;
              padding: 3px 4px;
              vertical-align: top;
              line-height: 1.1;
              overflow-wrap: anywhere;
            }
            .grid th,
            .grid td {
              border: 0.25mm solid #111;
              padding: 3px 4px;
              line-height: 1.1;
              overflow-wrap: anywhere;
            }
            .grid thead th {
              text-align: left;
              background: #fff;
              font-weight: 700;
            }
            .grid th:nth-child(1), .grid td:nth-child(1) { width: 12%; } /* Cod */
            .grid th:nth-child(2), .grid td:nth-child(2) { width: 23%; } /* Producto */
            .grid:not(.grid-with-brand) th:nth-child(3), .grid:not(.grid-with-brand) td:nth-child(3) { width: 12%; } /* Color */
            .grid:not(.grid-with-brand) th:nth-child(4), .grid:not(.grid-with-brand) td:nth-child(4) { width: 10%; } /* Cantidad */
            .grid:not(.grid-with-brand) th:nth-child(5), .grid:not(.grid-with-brand) td:nth-child(5) { width: 14%; } /* Medida */
            .grid:not(.grid-with-brand) th:nth-child(6), .grid:not(.grid-with-brand) td:nth-child(6) { width: 15%; } /* Precio */
            .grid:not(.grid-with-brand) th:nth-child(7), .grid:not(.grid-with-brand) td:nth-child(7) { width: 15%; } /* Total */
            .grid.grid-with-brand th:nth-child(3), .grid.grid-with-brand td:nth-child(3) { width: 11%; } /* Marca */
            .grid.grid-with-brand th:nth-child(4), .grid.grid-with-brand td:nth-child(4) { width: 10%; } /* Color */
            .grid.grid-with-brand th:nth-child(5), .grid.grid-with-brand td:nth-child(5) { width: 9%; } /* Cantidad */
            .grid.grid-with-brand th:nth-child(6), .grid.grid-with-brand td:nth-child(6) { width: 12%; } /* Medida */
            .grid.grid-with-brand th:nth-child(7), .grid.grid-with-brand td:nth-child(7) { width: 13%; } /* Precio */
            .grid.grid-with-brand th:nth-child(8), .grid.grid-with-brand td:nth-child(8) { width: 13%; } /* Total */
            .numeric {
              text-align: right;
              white-space: nowrap;
            }
            .empty {
              text-align: center;
              color: #666;
              font-style: italic;
            }
            .total-row td {
              background: #fff;
            }
            .footer-meta {
              margin-top: 2px;
            }
          </style>
        </head>
        <body>
          ${docsHtml}
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
      } catch (err) {
        showError(err?.message || "Error al preparar la impresion");
      }
    })();
  };

  const exportSelectedToExcel = () => {
    const docs = buildPrintableDocs();
    if (docs.length === 0) {
      showError("Selecciona al menos un envio para exportar a Excel");
      return;
    }

    if (opiReferenceFlow) {
      showError("Para OPI use Imprimir seleccionados; no hay exportación Excel en este flujo.");
      return;
    }

    if (luisFelipePrintFlow) {
      const opvDeps = {
        packingMaterials,
        resolveProductUnitPrice,
        resolveMaterialUnitPrice,
        getShipmentPackingItems: resolveShipmentPackingItems,
      };
      const showBrand = orderItemsHaveBrand(selectedProductionOrder?.items);
      const lfWb = XLSX.utils.book_new();
      docs.forEach((shipment, idx) => {
        const sale = buildOpvOnlineSalePayload(shipment, selectedProductionOrder, opvDeps);
        const headerRow = ["Cod.", "Cant."];
        if (showBrand) headerRow.push("Marca");
        headerRow.push("Descripcion", "P. Unit.", "Total");
        const sheetData = [
          ["FOSSILES - VENTA CLIENTES FOSSILES"],
          ["Cliente", sale.customerName],
          ["Direccion", sale.address],
          ["Telefono", sale.phone],
          ["Pedido", sale.saleNumber],
          ["N° envío", sale.shipmentNumber],
          ...(shipment.partialReleaseLabel ? [["Parcial", shipment.partialReleaseLabel]] : []),
          ["Fecha", sale.saleDate],
          ["Vendedor", sale.salesperson],
          [],
          headerRow,
          ...sale.items.map((it) => {
            const desc = [it.productName, it.colorName, it.size ? `Talla ${it.size}` : ""]
              .filter(Boolean)
              .join(" - ");
            const row = [it.productCode, it.quantity];
            if (showBrand) row.push(it.brandName || "—");
            row.push(desc, it.unitPrice, it.subtotal);
            return row;
          }),
          [],
          ["Neto", sale.netAmount],
          ["Costo envío", sale.shippingCost],
          ["Total", sale.totalAmount],
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        const sheetName = String(shipment.shipmentNumber || shipment.id || `Envio${idx + 1}`)
          .slice(0, 31)
          .replace(/[\\/?*[\]]/g, "-");
        XLSX.utils.book_append_sheet(lfWb, ws, sheetName || `Envio${idx + 1}`);
      });
      XLSX.writeFile(
        lfWb,
        `envio_luis_felipe_${selectedProductionOrder?.code || "orden"}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
      showSuccess("Excel Luis Felipe generado (formato venta en línea).");
      return;
    }

    const wb = XLSX.utils.book_new();
    const distributionNumber = printContextLabels.distributionNumber;
    const distributionDescription = printContextLabels.distributionDescription;
    const sourceAddress = "Bodega Principal";
    const compactCode = (value) =>
      String(value || "")
        .replace(/DIST-/gi, "")
        .replace(/ENV-/gi, "")
        .replace(/--+/g, "-")
        .replace(/^-+|-+$/g, "")
        .trim();
    const shipmentCorrelative = (value) => {
      const normalized = compactCode(value);
      const parts = normalized.split("-").filter(Boolean);
      return parts.length > 0 ? parts[parts.length - 1] : normalized;
    };

    docs.forEach((shipment, idx) => {
      const notesPayload = parseShipmentMetaNotes(shipment.notes);
      const shipmentProducts = shipment._printProducts || shipment.products || [];
      const shipmentPackingItems = shipment._printPackingItems || resolveShipmentPackingItems(shipment);
      const packingRows = shipmentPackingItems
        .map((item) => {
          const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
          const qty = Number(item.quantity || 0);
          const unitPrice = resolveMaterialUnitPrice(item, material);
          return {
            code: material?.sku || `SUM-${item.materialId}`,
            product: material?.name || "Empaque",
            color: "-",
            quantity: qty,
            uom: material?.uomName || material?.unitName || "Unidad",
            unitPrice,
            total: qty * unitPrice,
          };
        })
        .filter((row) => row.quantity > 0);

      const lines = shipmentProducts.map((item) => {
        const qty = Number(item.quantity || 0);
        const rowPrice = resolveProductUnitPrice(item);
        return {
          code: item.productCode || "-",
          product: item.size ? `${item.productName || "-"} TALLA ${String(item.size).toUpperCase()}` : (item.productName || "-"),
          color: item.colorName || "-",
          quantity: qty,
          uom: item.uomName || item.unitName || "Unidad",
          unitPrice: rowPrice > 0 ? rowPrice : 0,
          total: rowPrice > 0 ? qty * rowPrice : 0,
        };
      });

      const detailRows = [...lines, ...packingRows];
      const totalQty = detailRows.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
      const totalAmount = detailRows.reduce((sum, r) => sum + Number(r.total || 0), 0);
      const shippingCost = Number(shipment.shippingCost || 0);
      const grandTotal = totalAmount + (shippingCost > 0 ? shippingCost : 0);
      const printedAt = resolveShipmentPrintDate(shipment);
      const createdByName = resolveCreatedByName(shipment);
      const generatedByName = resolveGeneratedByName(shipment);

      const sheetData = [
        ["Direccion Envio:", sourceAddress, "", "", "Fecha:", printedAt, ""],
        ["Direccion Recibido:", `${shipment.locationName || "-"} ${shipment.locationCode ? `(${shipment.locationCode})` : ""}`, "", "", "Envio:", shipmentCorrelative(shipment.shipmentNumber || shipment.id), ""],
        ["Creado por:", createdByName, "", "", "Distribucion:", compactCode(distributionNumber), ""],
        ["Generado por:", `${generatedByName}${shipment.copyLabel ? ` - ${shipment.copyLabel}` : ""}`, "", "", "", "", ""],
        ["Cod.", "Producto", "Color", "Cantidad", "Medida", "Precio", "Total"],
        ...detailRows.map((row) => [
          row.code,
          row.product,
          row.color,
          row.quantity,
          row.uom,
          row.unitPrice > 0 ? formatCurrency(row.unitPrice) : "",
          row.total > 0 ? formatCurrency(row.total) : "",
        ]),
        ["Total", "", "", totalQty, "", "", totalAmount > 0 ? formatCurrency(totalAmount) : ""],
        ...(luisFelipePrintFlow
          ? [
              ["Costo envio", "", "", "", "", "", shippingCost > 0 ? formatCurrency(shippingCost) : "Q0.00"],
              ["Total c/envio", "", "", "", "", "", grandTotal > 0 ? formatCurrency(grandTotal) : "Q0.00"],
            ]
          : []),
        ["Observacion:", notesPayload.baseNotes || distributionDescription || "-", "", "", "", "", ""],
        ["Vo. Bo.:", "", "", "", "Recibido:", "", ""],
      ];

      const ws = XLSX.utils.aoa_to_sheet(sheetData);
      ws["!cols"] = [
        { wch: 16 }, // Etiquetas / Cod
        { wch: 24 }, // Producto
        { wch: 9 }, // Color
        { wch: 7 }, // Cantidad
        { wch: 10 }, // Medida
        { wch: 9 }, // Precio
        { wch: 10 }, // Total
      ];
      ws["!merges"] = [
        // Encabezado superior
        { s: { r: 0, c: 1 }, e: { r: 0, c: 3 } },
        { s: { r: 0, c: 5 }, e: { r: 0, c: 6 } },
        { s: { r: 1, c: 1 }, e: { r: 1, c: 3 } },
        { s: { r: 1, c: 5 }, e: { r: 1, c: 6 } },
        { s: { r: 2, c: 1 }, e: { r: 2, c: 3 } },
        { s: { r: 2, c: 5 }, e: { r: 2, c: 6 } },
        { s: { r: 3, c: 1 }, e: { r: 3, c: 6 } },
        // Total
        { s: { r: 5 + detailRows.length, c: 0 }, e: { r: 5 + detailRows.length, c: 2 } },
        // Observación
        { s: { r: 6 + detailRows.length, c: 1 }, e: { r: 6 + detailRows.length, c: 6 } },
        // Firmas
        { s: { r: 7 + detailRows.length, c: 1 }, e: { r: 7 + detailRows.length, c: 3 } },
        { s: { r: 7 + detailRows.length, c: 5 }, e: { r: 7 + detailRows.length, c: 6 } },
      ];

      const thinBorder = {
        top: { style: "thin", color: { rgb: "111111" } },
        right: { style: "thin", color: { rgb: "111111" } },
        bottom: { style: "thin", color: { rgb: "111111" } },
        left: { style: "thin", color: { rgb: "111111" } },
      };
      const allRows = sheetData.length;
      const lastCol = 6;
      const headerRowIdx = 4;
      const totalRowIdx = 5 + detailRows.length;
      const extraRows = luisFelipePrintFlow ? 2 : 0;
      const observationRowIdx = totalRowIdx + 1 + extraRows;
      const signaturesRowIdx = totalRowIdx + 2 + extraRows;
      ws["!rows"] = Array.from({ length: allRows }, (_, idx) => {
        if (idx >= 0 && idx <= 3) return { hpt: 26 };
        if (idx >= 5 && idx < totalRowIdx) {
          const detailIdx = idx - 5;
          const productText = String(detailRows[detailIdx]?.product || "");
          // Permitir filas de 1 o 2 líneas según longitud del nombre.
          return { hpt: productText.length > 24 ? 34 : 20 };
        }
        if (idx === observationRowIdx || idx === signaturesRowIdx) return { hpt: 22 };
        return { hpt: 18 };
      });

      for (let rowIdx = 0; rowIdx < allRows; rowIdx += 1) {
        for (let colIdx = 0; colIdx <= lastCol; colIdx += 1) {
          const cellRef = XLSX.utils.encode_cell({ r: rowIdx, c: colIdx });
          const cell = ws[cellRef];
          if (!cell) continue;

          const isHeader = rowIdx === headerRowIdx;
          const isTotal = rowIdx === totalRowIdx;
          const isMeta = rowIdx >= 0 && rowIdx <= 3;
          const isFooter = rowIdx === observationRowIdx || rowIdx === signaturesRowIdx;
          const isNumericCol = colIdx >= 3 && colIdx <= 6;

          cell.s = {
            font: {
              name: "Arial",
              sz: 10,
              bold: isHeader || isTotal || isMeta || isFooter,
              color: { rgb: "111111" },
            },
            alignment: {
              vertical: "center",
              horizontal: isNumericCol ? "right" : "left",
              wrapText: true,
            },
            border: thinBorder,
            fill: isHeader
              ? { fgColor: { rgb: "E9ECEF" } }
              : undefined,
          };
        }
      }

      const sheetSuffix = shipment._partTotal > 1
        ? `_P${shipment._partNumber || 1}`
        : "";
      const safeName = String(`${shipment.shipmentNumber || `ENV_${idx + 1}`}${sheetSuffix}`).slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, safeName);
    });

    XLSX.writeFile(
      wb,
      `preparacion_envios_excel_${selectedDistribution?.distributionNumber || "general"}_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    showSuccess("Excel de envíos generado. Puedes imprimirlo desde Excel.");
  };

  const exportCurrentList = () => {
    exportRowsToCsv(
      `preparacion_envios_${selectedDistribution?.distributionNumber || "general"}`,
      [
        { label: "Distribucion", value: () => selectedDistribution?.distributionNumber || "-" },
        { label: "Envio", value: (s) => s.shipmentNumber || s.id },
        { label: "Parcial", value: (s) => s.partialReleaseLabel || "" },
        { label: "Kiosko", value: (s) => s.locationName || "-" },
        { label: "Codigo Kiosko", value: (s) => s.locationCode || "-" },
        { label: "Estado", value: (s) => tStatus(s.status) },
        {
          label: "Productos",
          value: (s) => getShipmentPrintProducts(s).length,
        },
        {
          label: "Unidades",
          value: (s) =>
            getShipmentPrintProducts(s).reduce((sum, p) => sum + Number(p.quantity || 0), 0),
        },
      ],
      filteredShipments
    );
  };

  const exportCurrentPdf = () => {
    if (opiReferenceFlow) {
      showError("Para OPI use Imprimir seleccionados.");
      return;
    }
    if (luisFelipePrintFlow) {
      const rows = [];
      (filteredShipments || []).forEach((shipment) => {
        getShipmentPrintProducts(shipment).forEach((item) => {
          const qty = Number(item.quantity || 0);
          const unitPrice = resolveProductUnitPrice(item);
          rows.push({
            shipmentNumber: shipment.shipmentNumber || shipment.id,
            partialLabel: shipment.partialReleaseLabel || "",
            locationName: shipment.locationName || "-",
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            quantity: qty,
            unitPrice,
            total: qty * unitPrice,
            rowType: "PRODUCTO",
          });
        });
        resolveShipmentPackingItems(shipment).forEach((item) => {
          const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
          const qty = Number(item.quantity || 0);
          const unitPrice = resolveMaterialUnitPrice(item, material);
          rows.push({
            shipmentNumber: shipment.shipmentNumber || shipment.id,
            locationName: shipment.locationName || "-",
            productCode: material?.sku || `SUM-${item.materialId}`,
            productName: material?.name || "Empaque",
            quantity: qty,
            unitPrice,
            total: qty * unitPrice,
            rowType: "EMPAQUE",
          });
        });
        rows.push({
          shipmentNumber: shipment.shipmentNumber || shipment.id,
          locationName: shipment.locationName || "-",
          productCode: "",
          productName: "Costo de envío",
          quantity: 1,
          unitPrice: Number(shipment.shippingCost || 0),
          total: Number(shipment.shippingCost || 0),
          rowType: "ENVIO",
        });
      });
      exportRowsToPdf(
        `Reporte OPV vendedor ${selectedDistribution?.distributionNumber || ""}`.trim(),
        [
          { label: "Envio", value: (r) => r.shipmentNumber },
          { label: "Kiosko", value: (r) => r.locationName },
          { label: "Tipo", value: (r) => r.rowType },
          { label: "Codigo", value: (r) => r.productCode },
          { label: "Producto", value: (r) => r.productName },
          { label: "Cantidad", value: (r) => r.quantity },
          { label: "P.Unitario", value: (r) => formatCurrency(r.unitPrice) },
          { label: "Total", value: (r) => formatCurrency(r.total) },
        ],
        rows
      );
      return;
    }
    const rows = [];
    (filteredShipments || []).forEach((shipment) => {
      getShipmentPrintProducts(shipment).forEach((item) => {
        const qty = Number(item.quantity || 0);
        rows.push({
          shipmentNumber: shipment.shipmentNumber || shipment.id,
          partialLabel: shipment.partialReleaseLabel || "",
          locationName: shipment.locationName || "-",
          productCode: item.productCode || "-",
          productName: item.size
            ? `${item.productName || "-"} TALLA ${String(item.size).toUpperCase()}`
            : item.productName || "-",
          colorName: item.colorName || "-",
          quantity: qty,
          rowType: "PRODUCTO",
        });
      });
      resolveShipmentPackingItems(shipment).forEach((item) => {
        const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
        const qty = Number(item.quantity || 0);
        rows.push({
          shipmentNumber: shipment.shipmentNumber || shipment.id,
          partialLabel: shipment.partialReleaseLabel || "",
          locationName: shipment.locationName || "-",
          productCode: material?.sku || `SUM-${item.materialId}`,
          productName: material?.name || "Empaque",
          colorName: "-",
          quantity: qty,
          rowType: "EMPAQUE",
        });
      });
    });
    exportRowsToPdf(
      `Preparacion de Envios ${printContextLabels.distributionNumber || ""}`.trim(),
      [
        { label: "Envio", value: (r) => r.shipmentNumber },
        { label: "Parcial", value: (r) => r.partialLabel },
        { label: "Kiosko", value: (r) => r.locationName },
        { label: "Tipo", value: (r) => r.rowType },
        { label: "Codigo", value: (r) => r.productCode },
        { label: "Producto", value: (r) => r.productName },
        { label: "Color", value: (r) => r.colorName },
        { label: "Cantidad", value: (r) => r.quantity },
      ],
      rows
    );
  };

  const handleSendShipment = async (shipmentId) => {
    try {
      setSendingShipmentId(shipmentId);
      setError("");

      const shipment = shipments.find((item) => Number(item.id) === Number(shipmentId));
      if (!shipment) {
        throw new Error("No se encontró el envío seleccionado");
      }

      if (!opiInternalFlow && !standaloneInternalFlow && !shipment.locationId) {
        await assertDispatchStockForProducts(shipment.products || []);
      }

      await sendShipment(shipmentId);
      showSuccess("Envio marcado como enviado correctamente");
      await reloadCurrentShipments();
    } catch (err) {
      const message = err.message || "No se pudo marcar el envio como enviado";
      setError(message);
      showError(message);
    } finally {
      setSendingShipmentId(null);
    }
  };

  const handleRevertSentShipment = async (shipment) => {
    if (!shipment?.id) return;
    if (
      !window.confirm(
        "¿Regresar este envío a bodega? Se revierte la salida de Bodega PT/Devoluciones y el envío quedará confirmado (sin salir)."
      )
    ) {
      return;
    }
    try {
      setRevertingShipmentId(shipment.id);
      setError("");
      await revertSentShipment(shipment.id);
      showSuccess("Envío regresado a bodega. Quedó confirmado y puede editarse o anularse.");
      await reloadCurrentShipments();
    } catch (err) {
      const message = err.message || "No se pudo regresar el envío a bodega";
      setError(message);
      showError(message);
    } finally {
      setRevertingShipmentId(null);
    }
  };

  const handleRepairReceiptInventory = async (shipment) => {
    if (!shipment?.id) return;
    if (
      !window.confirm(
        "¿Sincronizar inventario de kiosko con este envío entregado?\n\n"
          + "Se cargarán al kiosko todas las líneas del documento (productos, tallas y empaques SUM-) "
          + "según las cantidades recibidas del envío. No descarga archivos."
      )
    ) {
      return;
    }
    try {
      setRepairingReceiptShipmentId(shipment.id);
      setError("");
      const result = await repairDeliveredShipmentReceiptInventory(shipment.id);
      const { message, warnings } = formatShipmentReceiptRepairMessage(result);
      if (warnings.length > 0) {
        showWarning(message);
      } else {
        showSuccess(message);
      }
      await reloadCurrentShipments();
    } catch (err) {
      const message = err.message || "No se pudo reparar el inventario de recepción";
      setError(message);
      showError(message);
    } finally {
      setRepairingReceiptShipmentId(null);
    }
  };

  const handleEditShipmentFromPartial = async (release) => {
    if (!release?.shipmentId) return;
    let shipment = (shipments || []).find((s) => Number(s.id) === Number(release.shipmentId));
    if (!shipment) {
      try {
        shipment = await getShipmentById(release.shipmentId);
      } catch (err) {
        showError(err.message || "No se pudo cargar el envío");
        return;
      }
    }
    setEditProductsShipment(shipment);
  };

  const handleSendShipmentFromPartial = async (release) => {
    if (!release?.shipmentId) return;
    await handleSendShipment(release.shipmentId);
  };

  const shipmentSendButtonLabel =
    opkFlow || opckFlow || standaloneKioskFlow || distributionFlow ? "Enviar" : "Listo / Enviar";

  const reloadAfterShipmentCancel = async () => {
    if (selectedOpvOrderId) {
      await reloadOpvShipmentsView();
      if (viewMode === "pending") await loadPendingOrders();
      return;
    }
    if (selectedOpcOrderId) {
      await reloadOpcShipmentsView();
      if (viewMode === "pending") await loadPendingOrders();
      return;
    }
    if (selectedOpckOrderId) {
      await reloadOpckShipmentsView();
      if (viewMode === "pending") await loadPendingOrders();
      return;
    }
    if (selectedOpkOrderId) {
      await reloadOpkShipmentsView();
      if (viewMode === "pending") await loadPendingOrders();
      return;
    }
    if (selectedOpiOrderId) {
      const order = await getProductionOrderById(selectedOpiOrderId);
      setSelectedProductionOrder(order);
      if (order.vendorShipmentVoidedAt) {
        setShipments([]);
        setCopiesByShipment({});
        setSelectedRows({});
      } else {
        const synthetic = buildOpiShipmentFromOrder(order);
        setShipments([synthetic]);
        setCopiesByShipment({ [synthetic.id]: 1 });
        setSelectedRows({ [synthetic.id]: true });
      }
      if (viewMode === "pending") await loadPendingOrders();
      return;
    }
    if (selectedStandaloneKioskId) {
      await loadStandaloneKioskShipments();
      try {
        const shipment = await getShipmentById(selectedStandaloneKioskId);
        const status = String(shipment?.status || "").trim().toUpperCase();
        if (status === "CANCELLED") {
          setSelectedStandaloneKioskId("");
          setShipments([]);
          setSelectedRows({});
        } else {
          setShipments([shipment]);
          setCopiesByShipment({ [shipment.id]: 1 });
          setSelectedRows({ [shipment.id]: true });
        }
      } catch (_err) {
        setSelectedStandaloneKioskId("");
        setShipments([]);
      }
      return;
    }
    await reloadCurrentShipments();
    if (viewMode === "pending") await loadPendingOrders();
  };

  const handleCancelShipment = async (shipment) => {
    if (!shipment) return;
    if (!window.confirm("¿Anular este envío? Solo aplica antes de enviar (borrador o confirmado).")) {
      return;
    }
    try {
      setCancellingShipmentId(shipment.id);
      setError("");
      if (isSyntheticShipmentId(shipment.id)) {
        const orderId = syntheticShipmentOrderId(shipment.id);
        if (!orderId) throw new Error("No se pudo identificar la orden del documento");
        await voidVendorShipmentDocument(orderId);
        showSuccess("Documento de envío anulado");
      } else {
        await cancelShipment(shipment.id);
        showSuccess("Envío anulado correctamente");
      }
      await reloadAfterShipmentCancel();
    } catch (err) {
      const message = err.message || "No se pudo anular el envío";
      setError(message);
      showError(message);
    } finally {
      setCancellingShipmentId(null);
    }
  };

  const hasAnyFiltered = filteredShipments.length > 0;
  const allFilteredSelected =
    hasAnyFiltered && filteredShipments.every((shipment) => selectedRows[shipment.id]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Preparar Envíos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={() => {
                      loadDistributions();
                      loadOpvOrders();
                      loadOpiOrders();
                      loadOpcOrders();
                      loadOpckOrders();
                      loadOpkOrders();
                      loadStandaloneKioskShipments();
                      if (viewMode === "pending") loadPendingOrders();
                    }}
                    disabled={loadingDistributions || loadingPending}
                    className="mr-2 mt-2"
                  >
                    {loadingDistributions ? <Spinner size="sm" /> : <i className="nc-icon nc-refresh-69 mr-1" />}
                    Actualizar
                  </Button>
                  {luisFelipePrintFlow && (
                    <Button
                      color="warning"
                      size="sm"
                      onClick={() => openOpvPriceReview(false)}
                      disabled={!selectedProductionOrder?.id}
                      className="mt-2 mr-2"
                    >
                      <i className="nc-icon nc-money-coins mr-1" />
                      Revisar precios
                    </Button>
                  )}
                  <Button
                    color="success"
                    size="sm"
                    onClick={() => setStandaloneKioskModalOpen(true)}
                    disabled={pendingFlow}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-shop mr-1" />
                    Envío directo a kiosko
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={printSelected}
                    disabled={selectedShipmentIds.length === 0}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    {luisFelipePrintFlow ? "Revisar precios e imprimir" : "Imprimir Seleccionados"}
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={exportCurrentList}
                    disabled={!filteredShipments.length}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    CSV
                  </Button>
                  <Button
                    color="secondary"
                    size="sm"
                    onClick={exportCurrentPdf}
                    disabled={!filteredShipments.length}
                    className="mt-2"
                  >
                    <i className="nc-icon nc-single-copy-04 mr-1" />
                    PDF
                  </Button>
                  <Button
                    color="success"
                    size="sm"
                    onClick={exportSelectedToExcel}
                    disabled={selectedShipmentIds.length === 0}
                    className="mt-2 ml-2"
                  >
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Excel impresión
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              <p className="text-muted mb-4">
                {pendingFlow
                  ? "Órdenes OPC, OPI, OPV, OPCK u OPK sin envío confirmado. Genere el envío de cada una con el formato correspondiente o ábrala para imprimir (OPV)."
                  : "Selecciona una distribución, orden OP (OPV/OPI/OPC/OPCK/OPK) o prepara envíos por kiosko e imprime con copias."}
              </p>
              {pendingFlow && (
                <Alert color="primary" className="mb-3">
                  <strong>Órdenes sin envío:</strong> use <strong>Generar envío</strong> (OPC, OPI, OPCK, OPK) o <strong>Abrir para imprimir</strong> (OPV, documento desde la orden).
                </Alert>
              )}
              {luisFelipePrintFlow && (
                <Alert color="warning">
                  Flujo especial OPV vendedor activo ({selectedProductionOrder?.sellerName || "Luis Felipe"}): sin límite de productos por envío y usando precio vendedor.
                  <div className="mt-1">
                    Los empaques y costo de envío para OPV se gestionan únicamente en la vista de Orden de Producción.
                  </div>
                </Alert>
              )}

              {opcFlow && (
                <Alert color="info">
                  <strong>OPC (cinchos):</strong> envíos generados desde la orden de producción. Impresión con el mismo formato que distribución; al marcar enviado se descuenta Bodega PT (con kiosko opcional en la generación del envío).
                </Alert>
              )}

              {opckFlow && (
                <Alert color="info">
                  <strong>OPCK (kiosko):</strong> impresión con el mismo formato que distribución / OPC. Si no hay envío, genérelo desde la vista <strong>Órdenes sin envío (OP)</strong>.
                </Alert>
              )}

              {opkFlow && (
                <Alert color="info">
                  <strong>OPK (kiosko, sin distribución):</strong> <strong>Generar envío</strong> (completo o parcial) solo crea el documento{" "}
                  <strong>confirmado</strong> — sin revisar stock ni salir de bodega. Cuando esté listo, use{" "}
                  <strong>Enviar</strong> en la tabla (pasa a tránsito sin validar stock PT).
                  Recepción en <strong>POS → Recibir distribución</strong>.
                </Alert>
              )}

              {standaloneKioskFlow && (
                <Alert color="info">
                  <strong>Envío directo a kiosko (sin OP):</strong> documento formato OPK. Si quedó solo confirmado, use{" "}
                  <strong>Enviar</strong>. Los empaques <strong>SUM-</strong> se agregan con el botón <strong>Empaques</strong> en la tabla
                  o al crear el envío. Recepción en <strong>POS → Recibir distribución</strong>.
                </Alert>
              )}

              {standaloneInternalFlow && (
                <Alert color="success">
                  <strong>ENVI (sin orden de producción):</strong> envíos ya autorizados por Contabilidad.
                  Impresión con formato <strong>ENVIO INTERNO</strong> (planilla o defectos según solicitud).
                  Para crear una nueva solicitud use{" "}
                  <Button color="link" className="p-0 align-baseline" onClick={() => navigate("/admin/authorize-shipments")}>
                    Autorizar envíos
                  </Button>.
                </Alert>
              )}

              {opiInternalFlow && (
                <Alert color="secondary">
                  <strong>OPI (orden interna):</strong> documento de entrega al colaborador. No usa kiosko ni movimiento de inventario de PT desde esta pantalla; solo impresión con precio de referencia (precio de venta de catálogo y opción 50%).
                  <div className="mt-2 d-flex align-items-center flex-wrap">
                    <Label check className="mb-0 mr-2">
                      <Input
                        type="checkbox"
                        checked={applyOpiHalfPrice}
                        onChange={(e) => setApplyOpiHalfPrice(e.target.checked)}
                        className="mr-2"
                      />
                      Mostrar precio con 50% de descuento sobre precio de venta (empleado)
                    </Label>
                  </div>
                </Alert>
              )}

              {selectedPartialReleaseKey && (
                <Alert color="info">
                  Mostrando el envío de la liberación parcial seleccionada. Use <strong>Imprimir</strong> o{" "}
                  <strong>Marcar impresión</strong> como con cualquier otro envío.
                </Alert>
              )}
              {error && <Alert color="danger">{error}</Alert>}
              {distributionFlow && (shipments || []).length > 0 && (
                <Alert color="info">
                  Se muestran todos los envíos de esta distribución (incluidos enviados) para imprimir o exportar de nuevo.
                  El botón <strong>Enviar</strong> solo aplica a envíos en estado <strong>Confirmado</strong>.
                </Alert>
              )}
              {hiddenProcessedCount > 0 && (
                <Alert color="light">
                  Se ocultaron {hiddenProcessedCount} envío(s) ya entregado(s) o anulado(s). Los envíos <strong>en tránsito (Enviado)</strong> siguen visibles para reimprimir.
                </Alert>
              )}

              <Row className="mb-3">
                <Col md="2">
                  <Label><strong>Vista</strong></Label>
                  <FilterableSelect
                    value={viewMode}
                    onChange={(v) => {
                      setViewMode(v || "shipments");
                      if (v === "pending") clearOrderSelectors();
                    }}
                    allowEmpty={false}
                    options={[
                      { value: "shipments", label: "Envíos / imprimir", searchText: "envios imprimir" },
                      { value: "pending", label: "Órdenes sin envío (OP)", searchText: "sin envio pendiente op" },
                    ]}
                    placeholder="Vista…"
                  />
                </Col>
                <Col md="2">
                  <Label><strong>Distribucion</strong></Label>
                  <FilterableSelect
                    value={distributionId}
                    onChange={(id) => {
                      setDistributionId(id);
                      if (id) {
                        setViewMode("shipments");
                        clearOrderSourceSelectors();
                      }
                    }}
                    options={distributionOptions}
                    disabled={loadingDistributions || pendingFlow}
                    placeholder="Buscar distribución…"
                    emptyLabel="— Seleccione una distribución —"
                  />
                </Col>
                <Col md="2">
                  <Label><strong>Orden OPV vendedor</strong></Label>
                  <FilterableSelect
                    value={selectedOpvOrderId}
                    onChange={(id) => activateOrderSource("OPV", id)}
                    options={opvOrderOptions}
                    disabled={loadingOpvOrders || pendingFlow}
                    placeholder="Buscar OPV…"
                    emptyLabel="— Seleccione orden OPV —"
                  />
                </Col>
                <Col md="2">
                  <Label><strong>Orden OPI (interna)</strong></Label>
                  <FilterableSelect
                    value={selectedOpiOrderId}
                    onChange={(id) => activateOrderSource("OPI", id)}
                    options={opiOrderOptions}
                    disabled={loadingOpiOrders || pendingFlow}
                    placeholder="Buscar OPI…"
                    emptyLabel="— OPI (sin kiosko / PT) —"
                  />
                </Col>
                <Col md="2">
                  <Label><strong>Orden OPC (cinchos)</strong></Label>
                  <FilterableSelect
                    value={selectedOpcOrderId}
                    onChange={(id) => activateOrderSource("OPC", id)}
                    options={opcOrderOptions}
                    disabled={loadingOpcOrders || pendingFlow}
                    placeholder="Buscar OPC…"
                    emptyLabel="— Orden OPC —"
                  />
                </Col>
                <Col md="2">
                  <Label><strong>Orden OPCK (kiosko)</strong></Label>
                  <FilterableSelect
                    value={selectedOpckOrderId}
                    onChange={(id) => activateOrderSource("OPCK", id)}
                    options={opckOrderOptions}
                    disabled={loadingOpckOrders || pendingFlow}
                    placeholder="Buscar OPCK…"
                    emptyLabel="— OPCK —"
                  />
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="3">
                  <Label><strong>Orden OPK (kiosko)</strong></Label>
                  <FilterableSelect
                    value={selectedOpkOrderId}
                    onChange={(id) => activateOrderSource("OPK", id)}
                    options={opkOrderOptions}
                    disabled={loadingOpkOrders || pendingFlow}
                    placeholder="Buscar OPK…"
                    emptyLabel="— OPK —"
                  />
                </Col>
                <Col md="4">
                  <Label><strong>Envío interno ENVI (sin OP)</strong></Label>
                  <FilterableSelect
                    value={selectedStandaloneInternalId}
                    onChange={(id) => {
                      if (id) {
                        setViewMode("shipments");
                        clearPartialReleaseFocus();
                        setDistributionId("");
                        setSelectedOpvOrderId("");
                        setSelectedOpiOrderId("");
                        setSelectedOpcOrderId("");
                        setSelectedOpckOrderId("");
                        setSelectedOpkOrderId("");
                        setSelectedStandaloneKioskId("");
                        setSelectedStandaloneInternalId(String(id));
                      } else {
                        setSelectedStandaloneInternalId("");
                        if (
                          !distributionId &&
                          !selectedOpvOrderId &&
                          !selectedOpiOrderId &&
                          !selectedOpcOrderId &&
                          !selectedOpckOrderId &&
                          !selectedOpkOrderId &&
                          !selectedStandaloneKioskId
                        ) {
                          setShipments([]);
                          setSelectedProductionOrder(null);
                        }
                      }
                    }}
                    options={standaloneInternalOptions}
                    disabled={loadingStandaloneInternalList || pendingFlow}
                    placeholder="Buscar ENVI…"
                    emptyLabel="— ENVI creados (sin orden) —"
                  />
                </Col>
                <Col md="4" className="d-flex align-items-end pb-1">
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => navigate("/admin/authorize-shipments")}
                    disabled={pendingFlow}
                  >
                    <i className="nc-icon nc-send mr-1" />
                    Solicitar envío interno
                  </Button>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="8">
                  <Label><strong>Envío parcial (liberación)</strong></Label>
                  <FilterableSelect
                    value={selectedPartialReleaseKey}
                    onChange={(key) => void activatePartialReleaseSource(key)}
                    options={partialReleaseOptions}
                    disabled={loadingPartialReleases || pendingFlow}
                    placeholder="Buscar parcial, OP, cliente o ENV…"
                    emptyLabel="— Liberaciones parciales confirmadas —"
                  />
                  <small className="text-muted d-block mt-1">
                    Busca por etiqueta del parcial, código de orden, cliente o número de envío.
                  </small>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="8">
                  <Label><strong>Envío directo a kiosko (sin OP)</strong></Label>
                  <FilterableSelect
                    value={selectedStandaloneKioskId}
                    onChange={(id) => {
                      if (id) {
                        setViewMode("shipments");
                        clearPartialReleaseFocus();
                        setDistributionId("");
                        setSelectedOpvOrderId("");
                        setSelectedOpiOrderId("");
                        setSelectedOpcOrderId("");
                        setSelectedOpckOrderId("");
                        setSelectedOpkOrderId("");
                        setSelectedStandaloneInternalId("");
                        setSelectedStandaloneKioskId(String(id));
                      } else {
                        setSelectedStandaloneKioskId("");
                        if (
                          !distributionId &&
                          !selectedOpvOrderId &&
                          !selectedOpiOrderId &&
                          !selectedOpcOrderId &&
                          !selectedOpckOrderId &&
                          !selectedOpkOrderId &&
                          !selectedStandaloneInternalId
                        ) {
                          setShipments([]);
                          setSelectedProductionOrder(null);
                        }
                      }
                    }}
                    options={standaloneKioskOptions}
                    disabled={loadingStandaloneKioskList || pendingFlow}
                    placeholder="Buscar envío directo…"
                    emptyLabel="— Envíos directos a kiosko —"
                  />
                </Col>
                <Col md="4" className="d-flex align-items-end pb-1">
                  <Button
                    color="success"
                    size="sm"
                    outline
                    onClick={() => setStandaloneKioskModalOpen(true)}
                    disabled={pendingFlow}
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Nuevo envío a kiosko
                  </Button>
                </Col>
              </Row>

              <Row className="mb-3">
                <Col md="2">
                  <Label><strong>Buscar</strong></Label>
                  <Input
                    type="search"
                    placeholder="Código, cliente, ENV…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </Col>
                {pendingFlow ? (
                  <Col md="2">
                    <Label><strong>Tipo OP</strong></Label>
                    <FilterableSelect
                      value={pendingKindFilter}
                      onChange={(v) => setPendingKindFilter(v || "ALL")}
                      allowEmpty={false}
                      options={pendingKindOptions}
                      placeholder="Filtrar tipo…"
                    />
                  </Col>
                ) : (
                  <Col md="2" className="d-flex align-items-end">
                    <Button
                      color={allFilteredSelected ? "secondary" : "info"}
                      outline={!allFilteredSelected}
                      block
                      onClick={toggleAllFiltered}
                      disabled={!hasAnyFiltered}
                    >
                      {allFilteredSelected ? "Quitar todos" : "Seleccionar todos"}
                    </Button>
                  </Col>
                )}
              </Row>
              <Row className="mb-3">
                <Col md="12">
                  {opkFlow ? (
                  <Alert color="info" className="mb-0">
                    <strong>OPK:</strong> use <strong>Generar envío</strong> en el parcial (solo crea documento confirmado).
                    Después use <strong>Enviar</strong> en el parcial o en la tabla (pasa a tránsito sin validar stock PT).
                    Recepción en <strong>POS → Recibir distribución</strong>.
                  </Alert>
                  ) : standaloneKioskFlow ? (
                  <Alert color="info" className="mb-0">
                    <strong>Directo kiosko:</strong> <strong>Generar envío</strong> deja el documento confirmado; use <strong>Enviar</strong> para marcar tránsito (sin validar stock PT).
                    Empaques <strong>SUM-</strong>: botón <strong>Empaques</strong> en la tabla o al crear con <strong>Nuevo envío a kiosko</strong>.
                    Recepción en <strong>POS → Recibir distribución</strong>.
                    Si ya fue entregado y el inventario kiosco no cuadra con el envío, use <strong>Sincronizar inv. kiosco</strong>.
                  </Alert>
                  ) : !opiInternalFlow && !standaloneInternalFlow && !luisFelipePrintFlow && !opckFlow ? (
                  <Alert color="info" className="mb-0">
                    Al <strong>enviar</strong> solo se descuenta inventario de <strong>prendas</strong> desde Bodega PT.
                    Los empaques <strong>SUM-</strong> se registran en el envío (botón Empaques) para impresión y cargan inventario del kiosko al confirmar recepción.
                    La rebaja de materiales en bodega central la hace el encargado al entregarlos (Vista Materiales / entrega móvil).
                    <div className="mt-2">
                      Para Epson LX-350: en el diálogo de impresión usa escala <strong>100%</strong>,
                      tamaño <strong>Carta vertical</strong> y desactiva <strong>encabezados/pies</strong>.
                    </div>
                  </Alert>
                  ) : (
                  <Alert color="light" className="mb-0">
                    Flujo OPV/OPI/ENVI/OPCK: use <strong>Imprimir seleccionados</strong> para el documento. No aplica el botón &quot;Listo / Enviar&quot; de salida PT desde aquí (salvo distribución y OPC con envío confirmado).
                  </Alert>
                  )}
                </Col>
              </Row>

              {selectedProductionOrder && !pendingFlow && (selectedOpvOrderId || selectedOpcOrderId || selectedOpckOrderId) && (
                <PrepareShipmentsCustomerBlock order={selectedProductionOrder} />
              )}

              {showPartialReleasesPanel && (
                <ProductionOrderPartialReleasesPanel
                  context="prepare-shipments"
                  order={buildPartialPanelOrder(selectedProductionOrder)}
                  onRefresh={reloadPartialOrderShipmentsView}
                  onEditShipment={handleEditShipmentFromPartial}
                  onSendShipment={opkFlow || opckFlow ? handleSendShipmentFromPartial : undefined}
                />
              )}

              {partialPendingCount > 0 && showPartialReleasesPanel && (
                <Alert color="info" className="mb-3">
                  Hay {partialPendingCount} envío(s) parcial(es) confirmado(s) sin documento generado.
                  Use <strong>Generar envío</strong> en la tabla de liberaciones parciales de arriba.
                </Alert>
              )}

              {pendingFlow ? (
                loadingPending ? (
                  <div className="text-center py-5">
                    <Spinner color="primary" />
                    <p className="mt-2 mb-0">Cargando órdenes sin envío…</p>
                  </div>
                ) : filteredPendingOrders.length === 0 ? (
                  <Alert color="success" className="mb-0">
                    No hay órdenes OPC, OPI, OPV, OPCK u OPK pendientes de envío con el filtro actual.
                  </Alert>
                ) : (
                  <Table responsive>
                    <thead className="text-primary">
                      <tr>
                        <th>Tipo</th>
                        <th>Código</th>
                        <th>Cliente</th>
                        <th>Teléfono</th>
                        <th>Entrega</th>
                        <th>Vendedor</th>
                        <th>Estado OP</th>
                        <th className="text-right">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPendingOrders.map((order) => {
                        const kind = classifyPrepareOrder(order);
                        const kindColors = { OPC: "primary", OPI: "secondary", OPV: "warning", OPCK: "info", OPK: "success" };
                        const canGenerate = canGenerateShipmentForOrder(order);
                        return (
                          <tr key={order.id}>
                            <td>
                              <Badge color={kindColors[kind] || "dark"}>{kind}</Badge>
                            </td>
                            <td>
                              <strong>{order.code}</strong>
                            </td>
                            <td>{order.customerName || "—"}</td>
                            <td>{order.customerPhone || "—"}</td>
                            <td>{order.deliveryDate ? formatDateGt(order.deliveryDate) : "—"}</td>
                            <td>{order.sellerName || "—"}</td>
                            <td>{order.status || "—"}</td>
                            <td className="text-right">
                              {(kind === "OPV" || kind === "OPC" || kind === "OPCK" || kind === "OPK") &&
                                orderAllowsPartialReleases(order) && (
                                <Button
                                  color="warning"
                                  size="sm"
                                  outline
                                  className="mr-1"
                                  onClick={() => openOrderInShipmentsView(order)}
                                >
                                  Parciales
                                </Button>
                              )}
                              {canGenerate ? (
                                <Button
                                  color="success"
                                  size="sm"
                                  onClick={() => setGenerateModalOrder(order)}
                                >
                                  Generar envío
                                </Button>
                              ) : (
                                <Button
                                  color="primary"
                                  size="sm"
                                  outline
                                  onClick={() => openOrderInShipmentsView(order)}
                                >
                                  Abrir para imprimir
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                )
              ) : loadingShipments ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2 mb-0">Cargando envios...</p>
                </div>
              ) : !distributionId &&
                !selectedOpvOrderId &&
                !selectedOpiOrderId &&
                !selectedOpcOrderId &&
                !selectedOpckOrderId &&
                !selectedOpkOrderId &&
                !selectedStandaloneInternalId &&
                !selectedStandaloneKioskId ? (
                <Alert color="light" className="mb-0">
                  Selecciona una distribución, orden OPV/OPI/OPC/OPCK/OPK, un <strong>ENVI sin OP</strong>, un{" "}
                  <strong>envío directo a kiosko</strong>, o cambia a <strong>Órdenes sin envío (OP)</strong> para generar envíos.
                </Alert>
              ) : filteredShipments.length === 0 ? (
                <Alert color="warning" className="mb-0">
                  {opcFlow || opckFlow || opkFlow
                    ? "Esta orden no tiene envíos generados. Use la vista «Órdenes sin envío (OP)» para generar uno."
                    : standaloneKioskFlow
                      ? "No hay líneas en este envío o ajuste el filtro de búsqueda."
                    : luisFelipePrintFlow && partialPendingCount > 0
                      ? "Confirme y genere el envío desde liberaciones parciales (arriba), o ajuste el filtro de búsqueda."
                      : partialPendingCount > 0
                        ? "Confirme y genere el envío desde liberaciones parciales (arriba), o ajuste el filtro de búsqueda."
                        : luisFelipePrintFlow || isEntreCuerosCustomerOpv(selectedProductionOrder)
                        ? "Cree un envío parcial arriba o use el documento de la orden cuando corresponda."
                        : "No hay envíos con el filtro actual."}
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th style={{ width: 45 }} />
                      <th>Código</th>
                      {productionOrderPrintFlow && <th>Cliente</th>}
                      {productionOrderPrintFlow && <th>Fecha envío</th>}
                      {productionOrderPrintFlow && <th>Generado por</th>}
                      <th>{opcFlow || opckFlow || opkFlow ? "Destino / Kiosko" : "Kiosko"}</th>
                      <th>Productos</th>
                      <th>Copias</th>
                      <th>Estado</th>
                      <th style={{ minWidth: 230 }}>Detalle</th>
                      <th className="text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredShipments.map((shipment) => (
                      <tr key={shipment.id}>
                        <td>
                          <Input
                            type="checkbox"
                            checked={Boolean(selectedRows[shipment.id])}
                            onChange={() => toggleRow(shipment.id)}
                          />
                        </td>
                        <td>
                          <strong>{shipment.shipmentNumber || shipment.id}</strong>
                          {shipment.partialReleaseLabel ? (
                            <Badge color="info" className="ml-1">{shipment.partialReleaseLabel}</Badge>
                          ) : null}
                        </td>
                        {productionOrderPrintFlow && (
                          <td>
                            <div>{selectedProductionOrder?.customerName || "—"}</div>
                            {selectedProductionOrder?.customerAddress ? (
                              <small className="text-muted d-block">
                                {selectedProductionOrder.customerAddress}
                              </small>
                            ) : null}
                          </td>
                        )}
                        {productionOrderPrintFlow && (
                          <td>
                            {(() => {
                              const docDate =
                                parseShipmentMetaNotes(shipment.notes).documentDate ||
                                selectedProductionOrder?.deliveryDate;
                              return docDate ? formatDateGt(docDate) : "—";
                            })()}
                          </td>
                        )}
                        {productionOrderPrintFlow && (
                          <td>{shipment.createdByName || "—"}</td>
                        )}
                        <td>
                          {shipment.locationName ||
                            extractDestinationFromShipmentNotes(shipment.notes) ||
                            "-"}{" "}
                          {shipment.locationCode ? (
                            <Badge color="light" className="ml-1">{shipment.locationCode}</Badge>
                          ) : null}
                        </td>
                        <td>
                          <Badge color="info">{getShipmentPrintProducts(shipment).length}</Badge>
                        </td>
                        <td style={{ width: 110 }}>
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            value={copiesByShipment[shipment.id] || 1}
                            onChange={(e) =>
                              setCopiesByShipment((prev) => ({
                                ...prev,
                                [shipment.id]: Math.max(1, parseInt(e.target.value || "1", 10) || 1),
                              }))
                            }
                            bsSize="sm"
                          />
                        </td>
                        <td>{getStatusBadge(shipment.status)}</td>
                        <td>
                          {(() => {
                            const shipmentMeta = parseShipmentMetaNotes(shipment.notes);
                            const shipmentPacking = resolveShipmentPackingItems(shipment);
                            const printProducts = getShipmentPrintProducts(shipment);
                            const beltFromProducts = printProducts
                              .filter((item) => String(item.size || "").trim() !== "")
                              .map((item) => ({
                                productId: Number(item.productId),
                                colorId: item.colorId === null || item.colorId === undefined ? null : Number(item.colorId),
                                size: String(item.size || "").trim().toUpperCase(),
                                quantity: Number(item.quantity || 0),
                              }));
                            const beltPreviewSource = beltFromProducts.length > 0
                              ? beltFromProducts
                              : isPartialReleaseShipmentDoc(shipment)
                                ? []
                                : (shipmentMeta.beltSizes || []);
                            const beltPreview = beltPreviewSource.slice(0, 2);
                            return (
                              <>
                          {printProducts.slice(0, 2).map((product) => (
                            <div key={`${shipment.id}-${product.id || product.productId}-${product.size || ""}`}>
                              <small>
                                <strong>{product.productCode || "-"}</strong> - {product.productName || "-"} x {product.quantity || 0}
                              </small>
                            </div>
                          ))}
                          {beltFromProducts.length === 0 &&
                            beltPreview.map((line) => {
                            const product = printProducts.find(
                              (p) =>
                                Number(p.productId) === Number(line.productId) &&
                                Number(p.colorId || 0) === Number(line.colorId || 0)
                            );
                            return (
                              <div key={`${shipment.id}-belt-${line.productId}-${line.colorId || "null"}-${line.size}`}>
                                <small className="text-muted">
                                  <strong>{product?.productCode || "-"}</strong> - {product?.productName || "CINCHO"} talla {line.size} x {line.quantity || 0}
                                </small>
                              </div>
                            );
                          })}
                          {shipmentPacking.slice(0, 2).map((item) => {
                            const material = packingMaterials.find((m) => Number(m.id) === Number(item.materialId));
                            return (
                              <div key={`${shipment.id}-sum-${item.materialId}`}>
                                <small className="text-muted">
                                  <strong>{material?.sku || `SUM-${item.materialId}`}</strong> - {material?.name || "Empaque"} x {item.quantity || 0}
                                  {resolveMaterialUnitPrice(item, material) > 0
                                    ? ` @ ${formatCurrency(resolveMaterialUnitPrice(item, material))}`
                                    : ""}
                                </small>
                              </div>
                            );
                          })}
                          {printProducts.length > 2 && (
                            <small className="text-muted">
                              + {printProducts.length - 2} producto(s)
                            </small>
                          )}
                          {beltFromProducts.length === 0 && beltPreviewSource.length > 2 && (
                            <small className="text-muted d-block">
                              + {beltPreviewSource.length - 2} talla(s) de cincho
                            </small>
                          )}
                          {shipmentPacking.length > 2 && (
                            <small className="text-muted d-block">
                              + {shipmentPacking.length - 2} empaque(s)
                            </small>
                          )}
                              </>
                            );
                          })()}
                        </td>
                        <td className="text-right">
                          <Button
                            color="warning"
                            size="sm"
                            outline
                            onClick={() => setEditProductsShipment(shipment)}
                            className="mr-2"
                            disabled={
                              !isShipmentProductsEditable(shipment.status) ||
                              isSyntheticShipmentId(shipment.id) ||
                              luisFelipePrintFlow ||
                              opiInternalFlow ||
                              standaloneInternalFlow
                            }
                            title={
                              !isShipmentProductsEditable(shipment.status)
                                ? "Solo se pueden editar envíos en borrador, confirmado o en tránsito"
                                : "Corregir productos del envío"
                            }
                          >
                            <i className="nc-icon nc-ruler-pencil mr-1" />
                            Editar
                          </Button>
                          <Button
                            color="info"
                            size="sm"
                            outline
                            onClick={() => openPackingModal(shipment)}
                            className="mr-2"
                            disabled={
                              loadingPackingMaterials ||
                              luisFelipePrintFlow ||
                              opiInternalFlow ||
                              standaloneInternalFlow
                            }
                          >
                            <i className="nc-icon nc-box mr-1" />
                            Empaques
                            {(getPackingCountForShipment(shipment.id) > 0 || resolveShipmentPackingItems(shipment).length > 0) && (
                              <Badge color="primary" className="ml-1">
                                {Math.max(getPackingCountForShipment(shipment.id), resolveShipmentPackingItems(shipment).length)}
                              </Badge>
                            )}
                          </Button>
                          <Button
                            color="success"
                            size="sm"
                            disabled={
                              luisFelipePrintFlow ||
                              opiInternalFlow ||
                              standaloneInternalFlow ||
                              !isShipmentSendable(shipment.status) ||
                              sendingShipmentId === shipment.id
                            }
                            onClick={() => handleSendShipment(shipment.id)}
                            className="mr-2"
                          >
                            {sendingShipmentId === shipment.id ? (
                              <Spinner size="sm" />
                            ) : (
                              <>
                                <i className="nc-icon nc-delivery-fast mr-1" />
                                {shipmentSendButtonLabel}
                              </>
                            )}
                          </Button>
                          {isShipmentRevertible(shipment.status) && (
                            <Button
                              color="warning"
                              size="sm"
                              outline
                              disabled={
                                luisFelipePrintFlow ||
                                opiInternalFlow ||
                                standaloneInternalFlow ||
                                revertingShipmentId === shipment.id
                              }
                              onClick={() => handleRevertSentShipment(shipment)}
                              className="mr-2"
                              title="Devuelve el inventario a Bodega PT/Devoluciones y deja el envío confirmado"
                            >
                              {revertingShipmentId === shipment.id ? (
                                <Spinner size="sm" />
                              ) : (
                                <>
                                  <i className="nc-icon nc-refresh-69 mr-1" />
                                  Regresar a bodega
                                </>
                              )}
                            </Button>
                          )}
                          {isShipmentReceiptRepairable(shipment.status, shipment.locationId) && (
                            <Button
                              type="button"
                              color="warning"
                              size="sm"
                              outline
                              disabled={repairingReceiptShipmentId === shipment.id}
                              onClick={() => handleRepairReceiptInventory(shipment)}
                              className="mr-2"
                              title="Carga al kiosko productos, tallas y empaques SUM- del envío según cantidades recibidas"
                            >
                              {repairingReceiptShipmentId === shipment.id ? (
                                <Spinner size="sm" />
                              ) : (
                                <>
                                  <i className="nc-icon nc-refresh-69 mr-1" />
                                  Sincronizar inv. kiosco
                                </>
                              )}
                            </Button>
                          )}
                          {(isShipmentCancellable(shipment.status) || isSyntheticShipmentId(shipment.id)) && (
                            <Button
                              color="danger"
                              size="sm"
                              outline
                              disabled={cancellingShipmentId === shipment.id}
                              onClick={() => handleCancelShipment(shipment)}
                              className="mr-2"
                            >
                              {cancellingShipmentId === shipment.id ? (
                                <Spinner size="sm" />
                              ) : (
                                <>
                                  <i className="nc-icon nc-simple-remove mr-1" />
                                  Anular
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            color="primary"
                            size="sm"
                            outline
                            onClick={() =>
                              setSelectedRows((prev) => ({ ...prev, [shipment.id]: true }))
                            }
                          >
                            <i className="nc-icon nc-paper mr-1" />
                            Marcar impresión
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Modal isOpen={Boolean(packingModalShipment)} toggle={() => setPackingModalShipment(null)} size="lg">
        <ModalHeader toggle={() => setPackingModalShipment(null)}>
          Empaques SUM- para {packingModalShipment?.shipmentNumber || "envío"}
        </ModalHeader>
        <ModalBody>
          {loadingPackingMaterials ? (
            <div className="text-center py-4">
              <Spinner size="sm" /> Cargando empaques...
            </div>
          ) : packingMaterials.length === 0 ? (
            <Alert color="warning" className="mb-0">
              No se encontraron materiales con SKU SUM-.
            </Alert>
          ) : (
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Material</th>
                  <th style={{ width: 120 }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {packingMaterials.map((material) => {
                  const key = getPackingKey(packingModalShipment?.id, material.id);
                  return (
                    <tr key={material.id}>
                      <td><strong>{material.sku}</strong></td>
                      <td>{material.name}</td>
                      <td>
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          value={packingQtyByShipment[key] || ""}
                          onChange={(e) =>
                            setPackingQtyByShipment((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }))
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={() => setPackingModalShipment(null)} disabled={savingPacking}>
            Cancelar
          </Button>
          <Button color="primary" onClick={handleSavePackingModal} disabled={savingPacking}>
            {savingPacking ? (
              <>
                <Spinner size="sm" className="me-1" /> Guardando...
              </>
            ) : (
              "Guardar"
            )}
          </Button>
        </ModalFooter>
      </Modal>

      <ProductionOrderShipmentGenerateModal
        isOpen={Boolean(generateModalOrder)}
        toggle={() => setGenerateModalOrder(null)}
        order={generateModalOrder}
        onGenerated={handleShipmentGenerated}
      />

      <OpvShipmentPriceReviewModal
        isOpen={opvPriceReviewOpen}
        toggle={() => {
          setOpvPriceReviewOpen(false);
          setOpvPendingPrint(false);
        }}
        orderId={selectedProductionOrder?.id}
        productCatalogById={productCatalogById}
        confirmLabel={opvPendingPrint ? "Guardar e imprimir" : "Guardar precios"}
        onSaved={handleOpvPricesSaved}
      />

      <CreateStandaloneKioskShipmentModal
        isOpen={standaloneKioskModalOpen}
        toggle={() => setStandaloneKioskModalOpen(false)}
        onCreated={handleStandaloneKioskCreated}
      />

      <EditShipmentProductsModal
        isOpen={Boolean(editProductsShipment)}
        toggle={() => setEditProductsShipment(null)}
        shipment={editProductsShipment}
        onSaved={async () => {
          setEditProductsShipment(null);
          await reloadCurrentShipments();
        }}
      />

    </div>
  );
}

export default PrepareShipments;

