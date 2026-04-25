import React, { useEffect, useMemo, useState } from "react";
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
} from "services/productDistributionService";
import * as XLSX from "xlsx-js-style";
import { getProducts } from "services/productService";
import { getAuthHeader } from "services/authService";
import { getProductionOrderById, getProductionOrders } from "services/productionOrderService";
import { showError, showSuccess } from "utils/notificationHelper";
import { exportRowsToCsv, exportRowsToPdf } from "utils/reportExportHelper";
import { formatDateGt, formatNowGt } from "utils/dateTimeHelper";

const STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  COMPLETED: "Completado",
};

const tStatus = (status) => STATUS_ES[status] || status || "N/A";
const PACKING_TAG = "__PACKING_SUM__:";
const BELT_SIZE_TAG = "__BELT_SIZE__:";
const PROCESSED_SHIPMENT_STATUSES = new Set(["SENT", "DELIVERED", "COMPLETED", "RECEIVED", "CANCELLED"]);
const MAX_PRODUCT_ROWS_PER_SHIPMENT = 10;

const normalizeShipmentStatus = (status) => String(status || "").trim().toUpperCase();
const isShipmentAlreadyProcessed = (status) => PROCESSED_SHIPMENT_STATUSES.has(normalizeShipmentStatus(status));
const isShipmentSendable = (status) => normalizeShipmentStatus(status) === "CONFIRMED";
const chunkArray = (items, chunkSize) => {
  const source = Array.isArray(items) ? items : [];
  if (source.length === 0) return [[]];
  const chunks = [];
  for (let idx = 0; idx < source.length; idx += chunkSize) {
    chunks.push(source.slice(idx, idx + chunkSize));
  }
  return chunks;
};

const parseShipmentMetaNotes = (rawNotes) => {
  const lines = String(rawNotes || "").split("\n");
  const baseLines = [];
  let packingRaw = "";
  let beltSizeRaw = "";

  lines.forEach((line) => {
    if (line.startsWith(PACKING_TAG)) {
      packingRaw = line.slice(PACKING_TAG.length).trim();
    } else if (line.startsWith(BELT_SIZE_TAG)) {
      beltSizeRaw = line.slice(BELT_SIZE_TAG.length).trim();
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
  };
};

const parsePackingNotes = (rawNotes) => parseShipmentMetaNotes(rawNotes).packing;
const isCinchoProduct = (productCode, productName) =>
  `${productCode || ""} ${productName || ""}`.toUpperCase().includes("CINCHO");

const getShipmentPackingItems = (shipment) => {
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
  return parsePackingNotes(shipment?.notes);
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
    shipmentNumber: order?.code || `OPV-${order?.id}`,
    locationId: null,
    locationCode: "",
    locationName: order?.customerName || "Cliente OPV",
    status: order?.status || "CONFIRMED",
    notes: order?.observations || "",
    products: items.map((item, idx) => ({
      id: item?.id || `opi-${idx}`,
      productId: item?.productId,
      productCode: item?.productCode,
      productName: item?.productName,
      colorId: item?.colorId,
      colorName: item?.colorName,
      size: item?.size || "",
      quantity: Number(item?.quantity || 0),
      unitPrice: item?.unitPrice || 0,
      uomName: "Unidad",
      unitName: "Unidad",
    })),
    packingItems: Array.isArray(order?.packingItems) ? order.packingItems : [],
    shippingCost: Number(order?.shippingCost || 0),
  };
};

function PrepareShipments() {
  const [distributions, setDistributions] = useState([]);
  const [distributionId, setDistributionId] = useState("");
  const [shipments, setShipments] = useState([]);
  const [selectedRows, setSelectedRows] = useState({});
  const [copiesByShipment, setCopiesByShipment] = useState({});
  const [search, setSearch] = useState("");
  const [loadingDistributions, setLoadingDistributions] = useState(false);
  const [loadingShipments, setLoadingShipments] = useState(false);
  const [sendingShipmentId, setSendingShipmentId] = useState(null);
  const [error, setError] = useState("");
  const [opvOrders, setOpvOrders] = useState([]);
  const [selectedOpvOrderId, setSelectedOpvOrderId] = useState("");
  const [loadingOpvOrders, setLoadingOpvOrders] = useState(false);
  // Matriz: media carta en vertical (5.5 x 8.5 in)
  const [paperWidthMm, setPaperWidthMm] = useState(216);
  const [paperHeightMm, setPaperHeightMm] = useState(279.4);
  const [printFontMode, setPrintFontMode] = useState("DRAFT_ROMAN");
  const [productPriceById, setProductPriceById] = useState({});
  const [sellerPriceById, setSellerPriceById] = useState({});
  const [packingMaterials, setPackingMaterials] = useState([]);
  const [loadingPackingMaterials, setLoadingPackingMaterials] = useState(false);
  const [packingModalShipment, setPackingModalShipment] = useState(null);
  const [packingQtyByShipment, setPackingQtyByShipment] = useState({});
  const [selectedProductionOrder, setSelectedProductionOrder] = useState(null);

  useEffect(() => {
    loadDistributions();
    loadProductPrices();
    loadPackingMaterials();
    loadOpvOrders();
  }, []);

  useEffect(() => {
    if (selectedOpvOrderId) return;
    if (!distributionId) {
      setShipments([]);
      setSelectedRows({});
      setCopiesByShipment({});
      return;
    }
    loadShipments(distributionId);
  }, [distributionId, selectedOpvOrderId]);

  useEffect(() => {
    if (!selectedOpvOrderId) return;
    const loadOrderAsShipment = async () => {
      try {
        setLoadingShipments(true);
        setError("");
        const order = await getProductionOrderById(selectedOpvOrderId);
        setSelectedProductionOrder(order);
        const synthetic = buildOpvShipmentFromOrder(order);
        setShipments([synthetic]);
        setCopiesByShipment({ [synthetic.id]: 1 });
        setSelectedRows({});
      } catch (err) {
        setError(err.message || "No se pudo cargar la orden OPV");
        setShipments([]);
      } finally {
        setLoadingShipments(false);
      }
    };
    loadOrderAsShipment();
  }, [selectedOpvOrderId]);

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
      const rows = (orders || []).filter((order) => {
        const seller = String(order?.sellerName || "").trim().toUpperCase();
        return seller.includes("LUIS FELIPE");
      });
      setOpvOrders(rows);
    } catch (_err) {
      setOpvOrders([]);
    } finally {
      setLoadingOpvOrders(false);
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
      const data = await getShipmentsByDistribution(id);
      const rawShipments = data || [];

      setShipments(rawShipments);
      const initialCopies = {};
      rawShipments.forEach((shipment) => {
        initialCopies[shipment.id] = 1;
      });
      setCopiesByShipment(initialCopies);
      setSelectedRows({});
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
      (products || []).forEach((product) => {
        const discounted = Number(product.discountedPrice);
        const regular = Number(product.salePrice);
        const seller = Number(product.sellerPrice);
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
    } catch (err) {
      console.error("Error loading product prices:", err);
      setProductPriceById({});
      setSellerPriceById({});
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

  const isSpecialSellerFlow = (order) => {
    const po = order || selectedProductionOrder;
    if (!po) return false;
    const seller = String(po.sellerName || "").trim().toUpperCase();
    return seller.includes("LUIS FELIPE");
  };

  const specialSellerFlow = isSpecialSellerFlow(selectedProductionOrder);

  const resolveProductUnitPrice = (item) => {
    const productId = Number(item?.productId);
    if (!Number.isFinite(productId) || productId <= 0) {
      return Number(item?.unitPrice || item?.price || 0);
    }
    if (specialSellerFlow) {
      return Number(sellerPriceById[productId] || productPriceById[productId] || item?.unitPrice || item?.price || 0);
    }
    return Number(productPriceById[productId] || item?.unitPrice || item?.price || 0);
  };

  const normalizedQuery = (search || "").toLowerCase().trim();
  const visibleShipments = useMemo(
    () => (specialSellerFlow ? shipments : shipments.filter((shipment) => !isShipmentAlreadyProcessed(shipment.status))),
    [shipments, specialSellerFlow]
  );
  const hiddenProcessedCount = Math.max(0, (shipments || []).length - visibleShipments.length);
  const filteredShipments = useMemo(() => {
    if (!normalizedQuery) return visibleShipments;
    return visibleShipments.filter((shipment) => {
      const headers = [
        shipment.shipmentNumber,
        shipment.locationName,
        shipment.locationCode,
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

  const buildPrintableDocs = () => {
    const docs = [];
    shipments.forEach((shipment) => {
      if (!selectedRows[shipment.id]) return;
      const copies = Math.max(1, parseInt(copiesByShipment[shipment.id], 10) || 1);
      if (specialSellerFlow) {
        for (let copyIdx = 0; copyIdx < copies; copyIdx += 1) {
          const copyLabel = copies > 1 ? `Copia ${copyIdx + 1} de ${copies}` : "";
          docs.push({
            ...shipment,
            _printProducts: shipment.products || [],
            _printPackingItems: getShipmentPackingItems(shipment),
            _partNumber: 1,
            _partTotal: 1,
            copyLabel,
          });
        }
        return;
      }
      const productChunks = chunkArray(shipment.products, MAX_PRODUCT_ROWS_PER_SHIPMENT);
      const packingItems = getShipmentPackingItems(shipment);
      const hasPacking = packingItems.length > 0;
      const shouldSeparatePackingPart = productChunks.length > 1 && hasPacking;
      const totalParts = shouldSeparatePackingPart ? productChunks.length + 1 : productChunks.length;

      for (let partIdx = 0; partIdx < totalParts; partIdx += 1) {
        const isPackingOnlyPart = shouldSeparatePackingPart && partIdx === totalParts - 1;
        const productsForPart = isPackingOnlyPart ? [] : (productChunks[partIdx] || []);
        const packingForPart = shouldSeparatePackingPart
          ? (isPackingOnlyPart ? packingItems : [])
          : packingItems;
        const partLabel = totalParts > 1 ? `Parte ${partIdx + 1} de ${totalParts}` : "";
        for (let copyIdx = 0; copyIdx < copies; copyIdx += 1) {
          const copyLabel = copies > 1 ? `Copia ${copyIdx + 1} de ${copies}` : "";
          docs.push({
            ...shipment,
            _printProducts: productsForPart,
            _printPackingItems: packingForPart,
            _partNumber: partIdx + 1,
            _partTotal: totalParts,
            copyLabel: [partLabel, copyLabel].filter(Boolean).join(" - "),
          });
        }
      }
    });
    return docs;
  };

  const printSelected = () => {
    const docs = buildPrintableDocs();
    if (docs.length === 0) {
      showError("Selecciona al menos un envio para imprimir");
      return;
    }

    const distributionNumber = selectedDistribution?.distributionNumber || "N/A";
    const distributionDescription = selectedDistribution?.description || "";
    const printedBy = getPrintedBy();
    const printedAt = formatNowGt();
    const sourceAddress = "Bodega Principal";
    const pageWidth = Math.max(120, Number(paperWidthMm) || 216);
    const pageHeight = Math.max(80, Number(paperHeightMm) || 279.4);
    const printMarginTopMm = 5;
    const printMarginRightMm = 3;
    const printMarginBottomMm = 3;
    const printMarginLeftMm = 3;
    const hardwareSafeInsetMm = 5;
    const contentWidthMm = Math.max(
      90,
      pageWidth - printMarginLeftMm - printMarginRightMm - hardwareSafeInsetMm * 2
    );
    const printFontFamily =
      printFontMode === "SANS_SERIF"
        ? "Arial, Helvetica, sans-serif"
        : printFontMode === "HSD"
          ? "'Arial Narrow', Arial, Helvetica, sans-serif"
          : "'Times New Roman', Times, serif";

    const docsHtml = docs
      .map((shipment) => {
        const shipmentProducts = shipment._printProducts || shipment.products || [];
        const notesPayload = parseShipmentMetaNotes(shipment.notes);
        const shipmentPackingItems = shipment._printPackingItems || getShipmentPackingItems(shipment);
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
        const beltSizesSource = hasApiSizes ? beltSizeLines : (notesPayload.beltSizes || []);
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
        const rows = detailRows
          .map((row) => `
            <tr>
              <td>${row.productCode}</td>
              <td>${row.productName}</td>
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

        return `
          <section class="doc">
            <table class="meta">
              <tr>
                <td colspan="3"><strong>Direccion Envio:</strong> ${sourceAddress}</td>
                <td colspan="2"><strong>Fecha:</strong> ${printedAt}</td>
              </tr>
              <tr>
                <td colspan="3"><strong>Direccion Recibido:</strong> ${shipment.locationName || "-"} ${shipment.locationCode ? `(${shipment.locationCode})` : ""}</td>
                <td colspan="2"><strong>${specialSellerFlow ? "Orden No" : "Envio No"}:</strong> ${shipment.shipmentNumber || shipment.id}</td>
              </tr>
              <tr>
                <td colspan="3"><strong>Realizado por:</strong> ${specialSellerFlow ? (selectedProductionOrder?.sellerName || printedBy) : printedBy}</td>
                <td colspan="2"><strong>Distribucion:</strong> ${distributionNumber}</td>
              </tr>
              <tr>
                <td colspan="5"><strong>Generado por sistema:</strong> ${printedBy} ${shipment.copyLabel ? `- ${shipment.copyLabel}` : ""}</td>
              </tr>
            </table>

            <table class="grid">
              <thead>
                <tr>
                  <th>Cod.</th>
                  <th>Producto</th>
                  <th>Color</th>
                  <th>Cantidad</th>
                  <th>Medida</th>
                  <th>Precio</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${rows || `<tr><td colspan="7" class="empty">Sin productos</td></tr>`}
                <tr class="total-row">
                  <td colspan="3"><strong>Total</strong></td>
                  <td class="numeric"><strong>${totalQty}</strong></td>
                  <td></td>
                  <td></td>
                  <td class="numeric"><strong>${totalAmount > 0 ? formatCurrency(totalAmount) : "-"}</strong></td>
                </tr>
                ${
                  specialSellerFlow
                    ? `<tr class="total-row">
                        <td colspan="6"><strong>Costo de envio</strong></td>
                        <td class="numeric"><strong>${shippingCost > 0 ? formatCurrency(shippingCost) : "Q0.00"}</strong></td>
                      </tr>
                      <tr class="total-row">
                        <td colspan="6"><strong>Total con envio</strong></td>
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
          <title>${specialSellerFlow ? "Orden de Produccion" : "Preparacion de envios"}</title>
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
            .grid th:nth-child(3), .grid td:nth-child(3) { width: 12%; } /* Color */
            .grid th:nth-child(4), .grid td:nth-child(4) { width: 10%; } /* Cantidad */
            .grid th:nth-child(5), .grid td:nth-child(5) { width: 14%; } /* Medida */
            .grid th:nth-child(6), .grid td:nth-child(6) { width: 15%; } /* Precio */
            .grid th:nth-child(7), .grid td:nth-child(7) { width: 15%; } /* Total */
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
  };

  const exportSelectedToExcel = () => {
    const docs = buildPrintableDocs();
    if (docs.length === 0) {
      showError("Selecciona al menos un envio para exportar a Excel");
      return;
    }

    const wb = XLSX.utils.book_new();
    const distributionNumber = selectedDistribution?.distributionNumber || "N/A";
    const distributionDescription = selectedDistribution?.description || "";
    const printedBy = getPrintedBy();
    const printedAt = formatNowGt();
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
      const shipmentPackingItems = shipment._printPackingItems || getShipmentPackingItems(shipment);
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

      const sheetData = [
        ["Direccion Envio:", sourceAddress, "", "", "Fecha:", printedAt, ""],
        ["Direccion Recibido:", `${shipment.locationName || "-"} ${shipment.locationCode ? `(${shipment.locationCode})` : ""}`, "", "", "Envio:", shipmentCorrelative(shipment.shipmentNumber || shipment.id), ""],
        ["Realizado por:", specialSellerFlow ? (selectedProductionOrder?.sellerName || printedBy) : printedBy, "", "", "Distribucion:", compactCode(distributionNumber), ""],
        ["Generado por:", `${printedBy}${shipment.copyLabel ? ` - ${shipment.copyLabel}` : ""}`, "", "", "", "", ""],
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
        ...(specialSellerFlow
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
      const extraRows = specialSellerFlow ? 2 : 0;
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
        { label: "Kiosko", value: (s) => s.locationName || "-" },
        { label: "Codigo Kiosko", value: (s) => s.locationCode || "-" },
        { label: "Estado", value: (s) => tStatus(s.status) },
        { label: "Productos", value: (s) => (s.products || []).length },
        { label: "Unidades", value: (s) => (s.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0) },
      ],
      filteredShipments
    );
  };

  const exportCurrentPdf = () => {
    if (specialSellerFlow) {
      const rows = [];
      (filteredShipments || []).forEach((shipment) => {
        (shipment.products || []).forEach((item) => {
          const qty = Number(item.quantity || 0);
          const unitPrice = resolveProductUnitPrice(item);
          rows.push({
            shipmentNumber: shipment.shipmentNumber || shipment.id,
            locationName: shipment.locationName || "-",
            productCode: item.productCode || "-",
            productName: item.productName || "-",
            quantity: qty,
            unitPrice,
            total: qty * unitPrice,
            rowType: "PRODUCTO",
          });
        });
        getShipmentPackingItems(shipment).forEach((item) => {
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
    exportRowsToPdf(
      `Preparacion de Envios ${selectedDistribution?.distributionNumber || ""}`.trim(),
      [
        { label: "Distribucion", value: () => selectedDistribution?.distributionNumber || "-" },
        { label: "Envio", value: (s) => s.shipmentNumber || s.id },
        { label: "Kiosko", value: (s) => s.locationName || "-" },
        { label: "Codigo Kiosko", value: (s) => s.locationCode || "-" },
        { label: "Estado", value: (s) => tStatus(s.status) },
        { label: "Productos", value: (s) => (s.products || []).length },
        { label: "Unidades", value: (s) => (s.products || []).reduce((sum, p) => sum + Number(p.quantity || 0), 0) },
      ],
      filteredShipments
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

      const notesPacking = getShipmentPackingItems(shipment);

      const movementMap = new Map();
      notesPacking.forEach((item) => {
        movementMap.set(item.materialId, item.quantity);
      });
      for (const material of packingMaterials) {
        const key = getPackingKey(shipmentId, material.id);
        const manualQty = Number(packingQtyByShipment[key] || 0);
        if (Number.isFinite(manualQty) && manualQty > 0) {
          movementMap.set(Number(material.id), manualQty);
        }
      }

      for (const [materialId, qty] of movementMap.entries()) {
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const reasonParts = [
          "Salida empaque por distribución PT",
          shipment.shipmentNumber ? `Envío ${shipment.shipmentNumber}` : "",
          shipment.locationName ? `Kiosko ${shipment.locationName}` : "",
        ].filter(Boolean);

        const moveResponse = await fetch(
          `${process.env.REACT_APP_API_URL || "http://localhost:8080/api"}/public/inventory/materials/${materialId}/movements`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              movementType: "OUT",
              quantity: Number(qty.toFixed(2)),
              reason: reasonParts.join(" | "),
            }),
          }
        );
        if (!moveResponse.ok) {
          const errorData = await moveResponse
            .json()
            .catch(() => ({ message: "No se pudo descargar empaque de inventario" }));
          throw new Error(errorData.message || "No se pudo descargar empaque de inventario");
        }
      }

      await sendShipment(shipmentId);
      showSuccess("Envio marcado como enviado correctamente");
      await loadShipments(distributionId);
    } catch (err) {
      const message = err.message || "No se pudo marcar el envio como enviado";
      setError(message);
      showError(message);
    } finally {
      setSendingShipmentId(null);
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
                    onClick={loadDistributions}
                    disabled={loadingDistributions}
                    className="mr-2 mt-2"
                  >
                    {loadingDistributions ? <Spinner size="sm" /> : <i className="nc-icon nc-refresh-69 mr-1" />}
                    Actualizar
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    onClick={printSelected}
                    disabled={selectedShipmentIds.length === 0}
                    className="mt-2 mr-2"
                  >
                    <i className="nc-icon nc-paper mr-1" />
                    Imprimir Seleccionados
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
                Selecciona una distribucion, prepara envios por kiosko y luego imprime solo los que necesites con copias.
              </p>
              {specialSellerFlow && (
                <Alert color="warning">
                  Flujo especial OPV vendedor activo ({selectedProductionOrder?.sellerName || "Luis Felipe"}): sin límite de productos por envío y usando precio vendedor.
                  <div className="mt-1">
                    Los empaques y costo de envío para OPV se gestionan únicamente en la vista de Orden de Producción.
                  </div>
                </Alert>
              )}

              {error && <Alert color="danger">{error}</Alert>}
              {hiddenProcessedCount > 0 && (
                <Alert color="light">
                  Se ocultaron {hiddenProcessedCount} envío(s) ya procesado(s) para enfocarse solo en pendientes por preparar.
                </Alert>
              )}

              <Row className="mb-3">
                <Col md="3">
                  <Label><strong>Distribucion</strong></Label>
                  <Input
                    type="select"
                    value={distributionId}
                    onChange={(e) => {
                      setDistributionId(e.target.value);
                      if (e.target.value) {
                        setSelectedOpvOrderId("");
                      }
                    }}
                    disabled={loadingDistributions}
                  >
                    <option value="">-- Seleccione una distribucion --</option>
                    {distributions.map((dist) => (
                      <option key={dist.id} value={dist.id}>
                        {dist.distributionNumber} - {dist.distributionDate ? formatDateGt(dist.distributionDate) : "Sin fecha"}
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md="3">
                  <Label><strong>Orden OPV vendedor</strong></Label>
                  <Input
                    type="select"
                    value={selectedOpvOrderId}
                    onChange={(e) => {
                      setSelectedOpvOrderId(e.target.value);
                      if (e.target.value) {
                        setDistributionId("");
                      } else {
                        setShipments([]);
                        setSelectedProductionOrder(null);
                      }
                    }}
                    disabled={loadingOpvOrders}
                  >
                    <option value="">-- Seleccione OPV de Luis Felipe --</option>
                    {opvOrders.map((order) => (
                      <option key={order.id} value={order.id}>
                        {order.code} - {order.customerName || "Cliente"} ({order.status})
                      </option>
                    ))}
                  </Input>
                </Col>
                <Col md="4">
                  <Label><strong>Buscar envio (codigo, kiosko, SKU o nombre)</strong></Label>
                  <Input
                    type="search"
                    placeholder="Ej: ENV-001, PRADERA, 009901 o billetera"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    disabled={!distributionId && !selectedOpvOrderId}
                  />
                </Col>
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
              </Row>
              <Row className="mb-3">
                <Col md="3">
                  <Label><strong>Ancho papel (mm)</strong></Label>
                  <Input
                    type="number"
                    min="120"
                    step="0.1"
                    value={paperWidthMm}
                    onChange={(e) => setPaperWidthMm(e.target.value)}
                  />
                </Col>
                <Col md="3">
                  <Label><strong>Alto hoja continua (mm)</strong></Label>
                  <Input
                    type="number"
                    min="80"
                    step="0.1"
                    value={paperHeightMm}
                    onChange={(e) => setPaperHeightMm(e.target.value)}
                  />
                </Col>
                <Col md="3">
                  <Label><strong>Fuente impresión</strong></Label>
                  <Input
                    type="select"
                    value={printFontMode}
                    onChange={(e) => setPrintFontMode(e.target.value)}
                  >
                    <option value="DRAFT_ROMAN">Draft Roman</option>
                    <option value="SANS_SERIF">Sans Serif</option>
                    <option value="HSD">HSD (aprox.)</option>
                  </Input>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Alert color="light" className="mb-0 w-100">
                    Ajuste sugerido: <strong>Carta vertical 216 x 279.4 mm</strong> (8.5 x 11 pulgadas).
                    <div className="mt-2">
                      <Button
                        color="secondary"
                        size="sm"
                        outline
                        onClick={() => {
                          setPaperWidthMm(216);
                          setPaperHeightMm(279.4);
                        }}
                      >
                        Usar Carta Vertical
                      </Button>
                    </div>
                  </Alert>
                </Col>
              </Row>
              <Row className="mb-3">
                <Col md="12">
                  <Alert color="info" className="mb-0">
                    Al enviar, también se descuentan empaques seleccionados (SKU <strong>SUM-</strong>) del inventario de materiales.
                    <div className="mt-2">
                      Para Epson LX-350: en el diálogo de impresión usa escala <strong>100%</strong>,
                      tamaño <strong>Carta vertical</strong> y desactiva <strong>encabezados/pies</strong>.
                    </div>
                  </Alert>
                </Col>
              </Row>

              {loadingShipments ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2 mb-0">Cargando envios...</p>
                </div>
              ) : !distributionId && !selectedOpvOrderId ? (
                <Alert color="light" className="mb-0">
                  Primero selecciona una distribución o una orden OPV de Luis Felipe para preparar los envíos.
                </Alert>
              ) : filteredShipments.length === 0 ? (
                <Alert color="warning" className="mb-0">
                  No hay envios para esta distribucion con ese filtro.
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th style={{ width: 45 }} />
                      <th>Código</th>
                      <th>Kiosko</th>
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
                        </td>
                        <td>
                          {shipment.locationName || "-"}{" "}
                          {shipment.locationCode ? (
                            <Badge color="light" className="ml-1">{shipment.locationCode}</Badge>
                          ) : null}
                        </td>
                        <td>
                          <Badge color="info">{(shipment.products || []).length}</Badge>
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
                            const shipmentPacking = getShipmentPackingItems(shipment);
                            const beltFromProducts = (shipment.products || [])
                              .filter((item) => String(item.size || "").trim() !== "")
                              .map((item) => ({
                                productId: Number(item.productId),
                                colorId: item.colorId === null || item.colorId === undefined ? null : Number(item.colorId),
                                size: String(item.size || "").trim().toUpperCase(),
                                quantity: Number(item.quantity || 0),
                              }));
                            const beltPreviewSource = beltFromProducts.length > 0 ? beltFromProducts : (shipmentMeta.beltSizes || []);
                            const beltPreview = beltPreviewSource.slice(0, 2);
                            return (
                              <>
                          {(shipment.products || []).slice(0, 2).map((product) => (
                            <div key={`${shipment.id}-${product.id || product.productId}`}>
                              <small>
                                <strong>{product.productCode || "-"}</strong> - {product.productName || "-"} x {product.quantity || 0}
                              </small>
                            </div>
                          ))}
                          {beltPreview.map((line) => {
                            const product = (shipment.products || []).find(
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
                          {(shipment.products || []).length > 2 && (
                            <small className="text-muted">
                              + {(shipment.products || []).length - 2} producto(s)
                            </small>
                          )}
                          {beltPreviewSource.length > 2 && (
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
                            color="info"
                            size="sm"
                            outline
                            onClick={() => setPackingModalShipment(shipment)}
                            className="mr-2"
                            disabled={loadingPackingMaterials || specialSellerFlow}
                          >
                            <i className="nc-icon nc-box mr-1" />
                            Empaques
                            {(getPackingCountForShipment(shipment.id) > 0 || getShipmentPackingItems(shipment).length > 0) && (
                              <Badge color="primary" className="ml-1">
                                {Math.max(getPackingCountForShipment(shipment.id), getShipmentPackingItems(shipment).length)}
                              </Badge>
                            )}
                          </Button>
                          <Button
                            color="success"
                            size="sm"
                            disabled={specialSellerFlow || !isShipmentSendable(shipment.status) || sendingShipmentId === shipment.id}
                            onClick={() => handleSendShipment(shipment.id)}
                            className="mr-2"
                          >
                            {sendingShipmentId === shipment.id ? <Spinner size="sm" /> : <><i className="nc-icon nc-delivery-fast mr-1" />Listo / Enviar</>}
                          </Button>
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
          <Button color="primary" onClick={() => setPackingModalShipment(null)}>
            Listo
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default PrepareShipments;

