import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Button, Card, CardHeader, CardBody, CardTitle, CardFooter,
  Row, Col, Table, Badge, Input, Label, FormGroup, Modal, ModalHeader,
  ModalBody, ModalFooter, Alert, Spinner, Nav, NavItem, NavLink,
  TabContent, TabPane, Progress
} from "reactstrap";
import { getProducts } from "../../services/productService";
import { getColors } from "../../services/colorService";
import {
  createOnlineSale, updateOnlineSale, deleteOnlineSale,
  getOnlineSalesByDate, getOnlineSalesByDateRange, getDailySummary,
  getEligibleForProduction, createProductionOrderFromSales, processFulfillment,
  previewFulfillment, getSaleItemsPreview, resolveMixedSale,
  importOnlineSales, returnOnlineSale, voidOnlineSale, registerOnlineSaleShipment,
  getReturnInventory, getReturnEvents, getReturnForPrint,
  createOnlineSaleExchange,
  PAYMENT_METHODS, SALESPERSONS, SOCIAL_NETWORKS, SHIPPING_CARRIERS, SALE_STATUSES
} from "../../services/onlineSaleService";
import { getWarehouseView } from "../../services/productionOrderService";
import * as XLSX from "xlsx";
import { formatNowGt } from "utils/dateTimeHelper";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { buildShipmentDocumentHtml, getSimplePaymentLabel } from "utils/shipmentPrintDocumentHtml";
import QRCode from "qrcode";
import { getPublicFrontBaseUrl, buildPtDispatchOnlineUrl } from "utils/ptDispatchQr";
import {
  issueTaxInvoiceFromOnlineSale,
  downloadTaxInvoiceCertifiedXml,
  openFelInvoiceReport,
} from "../../services/taxInvoiceService";
import EditTaxInvoiceFelModal from "../../components/accounting/EditTaxInvoiceFelModal";
import { useAuth } from "../../contexts/AuthContext";
import { canEditTaxInvoiceFel } from "../../utils/taxInvoiceEditHelper";

// ─── Helpers ─────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];
const dateDaysAgo = (days) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.max(0, Number(days) || 0));
  return d.toISOString().split("T")[0];
};

const formatQ = (v) => {
  if (v == null) return "Q 0.00";
  return `Q ${parseFloat(v).toFixed(2)}`;
};

const getShippingCost = (paymentMethod) => {
  const found = PAYMENT_METHODS.find(p => p.value === paymentMethod);
  return found ? found.shipping : 15;
};

const emptyItem = () => ({ productId: null, colorId: null, size: "", quantity: 1, unitPrice: "" });

const getStatusBadge = (status) => {
  const found = SALE_STATUSES.find(s => s.value === status);
  return found ? <Badge color={found.color}>{found.label}</Badge> : <Badge>{status}</Badge>;
};

const getFelInvoiceBadge = (sale) => {
  const status = sale?.invoiceStatus;
  if (status === "CERTIFIED") return <Badge color="success">Certificada</Badge>;
  if (status === "FAILED") return <Badge color="danger" title={sale.invoiceFelError || ""}>Error</Badge>;
  if (status === "SKIPPED") return <Badge color="warning">Omitida</Badge>;
  return <Badge color="secondary">Sin factura</Badge>;
};

const canGenerateFelInvoice = (sale) => {
  if (!sale || sale.invoiceStatus === "CERTIFIED") return false;
  return !["ANULADA", "CANCELADO", "DEVOLUCION"].includes(sale.status);
};

const isFelInvoiceRetry = (sale) =>
  sale?.invoiceStatus === "FAILED" || sale?.invoiceStatus === "SKIPPED";

const canDownloadFelInvoice = (sale) =>
  sale?.invoiceStatus === "CERTIFIED" && Boolean(sale?.invoiceFelUuid);

const formatBillingDateGt = () => new Date().toLocaleDateString("es-GT", {
  timeZone: "America/Guatemala",
  year: "numeric",
  month: "long",
  day: "numeric",
});

const computeSaleAmountsFromItems = (sale) => {
  if (!sale) return { net: 0, total: 0, lineCount: 0 };
  const preview = buildFelInvoicePreview(sale);
  if (!preview) return { net: 0, total: 0, lineCount: 0 };
  const productLines = (preview.lines || []).filter((l) => l.description !== "Costo de envío");
  const net = productLines.reduce((sum, line) => sum + line.lineTotal, 0);
  const shipping = parseFloat(sale.shippingCost || 0) || 0;
  const total = preview.total || net + shipping;
  return { net, total, lineCount: productLines.length };
};

const buildFelInvoicePreview = (sale) => {
  if (!sale) return null;
  const lines = [];
  const items = Array.isArray(sale.items) && sale.items.length > 0 ? sale.items : [];

  if (items.length > 0) {
    items.forEach((item) => {
      const qty = Number(item.quantity || 1);
      const unitPrice = parseFloat(item.unitPrice || 0);
      const lineTotal = item.subtotal != null
        ? parseFloat(item.subtotal)
        : unitPrice * qty;
      if (!Number.isFinite(lineTotal) || lineTotal <= 0) return;
      const description = [item.productCode, item.productName, item.colorName, item.size]
        .filter(Boolean)
        .join(" ")
        .trim();
      lines.push({
        description: description || "Producto",
        quantity: qty,
        unitPrice,
        lineTotal,
      });
    });
  } else if (sale.productId) {
    const qty = Number(sale.quantity || 1);
    const unitPrice = parseFloat(sale.unitPrice || 0);
    const lineTotal = unitPrice * qty;
    const description = [sale.productCode, sale.productName].filter(Boolean).join(" ").trim();
    lines.push({
      description: description || "Producto",
      quantity: qty,
      unitPrice,
      lineTotal,
    });
  }

  const shipping = parseFloat(sale.shippingCost || 0);
  if (Number.isFinite(shipping) && shipping > 0) {
    lines.push({
      description: "Costo de envío",
      quantity: 1,
      unitPrice: shipping,
      lineTotal: shipping,
    });
  }

  const rawTaxId = String(sale.invoiceTaxId || "CF").trim().toUpperCase();
  const customerTaxId = rawTaxId === "C/F" || !rawTaxId ? "CF" : rawTaxId;
  const customerName = sale.customerName
    || (customerTaxId === "CF" ? "CONSUMIDOR FINAL" : "—");

  const totalFromLines = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  const total = lines.length > 0 ? totalFromLines : (parseFloat(sale.totalAmount || 0) || 0);

  return {
    saleNumber: sale.saleNumber || sale.id,
    billingDate: formatBillingDateGt(),
    // Ventas en línea = est. FEL 1 (CUEROGLAM central) → FCAM + Abonos
    documentType: "FCAM",
    establishmentCode: "1",
    customerTaxId,
    customerName,
    address: sale.address || "—",
    phone: sale.phone || "—",
    email: sale.email || "—",
    lines,
    total,
  };
};

const getSocialIcon = (sn) => {
  const found = SOCIAL_NETWORKS.find(s => s.value === sn);
  if (!found) return sn;
  return <span style={{ color: found.color, fontWeight: 600 }}>{found.icon} {found.label}</span>;
};

// ─── CSV Import Parser ───────────────────────────────────────────

const CSV_PAYMENT_MAP = {
  "contra entrega": "CONTRA_ENTREGA",
  "deposito": "DEPOSITO_LISTO",
  "depósito": "DEPOSITO_LISTO",
  "deposito listo": "DEPOSITO_LISTO",
  "deposito pendiente": "DEPOSITO_PENDIENTE",
  "transferencia": "VISALINK_PAGADO",
  "transferencia lista": "VISALINK_PAGADO",
  "transferencia pend": "VISALINK_PENDIENTE",
  "transferencia pendiente": "VISALINK_PENDIENTE",
  "visalink": "VISALINK_PAGADO",
  "visalink pagado": "VISALINK_PAGADO",
  "visalink pendiente": "VISALINK_PENDIENTE",
  "tarjeta": "TARJETA_PAGADO",
  "tarjeta pagado": "TARJETA_PAGADO",
  "tarjeta web": "TARJETA_PAGADO",
  "tarjeta web pagado": "TARJETA_PAGADO",
  "td/tc": "TARJETA_PAGADO",
  "contra entrega deposito": "CONTRA_ENTREGA_DEPOSITO",
};

const CSV_CARRIER_MAP = {
  "guatex": "GUATEX",
  "forza": "FORZA_DELIVERY",
  "motorista": "MOTORISTA",
};

const CSV_SOCIAL_MAP = {
  "whatsapp": "WHATSAPP",
  "facebook": "FACEBOOK",
  "instagram": "INSTAGRAM",
  "pagina web": "WEB",
  "web": "WEB",
};

const CSV_SELLER_MAP = {
  "anthony": "Anthony Ixcajo",
  "eduardo": "Eduardo Ramirez",
  "mariana": "Mariana",
  "luisa": "Luisa Marquez",
  "marquez": "Luisa Marquez",
};

const DAY_NAMES = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "MIÉRCOLES", "JUEVES", "VIERNES", "SABADO", "SÁBADO"];

function parseCSVText(text) {
  const rows = [];
  let i = 0;
  while (i < text.length) {
    const row = [];
    while (i < text.length) {
      if (text[i] === '"') {
        i++;
        let field = "";
        while (i < text.length) {
          if (text[i] === '"') {
            if (i + 1 < text.length && text[i + 1] === '"') { field += '"'; i += 2; }
            else { i++; break; }
          } else { field += text[i]; i++; }
        }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
      } else {
        let field = "";
        while (i < text.length && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
          field += text[i]; i++;
        }
        row.push(field);
        if (i < text.length && text[i] === ',') i++;
      }
      if (i >= text.length || text[i] === '\n' || text[i] === '\r') {
        while (i < text.length && (text[i] === '\n' || text[i] === '\r')) i++;
        break;
      }
    }
    rows.push(row);
  }
  return rows;
}

function parseAmount(val) {
  if (!val) return null;
  const cleaned = val.replace(/[Qq\s$]/g, "").replace(/,/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

function parseCSVDate(val) {
  if (!val) return null;
  const t = val.trim();
  const parts = t.split("/");
  if (parts.length === 3) {
    const month = parts[0].padStart(2, "0");
    const day = parts[1].padStart(2, "0");
    const year = parts[2].length === 2 ? "20" + parts[2] : parts[2];
    return `${year}-${month}-${day}`;
  }
  return null;
}

function isDaySeparator(row) {
  const first = (row[0] || "").trim().toUpperCase();
  return DAY_NAMES.some(d => first.startsWith(d));
}

function extractSalesperson(row) {
  const parts = (row[0] || "").trim().split(/\s+/);
  if (parts.length >= 3) {
    const name = parts[parts.length - 1].toLowerCase();
    return CSV_SELLER_MAP[name] || parts[parts.length - 1];
  }
  return null;
}

function mapPayment(val) {
  if (!val) return null;
  const key = val.trim().toLowerCase();
  return CSV_PAYMENT_MAP[key] || null;
}

function mapCarrier(val) {
  if (!val) return null;
  const key = val.trim().toLowerCase();
  return CSV_CARRIER_MAP[key] || null;
}

function mapSocial(val) {
  if (!val) return null;
  const key = val.trim().toLowerCase();
  return CSV_SOCIAL_MAP[key] || null;
}

function parseCSVSales(text) {
  const rawRows = parseCSVText(text);
  const sales = [];
  let currentSeller = null;

  for (const row of rawRows) {
    // Detectar separador de día/vendedor
    if (isDaySeparator(row)) {
      currentSeller = extractSalesperson(row);
      continue;
    }

    // Saltar filas sin número o cabecera
    const num = (row[0] || "").trim();
    if (!num || isNaN(parseInt(num))) continue;

    // Verificar que tenga datos reales (al menos nombre)
    const name = (row[1] || "").trim();
    if (!name) continue;

    const totalAmount = parseAmount(row[10]);
    const shippingCost = parseAmount(row[11]);
    let netAmount = parseAmount(row[27]);

    // Fallback: si "sin envio" está vacío o tiene #REF!, calcular desde total - envío
    if (!netAmount && totalAmount) {
      netAmount = totalAmount - (shippingCost || 0);
      if (netAmount <= 0) netAmount = null;
    }

    // Si no hay monto, saltar
    if (!totalAmount && !netAmount) continue;

    const paymentMethod = mapPayment(row[5]);
    const carrier = mapCarrier(row[12]);
    const socialNetwork = mapSocial(row[14]);
    const saleDate = parseCSVDate(row[13]);

    // Parsear productos (pueden ser múltiples separados por "/")
    const productStr = (row[7] || "").trim();
    const colorStr = (row[8] || "").trim();
    const sizeStr = (row[9] || "").trim();

    const productNames = productStr.split("/").map(s => s.trim()).filter(Boolean);
    const colorNames = colorStr.split("/").map(s => s.trim());

    const items = productNames.map((pName, idx) => ({
      productName: pName,
      colorName: colorNames[idx] || colorNames[0] || "",
      size: productNames.length === 1 ? sizeStr : "",
      quantity: 1,
      unitPrice: productNames.length === 1 && netAmount ? netAmount : (netAmount ? Math.round((netAmount / productNames.length) * 100) / 100 : 0),
    }));

    const sale = {
      saleNumber: num,
      customerName: name,
      address: (row[2] || "").trim(),
      phone: (row[3] || "").trim(),
      packaging: (row[4] || "").trim().toLowerCase() === "si",
      paymentMethod: paymentMethod,
      invoiceTaxId: (row[6] || "").trim() || "cf",
      shippingCarrier: carrier,
      saleDate: saleDate,
      socialNetwork: socialNetwork,
      email: (row[15] || "").trim(),
      guideNumber: (row[16] || "").trim(),
      paymentAuthorization: (row[20] || "").trim().replace(/^--$/, ""),
      status: "PENDIENTE",
      observations: (row[22] || "").trim(),
      salesperson: currentSeller,
      totalAmount: totalAmount,
      shippingCost: shippingCost,
      netAmount: netAmount,
      items: items,
    };

    sales.push(sale);
  }

  return sales;
}

// ─── Componente Filtro de Producto con typeahead ──────────────────

function ProductSelector({ products, value, onChange }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = products.find(p => p.id === value);
  const filtered = products.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.code || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Input
        type="text"
        placeholder="Buscar producto..."
        value={open ? search : (selected ? `${selected.code} - ${selected.name}` : "")}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setSearch(""); }}
        bsSize="sm"
      />
      {open && (
        <div style={{
          position: "absolute", zIndex: 1000, background: "#fff", border: "1px solid #ddd",
          borderRadius: 4, maxHeight: 200, overflowY: "auto", width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 8, color: "#999", fontSize: 12 }}>Sin resultados</div>
          ) : filtered.map(p => (
            <div key={p.id} style={{
              padding: "6px 10px", cursor: "pointer", fontSize: 13,
              background: p.id === value ? "#e3f2fd" : "transparent"
            }}
              onMouseDown={() => { onChange(p); setOpen(false); setSearch(""); }}>
              <strong>{p.code}</strong> — {p.name}
              {p.salePrice != null && <span style={{ float: "right", color: "#666" }}>Q{parseFloat(p.salePrice).toFixed(2)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente Filtro de Color con typeahead ─────────────────────

function ColorSelector({ colors, value, onChange }) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = colors.find(c => c.id === value);
  const filtered = colors.filter(c =>
    (c.name || "").toLowerCase().includes(search.toLowerCase())
  ).slice(0, 30);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <Input
        type="text"
        placeholder="Buscar color..."
        value={open ? search : (selected ? selected.name : "")}
        onChange={e => { setSearch(e.target.value); if (!open) setOpen(true); }}
        onFocus={() => { setOpen(true); setSearch(""); }}
        bsSize="sm"
      />
      {open && (
        <div style={{
          position: "absolute", zIndex: 1000, background: "#fff", border: "1px solid #ddd",
          borderRadius: 4, maxHeight: 200, overflowY: "auto", width: "100%", boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
        }}>
          {filtered.length === 0 ? (
            <div style={{ padding: 8, color: "#999", fontSize: 12 }}>Sin resultados</div>
          ) : filtered.map(c => (
            <div key={c.id} style={{
              padding: "6px 10px", cursor: "pointer", fontSize: 13,
              background: c.id === value ? "#e3f2fd" : "transparent"
            }}
              onMouseDown={() => { onChange(c); setOpen(false); setSearch(""); }}>
              {c.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente Principal ────────────────────────────────────────

function OnlineSales() {
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canEditFel = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });

  // Tabs
  const [activeTab, setActiveTab] = useState("ventas");

  // Data
  const [sales, setSales] = useState([]);
  const [warehouseOrders, setWarehouseOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summarySales, setSummarySales] = useState([]);
  const [summaryDateFrom, setSummaryDateFrom] = useState(() => today());
  const [summaryDateTo, setSummaryDateTo] = useState(() => today());
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Filtros
  const [filterDate, setFilterDate] = useState(today());
  const [filterSalesperson, setFilterSalesperson] = useState("");
  const [filterSocial, setFilterSocial] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  // Modal formulario
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(getEmptyForm());

  // Inline editing
  const [editCell, setEditCell] = useState(null); // { id, field }
  const [editValue, setEditValue] = useState("");

  // Producción
  const [eligibleSales, setEligibleSales] = useState([]);
  const [selectedForPO, setSelectedForPO] = useState(new Set());
  const [fulfillmentPreview, setFulfillmentPreview] = useState({
    bodegaPtFound: true, map: {}, sourceMap: {}, leatherOkMap: {}, leatherSummaryMap: {}
  });

  // Resolver venta mixta: una venta + rutas por linea + OP solo lineas PRODUCE
  const [resolveSale, setResolveSale] = useState(null);
  const [resolveItems, setResolveItems] = useState([]);
  const [resolveActions, setResolveActions] = useState({});
  const [resolveLoading, setResolveLoading] = useState(false);
  const [resolveError, setResolveError] = useState("");
  const [resolveSubmitting, setResolveSubmitting] = useState(false);
  const [loadingPO, setLoadingPO] = useState(false);
  const [fulfillmentResult, setFulfillmentResult] = useState(null);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [productionDateFrom, setProductionDateFrom] = useState("");
  const [productionDateTo, setProductionDateTo] = useState("");
  const [productionBulkDate, setProductionBulkDate] = useState(today());

  // Resumen mensual
  const [monthFilter, setMonthFilter] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthlySales, setMonthlySales] = useState([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);

  // CSV Import
  const [showImportModal, setShowImportModal] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importingCSV, setImportingCSV] = useState(false);
  const csvInputRef = useRef(null);

  // Devolución / Anulación
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [actionSaleId, setActionSaleId] = useState(null);
  const [returnReason, setReturnReason] = useState("");
  const [returnCondition, setReturnCondition] = useState("BUENO");
  const [voidReason, setVoidReason] = useState("");
  const [felInvoiceLoadingId, setFelInvoiceLoadingId] = useState(null);
  const [felXmlDownloading, setFelXmlDownloading] = useState(false);
  const [felInvoiceModal, setFelInvoiceModal] = useState(null);
  const [felEditTarget, setFelEditTarget] = useState(null);
  // { phase: 'preview', sale } | { phase: 'result', sale, invoice }
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipmentSale, setShipmentSale] = useState(null);
  const [shipmentForm, setShipmentForm] = useState({
    shippingCarrier: "FORZA_DELIVERY",
    guideNumber: "",
    observations: ""
  });

  // CAMBIO (nuevo envío Q0)
  const [showExchangeModal, setShowExchangeModal] = useState(false);
  const [exchangeOriginalSale, setExchangeOriginalSale] = useState(null);
  const [exchangeItems, setExchangeItems] = useState([]);
  const [exchangeForm, setExchangeForm] = useState({
    shippingCarrier: "FORZA_DELIVERY",
    guideNumber: "",
    observations: "",
  });
  const [creatingExchange, setCreatingExchange] = useState(false);
  const [exchangeCreatedSale, setExchangeCreatedSale] = useState(null);

  // Inventario de devoluciones (historial)
  const [returnsStartDate, setReturnsStartDate] = useState(() => dateDaysAgo(30));
  const [returnsEndDate, setReturnsEndDate] = useState(() => today());
  const [returnsCondition, setReturnsCondition] = useState("");
  const [returnsRows, setReturnsRows] = useState([]);
  const [returnEvents, setReturnEvents] = useState([]);
  const [loadingReturns, setLoadingReturns] = useState(false);
  const [returnsError, setReturnsError] = useState("");

  // ─── Load inicial ───────────────────────────────────────────────

  useEffect(() => {
    loadProducts();
    loadColors();
  }, []);

  useEffect(() => {
    loadSales();
  }, [filterDate]); // eslint-disable-line

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data || []);
    } catch (e) { console.error(e); }
  };

  const loadColors = async () => {
    try {
      const data = await getColors();
      setColors(data || []);
    } catch (e) { console.error(e); }
  };

  const loadSales = useCallback(async () => {
    setLoading(true);
    try {
      const [data, wOrders] = await Promise.all([
        getOnlineSalesByDate(filterDate),
        getWarehouseView(),
      ]);
      setSales(data || []);
      setWarehouseOrders(wOrders || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  const summaryRangeLabel = useMemo(() => {
    const from = summaryDateFrom || summaryDateTo;
    const to = summaryDateTo || summaryDateFrom;
    if (!from) return "";
    if (from === to) return from;
    return `${from} al ${to}`;
  }, [summaryDateFrom, summaryDateTo]);

  const loadSummary = useCallback(async () => {
    const from = summaryDateFrom || summaryDateTo;
    const to = summaryDateTo || summaryDateFrom;
    if (!from || !to) {
      setError("Indique fecha desde y hasta para el resumen.");
      return;
    }
    if (from > to) {
      setError("La fecha inicial no puede ser posterior a la final.");
      return;
    }
    setLoadingSummary(true);
    setError("");
    try {
      const [sum, rangeSales] = await Promise.all([
        getDailySummary(from, to),
        from === to ? getOnlineSalesByDate(from) : getOnlineSalesByDateRange(from, to),
      ]);
      setSummary(sum);
      setSummarySales(rangeSales || []);
    } catch (e) {
      setError(e.message);
      setSummary(null);
      setSummarySales([]);
    } finally {
      setLoadingSummary(false);
    }
  }, [summaryDateFrom, summaryDateTo]);

  // ─── Producción ──────────────────────────────────────────────────

  const loadEligibleSales = async () => {
    try {
      const data = await getEligibleForProduction(productionDateFrom || undefined, productionDateTo || undefined);
      setEligibleSales(data || []);
      setSelectedForPO(new Set());

      // Preview de inventario (Bodega PT / Devoluciones): muestra si se puede despachar directo y de dónde.
      try {
        const ids = (data || []).map((s) => s.id).filter(Boolean);
        if (ids.length === 0) {
          setFulfillmentPreview({
            bodegaPtFound: true, map: {}, sourceMap: {}, leatherOkMap: {}, leatherSummaryMap: {}
          });
        } else {
          const preview = await previewFulfillment(ids);
          const map = {};
          const sourceMap = {};
          const leatherOkMap = {};
          const leatherSummaryMap = {};
          (preview?.rows || []).forEach((r) => {
            const sid = String(r.saleId);
            map[sid] = Boolean(r.canFulfillFromInventory);
            sourceMap[sid] = r.inventorySource || "";
            leatherOkMap[sid] = r.leatherOkForOpl !== false;
            leatherSummaryMap[sid] = Array.isArray(r.leatherSummary) ? r.leatherSummary : [];
          });
          setFulfillmentPreview({
            bodegaPtFound: preview?.bodegaPtFound !== false, map, sourceMap, leatherOkMap, leatherSummaryMap
          });
        }
      } catch (e) {
        setFulfillmentPreview({
          bodegaPtFound: true, map: {}, sourceMap: {}, leatherOkMap: {}, leatherSummaryMap: {}
        });
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (activeTab === "produccion") loadEligibleSales();
    if (activeTab === "mensual") loadMonthlySales();
    if (activeTab === "devoluciones") loadReturns();
    if (activeTab === "resumen") loadSummary();
  }, [activeTab]); // eslint-disable-line

  const loadReturns = async () => {
    try {
      setLoadingReturns(true);
      setReturnsError("");
      const [data, events] = await Promise.all([
        getReturnInventory(returnsStartDate, returnsEndDate),
        getReturnEvents(returnsStartDate, returnsEndDate),
      ]);
      const rows = Array.isArray(data) ? data : [];
      setReturnsRows(rows);
      setReturnEvents(Array.isArray(events) ? events : []);
    } catch (e) {
      setReturnsError(e.message || "No se pudieron cargar las devoluciones.");
      setReturnsRows([]);
      setReturnEvents([]);
    } finally {
      setLoadingReturns(false);
    }
  };

  const filteredReturns = useMemo(() => {
    let rows = Array.isArray(returnsRows) ? returnsRows : [];
    if (returnsCondition) {
      const cond = String(returnsCondition).toUpperCase();
      rows = rows.filter((r) => String(r?.itemCondition || "").toUpperCase() === cond);
    }
    return rows;
  }, [returnsRows, returnsCondition]);

  const returnsTotals = useMemo(() => {
    const rows = filteredReturns || [];
    const units = rows.reduce((sum, r) => sum + (parseInt(r?.quantity, 10) || 0), 0);
    const amount = rows.reduce((sum, r) => sum + (parseFloat(r?.subtotal) || 0), 0);
    return { units, amount };
  }, [filteredReturns]);

  const filteredEligibleSales = useMemo(() => {
    const excludedStatuses = new Set([
      "EN_PRODUCCION",
      "PRODUCIDO",
      "ENVIADO",
      "ENTREGADO",
      "ANULADA",
      "CANCELADO",
      "DEVOLUCION",
    ]);
    return (eligibleSales || []).filter(sale => {
      if (excludedStatuses.has(String(sale.status || "").toUpperCase())) return false;
      if (productionDateFrom && sale.saleDate < productionDateFrom) return false;
      if (productionDateTo && sale.saleDate > productionDateTo) return false;
      return true;
    });
  }, [eligibleSales, productionDateFrom, productionDateTo]);

  // ─── Resumen Mensual ──────────────────────────────────────────

  const loadMonthlySales = useCallback(async () => {
    setLoadingMonthly(true);
    try {
      const [year, month] = monthFilter.split("-").map(Number);
      const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const data = await getOnlineSalesByDateRange(startDate, endDate);
      setMonthlySales(data || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingMonthly(false);
    }
  }, [monthFilter]);

  useEffect(() => {
    if (activeTab === "mensual") loadMonthlySales();
  }, [monthFilter]); // eslint-disable-line

  const toggleSelectForPO = (id) => {
    setSelectedForPO(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredEligibleSales.map(s => s.id);
    const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedForPO.has(id));

    if (allFilteredSelected) {
      const next = new Set(selectedForPO);
      filteredIds.forEach(id => next.delete(id));
      setSelectedForPO(next);
    } else {
      const next = new Set(selectedForPO);
      filteredIds.forEach(id => next.add(id));
      setSelectedForPO(next);
    }
  };

  const selectAllForDay = () => {
    if (!productionBulkDate) return;
    const dayIds = (eligibleSales || [])
      .filter(s => s.saleDate === productionBulkDate)
      .map(s => s.id);
    setSelectedForPO(new Set(dayIds));
  };

  const clearProductionSelection = () => {
    setSelectedForPO(new Set());
  };

  const allFilteredSelected = filteredEligibleSales.length > 0
    && filteredEligibleSales.every(s => selectedForPO.has(s.id));

  const selectedInFiltered = filteredEligibleSales.filter(s => selectedForPO.has(s.id)).length;

  const saleInventorySource = (sale) => (fulfillmentPreview?.sourceMap || {})[String(sale.id)] || "";

  const saleIsPartial = (sale) => saleInventorySource(sale) === "PARCIAL";

  const saleHasBodegaStock = (sale) =>
    !saleIsPartial(sale)
    && fulfillmentPreview?.bodegaPtFound !== false
    && (fulfillmentPreview?.map || {})[String(sale.id)] === true;

  const saleNeedsProduction = (sale) =>
    !saleIsPartial(sale)
    && (
      fulfillmentPreview?.bodegaPtFound === false
      || (fulfillmentPreview?.map || {})[String(sale.id)] !== true
    );

  const saleLeatherOkForOpl = (sale) => {
    if (!saleNeedsProduction(sale)) return true;
    const v = (fulfillmentPreview?.leatherOkMap || {})[String(sale.id)];
    return v !== false;
  };

  const saleLeatherSummaryLines = (sale) =>
    (fulfillmentPreview?.leatherSummaryMap || {})[String(sale.id)] || [];

  const openResolveMixedModal = async (sale) => {
    setResolveSale(sale);
    setResolveItems([]);
    setResolveActions({});
    setResolveError("");
    setResolveLoading(true);
    try {
      const preview = await getSaleItemsPreview(sale.id);
      const items = Array.isArray(preview?.items) ? preview.items : [];
      setResolveItems(items);
      const initial = {};
      items.forEach((it, idx) => {
        const key = it.saleItemId != null ? String(it.saleItemId) : `idx-${idx}`;
        initial[key] = it.suggestedAction || "PRODUCE";
      });
      setResolveActions(initial);
    } catch (e) {
      setResolveError(e.message || "No se pudo cargar el detalle de la venta");
    } finally {
      setResolveLoading(false);
    }
  };

  const closeResolveMixedModal = () => {
    if (resolveSubmitting) return;
    setResolveSale(null);
    setResolveItems([]);
    setResolveActions({});
    setResolveError("");
  };

  const setResolveAction = (key, action) => {
    setResolveActions((prev) => ({ ...prev, [key]: action }));
  };

  const submitResolveMixed = async () => {
    if (!resolveSale) return;
    const payload = resolveItems
      .filter((it) => it.saleItemId != null)
      .map((it) => ({
        saleItemId: it.saleItemId,
        action: resolveActions[String(it.saleItemId)] || "PRODUCE",
      }));
    if (payload.length === 0) {
      setResolveError("La venta no tiene items detallados para resolver.");
      return;
    }
    const dispatchOverflow = resolveItems.find((it) => {
      const action = resolveActions[String(it.saleItemId)];
      return action === "DISPATCH" && Number(it.stockTotal || 0) < Number(it.quantity || 0);
    });
    if (dispatchOverflow) {
      setResolveError(`Stock insuficiente para ${dispatchOverflow.productCode}. Cambia su accion a Producir.`);
      return;
    }
    setResolveSubmitting(true);
    setResolveError("");
    try {
      const result = await resolveMixedSale(resolveSale.id, payload);
      const msg = result?.message || "Venta resuelta";
      const opMsg = result?.productionOrderCode ? ` OP: ${result.productionOrderCode}.` : "";
      const ko = Array.isArray(result?.kioskOutflows) ? result.kioskOutflows : [];
      const koMsg = ko.length ? ` Boletas kiosko: ${ko.map((k) => k.ticketNumber).join(", ")}.` : "";
      showNotification(msg + opMsg + koMsg);
      setResolveSale(null);
      setResolveItems([]);
      setResolveActions({});
      await loadEligibleSales();
      await loadSales();
    } catch (e) {
      setResolveError(e.message || "No se pudo resolver la venta");
    } finally {
      setResolveSubmitting(false);
    }
  };

  const visibleWithStock = filteredEligibleSales.filter(saleHasBodegaStock);
  const visibleWithoutStock = filteredEligibleSales.filter(saleNeedsProduction);
  const selectedWithStock = filteredEligibleSales.filter(sale => selectedForPO.has(sale.id) && saleHasBodegaStock(sale));
  const selectedWithoutStock = filteredEligibleSales.filter(sale => selectedForPO.has(sale.id) && saleNeedsProduction(sale));

  const applyProductionDateFilter = async () => {
    await loadEligibleSales();
  };

  const clearProductionDateFilter = async () => {
    setProductionDateFrom("");
    setProductionDateTo("");
    try {
      const data = await getEligibleForProduction();
      setEligibleSales(data || []);
      setSelectedForPO(new Set());
    } catch (e) {
      setError(e.message);
    }
  };

  const selectSalesWithBodegaStock = () => {
    setSelectedForPO(new Set(visibleWithStock.map(sale => sale.id)));
  };

  const selectSalesWithoutBodegaStock = () => {
    setSelectedForPO(new Set(visibleWithoutStock.map(sale => sale.id)));
  };

  /**
   * Bodega PT: descuenta inventario y deja la venta en PRODUCIDO,
   * que para ventas online significa "lista para preparar/despachar".
   */
  const handleMarkReadyFromBodega = async () => {
    const ids = selectedWithStock.map(sale => sale.id);
    if (ids.length === 0) {
      showNotification("Selecciona ventas marcadas con stock en Bodega PT / Devoluciones.");
      return;
    }
    setLoadingPO(true);
    try {
      const result = await processFulfillment(ids);
      setFulfillmentResult(result);
      setShowFulfillmentModal(true);
      setSelectedForPO(new Set());
      loadEligibleSales();
      loadSales();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingPO(false);
    }
  };

  const handleCreatePO = async () => {
    const ids = selectedWithoutStock.map(sale => sale.id);
    if (ids.length === 0) {
      showNotification("Selecciona ventas sin stock en Bodega PT / Devoluciones para enviarlas a producción.");
      return;
    }
    setLoadingPO(true);
    try {
      const result = await createProductionOrderFromSales(ids);
      let msg = result.message || "Órdenes creadas";
      if (result.ordersCreated > 1 && result.productionOrderCodes) {
        msg = `${result.ordersCreated} OPs creadas: ${result.productionOrderCodes.join(", ")}`;
      }
      const ko = Array.isArray(result.kioskOutflows) ? result.kioskOutflows : [];
      if (ko.length) {
        msg += ` Salida cuero desde kiosko: ${ko.map((k) =>
          `${k.ticketNumber || ""}${k.kioskName ? ` (${k.kioskName})` : ""}`).join(", ")}.`;
      }
      if (result.tasksError) {
        msg += ` — Atención (tareas): ${result.tasksError}`;
      }
      showNotification(msg);
      setSelectedForPO(new Set());
      loadEligibleSales();
      loadSales();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingPO(false);
    }
  };

  // ─── Filtros en frontend ────────────────────────────────────────

  const filteredSales = useMemo(() => {
    let result = sales;
    if (filterSalesperson) result = result.filter(s => s.salesperson === filterSalesperson);
    if (filterSocial) result = result.filter(s => s.socialNetwork === filterSocial);
    if (filterStatus) result = result.filter(s => s.status === filterStatus);
    return result;
  }, [sales, filterSalesperson, filterSocial, filterStatus]);

  const exportSalesRows = activeTab === "resumen" ? summarySales : sales;
  const exportSalesFiltered = useMemo(() => {
    if (activeTab === "resumen") return exportSalesRows;
    return filteredSales;
  }, [activeTab, exportSalesRows, filteredSales]);

  const exportDateLabel = activeTab === "resumen" ? summaryRangeLabel : filterDate;

  const saleProductionProgress = useMemo(() => {
    const map = {};
    (warehouseOrders || [])
      .filter((o) => o?.dispatchType === "CUSTOMER_SHIPMENTS")
      .forEach((order) => {
        const bySale = {};
        (order.items || []).forEach((it) => {
          const saleId = Number(it?.onlineSaleId);
          if (!saleId) return;
          if (!bySale[saleId]) bySale[saleId] = { total: 0, produced: 0 };
          const planned = Number(it?.quantity || 0);
          const received = Number(it?.warehouseReceivedQty || 0);
          bySale[saleId].total += planned;
          bySale[saleId].produced += Math.min(Math.max(received, 0), Math.max(planned, 0));
        });
        Object.entries(bySale).forEach(([saleId, progress]) => {
          const prev = map[saleId] || { total: 0, produced: 0 };
          map[saleId] = {
            total: prev.total + progress.total,
            produced: prev.produced + progress.produced,
          };
        });
      });
    Object.keys(map).forEach((saleId) => {
      const p = map[saleId];
      p.pending = Math.max(p.total - p.produced, 0);
      p.pct = p.total > 0 ? Math.round((p.produced / p.total) * 100) : 0;
    });
    return map;
  }, [warehouseOrders]);

  const getSaleLogisticsStage = (sale) => {
    if (!sale) return { label: "Sin datos", color: "secondary" };
    if (isDispatchedStatus(sale.status)) return { label: "Enviado", color: "success" };
    const sn = sale.shipmentNumber ? ` · ${sale.shipmentNumber}` : "";
    if (sale.status === "PRODUCIDO") return { label: `Listo para despachar${sn}`, color: "primary" };
    const progress = saleProductionProgress[String(sale.id)];
    if (!progress || progress.total <= 0 || progress.produced <= 0) {
      return { label: `Pendiente en producción${sn}`, color: "warning" };
    }
    if (progress.produced < progress.total) return { label: `En producción${sn}`, color: "info" };
    return { label: `En bodega PT${sn}`, color: "primary" };
  };

  const shipmentSales = useMemo(() => {
    let result = (sales || []).filter(s =>
      s.status !== "ANULADA" && s.status !== "DEVOLUCION" && s.status !== "CANCELADO"
    );
    if (filterStatus) result = result.filter(s => s.status === filterStatus);
    return result;
  }, [sales, filterStatus]);

  // ─── Form helpers ───────────────────────────────────────────────

  function getEmptyForm() {
    return {
      customerName: "", address: "", phone: "", phone2: "", packaging: false,
      paymentMethod: "CONTRA_ENTREGA", invoiceTaxId: "CF",
      items: [emptyItem()],
      shippingCost: String(getShippingCost("CONTRA_ENTREGA") || 0),
      shippingCarrier: "FORZA_DELIVERY",
      saleDate: today(), socialNetwork: "WHATSAPP", email: "",
      guideNumber: "", paymentAuthorization: "",
      observations: "", salesperson: "Anthony Ixcajo"
    };
  }

  const openNewForm = () => {
    setEditingId(null);
    setFormData({ ...getEmptyForm(), saleDate: filterDate });
    setShowForm(true);
  };

  const openEditForm = (sale) => {
    setEditingId(sale.id);
    // Construir items desde la respuesta
    const saleItems = (sale.items && sale.items.length > 0)
      ? sale.items.map(it => ({
          productId: it.productId || null,
          colorId: it.colorId || null,
          size: it.size || "",
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || ""
        }))
      : [{ productId: sale.productId || null, colorId: sale.colorId || null,
           size: sale.size || "", quantity: sale.quantity || 1, unitPrice: sale.unitPrice || "" }];

    setFormData({
      customerName: sale.customerName || "",
      address: sale.address || "",
      phone: sale.phone || "",
      phone2: sale.phone2 || "",
      packaging: sale.packaging || false,
      paymentMethod: sale.paymentMethod || "CONTRA_ENTREGA",
      invoiceTaxId: sale.invoiceTaxId || "CF",
      items: saleItems,
      shippingCost: String((sale.shippingCost != null ? sale.shippingCost : getShippingCost(sale.paymentMethod)) ?? 0),
      shippingCarrier: sale.shippingCarrier || "FORZA_DELIVERY",
      saleDate: sale.saleDate || today(),
      socialNetwork: sale.socialNetwork || "WHATSAPP",
      email: sale.email || "",
      guideNumber: sale.guideNumber || "",
      paymentAuthorization: sale.paymentAuthorization || "",
      observations: sale.observations || "",
      salesperson: sale.salesperson || "Anthony Ixcajo"
    });
    setShowForm(true);
  };

  // Cálculo automático para multi-items
  // Neto = suma de subtotales de productos (precio sin envío)
  // Total = Neto + Envío
  const computedShipping = getShippingCost(formData.paymentMethod);
  const effectiveShipping = (() => {
    const v = parseFloat(formData.shippingCost);
    if (Number.isFinite(v) && v >= 0) return v;
    return parseFloat(computedShipping) || 0;
  })();
  const computedNet = useMemo(() => {
    return (formData.items || []).reduce((sum, it) => {
      const price = parseFloat(it.unitPrice) || 0;
      const qty = parseInt(it.quantity) || 1;
      return sum + (price * qty);
    }, 0);
  }, [formData.items]);
  const computedTotal = computedNet > 0 ? computedNet + effectiveShipping : 0;

  // Item handlers
  const updateItem = (index, field, value) => {
    setFormData(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      return { ...prev, items };
    });
  };

  const addItem = () => {
    setFormData(prev => ({ ...prev, items: [...prev.items, emptyItem()] }));
  };

  const removeItem = (index) => {
    setFormData(prev => {
      const items = prev.items.filter((_, i) => i !== index);
      return { ...prev, items: items.length > 0 ? items : [emptyItem()] };
    });
  };

  const handleItemProductSelect = (index, product) => {
    setFormData(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], productId: product.id, unitPrice: product.salePrice || "" };
      return { ...prev, items };
    });
  };

  const handleItemColorSelect = (index, color) => {
    updateItem(index, "colorId", color.id);
  };

  const handleSave = async () => {
    if (!formData.customerName) { setError("Nombre del cliente es requerido"); return; }
    if (!formData.salesperson) { setError("Seleccione un vendedor"); return; }
    const validItems = (formData.items || []).filter(it => it.productId);
    if (validItems.length === 0) { setError("Agregue al menos un producto"); return; }

    setLoading(true);
    setError("");
    try {
      const payload = {
        customerName: formData.customerName,
        address: formData.address,
        phone: formData.phone,
        phone2: formData.phone2,
        packaging: formData.packaging,
        paymentMethod: formData.paymentMethod,
        invoiceTaxId: formData.invoiceTaxId,
        shippingCost: effectiveShipping,
        shippingCarrier: formData.shippingCarrier,
        saleDate: formData.saleDate,
        socialNetwork: formData.socialNetwork,
        email: formData.email,
        guideNumber: formData.guideNumber,
        paymentAuthorization: formData.paymentAuthorization,
        observations: formData.observations,
        salesperson: formData.salesperson,
        items: validItems.map(it => ({
          productId: it.productId,
          colorId: it.colorId || null,
          size: it.size || null,
          quantity: parseInt(it.quantity) || 1,
          unitPrice: parseFloat(it.unitPrice) || 0
        }))
      };

      if (editingId) {
        await updateOnlineSale(editingId, payload);
        showNotification("Venta actualizada correctamente");
      } else {
        await createOnlineSale(payload);
        showNotification("Venta registrada correctamente");
      }
      setShowForm(false);
      loadSales();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const openFelInvoiceModal = (sale) => {
    setError("");
    setFelInvoiceModal({ phase: "preview", sale });
  };

  const closeFelInvoiceModal = () => {
    if (felInvoiceLoadingId) return;
    setFelInvoiceModal(null);
  };

  const openFelEditModal = (sale) => {
    if (!sale?.invoiceId) return;
    setFelEditTarget({
      saleId: sale.id,
      invoiceId: sale.invoiceId,
      felUuid: sale.invoiceFelUuid,
      felSerie: sale.invoiceFelSerie,
      felNumero: sale.invoiceFelNumero,
      felCertifiedAt: sale.invoiceFelCertifiedAt,
    });
  };

  const handleFelMetadataSaved = async (updated) => {
    if (!updated?.id) return;
    setSales((prev) => prev.map((s) => (s.id === felEditTarget?.saleId ? {
      ...s,
      invoiceStatus: updated.status,
      invoiceFelUuid: updated.felUuid,
      invoiceFelSerie: updated.felSerie,
      invoiceFelNumero: updated.felNumero,
      invoiceFelError: updated.felError,
      invoiceFelCertifiedAt: updated.felCertifiedAt,
    } : s)));
    setFelInvoiceModal((prev) => (
      prev?.sale?.id === felEditTarget?.saleId
        ? { ...prev, invoice: updated }
        : prev
    ));
    await loadSales();
  };

  const handleDownloadCertifiedFelInvoice = (sale) => {
    if (!canDownloadFelInvoice(sale)) {
      showNotification("No hay factura certificada para descargar.", "warning");
      return;
    }
    try {
      setError("");
      openFelInvoiceReport(sale.invoiceFelUuid);
    } catch (e) {
      setError(e.message || "No se pudo descargar la factura FEL.");
    }
  };

  const confirmGenerateFelInvoice = async () => {
    const sale = felInvoiceModal?.sale;
    if (!sale?.id) return;
    try {
      setFelInvoiceLoadingId(sale.id);
      setError("");
      const invoice = await issueTaxInvoiceFromOnlineSale(sale.id);
      setSales((prev) => prev.map((s) => (s.id === sale.id ? {
        ...s,
        invoiceId: invoice.id,
        invoiceStatus: invoice.status,
        invoiceFelUuid: invoice.felUuid,
        invoiceFelSerie: invoice.felSerie,
        invoiceFelNumero: invoice.felNumero,
        invoiceFelError: invoice.felError,
        invoiceFelCertifiedAt: invoice.felCertifiedAt,
      } : s)));
      setFelInvoiceModal({ phase: "result", sale, invoice });
      loadSales();
      showNotification(invoice.status === "CERTIFIED"
        ? "Factura FEL certificada correctamente."
        : "Factura registrada; revise el estado FEL.");
    } catch (e) {
      setError(e.message || "No se pudo generar la factura FEL.");
    } finally {
      setFelInvoiceLoadingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Eliminar esta venta?")) return;
    try {
      await deleteOnlineSale(id);
      showNotification("Venta eliminada");
      loadSales();
    } catch (e) {
      setError(e.message);
    }
  };

  // ─── Devolución / Anulación ────────────────────────────────────

  const openReturnModal = (saleId) => {
    setActionSaleId(saleId);
    setReturnReason("");
    setReturnCondition("BUENO");
    setShowReturnModal(true);
  };

  const handleReturn = async () => {
    if (!actionSaleId) return;
    try {
      await returnOnlineSale(actionSaleId, { reason: returnReason, itemCondition: returnCondition });
      showNotification("Venta marcada como DEVOLUCIÓN. Productos ingresados al inventario de devoluciones.");
      setShowReturnModal(false);
      loadSales();
    } catch (e) {
      setError(e.message);
    }
  };

  const openVoidModal = (saleId) => {
    setActionSaleId(saleId);
    setVoidReason("");
    setShowVoidModal(true);
  };

  const handleVoid = async () => {
    if (!actionSaleId) return;
    try {
      await voidOnlineSale(actionSaleId, voidReason);
      showNotification("Venta ANULADA exitosamente");
      setShowVoidModal(false);
      loadSales();
    } catch (e) {
      setError(e.message);
    }
  };

  const isDispatchedStatus = (status) => status === "ENVIADO" || status === "ENTREGADO";

  const openShipmentModal = (sale) => {
    setShipmentSale(sale);
    const nextForm = {
      shippingCarrier: sale.shippingCarrier || "FORZA_DELIVERY",
      guideNumber: sale.guideNumber || "",
      observations: ""
    };
    setShipmentForm(nextForm);
    setShowShipmentModal(true);

    // Guardar de una vez (asigna ENVL si aplica) al abrir “Preparar envío”
    // El usuario luego puede ajustar campos; se auto-guardan en onBlur.
    (async () => {
      try {
        const updated = await registerOnlineSaleShipment(sale.id, {
          shippingCarrier: nextForm.shippingCarrier,
          guideNumber: nextForm.guideNumber || "",
          observations: nextForm.observations || "",
        });
        setSales(prev => prev.map(s => (s.id === updated.id ? updated : s)));
        setShipmentSale(updated);
      } catch (e) {
        // No bloquea el modal; solo muestra error si falla
        setError(e?.message || "No se pudo guardar la preparación del envío.");
      }
    })();
  };

  const openExchangeModal = (sale) => {
    setExchangeOriginalSale(sale);
    const items = (sale?.items && sale.items.length > 0)
      ? sale.items.map((it, idx) => ({
          key: it.id || `${sale.id}-it-${idx}`,
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          colorId: it.colorId ?? null,
          colorName: it.colorName,
          size: it.size || "",
          quantity: parseInt(it.quantity, 10) || 1,
          selected: true,
        }))
      : [{
          key: `${sale?.id}-legacy`,
          productId: sale.productId,
          productCode: sale.productCode,
          productName: sale.productName,
          colorId: sale.colorId ?? null,
          colorName: sale.colorName,
          size: sale.size || "",
          quantity: parseInt(sale.quantity, 10) || 1,
          selected: true,
        }];
    setExchangeItems(items.filter(i => i.productId));
    setExchangeForm({
      shippingCarrier: sale?.shippingCarrier || "FORZA_DELIVERY",
      guideNumber: "",
      observations: "CAMBIO por producto dañado / parcial",
    });
    setExchangeCreatedSale(null);
    setShowExchangeModal(true);
  };

  const handleCreateExchange = async () => {
    if (!exchangeOriginalSale) return;
    const selected = (exchangeItems || []).filter((it) => it.selected && it.productId && (it.quantity || 0) > 0);
    if (selected.length === 0) {
      setError("Seleccione al menos un item con cantidad para el CAMBIO.");
      return;
    }
    try {
      setCreatingExchange(true);
      const created = await createOnlineSaleExchange(exchangeOriginalSale.id, {
        shippingCarrier: exchangeForm.shippingCarrier,
        guideNumber: exchangeForm.guideNumber || "",
        observations: exchangeForm.observations || "",
        items: selected.map((it) => ({
          productId: it.productId,
          colorId: it.colorId ?? null,
          size: it.size || "",
          quantity: parseInt(it.quantity, 10) || 1,
        })),
      });
      setExchangeCreatedSale(created);
      showNotification(`CAMBIO creado · ${created.shipmentNumber || created.id}`);
    } catch (e) {
      setError(e.message || "No se pudo crear el CAMBIO.");
    } finally {
      setCreatingExchange(false);
    }
  };

  const printExchangeDocument = (exchangeSale) => {
    if (!exchangeSale) return;
    const related = exchangeOriginalSale?.shipmentNumber
      ? `Envío ${exchangeOriginalSale.shipmentNumber}`
      : (exchangeOriginalSale?.saleNumber ? `Pedido #${exchangeOriginalSale.saleNumber}` : "");
    printShipmentDocument(exchangeSale, {
      docType: "CAMBIO",
      docNo: String(exchangeSale.shipmentNumber || exchangeSale.saleNumber || exchangeSale.id || ""),
      relatedShipmentNumber: related,
      shippingCost: 0,
      netAmount: 0,
      totalAmount: 0,
    });
  };

  const downloadExchangePdf = async (exchangeSale) => {
    if (!exchangeSale) return;
    const related = exchangeOriginalSale?.shipmentNumber
      ? `Envío ${exchangeOriginalSale.shipmentNumber}`
      : (exchangeOriginalSale?.saleNumber ? `Pedido #${exchangeOriginalSale.saleNumber}` : "");
    await downloadShipmentPdf(exchangeSale, {
      docType: "CAMBIO",
      docNo: String(exchangeSale.shipmentNumber || exchangeSale.saleNumber || exchangeSale.id || ""),
      relatedShipmentNumber: related,
      shippingCost: 0,
      netAmount: 0,
      totalAmount: 0,
    });
  };

  const printShipmentDocument = async (sale, opts = {}) => {
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      setError("No se pudo abrir la ventana de impresión. Verifique bloqueador de ventanas.");
      return;
    }
    let qrDataUrl = "";
    const docType = String(opts?.docType || "ENVIO").toUpperCase();
    if (docType === "ENVIO" && sale?.id) {
      try {
        const url = buildPtDispatchOnlineUrl(getPublicFrontBaseUrl(), {
          onlineSaleId: sale.id,
          productionOrderId: sale.productionOrderId,
        });
        qrDataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1 });
      } catch (_e) {
        qrDataUrl = "";
      }
    }
    printWindow.document.write(buildShipmentDocumentHtml(sale, { ...opts, qrDataUrl }));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const downloadShipmentPdf = async (sale, opts) => {
    if (!sale) return;
    let qrDataUrl = "";
    const docType = String(opts?.docType || "ENVIO").toUpperCase();
    if (docType === "ENVIO" && sale?.id) {
      try {
        const url = buildPtDispatchOnlineUrl(getPublicFrontBaseUrl(), {
          onlineSaleId: sale.id,
          productionOrderId: sale.productionOrderId,
        });
        qrDataUrl = await QRCode.toDataURL(url, { width: 160, margin: 1 });
      } catch (_e) {
        qrDataUrl = "";
      }
    }
    const html = buildShipmentDocumentHtml(sale, { ...opts, qrDataUrl });
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:816px;background:#fff;";
    host.innerHTML = html;
    document.body.appendChild(host);
    const docEl = host.querySelector(".doc") || host;
    try {
      const canvas = await html2canvas(docEl, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "letter" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const imgW = pageW;
      const imgH = (canvas.height * imgW) / canvas.width;
      let heightLeft = imgH;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
      heightLeft -= pageH;
      while (heightLeft > 0) {
        position = heightLeft - imgH;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgW, imgH);
        heightLeft -= pageH;
      }
      const docType = String(opts?.docType || "ENVIO").toUpperCase();
      const prefix = docType === "DEVOLUCION" ? "Devolucion" : (docType === "CAMBIO" ? "Cambio" : "Envio");
      const docNo = String(opts?.docNo || sale.shipmentNumber || sale.saleNumber || sale.id || "");
      pdf.save(`${prefix}-${docNo}.pdf`);
    } catch (e) {
      setError(e?.message || "No se pudo generar el PDF del envío.");
    } finally {
      document.body.removeChild(host);
    }
  };

  const buildReturnPrintObservation = (dto) => {
    const parts = [];
    const reason = String(dto?.returnReason ?? "").trim();
    const condition = String(dto?.itemCondition ?? "").trim();
    if (reason) parts.push(reason);
    if (condition) parts.push(`Condición: ${condition}`);
    return parts.join(" | ");
  };

  const printReturnDocument = async (returnId) => {
    try {
      const dto = await getReturnForPrint(returnId);
      const saleLike = {
        id: dto.onlineSaleId,
        saleNumber: dto.saleNumber,
        shipmentNumber: dto.relatedShipmentNumber || "",
        customerName: dto.customerName,
        address: dto.address,
        phone: dto.phone,
        phone2: dto.phone2,
        saleDate: dto.returnDate,
        shippingCarrier: "",
        guideNumber: "",
        invoiceTaxId: "CF",
        salesperson: "",
        paymentMethod: "",
        netAmount: dto.totalAmount || 0,
        shippingCost: 0,
        totalAmount: dto.totalAmount || 0,
        items: (dto.items || []).map((it) => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          colorId: it.colorId,
          colorName: it.colorName,
          size: it.size,
          quantity: it.quantity,
          unitPrice: it.unitPrice || 0,
          subtotal: it.subtotal || 0,
        })),
      };
      printShipmentDocument(saleLike, {
        docType: "DEVOLUCION",
        docNo: String(dto.returnId),
        relatedShipmentNumber: dto.relatedShipmentNumber ? `Envío ${dto.relatedShipmentNumber}` : "",
        shippingCost: 0,
        netAmount: dto.totalAmount || 0,
        totalAmount: dto.totalAmount || 0,
        shipmentObservations: buildReturnPrintObservation(dto),
      });
    } catch (e) {
      setError(e.message || "No se pudo imprimir la devolución.");
    }
  };

  const downloadReturnPdf = async (returnId) => {
    try {
      const dto = await getReturnForPrint(returnId);
      const saleLike = {
        id: dto.onlineSaleId,
        saleNumber: dto.saleNumber,
        shipmentNumber: dto.relatedShipmentNumber || "",
        customerName: dto.customerName,
        address: dto.address,
        phone: dto.phone,
        phone2: dto.phone2,
        saleDate: dto.returnDate,
        shippingCarrier: "",
        guideNumber: "",
        invoiceTaxId: "CF",
        salesperson: "",
        paymentMethod: "",
        netAmount: dto.totalAmount || 0,
        shippingCost: 0,
        totalAmount: dto.totalAmount || 0,
        items: (dto.items || []).map((it) => ({
          productId: it.productId,
          productCode: it.productCode,
          productName: it.productName,
          colorId: it.colorId,
          colorName: it.colorName,
          size: it.size,
          quantity: it.quantity,
          unitPrice: it.unitPrice || 0,
          subtotal: it.subtotal || 0,
        })),
      };
      await downloadShipmentPdf(saleLike, {
        docType: "DEVOLUCION",
        docNo: String(dto.returnId),
        relatedShipmentNumber: dto.relatedShipmentNumber ? `Envío ${dto.relatedShipmentNumber}` : "",
        shippingCost: 0,
        netAmount: dto.totalAmount || 0,
        totalAmount: dto.totalAmount || 0,
        shipmentObservations: buildReturnPrintObservation(dto),
      });
    } catch (e) {
      setError(e.message || "No se pudo descargar el PDF de la devolución.");
    }
  };

  const handleRegisterShipment = async () => {
    if (!shipmentSale) return;
    if (!shipmentForm.shippingCarrier) {
      setError("Seleccione el transporte del envío.");
      return;
    }
    try {
      const updated = await registerOnlineSaleShipment(shipmentSale.id, {
        shippingCarrier: shipmentForm.shippingCarrier,
        guideNumber: shipmentForm.guideNumber || "",
        observations: shipmentForm.observations || ""
      });
      setSales(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      setShipmentSale(updated);
      const envLabel = updated.shipmentNumber
        ? `Preparación guardada · ${updated.shipmentNumber}`
        : "Datos de envío guardados";
      showNotification(`${envLabel} — pedido #${updated.saleNumber || updated.id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  const autoSaveShipmentPrep = async () => {
    if (!shipmentSale) return;
    if (!shipmentForm.shippingCarrier) return;
    try {
      const updated = await registerOnlineSaleShipment(shipmentSale.id, {
        shippingCarrier: shipmentForm.shippingCarrier,
        guideNumber: shipmentForm.guideNumber || "",
        observations: shipmentForm.observations || ""
      });
      setSales(prev => prev.map(s => (s.id === updated.id ? updated : s)));
      setShipmentSale(updated);
    } catch (e) {
      setError(e?.message || "No se pudo actualizar la preparación del envío.");
    }
  };

  // ─── Inline editing ────────────────────────────────────────────

  const startInlineEdit = (sale, field) => {
    setEditCell({ id: sale.id, field });
    setEditValue(sale[field] ?? "");
  };

  const saveInlineEdit = async () => {
    if (!editCell) return;
    const { id, field } = editCell;
    try {
      await updateOnlineSale(id, { [field]: editValue });
      setSales(prev => prev.map(s => s.id === id ? { ...s, [field]: editValue } : s));
    } catch (e) {
      setError(e.message);
    }
    setEditCell(null);
  };

  const renderInlineCell = (sale, field, type = "text", options = null) => {
    const isEditing = editCell && editCell.id === sale.id && editCell.field === field;
    if (isEditing) {
      if (options) {
        return (
          <Input type="select" bsSize="sm" value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={saveInlineEdit} autoFocus
            style={{ minWidth: 120 }}>
            {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Input>
        );
      }
      return (
        <Input type={type} bsSize="sm" value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={saveInlineEdit} onKeyDown={e => e.key === "Enter" && saveInlineEdit()}
          autoFocus style={{ minWidth: 80 }} />
      );
    }
    return (
      <span style={{ cursor: "pointer", borderBottom: "1px dashed #ccc" }}
        onClick={() => startInlineEdit(sale, field)}>
        {sale[field] || "—"}
      </span>
    );
  };

  // ─── Notificaciones ────────────────────────────────────────────

  const showNotification = (msg) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  // ─── CSV Import handlers ──────────────────────────────────────

  const handleCSVFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const parsed = parseCSVSales(evt.target.result);
        if (parsed.length === 0) {
          setError("No se encontraron ventas válidas en el archivo CSV.");
          return;
        }
        setImportPreview(parsed);
        setShowImportModal(true);
      } catch (err) {
        setError("Error al leer el CSV: " + err.message);
      }
    };
    reader.readAsText(file, "latin1");
    if (csvInputRef.current) csvInputRef.current.value = "";
  };

  const handleImportCSV = async () => {
    if (!importPreview || importPreview.length === 0) return;
    setImportingCSV(true);
    try {
      const result = await importOnlineSales(importPreview);
      showNotification(`Importación completada: ${result.imported} nuevas` +
        (result.skipped > 0 ? `, ${result.skipped} ya existentes (omitidas)` : "") +
        (result.errors > 0 ? `, ${result.errors} errores` : ""));
      setShowImportModal(false);
      setImportPreview(null);
      loadSales();
    } catch (err) {
      setError("Error al importar: " + err.message);
    } finally {
      setImportingCSV(false);
    }
  };

  // ─── Exportar Excel ───────────────────────────────────────────

  const exportToExcel = () => {
    // Generar filas expandiendo items — una fila por item, datos de venta solo en la primera
    const rows = [];
    exportSalesFiltered.forEach((s, i) => {
      const items = (s.items && s.items.length > 0) ? s.items : [
        { productCode: s.productCode, productName: s.productName, colorName: s.colorName,
          size: s.size, quantity: s.quantity || 1, unitPrice: s.unitPrice, subtotal: s.totalAmount }
      ];
      items.forEach((it, idx) => {
        rows.push({
          "No.": idx === 0 ? (s.saleNumber || i + 1) : "",
          "Nombre": idx === 0 ? (s.customerName || "") : "",
          "Teléfono": idx === 0 ? (s.phone || "") : "",
          "Teléfono 2": idx === 0 ? (s.phone2 || "") : "",
          "Dirección": idx === 0 ? (s.address || "") : "",
          "Empaque": idx === 0 ? (s.packaging ? "Sí" : "No") : "",
          "Forma de Pago": idx === 0 ? (PAYMENT_METHODS.find(p => p.value === s.paymentMethod)?.label || s.paymentMethod) : "",
          "Factura": idx === 0 ? (s.invoiceTaxId || "") : "",
          "Código": it.productCode || "",
          "Producto": it.productName || "",
          "Color": it.colorName || "",
          "Talla": it.size || "",
          "Cantidad": it.quantity || 1,
          "P. Unitario": parseFloat(it.unitPrice) || 0,
          "Subtotal": parseFloat(it.subtotal) || 0,
          "Total": idx === 0 ? (parseFloat(s.totalAmount) || 0) : "",
          "Envío": idx === 0 ? (parseFloat(s.shippingCost) || 0) : "",
          "Sin Envío": idx === 0 ? (parseFloat(s.netAmount) || 0) : "",
          "Transporte": idx === 0 ? (SHIPPING_CARRIERS.find(c => c.value === s.shippingCarrier)?.label || s.shippingCarrier || "") : "",
          "Red Social": idx === 0 ? (SOCIAL_NETWORKS.find(sn => sn.value === s.socialNetwork)?.label || s.socialNetwork || "") : "",
          "Vendedor": idx === 0 ? (s.salesperson || "") : "",
          "Estado": idx === 0 ? (SALE_STATUSES.find(st => st.value === s.status)?.label || s.status || "") : "",
          "Guía": idx === 0 ? (s.guideNumber || "") : "",
          "Autorización": idx === 0 ? (s.paymentAuthorization || "") : "",
          "Observación": idx === 0 ? (s.observations || "") : ""
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);

    // Ajustar anchos de columna
    const colWidths = Object.keys(rows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...rows.map(r => String(r[key] || "").length)) + 2
    }));
    ws["!cols"] = colWidths;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas Online");

    if (activeTab === "resumen" && summary) {
      const summaryRows = [
        { "Concepto": "Total Ventas", "Valor": summary.totalSalesCount },
        { "Concepto": "Total Bruto", "Valor": parseFloat(summary.totalAmount) || 0 },
        { "Concepto": "Total Neto", "Valor": parseFloat(summary.totalNetAmount) || 0 },
        { "Concepto": "Total Envíos", "Valor": (parseFloat(summary.totalAmount) || 0) - (parseFloat(summary.totalNetAmount) || 0) },
        { "Concepto": "", "Valor": "" },
        { "Concepto": "--- POR VENDEDOR ---", "Valor": "" },
        ...(summary.bySeller || []).flatMap(s => {
          const netAmt = parseFloat(s.totalNetAmount) || 0;
          return [
            { "Concepto": `${s.salesperson} - Ventas`, "Valor": s.salesCount },
            { "Concepto": `${s.salesperson} - Total`, "Valor": parseFloat(s.totalAmount) || 0 },
            { "Concepto": `${s.salesperson} - Neto`, "Valor": netAmt },
            { "Concepto": `${s.salesperson} - Comisión (2%)`, "Valor": +(netAmt * 0.02).toFixed(2) },
          ];
        }),
        { "Concepto": "", "Valor": "" },
        { "Concepto": "--- POR RED SOCIAL ---", "Valor": "" },
        ...(summary.bySocialNetwork || []).flatMap(g => [
          { "Concepto": `${g.name} - Ventas`, "Valor": g.salesCount },
          { "Concepto": `${g.name} - Total`, "Valor": parseFloat(g.totalAmount) || 0 },
          { "Concepto": `${g.name} - Neto`, "Valor": parseFloat(g.totalNetAmount) || 0 },
        ]),
        { "Concepto": "", "Valor": "" },
        { "Concepto": "--- POR FORMA DE PAGO ---", "Valor": "" },
        ...(summary.byPaymentMethod || []).flatMap(g => [
          { "Concepto": `${g.name} - Ventas`, "Valor": g.salesCount },
          { "Concepto": `${g.name} - Total`, "Valor": parseFloat(g.totalAmount) || 0 },
          { "Concepto": `${g.name} - Neto`, "Valor": parseFloat(g.totalNetAmount) || 0 },
        ]),
        { "Concepto": "", "Valor": "" },
        { "Concepto": "--- POR ESTADO ---", "Valor": "" },
        ...Object.entries(summary.byStatus || {}).map(([k, v]) => ({
          "Concepto": SALE_STATUSES.find(s => s.value === k)?.label || k, "Valor": v
        })),
      ];
      const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
      wsSummary["!cols"] = [{ wch: 35 }, { wch: 15 }];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Resumen Diario");
    }

    const fileSuffix = String(exportDateLabel).replace(/\s+/g, "_").replace(/[^\w\-_.]/g, "");
    XLSX.writeFile(wb, `Ventas_Online_${fileSuffix}.xlsx`);
    showNotification("Excel descargado correctamente");
  };

  // ─── Exportar PDF ─────────────────────────────────────────────

  const exportToPDF = () => {
    const pmLabel = (v) => PAYMENT_METHODS.find(p => p.value === v)?.label || v || "";
    const snLabel = (v) => SOCIAL_NETWORKS.find(s => s.value === v)?.label || v || "";
    const stLabel = (v) => SALE_STATUSES.find(s => s.value === v)?.label || v || "";
    const carrierLabel = (v) => SHIPPING_CARRIERS.find(c => c.value === v)?.label || v || "";

    const totalBruto = exportSalesFiltered.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0);
    const totalNeto = exportSalesFiltered.reduce((s, r) => s + (parseFloat(r.netAmount) || 0), 0);
    const totalEnvios = totalBruto - totalNeto;

    const salesRows = exportSalesFiltered.map((s, i) => {
      const items = (s.items && s.items.length > 0) ? s.items : [
        { productCode: s.productCode, productName: s.productName, colorName: s.colorName,
          size: s.size, quantity: s.quantity || 1, unitPrice: s.unitPrice, subtotal: s.totalAmount }
      ];
      const itemCount = items.length;
      const itemRows = items.map((it, idx) => `
        <tr>
          ${idx === 0 ? `<td rowspan="${itemCount}">${s.saleNumber || i + 1}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${s.customerName || ""}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${s.phone || ""}${s.phone2 ? "<br/>" + s.phone2 : ""}</td>` : ""}
          <td>${it.productCode || ""} <small>${it.productName || ""}</small></td>
          <td>${it.colorName || ""}</td>
          <td>${it.size || ""}</td>
          <td style="text-align:center">${it.quantity || 1}</td>
          <td style="text-align:right">${formatQ(it.subtotal)}</td>
          ${idx === 0 ? `<td rowspan="${itemCount}" style="text-align:right;font-weight:600">${formatQ(s.totalAmount)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}" style="text-align:right">${formatQ(s.shippingCost)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}" style="text-align:right;font-weight:600;color:#2e7d32">${formatQ(s.netAmount)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${pmLabel(s.paymentMethod)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${carrierLabel(s.shippingCarrier)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${snLabel(s.socialNetwork)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${stLabel(s.status)}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${s.guideNumber || ""}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}">${s.paymentAuthorization || ""}</td>` : ""}
          ${idx === 0 ? `<td rowspan="${itemCount}" style="font-size:10px">${s.observations || ""}</td>` : ""}
        </tr>`).join("");
      return itemRows;
    }).join("");

    // Resumen por vendedor con comisión 2% sobre neto
    const COMMISSION_RATE = 0.02;
    const sellerSummaryRows = (summary?.bySeller || []).map(s => {
      const commission = (parseFloat(s.totalNetAmount) || 0) * COMMISSION_RATE;
      return `
      <tr>
        <td>${s.salesperson}</td>
        <td style="text-align:center">${s.salesCount}</td>
        <td style="text-align:right">${formatQ(s.totalAmount)}</td>
        <td style="text-align:right;color:#2e7d32">${formatQ(s.totalNetAmount)}</td>
        <td style="text-align:right;color:#1565c0;font-weight:600">${formatQ(commission)}</td>
      </tr>`;
    }).join("");

    const html = `<!DOCTYPE html><html><head><title>Ventas Online - ${exportDateLabel}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 15px; color: #333; }
      h2 { margin: 0 0 5px 0; font-size: 16px; }
      h3 { margin: 15px 0 5px 0; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
      .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px; }
      .summary-cards { display: flex; gap: 15px; margin-bottom: 12px; }
      .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 8px 14px; text-align: center; flex: 1; }
      .summary-card .value { font-size: 18px; font-weight: 700; }
      .summary-card .label { font-size: 10px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
      th, td { border: 1px solid #ddd; padding: 3px 5px; font-size: 10px; }
      th { background: #f5f5f5; font-weight: 600; text-align: left; }
      tr:nth-child(even) { background: #fafafa; }
      .totals { font-weight: 700; background: #e8f5e9 !important; }
      @media print { body { margin: 8px; } }
    </style></head><body>
      <div class="header">
        <div>
          <h2>Reporte de Ventas Online</h2>
          <div>Período: <strong>${exportDateLabel}</strong></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#999">Generado: ${formatNowGt()}</div>
        </div>
      </div>

      <div class="summary-cards">
        <div class="summary-card"><div class="value">${exportSalesFiltered.length}</div><div class="label">Total Ventas</div></div>
        <div class="summary-card"><div class="value">${formatQ(totalBruto)}</div><div class="label">Total Bruto</div></div>
        <div class="summary-card"><div class="value" style="color:#2e7d32">${formatQ(totalNeto)}</div><div class="label">Total Neto</div></div>
        <div class="summary-card"><div class="value">${formatQ(totalEnvios)}</div><div class="label">Envíos</div></div>
      </div>

      ${sellerSummaryRows ? `
      <h3>Resumen por Vendedor</h3>
      <table style="width:auto;min-width:500px">
        <thead><tr><th>Vendedor</th><th>Ventas</th><th>Total</th><th>Neto</th><th>Comisión (2%)</th></tr></thead>
        <tbody>${sellerSummaryRows}</tbody>
      </table>` : ""}

      <div style="display:flex;gap:20px;margin-bottom:8px;">
        <div style="flex:1">
          <h3>Por Red Social</h3>
          <table>
            <thead><tr><th>Red Social</th><th style="text-align:center">Ventas</th><th style="text-align:right">Total</th><th style="text-align:right">Neto</th></tr></thead>
            <tbody>${(summary?.bySocialNetwork || []).map(g =>
              `<tr><td>${g.name}</td><td style="text-align:center">${g.salesCount}</td><td style="text-align:right">${formatQ(g.totalAmount)}</td><td style="text-align:right;color:#2e7d32;font-weight:600">${formatQ(g.totalNetAmount)}</td></tr>`
            ).join("")}</tbody>
          </table>
        </div>
        <div style="flex:1">
          <h3>Por Forma de Pago</h3>
          <table>
            <thead><tr><th>Forma de Pago</th><th style="text-align:center">Ventas</th><th style="text-align:right">Total</th><th style="text-align:right">Neto</th></tr></thead>
            <tbody>${(summary?.byPaymentMethod || []).map(g =>
              `<tr><td>${g.name}</td><td style="text-align:center">${g.salesCount}</td><td style="text-align:right">${formatQ(g.totalAmount)}</td><td style="text-align:right;color:#2e7d32;font-weight:600">${formatQ(g.totalNetAmount)}</td></tr>`
            ).join("")}</tbody>
          </table>
        </div>
      </div>

      <h3>Detalle de Ventas</h3>
      <table>
        <thead><tr>
          <th>No.</th><th>Nombre</th><th>Teléfono</th><th>Producto</th><th>Color</th><th>Talla</th>
          <th>Cant.</th><th>Subtotal</th><th>Total</th><th>Envío</th><th>Neto</th><th>F. Pago</th><th>Transp.</th>
          <th>Red</th><th>Estado</th><th>Guía</th><th>Autoriz.</th><th>Obs.</th>
        </tr></thead>
        <tbody>
          ${salesRows}
          <tr class="totals">
            <td colspan="8" style="text-align:right">TOTALES:</td>
            <td style="text-align:right">${formatQ(totalBruto)}</td>
            <td style="text-align:right">${formatQ(totalEnvios)}</td>
            <td style="text-align:right;color:#2e7d32">${formatQ(totalNeto)}</td>
            <td colspan="8"></td>
          </tr>
        </tbody>
      </table>
    </body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  // ─── Exportar Resumen Mensual Excel ─────────────────────────────

  const exportMonthlyExcel = (includeCommission = true) => {
    if (monthlySales.length === 0) return;

    // Agrupar por día
    const byDay = {};
    monthlySales.forEach(s => {
      const day = s.saleDate;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(s);
    });
    const sortedDays = Object.keys(byDay).sort();

    const monthTotalBruto = monthlySales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
    const monthTotalNeto = monthlySales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
    const monthTotalEnvios = monthlySales.reduce((sum, s) => sum + (parseFloat(s.shippingCost) || 0), 0);

    // Hoja 1: Ventas por día
    const dayRows = sortedDays.map(day => {
      const ds = byDay[day];
      return {
        "Fecha": day,
        "Ventas": ds.length,
        "Total Bruto": ds.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0),
        "Envíos": ds.reduce((s, r) => s + (parseFloat(r.shippingCost) || 0), 0),
        "Total Neto": ds.reduce((s, r) => s + (parseFloat(r.netAmount) || 0), 0),
      };
    });
    dayRows.push({
      "Fecha": "TOTAL MES",
      "Ventas": monthlySales.length,
      "Total Bruto": monthTotalBruto,
      "Envíos": monthTotalEnvios,
      "Total Neto": monthTotalNeto,
    });

    const ws1 = XLSX.utils.json_to_sheet(dayRows);
    ws1["!cols"] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 12 }, { wch: 14 }];

    // Hoja 2: Resumen por vendedor
    const bySeller = {};
    monthlySales.forEach(s => {
      const seller = s.salesperson || "Sin asignar";
      if (!bySeller[seller]) bySeller[seller] = { count: 0, total: 0, net: 0 };
      bySeller[seller].count++;
      bySeller[seller].total += (parseFloat(s.totalAmount) || 0);
      bySeller[seller].net += (parseFloat(s.netAmount) || 0);
    });

    const sellerRows = Object.entries(bySeller).map(([seller, data]) => {
      const row = {
        "Vendedor": seller,
        "Ventas": data.count,
        "Total Bruto": data.total,
        "Total Neto": data.net,
      };
      if (includeCommission) row["Comisión (2%)"] = +(data.net * 0.02).toFixed(2);
      return row;
    });

    const ws2 = XLSX.utils.json_to_sheet(sellerRows);
    ws2["!cols"] = [{ wch: 22 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, ...(includeCommission ? [{ wch: 14 }] : [])];

    // Hoja 3: Por red social con montos
    const bySocial = {};
    monthlySales.forEach(s => {
      const sn = SOCIAL_NETWORKS.find(x => x.value === s.socialNetwork)?.label || s.socialNetwork || "Otro";
      if (!bySocial[sn]) bySocial[sn] = { count: 0, total: 0, net: 0 };
      bySocial[sn].count++;
      bySocial[sn].total += parseFloat(s.totalAmount) || 0;
      bySocial[sn].net += parseFloat(s.netAmount) || 0;
    });
    const socialRows = Object.entries(bySocial).map(([k, v]) => ({
      "Red Social": k, "Ventas": v.count, "Total": v.total, "Neto": v.net
    }));

    // Por forma de pago con montos
    const byPM = {};
    monthlySales.forEach(s => {
      const pm = PAYMENT_METHODS.find(x => x.value === s.paymentMethod)?.label || s.paymentMethod || "Otro";
      if (!byPM[pm]) byPM[pm] = { count: 0, total: 0, net: 0 };
      byPM[pm].count++;
      byPM[pm].total += parseFloat(s.totalAmount) || 0;
      byPM[pm].net += parseFloat(s.netAmount) || 0;
    });
    const pmRows = Object.entries(byPM).map(([k, v]) => ({
      "Forma de Pago": k, "Ventas": v.count, "Total": v.total, "Neto": v.net
    }));

    const miscRows = [
      { "Concepto": "--- POR RED SOCIAL ---", "Ventas": "", "Total": "", "Neto": "" },
      ...socialRows.map(r => ({ "Concepto": r["Red Social"], "Ventas": r["Ventas"], "Total": r["Total"], "Neto": r["Neto"] })),
      { "Concepto": "", "Ventas": "", "Total": "", "Neto": "" },
      { "Concepto": "--- POR FORMA DE PAGO ---", "Ventas": "", "Total": "", "Neto": "" },
      ...pmRows.map(r => ({ "Concepto": r["Forma de Pago"], "Ventas": r["Ventas"], "Total": r["Total"], "Neto": r["Neto"] })),
    ];
    const ws3 = XLSX.utils.json_to_sheet(miscRows);
    ws3["!cols"] = [{ wch: 28 }, { wch: 10 }, { wch: 14 }, { wch: 14 }];

    // Hoja 4: Detalle completo de ventas del mes
    const detailRows = monthlySales.map((s, i) => ({
      "No.": s.saleNumber || i + 1,
      "Fecha": s.saleDate || "",
      "Nombre": s.customerName || "",
      "Teléfono": s.phone || "",
      "Teléfono 2": s.phone2 || "",
      "Producto": s.productName || "",
      "Código": s.productCode || "",
      "Color": s.colorName || "",
      "Talla": s.size || "",
      "Cantidad": s.quantity || 1,
      "P. Unitario": parseFloat(s.unitPrice) || 0,
      "Total": parseFloat(s.totalAmount) || 0,
      "Envío": parseFloat(s.shippingCost) || 0,
      "Sin Envío": parseFloat(s.netAmount) || 0,
      "Forma de Pago": PAYMENT_METHODS.find(p => p.value === s.paymentMethod)?.label || s.paymentMethod,
      "Transporte": SHIPPING_CARRIERS.find(c => c.value === s.shippingCarrier)?.label || s.shippingCarrier || "",
      "Red Social": SOCIAL_NETWORKS.find(sn => sn.value === s.socialNetwork)?.label || s.socialNetwork || "",
      "Vendedor": s.salesperson || "",
      "Estado": SALE_STATUSES.find(st => st.value === s.status)?.label || s.status || "",
      "Guía": s.guideNumber || "",
      "Autorización": s.paymentAuthorization || "",
      "Observación": s.observations || "",
    }));
    const ws4 = XLSX.utils.json_to_sheet(detailRows);
    const colWidths4 = Object.keys(detailRows[0] || {}).map(key => ({
      wch: Math.max(key.length, ...detailRows.map(r => String(r[key] || "").length)) + 2
    }));
    ws4["!cols"] = colWidths4;

    // Hoja 5: Dato de Contabilidad
    const validSalesExcel = monthlySales.filter(s => s.status !== "DEVOLUCION" && s.status !== "ANULADA");
    const returnedExcel = monthlySales.filter(s => s.status === "DEVOLUCION");
    const voidedExcel = monthlySales.filter(s => s.status === "ANULADA");

    const byCarrierExcel = {};
    validSalesExcel.forEach(s => {
      const c = SHIPPING_CARRIERS.find(x => x.value === s.shippingCarrier)?.label || s.shippingCarrier || "Sin asignar";
      if (!byCarrierExcel[c]) byCarrierExcel[c] = 0;
      byCarrierExcel[c] += parseFloat(s.totalAmount) || 0;
    });

    const ventasTotalExcel = validSalesExcel.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
    const enviosTotalExcel = validSalesExcel.reduce((sum, s) => sum + (parseFloat(s.shippingCost) || 0), 0);
    const devAmtExcel = returnedExcel.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
    const anulAmtExcel = voidedExcel.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
    const subTotalExcel = ventasTotalExcel - enviosTotalExcel - devAmtExcel - anulAmtExcel;
    const ivaExcel = subTotalExcel / 1.12 * 0.12;
    const ventasNetasExcel = subTotalExcel - ivaExcel;
    const comisionExcel = ventasNetasExcel * 0.02;

    const contabRows = [];
    Object.entries(byCarrierExcel).forEach(([c, total]) => contabRows.push({ "Concepto": `VENTA ${c}`, "Monto": total }));
    contabRows.push({ "Concepto": "TOTAL VENTAS", "Monto": ventasTotalExcel });
    contabRows.push({ "Concepto": "(-) PAGO DE ENVÍO", "Monto": enviosTotalExcel });
    if (returnedExcel.length > 0) contabRows.push({ "Concepto": `(-) ${returnedExcel.length} DEVOLUCIONES`, "Monto": devAmtExcel });
    if (voidedExcel.length > 0) contabRows.push({ "Concepto": `(-) ${voidedExcel.length} ANULADAS`, "Monto": anulAmtExcel });
    contabRows.push({ "Concepto": "SUB TOTAL", "Monto": subTotalExcel });
    contabRows.push({ "Concepto": "(-) IVA (12%)", "Monto": +ivaExcel.toFixed(2) });
    contabRows.push({ "Concepto": "TOTAL VENTAS NETAS", "Monto": +ventasNetasExcel.toFixed(2) });
    contabRows.push({ "Concepto": "2% COMISIONES", "Monto": +comisionExcel.toFixed(2) });

    const ws5 = XLSX.utils.json_to_sheet(contabRows);
    ws5["!cols"] = [{ wch: 30 }, { wch: 18 }];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws1, "Ventas por Día");
    XLSX.utils.book_append_sheet(wb, ws2, "Por Vendedor");
    XLSX.utils.book_append_sheet(wb, ws3, "Por Red y Pago");
    XLSX.utils.book_append_sheet(wb, ws4, "Detalle Ventas");
    XLSX.utils.book_append_sheet(wb, ws5, "Contabilidad");

    XLSX.writeFile(wb, `Resumen_Mensual_${monthFilter}.xlsx`);
    showNotification("Excel mensual descargado");
  };

  // ─── Exportar Resumen Mensual PDF ──────────────────────────────

  const exportMonthlyPDF = (includeCommission = true) => {
    if (monthlySales.length === 0) return;

    const pmLabel = (v) => PAYMENT_METHODS.find(p => p.value === v)?.label || v || "";
    const snLabel = (v) => SOCIAL_NETWORKS.find(s => s.value === v)?.label || v || "";

    // Agrupar por día
    const byDay = {};
    monthlySales.forEach(s => {
      const day = s.saleDate;
      if (!byDay[day]) byDay[day] = [];
      byDay[day].push(s);
    });
    const sortedDays = Object.keys(byDay).sort();

    const monthTotalBruto = monthlySales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
    const monthTotalNeto = monthlySales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
    const monthTotalEnvios = monthlySales.reduce((sum, s) => sum + (parseFloat(s.shippingCost) || 0), 0);

    // Vendedores
    const bySeller = {};
    monthlySales.forEach(s => {
      const seller = s.salesperson || "Sin asignar";
      if (!bySeller[seller]) bySeller[seller] = { count: 0, total: 0, net: 0 };
      bySeller[seller].count++;
      bySeller[seller].total += (parseFloat(s.totalAmount) || 0);
      bySeller[seller].net += (parseFloat(s.netAmount) || 0);
    });

    // Red social con montos
    const bySocial = {};
    monthlySales.forEach(s => {
      const sn = snLabel(s.socialNetwork);
      if (!bySocial[sn]) bySocial[sn] = { count: 0, total: 0, net: 0 };
      bySocial[sn].count++;
      bySocial[sn].total += (parseFloat(s.totalAmount) || 0);
      bySocial[sn].net += (parseFloat(s.netAmount) || 0);
    });

    // Forma de pago con montos
    const byPM = {};
    monthlySales.forEach(s => {
      const pm = pmLabel(s.paymentMethod);
      if (!byPM[pm]) byPM[pm] = { count: 0, total: 0, net: 0 };
      byPM[pm].count++;
      byPM[pm].total += (parseFloat(s.totalAmount) || 0);
      byPM[pm].net += (parseFloat(s.netAmount) || 0);
    });

    const dayRows = sortedDays.map(day => {
      const ds = byDay[day];
      const dayBruto = ds.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0);
      const dayEnvios = ds.reduce((s, r) => s + (parseFloat(r.shippingCost) || 0), 0);
      const dayNeto = ds.reduce((s, r) => s + (parseFloat(r.netAmount) || 0), 0);
      return `<tr>
        <td><strong>${day}</strong></td>
        <td style="text-align:center">${ds.length}</td>
        <td style="text-align:right">${formatQ(dayBruto)}</td>
        <td style="text-align:right">${formatQ(dayEnvios)}</td>
        <td style="text-align:right;color:#2e7d32;font-weight:600">${formatQ(dayNeto)}</td>
      </tr>`;
    }).join("");

    const sellerRows = Object.entries(bySeller).map(([seller, data]) => {
      const commission = data.net * 0.02;
      let row = `<tr>
        <td>${seller}</td>
        <td style="text-align:center">${data.count}</td>
        <td style="text-align:right">${formatQ(data.total)}</td>
        <td style="text-align:right;color:#2e7d32">${formatQ(data.net)}</td>`;
      if (includeCommission) row += `<td style="text-align:right;color:#1565c0;font-weight:600">${formatQ(commission)}</td>`;
      row += `</tr>`;
      return row;
    }).join("");

    const socialRows = Object.entries(bySocial).map(([k, v]) =>
      `<tr><td>${k}</td><td style="text-align:center">${v.count}</td><td style="text-align:right">${formatQ(v.total)}</td><td style="text-align:right;color:#2e7d32;font-weight:600">${formatQ(v.net)}</td></tr>`
    ).join("");

    const pmRows = Object.entries(byPM).map(([k, v]) =>
      `<tr><td>${k}</td><td style="text-align:center">${v.count}</td><td style="text-align:right">${formatQ(v.total)}</td><td style="text-align:right;color:#2e7d32;font-weight:600">${formatQ(v.net)}</td></tr>`
    ).join("");

    const [year, month] = monthFilter.split("-");
    const monthNames = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const monthName = monthNames[parseInt(month) - 1] || month;

    const html = `<!DOCTYPE html><html><head><title>Resumen Mensual - ${monthName} ${year}</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 11px; margin: 20px; color: #333; }
      h2 { margin: 0 0 5px 0; font-size: 18px; }
      h3 { margin: 18px 0 6px 0; font-size: 13px; border-bottom: 1px solid #ddd; padding-bottom: 3px; }
      .header { border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 15px; display: flex; justify-content: space-between; }
      .summary-cards { display: flex; gap: 15px; margin-bottom: 15px; }
      .summary-card { border: 1px solid #ddd; border-radius: 6px; padding: 10px 16px; text-align: center; flex: 1; }
      .summary-card .value { font-size: 20px; font-weight: 700; }
      .summary-card .label { font-size: 10px; color: #666; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; font-size: 11px; }
      th { background: #f5f5f5; font-weight: 600; text-align: left; }
      tr:nth-child(even) { background: #fafafa; }
      .totals { font-weight: 700; background: #e8f5e9 !important; }
      .two-col { display: flex; gap: 20px; }
      .two-col > div { flex: 1; }
      @media print { body { margin: 10px; } }
    </style></head><body>
      <div class="header">
        <div>
          <h2>Resumen Mensual de Ventas Online</h2>
          <div><strong>${monthName} ${year}</strong></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#999">Generado: ${formatNowGt()}</div>
        </div>
      </div>

      <div class="summary-cards">
        <div class="summary-card"><div class="value">${monthlySales.length}</div><div class="label">Total Ventas</div></div>
        <div class="summary-card"><div class="value">${formatQ(monthTotalBruto)}</div><div class="label">Total Bruto</div></div>
        <div class="summary-card"><div class="value" style="color:#2e7d32">${formatQ(monthTotalNeto)}</div><div class="label">Total Neto</div></div>
        <div class="summary-card"><div class="value">${formatQ(monthTotalEnvios)}</div><div class="label">Total Envíos</div></div>
      </div>

      <h3>Resumen por Vendedor${includeCommission ? " (con Comisiones)" : ""}</h3>
      <table style="width:auto;min-width:500px">
        <thead><tr><th>Vendedor</th><th>Ventas</th><th>Total</th><th>Neto</th>${includeCommission ? "<th>Comisión (2%)</th>" : ""}</tr></thead>
        <tbody>${sellerRows}</tbody>
      </table>

      <h3>Ventas por Día</h3>
      <table>
        <thead><tr><th>Fecha</th><th style="text-align:center">Ventas</th><th style="text-align:right">Total Bruto</th><th style="text-align:right">Envíos</th><th style="text-align:right">Total Neto</th></tr></thead>
        <tbody>
          ${dayRows}
          <tr class="totals">
            <td>TOTAL MES</td>
            <td style="text-align:center">${monthlySales.length}</td>
            <td style="text-align:right">${formatQ(monthTotalBruto)}</td>
            <td style="text-align:right">${formatQ(monthTotalEnvios)}</td>
            <td style="text-align:right;color:#2e7d32">${formatQ(monthTotalNeto)}</td>
          </tr>
        </tbody>
      </table>

      <div class="two-col">
        <div>
          <h3>Por Red Social</h3>
          <table><thead><tr><th>Red Social</th><th style="text-align:center">Ventas</th><th style="text-align:right">Total</th><th style="text-align:right">Neto</th></tr></thead>
          <tbody>${socialRows}</tbody></table>
        </div>
        <div>
          <h3>Por Forma de Pago</h3>
          <table><thead><tr><th>Forma de Pago</th><th style="text-align:center">Ventas</th><th style="text-align:right">Total</th><th style="text-align:right">Neto</th></tr></thead>
          <tbody>${pmRows}</tbody></table>
        </div>
      </div>

      ${(() => {
        const vsPdf = monthlySales.filter(s => s.status !== "DEVOLUCION" && s.status !== "ANULADA");
        const retPdf = monthlySales.filter(s => s.status === "DEVOLUCION");
        const voidPdf = monthlySales.filter(s => s.status === "ANULADA");
        const byCarrPdf = {};
        vsPdf.forEach(s => {
          const c = SHIPPING_CARRIERS.find(x => x.value === s.shippingCarrier)?.label || s.shippingCarrier || "Sin asignar";
          if (!byCarrPdf[c]) byCarrPdf[c] = 0;
          byCarrPdf[c] += parseFloat(s.totalAmount) || 0;
        });
        const vtPdf = vsPdf.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
        const envPdf = vsPdf.reduce((sum, s) => sum + (parseFloat(s.shippingCost) || 0), 0);
        const devPdf = retPdf.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
        const anulPdf = voidPdf.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
        const subPdf = vtPdf - envPdf - devPdf - anulPdf;
        const ivaPdf = subPdf / 1.12 * 0.12;
        const vnPdf = subPdf - ivaPdf;
        const comPdf = vnPdf * 0.02;

        const carrierRows = Object.entries(byCarrPdf).map(([c, t]) =>
          '<tr><td style="padding-left:20px">VENTA ' + c.toUpperCase() + '</td><td style="text-align:right">' + formatQ(t) + '</td></tr>'
        ).join("");

        return '<div style="page-break-before:always"></div>' +
          '<h3 style="background:#fff3e0;padding:6px 10px;border-radius:4px">📊 Dato de Contabilidad</h3>' +
          '<table style="width:auto;min-width:400px">' +
          '<tbody>' +
          carrierRows +
          '<tr style="background:#e3f2fd;font-weight:700"><td style="padding-left:20px">TOTAL VENTAS</td><td style="text-align:right">' + formatQ(vtPdf) + '</td></tr>' +
          '<tr><td style="padding-left:20px">(-) PAGO DE ENVÍO</td><td style="text-align:right">' + formatQ(envPdf) + '</td></tr>' +
          (retPdf.length > 0 ? '<tr style="color:#d32f2f"><td style="padding-left:20px">(-) ' + retPdf.length + ' DEVOLUCIONES</td><td style="text-align:right">' + formatQ(devPdf) + '</td></tr>' : '') +
          (voidPdf.length > 0 ? '<tr style="color:#d32f2f"><td style="padding-left:20px">(-) ' + voidPdf.length + ' ANULADAS</td><td style="text-align:right">' + formatQ(anulPdf) + '</td></tr>' : '') +
          '<tr style="background:#e8f5e9;font-weight:700"><td style="padding-left:20px">SUB TOTAL</td><td style="text-align:right">' + formatQ(subPdf) + '</td></tr>' +
          '<tr><td style="padding-left:20px">(-) IVA (12%)</td><td style="text-align:right">' + formatQ(ivaPdf) + '</td></tr>' +
          '<tr style="background:#c8e6c9;font-weight:700;font-size:14px"><td style="padding-left:20px">TOTAL VENTAS NETAS</td><td style="text-align:right">' + formatQ(vnPdf) + '</td></tr>' +
          '<tr style="border-top:2px solid #333"><td style="padding-left:20px">2% COMISIONES</td><td style="text-align:right">' + formatQ(comPdf) + '</td></tr>' +
          '</tbody></table>';
      })()}
    </body></html>`;

    const win = window.open("", "_blank");
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  };

  // ─── Render ────────────────────────────────────────────────────

  return (
    <div className="content">
      {/* Notificaciones */}
      {error && <Alert color="danger" toggle={() => setError("")}>{error}</Alert>}
      {successMsg && <Alert color="success" toggle={() => setSuccessMsg("")}>{successMsg}</Alert>}

      {/* Tabs */}
      <Nav tabs className="mb-3">
        <NavItem>
          <NavLink className={activeTab === "ventas" ? "active" : ""} onClick={() => setActiveTab("ventas")}
            style={{ cursor: "pointer" }}>
            📋 Ventas del Día
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "resumen" ? "active" : ""} onClick={() => setActiveTab("resumen")}
            style={{ cursor: "pointer" }}>
            📊 Resumen por fechas
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "envios" ? "active" : ""} onClick={() => setActiveTab("envios")}
            style={{ cursor: "pointer" }}>
            🚚 Envíos
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "devoluciones" ? "active" : ""} onClick={() => setActiveTab("devoluciones")}
            style={{ cursor: "pointer" }}>
            ↩ Devoluciones
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "mensual" ? "active" : ""} onClick={() => setActiveTab("mensual")}
            style={{ cursor: "pointer" }}>
            📅 Resumen Mensual
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "produccion" ? "active" : ""} onClick={() => setActiveTab("produccion")}
            style={{ cursor: "pointer" }}>
            📦 Despacho / Producción
            {eligibleSales.length > 0 && (
              <Badge color="danger" pill className="ml-1">{eligibleSales.length}</Badge>
            )}
          </NavLink>
        </NavItem>
      </Nav>

      <TabContent activeTab={activeTab}>
        {/* ═══ TAB VENTAS ═══ */}
        <TabPane tabId="ventas">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="3">
                  <CardTitle tag="h4" className="mb-0">Ventas Online</CardTitle>
                </Col>
                <Col md="2">
                  <Input type="date" bsSize="sm" value={filterDate}
                    onChange={e => setFilterDate(e.target.value)} />
                </Col>
                <Col md="2">
                  <Input type="select" bsSize="sm" value={filterSalesperson}
                    onChange={e => setFilterSalesperson(e.target.value)}>
                    <option value="">Todos los vendedores</option>
                    {SALESPERSONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Input>
                </Col>
                <Col md="2">
                  <Input type="select" bsSize="sm" value={filterSocial}
                    onChange={e => setFilterSocial(e.target.value)}>
                    <option value="">Todas las redes</option>
                    {SOCIAL_NETWORKS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Input>
                </Col>
                <Col md="1">
                  <Input type="select" bsSize="sm" value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Estado</option>
                    {SALE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Input>
                </Col>
                <Col md="2" className="text-right">
                  <Button color="default" size="sm" onClick={exportToExcel} title="Descargar Excel"
                    style={{ marginRight: 4 }}>
                    <i className="nc-icon nc-cloud-download-93" /> Excel
                  </Button>
                  <Button color="default" size="sm" onClick={exportToPDF} title="Imprimir / PDF"
                    style={{ marginRight: 4 }}>
                    <i className="nc-icon nc-paper" /> PDF
                  </Button>
                  <Button color="info" size="sm" onClick={() => csvInputRef.current?.click()}
                    style={{ marginRight: 4 }} title="Importar ventas desde CSV">
                    <i className="nc-icon nc-cloud-upload-94" /> CSV
                  </Button>
                  <input type="file" accept=".csv" ref={csvInputRef} onChange={handleCSVFileSelect}
                    style={{ display: "none" }} />
                  <Button color="success" size="sm" onClick={openNewForm}>
                    <i className="nc-icon nc-simple-add" /> Nueva Venta
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {loading ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : filteredSales.length === 0 ? (
                <div className="text-center p-4" style={{ color: "#999" }}>
                  No hay ventas para esta fecha.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <Table responsive hover size="sm" style={{ fontSize: 12, marginBottom: 0 }}>
                    <thead style={{ background: "#f8f9fa" }}>
                      <tr>
                        <th style={{ minWidth: 35 }}>No.</th>
                        <th style={{ minWidth: 120 }}>Nombre</th>
                        <th style={{ minWidth: 80 }}>Teléfono</th>
                        <th style={{ minWidth: 80 }}>Teléfono 2</th>
                        <th style={{ minWidth: 50 }}>Emp.</th>
                        <th style={{ minWidth: 130 }}>Forma Pago</th>
                        <th style={{ minWidth: 60 }}>NIT</th>
                        <th style={{ minWidth: 90 }}>FEL</th>
                        <th style={{ minWidth: 180 }}>Productos</th>
                        <th style={{ minWidth: 70 }}>Total</th>
                        <th style={{ minWidth: 50 }}>Envío</th>
                        <th style={{ minWidth: 70 }}>Sin Envío</th>
                        <th style={{ minWidth: 90 }}>Transporte</th>
                        <th style={{ minWidth: 80 }}>Red Social</th>
                        <th style={{ minWidth: 80 }}>Vendedor</th>
                        <th style={{ minWidth: 70 }}>Estado</th>
                        <th style={{ minWidth: 80 }}>Guía</th>
                        <th style={{ minWidth: 90 }}>Autorización</th>
                        <th style={{ minWidth: 100 }}>Observación</th>
                        <th style={{ minWidth: 80 }}>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSales.map((sale, idx) => (
                        <tr key={sale.id} style={{
                          background: (sale.paymentMethod === "CONTRA_ENTREGA" || sale.paymentMethod === "CONTRA_ENTREGA_DEPOSITO") ? "#fff3e0" :
                            (sale.paymentMethod && sale.paymentMethod.includes("PENDIENTE") ? "#fff8e1" : "transparent")
                        }}>
                          <td><strong>{sale.saleNumber || idx + 1}</strong></td>
                          <td>{renderInlineCell(sale, "customerName")}</td>
                          <td>{renderInlineCell(sale, "phone")}</td>
                          <td>{renderInlineCell(sale, "phone2")}</td>
                          <td>
                            <span style={{ cursor: "pointer" }}
                              onClick={async () => {
                                const newVal = !sale.packaging;
                                await updateOnlineSale(sale.id, { packaging: newVal });
                                setSales(prev => prev.map(s => s.id === sale.id ? { ...s, packaging: newVal } : s));
                              }}>
                              {sale.packaging ? <Badge color="success">Sí</Badge> : <Badge color="secondary">No</Badge>}
                            </span>
                          </td>
                          <td>{renderInlineCell(sale, "paymentMethod", "select",
                            PAYMENT_METHODS.map(p => ({ value: p.value, label: p.label })))}</td>
                          <td>{renderInlineCell(sale, "invoiceTaxId")}</td>
                          <td>{getFelInvoiceBadge(sale)}</td>
                          <td style={{ fontSize: 11 }}>
                            {(sale.items && sale.items.length > 0) ? sale.items.map((it, i) => (
                              <div key={i} style={{
                                borderBottom: i < sale.items.length - 1 ? "1px dashed #e0e0e0" : "none",
                                paddingBottom: 2, marginBottom: 2
                              }}>
                                <strong>{it.productCode}</strong> {it.productName}
                                {it.colorName && <span style={{ color: "#666" }}> · {it.colorName}</span>}
                                {it.size && <span style={{ color: "#999" }}> · {it.size}</span>}
                                {(it.quantity && it.quantity > 1) && <span style={{ color: "#1565c0", fontWeight: 600 }}> ×{it.quantity}</span>}
                              </div>
                            )) : (
                              <div>
                                <strong>{sale.productCode}</strong> {sale.productName}
                                {sale.colorName && <span style={{ color: "#666" }}> · {sale.colorName}</span>}
                                {(sale.quantity && sale.quantity > 1) && <span style={{ color: "#1565c0", fontWeight: 600 }}> ×{sale.quantity}</span>}
                              </div>
                            )}
                          </td>
                          <td>
                            {(() => {
                              const amounts = computeSaleAmountsFromItems(sale);
                              const storedTotal = parseFloat(sale.totalAmount || 0);
                              const mismatch = amounts.lineCount > 1
                                && amounts.total > 0
                                && Math.abs(amounts.total - storedTotal) > 0.01;
                              return (
                                <>
                                  <strong title={mismatch ? "Total recalculado desde productos" : undefined}>
                                    {formatQ(mismatch ? amounts.total : sale.totalAmount)}
                                  </strong>
                                  {mismatch && (
                                    <div className="text-warning small" title={`Guardado: ${formatQ(storedTotal)}`}>
                                      ≠ {formatQ(storedTotal)}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
                          </td>
                          <td>{formatQ(sale.shippingCost)}</td>
                          <td style={{ color: "#2e7d32", fontWeight: 600 }}>
                            {(() => {
                              const amounts = computeSaleAmountsFromItems(sale);
                              const storedNet = parseFloat(sale.netAmount || 0);
                              const mismatch = amounts.lineCount > 1
                                && amounts.net > 0
                                && Math.abs(amounts.net - storedNet) > 0.01;
                              return formatQ(mismatch ? amounts.net : sale.netAmount);
                            })()}
                          </td>
                          <td>{renderInlineCell(sale, "shippingCarrier", "select",
                            SHIPPING_CARRIERS.map(c => ({ value: c.value, label: c.label })))}</td>
                          <td>{getSocialIcon(sale.socialNetwork)}</td>
                          <td style={{ fontSize: 11 }}>{sale.salesperson ? sale.salesperson.split(" ")[0] : "—"}</td>
                          <td>{getStatusBadge(sale.status)}</td>
                          <td>{renderInlineCell(sale, "guideNumber")}</td>
                          <td>{renderInlineCell(sale, "paymentAuthorization")}</td>
                          <td>{renderInlineCell(sale, "observations")}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {canGenerateFelInvoice(sale) && (
                              <Button
                                color={isFelInvoiceRetry(sale) ? "warning" : "success"}
                                size="sm"
                                className="btn-icon btn-round"
                                title={isFelInvoiceRetry(sale)
                                  ? "Reintentar factura FEL"
                                  : "Generar factura FEL"}
                                onClick={() => openFelInvoiceModal(sale)}
                                disabled={felInvoiceLoadingId === sale.id}
                                style={{ padding: "3px 7px" }}>
                                {felInvoiceLoadingId === sale.id
                                  ? <Spinner size="sm" />
                                  : <i className={isFelInvoiceRetry(sale) ? "nc-icon nc-refresh-69" : "nc-icon nc-paper"} />}
                              </Button>
                            )}{" "}
                            {canDownloadFelInvoice(sale) && (
                              <Button
                                color="primary"
                                size="sm"
                                className="btn-icon btn-round"
                                title="Descargar factura certificada"
                                onClick={() => handleDownloadCertifiedFelInvoice(sale)}
                                style={{ padding: "3px 7px" }}>
                                <i className="nc-icon nc-cloud-download-93" />
                              </Button>
                            )}{" "}
                            {canEditFel && sale.invoiceId && (
                              <Button
                                color="warning"
                                size="sm"
                                className="btn-icon btn-round"
                                title="Corregir factura FEL real (UUID, serie, número, fecha)"
                                onClick={() => openFelEditModal(sale)}
                                style={{ padding: "3px 7px" }}>
                                <i className="nc-icon nc-settings-gear-65" />
                              </Button>
                            )}{" "}
                            <Button color="info" size="sm" className="btn-icon btn-round" title="Editar"
                              onClick={() => openEditForm(sale)} style={{ padding: "3px 7px" }}>
                              <i className="nc-icon nc-ruler-pencil" />
                            </Button>{" "}
                            {(sale.status === "ENVIADO" || sale.status === "ENTREGADO") && (
                              <><Button color="dark" size="sm" className="btn-icon btn-round" title="Devolución"
                                onClick={() => openReturnModal(sale.id)} style={{ padding: "3px 7px" }}>
                                <i className="nc-icon nc-refresh-69" />
                              </Button>{" "}</>
                            )}
                            {sale.status === "DEVOLUCION" && (
                              <><Button color="primary" size="sm" className="btn-icon btn-round" title="Registrar CAMBIO (Q0)"
                                onClick={() => openExchangeModal(sale)} style={{ padding: "3px 7px" }}>
                                <i className="nc-icon nc-send" />
                              </Button>{" "}</>
                            )}
                            {sale.status !== "DEVOLUCION" && sale.status !== "ANULADA"
                              && sale.status !== "ENVIADO" && sale.status !== "ENTREGADO" && (
                              <><Button color="warning" size="sm" className="btn-icon btn-round" title="Anular"
                                onClick={() => openVoidModal(sale.id)} style={{ padding: "3px 7px" }}>
                                <i className="nc-icon nc-simple-delete" />
                              </Button>{" "}</>
                            )}
                            <Button color="danger" size="sm" className="btn-icon btn-round" title="Eliminar"
                              onClick={() => handleDelete(sale.id)} style={{ padding: "3px 7px" }}>
                              <i className="nc-icon nc-simple-remove" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
            {filteredSales.length > 0 && (
              <CardFooter>
                <Row>
                  <Col md="4">
                    <small className="text-muted">
                      {filteredSales.length} venta(s) • Total: <strong>{formatQ(
                        filteredSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0)
                      )}</strong> • Neto: <strong>{formatQ(
                        filteredSales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0)
                      )}</strong>
                    </small>
                  </Col>
                </Row>
              </CardFooter>
            )}
          </Card>
        </TabPane>

        {/* ═══ TAB ENVIOS ═══ */}
        <TabPane tabId="envios">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="4">
                  <CardTitle tag="h4" className="mb-0">Preparación de envíos</CardTitle>
                </Col>
                <Col md="2">
                  <Input type="date" bsSize="sm" value={filterDate}
                    onChange={e => setFilterDate(e.target.value)} />
                </Col>
                <Col md="3">
                  <Input type="select" bsSize="sm" value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}>
                    <option value="">Todos los estados</option>
                    {SALE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Input>
                </Col>
                <Col md="3" className="text-right">
                  <Button color="primary" size="sm" onClick={loadSales}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                </Col>
              </Row>
              <Row className="mt-1">
                <Col>
                  <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                    Número ENVL y guía/transporte se guardan como preparación (aun sin mandar a producir o antes de bodega).
                    El estado &quot;Enviado&quot; solo aplica cuando bodega PT confirma el despacho.
                  </p>
                </Col>
              </Row>
            </CardHeader>
            <CardBody style={{ padding: 0 }}>
              {loading ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : shipmentSales.length === 0 ? (
                <div className="text-center p-4" style={{ color: "#999" }}>
                  No hay pedidos en esta fecha. Use el filtro de estado o cargue ventas del día.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <Table responsive hover size="sm" style={{ fontSize: 12, marginBottom: 0 }}>
                    <thead style={{ background: "#f8f9fa" }}>
                      <tr>
                        <th>Pedido</th>
                        <th>Cliente</th>
                        <th>Teléfono</th>
                        <th>Dirección</th>
                        <th>Total</th>
                        <th>Avance OP</th>
                        <th>Cant. Hecho/Falta</th>
                        <th>N° Envío</th>
                        <th>Transporte</th>
                        <th>Guía</th>
                        <th>Estado</th>
                        <th>Etapa logística</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shipmentSales.map((sale) => (
                        <tr key={`shipment-${sale.id}`}>
                          <td><strong>#{sale.saleNumber || sale.id}</strong></td>
                          <td>{sale.customerName || "—"}</td>
                          <td>{sale.phone || "—"}</td>
                          <td>{sale.address || "—"}</td>
                          <td>{formatQ(sale.totalAmount)}</td>
                          <td>
                            {(() => {
                              const p = saleProductionProgress[String(sale.id)];
                              return p ? `${p.pct}%` : "0%";
                            })()}
                          </td>
                          <td>
                            {(() => {
                              const p = saleProductionProgress[String(sale.id)];
                              if (!p) return "0/0";
                              return `${p.produced}/${p.pending}`;
                            })()}
                          </td>
                          <td><strong>{sale.shipmentNumber || "—"}</strong></td>
                          <td>{SHIPPING_CARRIERS.find(c => c.value === sale.shippingCarrier)?.label || sale.shippingCarrier || "—"}</td>
                          <td>{sale.guideNumber || "—"}</td>
                          <td>{getStatusBadge(sale.status)}</td>
                          <td>
                            {(() => {
                              const stage = getSaleLogisticsStage(sale);
                              return <Badge color={stage.color}>{stage.label}</Badge>;
                            })()}
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {isDispatchedStatus(sale.status) || sale.shipmentNumber ? (
                              <>
                                <Button color="default" size="sm" onClick={() => void printShipmentDocument(sale)} style={{ padding: "3px 8px" }}>
                                  Imprimir
                                </Button>{" "}
                                <Button color="info" size="sm" onClick={() => void downloadShipmentPdf(sale)} style={{ padding: "3px 8px" }}>
                                  PDF
                                </Button>
                              </>
                            ) : (
                              <Button color="success" size="sm" onClick={() => openShipmentModal(sale)} style={{ padding: "3px 8px" }}>
                                Preparar envío
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </TabPane>

        {/* ═══ TAB DEVOLUCIONES ═══ */}
        <TabPane tabId="devoluciones">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="4">
                  <CardTitle tag="h4" className="mb-0">Devoluciones (Ventas en línea)</CardTitle>
                  <small className="text-muted d-block">Historial + acceso al inventario de DEVOLUCIÓN</small>
                </Col>
                <Col md="2">
                  <Label className="mb-0" style={{ fontSize: 12 }}>Desde</Label>
                  <Input type="date" bsSize="sm" value={returnsStartDate}
                    onChange={(e) => setReturnsStartDate(e.target.value)} />
                </Col>
                <Col md="2">
                  <Label className="mb-0" style={{ fontSize: 12 }}>Hasta</Label>
                  <Input type="date" bsSize="sm" value={returnsEndDate}
                    onChange={(e) => setReturnsEndDate(e.target.value)} />
                </Col>
                <Col md="2">
                  <Label className="mb-0" style={{ fontSize: 12 }}>Condición</Label>
                  <Input type="select" bsSize="sm" value={returnsCondition}
                    onChange={(e) => setReturnsCondition(e.target.value)}>
                    <option value="">Todas</option>
                    <option value="BUENO">BUENO</option>
                    <option value="USADO">USADO</option>
                    <option value="DAÑADO">DAÑADO</option>
                  </Input>
                </Col>
                <Col md="2" className="text-right">
                  <Button
                    color="primary"
                    size="sm"
                    className="mr-2"
                    onClick={() => loadReturns()}
                    disabled={loadingReturns}
                  >
                    {loadingReturns ? <><Spinner size="sm" /> Cargando...</> : "Actualizar"}
                  </Button>
                  <Button
                    color="default"
                    size="sm"
                    onClick={() => { window.location.href = "/admin/product-inventory-by-location?category=DEVOLUCION"; }}
                    title="Ver inventario de productos en categoría DEVOLUCIÓN"
                  >
                    Ver inventario
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {returnsError && <Alert color="danger" toggle={() => setReturnsError("")}>{returnsError}</Alert>}

              <Row className="mb-3">
                <Col md="6">
                  <Alert color="light" className="mb-0">
                    <strong>Total unidades:</strong> {returnsTotals.units} &nbsp;|&nbsp;
                    <strong>Total Q:</strong> {formatQ(returnsTotals.amount)}
                  </Alert>
                </Col>
                <Col md="6" className="text-right">
                  <small className="text-muted d-block">
                    Tip: registra la devolución desde “Ventas del día” y aquí queda el historial. El stock se consulta en Inventarios → Productos → DEVOLUCIÓN.
                  </small>
                </Col>
              </Row>

              {loadingReturns ? (
                <div className="text-center py-4"><Spinner /> <div className="mt-2">Cargando devoluciones...</div></div>
              ) : (
                <>
                  {returnEvents.length === 0 ? (
                    <Alert color="info">No hay eventos de devolución en el rango seleccionado.</Alert>
                  ) : (
                    <div className="mb-4" style={{ overflowX: "auto" }}>
                      <h6 className="mb-2">Documentos de devolución</h6>
                      <Table bordered responsive size="sm">
                        <thead className="text-primary">
                          <tr>
                            <th style={{ width: 90 }}>No.</th>
                            <th style={{ width: 110 }}>Pedido</th>
                            <th style={{ width: 140 }}>Envío relacionado</th>
                            <th style={{ width: 120 }}>Condición</th>
                            <th>Motivo</th>
                            <th style={{ width: 180 }}>Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {returnEvents.map((e) => (
                            <tr key={e.id}>
                              <td><strong>{e.id}</strong></td>
                              <td>#{e.onlineSaleId || "—"}</td>
                              <td>{e.relatedShipmentNumber || "—"}</td>
                              <td>
                                <Badge color={String(e.itemCondition || "").toUpperCase() === "DAÑADO" ? "danger" : "secondary"}>
                                  {e.itemCondition || "—"}
                                </Badge>
                              </td>
                              <td style={{ whiteSpace: "pre-wrap" }}>{e.returnReason || "—"}</td>
                              <td style={{ whiteSpace: "nowrap" }}>
                                <Button color="default" size="sm" onClick={() => printReturnDocument(e.id)} style={{ padding: "3px 8px" }}>
                                  Imprimir
                                </Button>{" "}
                                <Button color="info" size="sm" onClick={() => void downloadReturnPdf(e.id)} style={{ padding: "3px 8px" }}>
                                  Descargar PDF
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    </div>
                  )}

                  {filteredReturns.length === 0 ? (
                    <Alert color="light" className="mb-0">Sin líneas de inventario de devolución para el filtro actual.</Alert>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <h6 className="mb-2">Líneas ingresadas a inventario de devoluciones</h6>
                      <Table bordered responsive size="sm">
                        <thead className="text-primary">
                          <tr>
                            <th style={{ width: 90 }}>Fecha</th>
                            <th style={{ width: 90 }}>Pedido</th>
                            <th style={{ width: 90 }}>Código</th>
                            <th>Producto</th>
                            <th style={{ width: 120 }}>Color / Talla</th>
                            <th style={{ width: 70 }} className="text-center">Qty</th>
                            <th style={{ width: 110 }} className="text-right">Subtotal</th>
                            <th style={{ width: 110 }}>Condición</th>
                            <th>Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredReturns.map((r) => {
                            const colorSize = [r?.colorName, r?.size].filter(Boolean).join(" / ");
                            return (
                              <tr key={r.id}>
                                <td>{r.returnDate || "—"}</td>
                                <td>#{r.onlineSaleId || "—"}</td>
                                <td>{r.productCode || "—"}</td>
                                <td>{r.productName || "—"}</td>
                                <td>{colorSize || "—"}</td>
                                <td className="text-center">{r.quantity || 0}</td>
                                <td className="text-right">{formatQ(r.subtotal)}</td>
                                <td>
                                  <Badge color={String(r.itemCondition || "").toUpperCase() === "DAÑADO" ? "danger" : "secondary"}>
                                    {r.itemCondition || "—"}
                                  </Badge>
                                </td>
                                <td style={{ whiteSpace: "pre-wrap" }}>{r.returnReason || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </div>
                  )}
                </>
              )}
            </CardBody>
          </Card>
        </TabPane>

        {/* ═══ TAB RESUMEN ═══ */}
        <TabPane tabId="resumen">
          <Row className="mb-3 align-items-end">
            <Col md="3">
              <FormGroup className="mb-md-0">
                <Label className="font-weight-bold">Desde</Label>
                <Input
                  type="date"
                  value={summaryDateFrom}
                  onChange={(e) => setSummaryDateFrom(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup className="mb-md-0">
                <Label className="font-weight-bold">Hasta</Label>
                <Input
                  type="date"
                  value={summaryDateTo}
                  onChange={(e) => setSummaryDateTo(e.target.value)}
                />
              </FormGroup>
            </Col>
            <Col md="2" className="d-flex align-items-end">
              <Button color="primary" size="sm" onClick={loadSummary} disabled={loadingSummary}>
                {loadingSummary ? "Cargando…" : "Actualizar"}
              </Button>
            </Col>
            <Col md="auto" className="d-flex align-items-end">
              <Button color="default" size="sm" onClick={exportToExcel} style={{ marginRight: 4 }} disabled={!summary}>
                <i className="nc-icon nc-cloud-download-93" /> Excel
              </Button>
              <Button color="default" size="sm" onClick={exportToPDF} disabled={!summary}>
                <i className="nc-icon nc-paper" /> PDF
              </Button>
            </Col>
          </Row>

          {loadingSummary ? (
            <div className="text-center p-4"><Spinner color="primary" /></div>
          ) : summary ? (
            <>
              <p className="text-muted mb-3">
                Período: <strong>{summaryRangeLabel}</strong>
                {summary.totalSalesCount != null ? (
                  <span> · {summary.totalSalesCount} venta(s) en el rango</span>
                ) : null}
              </p>
              {/* Tarjetas de resumen */}
              <Row>
                <Col md="3">
                  <Card className="card-stats">
                    <CardBody>
                      <Row>
                        <Col xs="5">
                          <div className="icon-big text-center" style={{ fontSize: 32 }}>📦</div>
                        </Col>
                        <Col xs="7">
                          <div className="numbers">
                            <p className="card-category">Total Ventas</p>
                            <CardTitle tag="p">{summary.totalSalesCount}</CardTitle>
                          </div>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="card-stats">
                    <CardBody>
                      <Row>
                        <Col xs="5">
                          <div className="icon-big text-center" style={{ fontSize: 32 }}>💰</div>
                        </Col>
                        <Col xs="7">
                          <div className="numbers">
                            <p className="card-category">Total Bruto</p>
                            <CardTitle tag="p">{formatQ(summary.totalAmount)}</CardTitle>
                          </div>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="card-stats">
                    <CardBody>
                      <Row>
                        <Col xs="5">
                          <div className="icon-big text-center" style={{ fontSize: 32 }}>💵</div>
                        </Col>
                        <Col xs="7">
                          <div className="numbers">
                            <p className="card-category">Total Neto</p>
                            <CardTitle tag="p" style={{ color: "#2e7d32" }}>{formatQ(summary.totalNetAmount)}</CardTitle>
                          </div>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
                <Col md="3">
                  <Card className="card-stats">
                    <CardBody>
                      <Row>
                        <Col xs="5">
                          <div className="icon-big text-center" style={{ fontSize: 32 }}>🚚</div>
                        </Col>
                        <Col xs="7">
                          <div className="numbers">
                            <p className="card-category">Envíos</p>
                            <CardTitle tag="p">{formatQ(
                              parseFloat(summary.totalAmount || 0) - parseFloat(summary.totalNetAmount || 0)
                            )}</CardTitle>
                          </div>
                        </Col>
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              {/* Por vendedor */}
              <Row>
                {(summary.bySeller || []).map(seller => {
                  const commission = (parseFloat(seller.totalNetAmount) || 0) * 0.02;
                  return (
                    <Col md="6" key={seller.salesperson}>
                      <Card>
                        <CardHeader>
                          <CardTitle tag="h5">👤 {seller.salesperson}</CardTitle>
                        </CardHeader>
                        <CardBody>
                          <Row>
                            <Col>
                              <p><strong>Ventas:</strong> {seller.salesCount}</p>
                              <p><strong>Total:</strong> {formatQ(seller.totalAmount)}</p>
                              <p><strong>Neto:</strong> <span style={{ color: "#2e7d32" }}>{formatQ(seller.totalNetAmount)}</span></p>
                              <p><strong>Comisión (2%):</strong>{" "}
                                <span style={{ color: "#1565c0", fontWeight: 600, fontSize: 16 }}>{formatQ(commission)}</span>
                              </p>
                            </Col>
                          </Row>
                        </CardBody>
                      </Card>
                    </Col>
                  );
                })}
              </Row>

              {/* Por red social y forma de pago */}
              <Row>
                <Col md="6">
                  <Card>
                    <CardHeader><CardTitle tag="h5">📱 Por Red Social</CardTitle></CardHeader>
                    <CardBody>
                      {summary.bySocialNetwork && summary.bySocialNetwork.length > 0 ? (
                        <Table size="sm" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th>Red Social</th>
                              <th className="text-center">Ventas</th>
                              <th className="text-right">Total</th>
                              <th className="text-right" style={{ color: "#2e7d32" }}>Neto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.bySocialNetwork.map(g => (
                              <tr key={g.name}>
                                <td>{getSocialIcon(g.name)}</td>
                                <td className="text-center"><strong>{g.salesCount}</strong></td>
                                <td className="text-right">{formatQ(g.totalAmount)}</td>
                                <td className="text-right" style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(g.totalNetAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      ) : <p className="text-muted">Sin datos</p>}
                    </CardBody>
                  </Card>
                </Col>
                <Col md="6">
                  <Card>
                    <CardHeader><CardTitle tag="h5">💳 Por Forma de Pago</CardTitle></CardHeader>
                    <CardBody>
                      {summary.byPaymentMethod && summary.byPaymentMethod.length > 0 ? (
                        <Table size="sm" style={{ fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th>Forma de Pago</th>
                              <th className="text-center">Ventas</th>
                              <th className="text-right">Total</th>
                              <th className="text-right" style={{ color: "#2e7d32" }}>Neto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {summary.byPaymentMethod.map(g => (
                              <tr key={g.name}>
                                <td>{g.name}</td>
                                <td className="text-center"><strong>{g.salesCount}</strong></td>
                                <td className="text-right">{formatQ(g.totalAmount)}</td>
                                <td className="text-right" style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(g.totalNetAmount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </Table>
                      ) : <p className="text-muted">Sin datos</p>}
                    </CardBody>
                  </Card>
                </Col>
              </Row>

              {/* Por estado */}
              <Row>
                <Col md="12">
                  <Card>
                    <CardHeader><CardTitle tag="h5">📊 Por Estado</CardTitle></CardHeader>
                    <CardBody>
                      <Row>
                        {summary.byStatus && Object.entries(summary.byStatus).map(([key, count]) => {
                          const st = SALE_STATUSES.find(s => s.value === key);
                          return (
                            <Col md="2" key={key} className="text-center mb-2">
                              <Badge color={st ? st.color : "secondary"} style={{ fontSize: 14, padding: "6px 12px" }}>
                                {st ? st.label : key}
                              </Badge>
                              <h4 className="mt-1">{count}</h4>
                            </Col>
                          );
                        })}
                      </Row>
                    </CardBody>
                  </Card>
                </Col>
              </Row>
            </>
          ) : (
            <Card>
              <CardBody className="text-center p-4">
                <p className="text-muted">
                  Elija fecha desde y hasta, luego pulse Actualizar para ver el resumen
                  {summaryRangeLabel ? ` (${summaryRangeLabel})` : ""}.
                </p>
              </CardBody>
            </Card>
          )}
        </TabPane>
        {/* ═══ TAB RESUMEN MENSUAL ═══ */}
        <TabPane tabId="mensual">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="4">
                  <CardTitle tag="h4" className="mb-0">📅 Resumen Mensual</CardTitle>
                </Col>
                <Col md="3">
                  <Input type="month" bsSize="sm" value={monthFilter}
                    onChange={e => setMonthFilter(e.target.value)} />
                </Col>
                <Col md="auto" className="text-right">
                  <Button color="primary" size="sm" onClick={loadMonthlySales} style={{ marginRight: 4 }}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                  <Button color="default" size="sm" onClick={() => exportMonthlyExcel(true)}
                    disabled={monthlySales.length === 0} style={{ marginRight: 4 }} title="Excel con comisiones">
                    <i className="nc-icon nc-cloud-download-93" /> Excel
                  </Button>
                  <Button color="default" size="sm" onClick={() => exportMonthlyPDF(true)}
                    disabled={monthlySales.length === 0} style={{ marginRight: 4 }} title="PDF con comisiones">
                    <i className="nc-icon nc-paper" /> PDF
                  </Button>
                  <Button color="warning" size="sm" onClick={() => exportMonthlyPDF(false)}
                    disabled={monthlySales.length === 0} style={{ marginRight: 4 }} title="PDF sin comisiones">
                    <i className="nc-icon nc-paper" /> PDF s/c
                  </Button>
                  <Button color="warning" size="sm" onClick={() => exportMonthlyExcel(false)}
                    disabled={monthlySales.length === 0} title="Excel sin comisiones">
                    <i className="nc-icon nc-cloud-download-93" /> Excel s/c
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {loadingMonthly ? (
                <div className="text-center p-4"><Spinner color="primary" /></div>
              ) : (() => {
                if (monthlySales.length === 0) {
                  return <p className="text-muted text-center py-4">No hay ventas en este mes.</p>;
                }

                // Agrupar por día
                const byDay = {};
                monthlySales.forEach(s => {
                  const day = s.saleDate;
                  if (!byDay[day]) byDay[day] = [];
                  byDay[day].push(s);
                });

                const sortedDays = Object.keys(byDay).sort();

                // Separar ventas válidas, devoluciones y anuladas
                const validSales = monthlySales.filter(s => s.status !== "DEVOLUCION" && s.status !== "ANULADA");
                const returnedSales = monthlySales.filter(s => s.status === "DEVOLUCION");
                const voidedSales = monthlySales.filter(s => s.status === "ANULADA");

                // Totales del mes (sobre ventas válidas)
                const monthTotalBruto = validSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
                const monthTotalNeto = validSales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
                const monthTotalEnvios = validSales.reduce((sum, s) => sum + (parseFloat(s.shippingCost) || 0), 0);

                // Montos de devoluciones y anuladas
                const totalDevoluciones = returnedSales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);
                const totalAnuladas = voidedSales.reduce((sum, s) => sum + (parseFloat(s.netAmount) || 0), 0);

                // Agrupar ventas válidas por transportista
                const byCarrier = {};
                validSales.forEach(s => {
                  const carrier = SHIPPING_CARRIERS.find(c => c.value === s.shippingCarrier)?.label || s.shippingCarrier || "Sin asignar";
                  if (!byCarrier[carrier]) byCarrier[carrier] = { count: 0, total: 0, net: 0, shipping: 0 };
                  byCarrier[carrier].count++;
                  byCarrier[carrier].total += (parseFloat(s.totalAmount) || 0);
                  byCarrier[carrier].net += (parseFloat(s.netAmount) || 0);
                  byCarrier[carrier].shipping += (parseFloat(s.shippingCost) || 0);
                });

                // DATO DE CONTABILIDAD
                const ventasTotalBruto = validSales.reduce((sum, s) => sum + (parseFloat(s.totalAmount) || 0), 0);
                const pagoEnvioReal = monthTotalEnvios;
                const subTotal = ventasTotalBruto - pagoEnvioReal - totalDevoluciones - totalAnuladas;
                const iva = subTotal / 1.12 * 0.12; // IVA Guatemala 12%
                const ventasNetas = subTotal - iva;
                const comision2Pct = ventasNetas * 0.02;

                // Agrupar por vendedor para el mes
                const bySeller = {};
                monthlySales.forEach(s => {
                  const seller = s.salesperson || "Sin asignar";
                  if (!bySeller[seller]) bySeller[seller] = { count: 0, total: 0, net: 0 };
                  bySeller[seller].count++;
                  bySeller[seller].total += (parseFloat(s.totalAmount) || 0);
                  bySeller[seller].net += (parseFloat(s.netAmount) || 0);
                });

                // Agrupar por red social
                const byMonthSocial = {};
                monthlySales.forEach(s => {
                  const sn = s.socialNetwork || "Otro";
                  if (!byMonthSocial[sn]) byMonthSocial[sn] = { count: 0, total: 0, net: 0 };
                  byMonthSocial[sn].count++;
                  byMonthSocial[sn].total += (parseFloat(s.totalAmount) || 0);
                  byMonthSocial[sn].net += (parseFloat(s.netAmount) || 0);
                });

                // Agrupar por forma de pago
                const byMonthPM = {};
                monthlySales.forEach(s => {
                  const pm = PAYMENT_METHODS.find(x => x.value === s.paymentMethod)?.label || s.paymentMethod || "Otro";
                  if (!byMonthPM[pm]) byMonthPM[pm] = { count: 0, total: 0, net: 0 };
                  byMonthPM[pm].count++;
                  byMonthPM[pm].total += (parseFloat(s.totalAmount) || 0);
                  byMonthPM[pm].net += (parseFloat(s.netAmount) || 0);
                });

                return (
                  <>
                    {/* Tarjetas resumen del mes */}
                    <Row className="mb-3">
                      <Col md="2">
                        <Card className="card-stats">
                          <CardBody>
                            <Row>
                              <Col xs="5"><div className="icon-big text-center" style={{ fontSize: 28 }}>📦</div></Col>
                              <Col xs="7">
                                <div className="numbers">
                                  <p className="card-category">Ventas</p>
                                  <CardTitle tag="p">{monthlySales.length}</CardTitle>
                                </div>
                              </Col>
                            </Row>
                          </CardBody>
                        </Card>
                      </Col>
                      <Col md="2">
                        <Card className="card-stats">
                          <CardBody>
                            <Row>
                              <Col xs="5"><div className="icon-big text-center" style={{ fontSize: 28 }}>💰</div></Col>
                              <Col xs="7">
                                <div className="numbers">
                                  <p className="card-category">Bruto</p>
                                  <CardTitle tag="p">{formatQ(monthTotalBruto)}</CardTitle>
                                </div>
                              </Col>
                            </Row>
                          </CardBody>
                        </Card>
                      </Col>
                      <Col md="2">
                        <Card className="card-stats">
                          <CardBody>
                            <Row>
                              <Col xs="5"><div className="icon-big text-center" style={{ fontSize: 28 }}>💵</div></Col>
                              <Col xs="7">
                                <div className="numbers">
                                  <p className="card-category">Neto</p>
                                  <CardTitle tag="p" style={{ color: "#2e7d32" }}>{formatQ(monthTotalNeto)}</CardTitle>
                                </div>
                              </Col>
                            </Row>
                          </CardBody>
                        </Card>
                      </Col>
                      <Col md="2">
                        <Card className="card-stats">
                          <CardBody>
                            <Row>
                              <Col xs="5"><div className="icon-big text-center" style={{ fontSize: 28 }}>🚚</div></Col>
                              <Col xs="7">
                                <div className="numbers">
                                  <p className="card-category">Envíos</p>
                                  <CardTitle tag="p">{formatQ(monthTotalEnvios)}</CardTitle>
                                </div>
                              </Col>
                            </Row>
                          </CardBody>
                        </Card>
                      </Col>
                      {returnedSales.length > 0 && (
                        <Col md="2">
                          <Card className="card-stats" style={{ borderLeft: "3px solid #ff9800" }}>
                            <CardBody>
                              <div className="numbers">
                                <p className="card-category">🔄 Devoluciones</p>
                                <CardTitle tag="p" style={{ color: "#e65100" }}>{returnedSales.length} — {formatQ(totalDevoluciones)}</CardTitle>
                              </div>
                            </CardBody>
                          </Card>
                        </Col>
                      )}
                      {voidedSales.length > 0 && (
                        <Col md="2">
                          <Card className="card-stats" style={{ borderLeft: "3px solid #d32f2f" }}>
                            <CardBody>
                              <div className="numbers">
                                <p className="card-category">❌ Anuladas</p>
                                <CardTitle tag="p" style={{ color: "#d32f2f" }}>{voidedSales.length} — {formatQ(totalAnuladas)}</CardTitle>
                              </div>
                            </CardBody>
                          </Card>
                        </Col>
                      )}
                    </Row>

                    {/* Resumen por vendedor con comisión */}
                    <Row className="mb-3">
                      {Object.entries(bySeller).map(([seller, data]) => {
                        const commission = data.net * 0.02;
                        return (
                          <Col md="6" key={seller}>
                            <Card>
                              <CardHeader><CardTitle tag="h5">👤 {seller}</CardTitle></CardHeader>
                              <CardBody>
                                <p><strong>Ventas:</strong> {data.count}</p>
                                <p><strong>Total:</strong> {formatQ(data.total)}</p>
                                <p><strong>Neto:</strong> <span style={{ color: "#2e7d32" }}>{formatQ(data.net)}</span></p>
                                <p><strong>Comisión (2%):</strong>{" "}
                                  <span style={{ color: "#1565c0", fontWeight: 700, fontSize: 18 }}>{formatQ(commission)}</span>
                                </p>
                              </CardBody>
                            </Card>
                          </Col>
                        );
                      })}
                    </Row>

                    {/* Por red social y forma de pago */}
                    <Row className="mb-3">
                      <Col md="6">
                        <Card>
                          <CardHeader><CardTitle tag="h5">📱 Por Red Social</CardTitle></CardHeader>
                          <CardBody>
                            <Table size="sm" style={{ fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th>Red Social</th>
                                  <th className="text-center">Ventas</th>
                                  <th className="text-right">Total</th>
                                  <th className="text-right" style={{ color: "#2e7d32" }}>Neto</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(byMonthSocial).map(([key, data]) => (
                                  <tr key={key}>
                                    <td>{getSocialIcon(key)}</td>
                                    <td className="text-center"><strong>{data.count}</strong></td>
                                    <td className="text-right">{formatQ(data.total)}</td>
                                    <td className="text-right" style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(data.net)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </CardBody>
                        </Card>
                      </Col>
                      <Col md="6">
                        <Card>
                          <CardHeader><CardTitle tag="h5">💳 Por Forma de Pago</CardTitle></CardHeader>
                          <CardBody>
                            <Table size="sm" style={{ fontSize: 13 }}>
                              <thead>
                                <tr>
                                  <th>Forma de Pago</th>
                                  <th className="text-center">Ventas</th>
                                  <th className="text-right">Total</th>
                                  <th className="text-right" style={{ color: "#2e7d32" }}>Neto</th>
                                </tr>
                              </thead>
                              <tbody>
                                {Object.entries(byMonthPM).map(([key, data]) => (
                                  <tr key={key}>
                                    <td>{key}</td>
                                    <td className="text-center"><strong>{data.count}</strong></td>
                                    <td className="text-right">{formatQ(data.total)}</td>
                                    <td className="text-right" style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(data.net)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </Table>
                          </CardBody>
                        </Card>
                      </Col>
                    </Row>

                    {/* Tabla de ventas por día */}
                    <Card>
                      <CardHeader><CardTitle tag="h5">Ventas por Día</CardTitle></CardHeader>
                      <CardBody style={{ padding: 0 }}>
                        <Table responsive hover size="sm" style={{ fontSize: 13, marginBottom: 0 }}>
                          <thead style={{ background: "#f8f9fa" }}>
                            <tr>
                              <th>Fecha</th>
                              <th className="text-center">Ventas</th>
                              <th className="text-right">Total Bruto</th>
                              <th className="text-right">Envíos</th>
                              <th className="text-right">Total Neto</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedDays.map(day => {
                              const daySales = byDay[day];
                              const dayBruto = daySales.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0);
                              const dayEnvios = daySales.reduce((s, r) => s + (parseFloat(r.shippingCost) || 0), 0);
                              const dayNeto = daySales.reduce((s, r) => s + (parseFloat(r.netAmount) || 0), 0);
                              return (
                                <tr key={day} style={{ cursor: "pointer" }}
                                  onClick={() => { setFilterDate(day); setActiveTab("ventas"); }}>
                                  <td><strong>{day}</strong></td>
                                  <td className="text-center">{daySales.length}</td>
                                  <td className="text-right">{formatQ(dayBruto)}</td>
                                  <td className="text-right">{formatQ(dayEnvios)}</td>
                                  <td className="text-right" style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(dayNeto)}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot style={{ background: "#e8f5e9", fontWeight: 700 }}>
                            <tr>
                              <td>TOTAL MES</td>
                              <td className="text-center">{monthlySales.length}</td>
                              <td className="text-right">{formatQ(monthTotalBruto)}</td>
                              <td className="text-right">{formatQ(monthTotalEnvios)}</td>
                              <td className="text-right" style={{ color: "#2e7d32" }}>{formatQ(monthTotalNeto)}</td>
                            </tr>
                          </tfoot>
                        </Table>
                      </CardBody>
                    </Card>

                    {/* ═══ DATO DE CONTABILIDAD ═══ */}
                    <Card className="mt-3">
                      <CardHeader style={{ background: "#fff3e0" }}>
                        <CardTitle tag="h5" className="mb-0">📊 Dato de Contabilidad</CardTitle>
                      </CardHeader>
                      <CardBody style={{ padding: 0 }}>
                        <Table bordered size="sm" style={{ fontSize: 14, marginBottom: 0 }}>
                          <tbody>
                            {/* Ventas por transportista */}
                            {Object.entries(byCarrier).map(([carrier, data]) => (
                              <tr key={carrier}>
                                <td style={{ paddingLeft: 24 }}>VENTA {carrier.toUpperCase()}</td>
                                <td className="text-right" style={{ width: 180 }}>{formatQ(data.total)}</td>
                              </tr>
                            ))}
                            <tr style={{ background: "#e3f2fd", fontWeight: 700 }}>
                              <td style={{ paddingLeft: 24 }}>TOTAL VENTAS</td>
                              <td className="text-right">{formatQ(ventasTotalBruto)}</td>
                            </tr>
                            <tr>
                              <td style={{ paddingLeft: 24 }}>(-) PAGO DE ENVÍO</td>
                              <td className="text-right">{formatQ(pagoEnvioReal)}</td>
                            </tr>
                            {returnedSales.length > 0 && (
                              <tr style={{ color: "#d32f2f" }}>
                                <td style={{ paddingLeft: 24 }}>(-) {returnedSales.length} DEVOLUCIONES</td>
                                <td className="text-right">{formatQ(totalDevoluciones)}</td>
                              </tr>
                            )}
                            {voidedSales.length > 0 && (
                              <tr style={{ color: "#d32f2f" }}>
                                <td style={{ paddingLeft: 24 }}>(-) {voidedSales.length} ANULADAS</td>
                                <td className="text-right">{formatQ(totalAnuladas)}</td>
                              </tr>
                            )}
                            <tr style={{ background: "#e8f5e9", fontWeight: 700 }}>
                              <td style={{ paddingLeft: 24 }}>SUB TOTAL</td>
                              <td className="text-right">{formatQ(subTotal)}</td>
                            </tr>
                            <tr>
                              <td style={{ paddingLeft: 24 }}>(-) IVA (12%)</td>
                              <td className="text-right">{formatQ(iva)}</td>
                            </tr>
                            <tr style={{ background: "#c8e6c9", fontWeight: 700, fontSize: 16 }}>
                              <td style={{ paddingLeft: 24 }}>TOTAL VENTAS NETAS</td>
                              <td className="text-right">{formatQ(ventasNetas)}</td>
                            </tr>
                            <tr style={{ borderTop: "2px solid #333" }}>
                              <td style={{ paddingLeft: 24 }}>2% COMISIONES</td>
                              <td className="text-right">{formatQ(comision2Pct)}</td>
                            </tr>
                          </tbody>
                        </Table>
                      </CardBody>
                    </Card>
                  </>
                );
              })()}
            </CardBody>
          </Card>
        </TabPane>

        {/* ═══ TAB PRODUCCIÓN ═══ */}
        <TabPane tabId="produccion">
          <Card>
            <CardHeader>
              <Row className="align-items-start">
                <Col md="7">
                  <CardTitle tag="h4" className="mb-0">
                    Ventas para despacho o producción
                  </CardTitle>
                  <p className="text-muted mb-0" style={{ fontSize: 12 }}>
                    Decide rápido: lo que ya está en Bodega PT o Devoluciones queda listo para despacho; lo demás genera OP.
                  </p>
                </Col>
                <Col md="5" className="text-right">
                  <Button color="default" size="sm" className="mr-2" onClick={loadEligibleSales}>
                    Actualizar
                  </Button>
                  <Button
                    color="success"
                    size="sm"
                    className="mr-2"
                    disabled={selectedWithStock.length === 0 || loadingPO}
                    onClick={handleMarkReadyFromBodega}
                    title="Descuenta inventario (Bodega PT / Devoluciones) y deja la venta PRODUCIDO/lista para despacho"
                  >
                    {loadingPO ? <Spinner size="sm" /> : `Listo para despacho (${selectedWithStock.length})`}
                  </Button>
                  <Button
                    color="primary"
                    size="sm"
                    disabled={selectedWithoutStock.length === 0 || loadingPO}
                    onClick={handleCreatePO}
                    title="Crea OP solo para ventas sin stock en Bodega PT / Devoluciones"
                  >
                    {loadingPO ? <Spinner size="sm" /> : `Crear OP (${selectedWithoutStock.length})`}
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
                <Col md="4">
                  <div style={{ border: "1px solid #e9ecef", borderRadius: 8, padding: 12, background: "#f8f9fa" }}>
                    <div className="text-muted" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
                      Total pendiente
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{filteredEligibleSales.length}</div>
                    <small className="text-muted">{selectedForPO.size} seleccionada(s)</small>
                  </div>
                </Col>
                <Col md="4">
                  <div
                    onClick={selectSalesWithBodegaStock}
                    style={{ border: "1px solid #d4edda", borderRadius: 8, padding: 12, background: "#f3fbf5", cursor: "pointer" }}
                  >
                    <div className="text-success" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
                      En Bodega PT / Devoluciones
                    </div>
                    <div className="text-success" style={{ fontSize: 24, fontWeight: 700 }}>{visibleWithStock.length}</div>
                    <small className="text-muted">Click para seleccionar y dejar listo</small>
                  </div>
                </Col>
                <Col md="4">
                  <div
                    onClick={selectSalesWithoutBodegaStock}
                    style={{ border: "1px solid #cce5ff", borderRadius: 8, padding: 12, background: "#f4f9ff", cursor: "pointer" }}
                  >
                    <div className="text-primary" style={{ fontSize: 11, textTransform: "uppercase", fontWeight: 700 }}>
                      Requiere producción
                    </div>
                    <div className="text-primary" style={{ fontSize: 24, fontWeight: 700 }}>{visibleWithoutStock.length}</div>
                    <small className="text-muted">Click para seleccionar y crear OP</small>
                  </div>
                </Col>
              </Row>

              <Row className="mb-3 align-items-end">
                <Col md="2">
                  <Label className="mb-1">Desde</Label>
                  <Input type="date" bsSize="sm" value={productionDateFrom}
                    onChange={e => setProductionDateFrom(e.target.value)} />
                </Col>
                <Col md="2">
                  <Label className="mb-1">Hasta</Label>
                  <Input type="date" bsSize="sm" value={productionDateTo}
                    onChange={e => setProductionDateTo(e.target.value)} />
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="primary" size="sm" onClick={applyProductionDateFilter} className="mr-2">
                    Filtrar
                  </Button>
                  <Button color="default" size="sm" onClick={clearProductionDateFilter}>
                    Ver todas
                  </Button>
                </Col>
                <Col md="2">
                  <Label className="mb-1">Seleccionar día</Label>
                  <Input type="date" bsSize="sm" value={productionBulkDate}
                    onChange={e => setProductionBulkDate(e.target.value)} />
                </Col>
                <Col md="3" className="text-right">
                  <Button color="secondary" size="sm" onClick={selectAllForDay} className="mr-2">
                    Seleccionar día
                  </Button>
                  <Button color="danger" size="sm" outline onClick={clearProductionSelection}>
                    Limpiar
                  </Button>
                </Col>
              </Row>

              {filteredEligibleSales.length === 0 ? (
                <Alert color="info">
                  <strong>Sin ventas elegibles para el filtro aplicado.</strong> Ajusta fechas o usa "Ver todas".
                </Alert>
              ) : (
                <>
                  <div className="mb-2 text-muted" style={{ fontSize: 12 }}>
                    Mostrando <strong>{filteredEligibleSales.length}</strong> venta(s). En esta vista hay <strong>{selectedInFiltered}</strong> seleccionada(s).
                  </div>
                  <Table responsive hover size="sm" style={{ fontSize: 12 }}>
                    <thead style={{ background: "#f8f9fa" }}>
                      <tr>
                        <th style={{ width: 40, textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={allFilteredSelected}
                            onChange={toggleSelectAll}
                            title="Seleccionar todas las ventas visibles"
                            style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2e7d32" }}
                          />
                        </th>
                        <th>Venta</th>
                        <th>Cliente</th>
                        <th>Productos</th>
                        <th>Acción</th>
                        <th style={{ minWidth: 160 }}>Cuero (OPL)</th>
                        <th className="text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEligibleSales.map(sale => (
                        <tr key={sale.id} style={{
                          background: selectedForPO.has(sale.id) ? "#e8f5e9" : "transparent"
                        }}>
                          <td style={{ textAlign: "center" }}>
                            <input
                              type="checkbox"
                              checked={selectedForPO.has(sale.id)}
                              onChange={() => toggleSelectForPO(sale.id)}
                              title={`Seleccionar venta #${sale.saleNumber}`}
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2e7d32" }}
                            />
                          </td>
                          <td>
                            <strong>#{sale.saleNumber}</strong>
                            <div className="text-muted">{sale.saleDate}</div>
                          </td>
                          <td>{sale.customerName}</td>
                          <td style={{ fontSize: 11 }}>
                            {(sale.items && sale.items.length > 0) ? sale.items.slice(0, 2).map((it, i) => (
                              <div key={i}>
                                <strong>{it.productCode}</strong> {it.productName}
                                {it.colorName && <span className="text-muted"> · {it.colorName}</span>}
                                {(it.quantity && it.quantity > 1) && <span className="text-primary font-weight-bold"> x{it.quantity}</span>}
                              </div>
                            )) : (
                              <div>
                                <strong>{sale.productCode}</strong> {sale.productName}
                                {sale.colorName && <span className="text-muted"> · {sale.colorName}</span>}
                                {(sale.quantity && sale.quantity > 1) && <span className="text-primary font-weight-bold"> x{sale.quantity}</span>}
                              </div>
                            )}
                            {sale.items && sale.items.length > 2 && (
                              <small className="text-muted">+{sale.items.length - 2} producto(s) más</small>
                            )}
                          </td>
                          <td>
                            {saleIsPartial(sale) ? (
                              <div>
                                <Badge color="warning">Mixto</Badge>
                                <div className="text-muted" style={{ fontSize: 11, marginBottom: 4 }}>
                                  Algunos items en stock, otros a OP
                                </div>
                                <Button
                                  color="warning"
                                  size="sm"
                                  outline
                                  onClick={(e) => { e.stopPropagation(); openResolveMixedModal(sale); }}
                                  disabled={resolveLoading}
                                >
                                  Resolver
                                </Button>
                              </div>
                            ) : saleHasBodegaStock(sale) ? (
                              <div>
                                <Badge color="success">Listo para despacho</Badge>
                                <div className="text-muted" style={{ fontSize: 11 }}>
                                  {(() => {
                                    const src = saleInventorySource(sale);
                                    if (src === "DEVOLUCIONES") return "Stock en Devoluciones";
                                    if (src === "BODEGA_PT") return "Stock en Bodega PT";
                                    if (src === "MIXTO") return "Stock mixto (Devoluciones + PT)";
                                    return "Stock disponible";
                                  })()}
                                </div>
                              </div>
                            ) : saleNeedsProduction(sale) ? (
                              <div>
                                <Badge color="primary">Crear OP</Badge>
                                <div className="text-muted" style={{ fontSize: 11 }}>Sin stock PT / Devoluciones</div>
                              </div>
                            ) : (
                              <Badge color="secondary">Revisar</Badge>
                            )}
                          </td>
                          <td style={{ fontSize: 11, verticalAlign: "top" }}>
                            {saleIsPartial(sale) || saleHasBodegaStock(sale) ? (
                              <span className="text-muted">—</span>
                            ) : saleNeedsProduction(sale) ? (
                              <div>
                                {saleLeatherOkForOpl(sale) ? (
                                  <Badge color="success">Cuero OK</Badge>
                                ) : (
                                  <Badge color="danger">Cuero / config</Badge>
                                )}
                                {saleLeatherSummaryLines(sale).length > 0 && (
                                  <ul className="pl-3 mb-0 mt-1 text-muted" style={{ fontSize: 10 }}>
                                    {saleLeatherSummaryLines(sale).map((ln, i) => (
                                      <li key={i}>{ln}</li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td className="text-right">
                            <strong>{formatQ(sale.totalAmount)}</strong>
                            <div className="text-muted" style={{ fontSize: 11 }}>
                              {getSimplePaymentLabel(sale.paymentMethodDisplay || sale.paymentMethod)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              )}
            </CardBody>
          </Card>
        </TabPane>
      </TabContent>

      {/* ═══ MODAL FORMULARIO ═══ */}
      <Modal isOpen={showForm} toggle={() => setShowForm(false)} size="lg" modalClassName="online-sale-form-modal">
        <ModalHeader toggle={() => setShowForm(false)}>
          {editingId ? "Editar Venta" : "Nueva Venta Online"}
        </ModalHeader>
        <ModalBody>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label className="font-weight-bold">Vendedor *</Label>
                <Input type="select" value={formData.salesperson}
                  onChange={e => setFormData(prev => ({ ...prev, salesperson: e.target.value }))}>
                  {SALESPERSONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Input>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label className="font-weight-bold">Fecha</Label>
                <Input type="date" value={formData.saleDate}
                  onChange={e => setFormData(prev => ({ ...prev, saleDate: e.target.value }))} />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label className="font-weight-bold">Red Social</Label>
                <Input type="select" value={formData.socialNetwork}
                  onChange={e => setFormData(prev => ({ ...prev, socialNetwork: e.target.value }))}>
                  {SOCIAL_NETWORKS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Input>
              </FormGroup>
            </Col>
          </Row>

          <hr />
          <h6 className="text-muted mb-3">DATOS DEL CLIENTE</h6>
          <Row>
            <Col md="6">
              <FormGroup>
                <Label>Nombre *</Label>
                <Input value={formData.customerName}
                  onChange={e => setFormData(prev => ({ ...prev, customerName: e.target.value }))}
                  placeholder="Nombre del cliente" />
              </FormGroup>
            </Col>
            <Col md="6">
              <FormGroup>
                <Label>Dirección</Label>
                <Input value={formData.address}
                  onChange={e => setFormData(prev => ({ ...prev, address: e.target.value }))}
                  placeholder="Dirección de envío" />
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="3">
              <FormGroup>
                <Label>Teléfono</Label>
                <Input value={formData.phone}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="Número de teléfono" />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Teléfono 2</Label>
                <Input value={formData.phone2}
                  onChange={e => setFormData(prev => ({ ...prev, phone2: e.target.value }))}
                  placeholder="Segundo número" />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Correo Electrónico</Label>
                <Input type="email" value={formData.email}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="email@ejemplo.com" />
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Factura (NIT / CF)</Label>
                <Input value={formData.invoiceTaxId}
                  onChange={e => setFormData(prev => ({ ...prev, invoiceTaxId: e.target.value }))}
                  placeholder="NIT o CF" />
              </FormGroup>
            </Col>
          </Row>

          <hr />
          <h6 className="text-muted mb-2">
            PRODUCTOS
            <Button color="success" size="sm" className="ml-2" onClick={addItem}
              style={{ padding: "2px 8px", fontSize: 11 }}>
              + Agregar producto
            </Button>
          </h6>
          {(formData.items || []).map((item, idx) => (
            <div key={idx} style={{
              border: "1px solid #e0e0e0", borderRadius: 6, padding: "10px 12px",
              marginBottom: 8, background: idx % 2 === 0 ? "#fafafa" : "#fff"
            }}>
              <Row className="align-items-end">
                <Col md="8">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>Producto *</Label>
                    <ProductSelector products={products} value={item.productId}
                      onChange={(p) => handleItemProductSelect(idx, p)} />
                  </FormGroup>
                </Col>
                <Col md="4">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>Color</Label>
                    <ColorSelector colors={colors} value={item.colorId}
                      onChange={(c) => handleItemColorSelect(idx, c)} />
                  </FormGroup>
                </Col>
              </Row>
              <Row className="align-items-end mt-1">
                <Col md="2">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>Talla</Label>
                    <Input bsSize="sm" value={item.size}
                      onChange={e => updateItem(idx, "size", e.target.value)}
                      placeholder="M, L..." />
                  </FormGroup>
                </Col>
                <Col md="2">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>Cant.</Label>
                    <Input bsSize="sm" type="number" min="1" value={item.quantity}
                      onChange={e => updateItem(idx, "quantity", e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>P. Unit. (Q)</Label>
                    <Input bsSize="sm" type="number" step="0.01" value={item.unitPrice}
                      onChange={e => updateItem(idx, "unitPrice", e.target.value)}
                      placeholder="Auto" />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup className="mb-1">
                    <Label style={{ fontSize: 11 }}>Subtotal</Label>
                    <div style={{ fontWeight: 600, fontSize: 13, minHeight: 31, display: "flex", alignItems: "center" }}>
                      {formatQ((parseFloat(item.unitPrice) || 0) * (parseInt(item.quantity) || 1))}
                    </div>
                  </FormGroup>
                </Col>
                <Col md="2" className="text-right">
                  {formData.items.length > 1 && (
                    <Button color="danger" size="sm" className="btn-icon btn-round"
                      onClick={() => removeItem(idx)}
                      style={{ padding: "2px 6px", marginBottom: 8 }}>
                      <i className="nc-icon nc-simple-remove" />
                    </Button>
                  )}
                </Col>
              </Row>
            </div>
          ))}
          <Row className="mt-2">
            <Col md="4">
              <div style={{ fontSize: 13 }}>
                <strong>{formData.items.length}</strong> producto(s)
              </div>
            </Col>
            <Col md="4" className="text-center">
              <div style={{ fontSize: 14, fontWeight: 600, color: "#2e7d32" }}>
                Neto: {formatQ(computedNet)}
              </div>
            </Col>
            <Col md="4" className="text-right">
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                Total: {formatQ(computedTotal)} <small style={{ color: "#999" }}>(+envío Q{computedShipping})</small>
              </div>
            </Col>
          </Row>

          <hr />
          <h6 className="text-muted mb-3">PAGO Y ENVÍO</h6>
          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Forma de Pago *</Label>
                <Input type="select" value={formData.paymentMethod}
                  onChange={e => setFormData(prev => ({ ...prev, paymentMethod: e.target.value }))}>
                  {PAYMENT_METHODS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Input>
              </FormGroup>
            </Col>
            <Col md="2">
              <FormGroup>
                <Label>Costo Envío</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formData.shippingCost ?? ""}
                  onChange={e => setFormData(prev => ({ ...prev, shippingCost: e.target.value }))}
                  placeholder={`Sugerido: Q ${computedShipping}.00`}
                />
                <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                  Sugerido segun pago: Q {computedShipping}.00
                </div>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Transporte</Label>
                <Input type="select" value={formData.shippingCarrier}
                  onChange={e => setFormData(prev => ({ ...prev, shippingCarrier: e.target.value }))}>
                  {SHIPPING_CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </Input>
              </FormGroup>
            </Col>
            <Col md="3">
              <FormGroup>
                <Label>Empaque</Label>
                <div className="mt-2">
                  <Label check style={{ cursor: "pointer" }}>
                    <Input type="checkbox" checked={formData.packaging}
                      onChange={e => setFormData(prev => ({ ...prev, packaging: e.target.checked }))} />
                    {" "}Sí, con empaque
                  </Label>
                </div>
              </FormGroup>
            </Col>
          </Row>

          <Row>
            <Col md="4">
              <FormGroup>
                <Label>Autorización</Label>
                <Input value={formData.paymentAuthorization}
                  onChange={e => setFormData(prev => ({ ...prev, paymentAuthorization: e.target.value }))}
                  placeholder="No. autorización" />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>No. de Guía</Label>
                <Input value={formData.guideNumber}
                  onChange={e => setFormData(prev => ({ ...prev, guideNumber: e.target.value }))}
                  placeholder="Número de guía de envío" />
              </FormGroup>
            </Col>
            <Col md="4">
              <FormGroup>
                <Label>Estado</Label>
                <div className="pt-2">
                  <Badge color="warning">Pendiente (automático)</Badge>
                </div>
              </FormGroup>
            </Col>
          </Row>
          <Row>
            <Col md="12">
              <FormGroup>
                <Label>Observaciones</Label>
                <Input type="textarea" rows="2" value={formData.observations}
                  onChange={e => setFormData(prev => ({ ...prev, observations: e.target.value }))}
                  placeholder="Notas adicionales..." />
              </FormGroup>
            </Col>
          </Row>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowForm(false)}>Cancelar</Button>
          <Button color="primary" onClick={handleSave} disabled={loading}>
            {loading ? <Spinner size="sm" /> : (editingId ? "Actualizar" : "Guardar Venta")}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ─── Modal Import CSV ─────────────────────────────────────── */}
      <Modal isOpen={showImportModal} toggle={() => { setShowImportModal(false); setImportPreview(null); }} size="xl">
        <ModalHeader toggle={() => { setShowImportModal(false); setImportPreview(null); }}>
          Importar Ventas desde CSV
        </ModalHeader>
        <ModalBody>
          {importPreview && (() => {
            const dates = [...new Set(importPreview.map(s => s.saleDate).filter(Boolean))].sort();
            const sellers = [...new Set(importPreview.map(s => s.salesperson).filter(Boolean))];
            const totalNet = importPreview.reduce((s, v) => s + (v.netAmount || 0), 0);
            return (
              <>
                <Alert color="info" style={{ fontSize: 13 }}>
                  <strong>{importPreview.length}</strong> ventas encontradas
                  {" | "}<strong>Fechas:</strong> {dates[0]} a {dates[dates.length - 1]}
                  {" | "}<strong>Vendedores:</strong> {sellers.join(", ")}
                  {" | "}<strong>Total neto:</strong> {formatQ(totalNet)}
                </Alert>
                <div style={{ maxHeight: 420, overflow: "auto", fontSize: 11 }}>
                  <Table size="sm" bordered hover>
                    <thead style={{ position: "sticky", top: 0, background: "#fff", zIndex: 1 }}>
                      <tr>
                        <th>#</th>
                        <th>Fecha</th>
                        <th>Nombre</th>
                        <th>Producto(s)</th>
                        <th>Color</th>
                        <th>Total</th>
                        <th>Envío</th>
                        <th>Neto</th>
                        <th>F. Pago</th>
                        <th>Transporte</th>
                        <th>Vendedor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {importPreview.map((s, i) => (
                        <tr key={i}>
                          <td>{s.saleNumber}</td>
                          <td>{s.saleDate}</td>
                          <td style={{ maxWidth: 150, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                            title={s.customerName}>{s.customerName}</td>
                          <td>{s.items?.map(it => it.productName).join(", ")}</td>
                          <td>{s.items?.map(it => it.colorName).filter(Boolean).join(", ")}</td>
                          <td className="text-right">{formatQ(s.totalAmount)}</td>
                          <td className="text-right">{formatQ(s.shippingCost)}</td>
                          <td className="text-right">{formatQ(s.netAmount)}</td>
                          <td>{PAYMENT_METHODS.find(p => p.value === s.paymentMethod)?.label || s.paymentMethod || "—"}</td>
                          <td>{s.shippingCarrier || "—"}</td>
                          <td>{s.salesperson || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              </>
            );
          })()}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => { setShowImportModal(false); setImportPreview(null); }}>
            Cancelar
          </Button>
          <Button color="success" onClick={handleImportCSV} disabled={importingCSV}>
            {importingCSV ? <><Spinner size="sm" /> Importando...</>
              : <>Importar {importPreview?.length || 0} ventas</>}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL REGISTRO DE ENVIO ═══ */}
      <Modal isOpen={showShipmentModal} toggle={() => setShowShipmentModal(false)}>
        <ModalHeader toggle={() => setShowShipmentModal(false)}>
          🚚 Preparar envío (antes de producción / bodega)
        </ModalHeader>
        <ModalBody>
          {shipmentSale && (
            <Alert color="light">
              <div><strong>Pedido:</strong> #{shipmentSale.saleNumber || shipmentSale.id}</div>
              <div><strong>Cliente:</strong> {shipmentSale.customerName || "—"}</div>
              <div><strong>Total:</strong> {formatQ(shipmentSale.totalAmount)}</div>
            </Alert>
          )}
          <FormGroup>
            <Label>Transporte *</Label>
            <Input type="select" value={shipmentForm.shippingCarrier}
              onChange={e => setShipmentForm(prev => ({ ...prev, shippingCarrier: e.target.value }))}
              onBlur={autoSaveShipmentPrep}>
              {SHIPPING_CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Input>
          </FormGroup>
          <FormGroup>
            <Label>No. Guía (paquetería)</Label>
            <Input value={shipmentForm.guideNumber}
              onChange={e => setShipmentForm(prev => ({ ...prev, guideNumber: e.target.value }))}
              onBlur={autoSaveShipmentPrep}
              placeholder="Opcional si aún no la tienen; con transporte igual se asigna ENVL" />
          </FormGroup>
          <FormGroup className="mb-0">
            <Label>Observaciones</Label>
            <Input type="textarea" rows={3} value={shipmentForm.observations}
              onChange={e => setShipmentForm(prev => ({ ...prev, observations: e.target.value }))}
              onBlur={autoSaveShipmentPrep}
              placeholder="Notas del envío..." />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowShipmentModal(false)}>Cerrar</Button>
          <Button
            color="info"
            onClick={() => shipmentSale && downloadShipmentPdf(shipmentSale)}
            disabled={!shipmentSale}
          >
            Descargar PDF
          </Button>
          <Button
            color="default"
            onClick={() => shipmentSale && void printShipmentDocument(shipmentSale)}
            disabled={!shipmentSale}
          >
            Imprimir
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL CAMBIO ═══ */}
      <Modal isOpen={showExchangeModal} toggle={() => setShowExchangeModal(false)} size="lg">
        <ModalHeader toggle={() => setShowExchangeModal(false)}>
          🔁 Registrar CAMBIO (nuevo envío Q0)
        </ModalHeader>
        <ModalBody>
          {exchangeOriginalSale && (
            <Alert color="light">
              <div><strong>Pedido:</strong> #{exchangeOriginalSale.saleNumber || exchangeOriginalSale.id}</div>
              <div><strong>Cliente:</strong> {exchangeOriginalSale.customerName || "—"}</div>
              <div><strong>Envío relacionado:</strong> {exchangeOriginalSale.shipmentNumber || "—"}</div>
              <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
                El cambio se crea como un nuevo envío con monto <strong>Q0</strong> y con un <strong>ENVL nuevo</strong>.
              </div>
            </Alert>
          )}

          <Row className="mb-3">
            <Col md="4">
              <Label>Transporte</Label>
              <Input type="select" value={exchangeForm.shippingCarrier}
                onChange={(e) => setExchangeForm(prev => ({ ...prev, shippingCarrier: e.target.value }))}>
                {SHIPPING_CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </Input>
            </Col>
            <Col md="4">
              <Label>No. Guía (opcional)</Label>
              <Input value={exchangeForm.guideNumber}
                onChange={(e) => setExchangeForm(prev => ({ ...prev, guideNumber: e.target.value }))}
                placeholder="Guía del cambio (si aplica)" />
            </Col>
            <Col md="4">
              <Label>Observaciones</Label>
              <Input value={exchangeForm.observations}
                onChange={(e) => setExchangeForm(prev => ({ ...prev, observations: e.target.value }))}
                placeholder="Notas del cambio..." />
            </Col>
          </Row>

          <h6 className="mb-2">Items a reenviar</h6>
          {exchangeItems.length === 0 ? (
            <Alert color="warning">No se encontraron items para el cambio.</Alert>
          ) : (
            <Table bordered responsive size="sm">
              <thead className="text-primary">
                <tr>
                  <th style={{ width: 50 }}>OK</th>
                  <th style={{ width: 90 }}>Código</th>
                  <th>Producto</th>
                  <th style={{ width: 140 }}>Color / Talla</th>
                  <th style={{ width: 110 }}>Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {exchangeItems.map((it) => (
                  <tr key={it.key}>
                    <td className="text-center">
                      <Input
                        type="checkbox"
                        checked={Boolean(it.selected)}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setExchangeItems(prev => prev.map(p => p.key === it.key ? { ...p, selected: checked } : p));
                        }}
                      />
                    </td>
                    <td><strong>{it.productCode || "—"}</strong></td>
                    <td>{it.productName || "—"}</td>
                    <td>{[it.colorName, it.size].filter(Boolean).join(" / ") || "—"}</td>
                    <td>
                      <Input
                        type="number"
                        min={1}
                        value={it.quantity}
                        onChange={(e) => {
                          const next = parseInt(e.target.value, 10);
                          setExchangeItems(prev => prev.map(p => p.key === it.key ? { ...p, quantity: Number.isFinite(next) ? next : 1 } : p));
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}

          {exchangeCreatedSale && (
            <Alert color="success" className="mt-3">
              CAMBIO creado. ENVL: <strong>{exchangeCreatedSale.shipmentNumber || "—"}</strong>
              <div className="mt-2">
                <Button color="info" size="sm" onClick={() => void downloadExchangePdf(exchangeCreatedSale)}>
                  Descargar PDF
                </Button>{" "}
                <Button color="default" size="sm" onClick={() => printExchangeDocument(exchangeCreatedSale)}>
                  Imprimir
                </Button>
              </div>
            </Alert>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowExchangeModal(false)}>Cerrar</Button>
          <Button color="primary" onClick={handleCreateExchange} disabled={creatingExchange}>
            {creatingExchange ? <><Spinner size="sm" /> Creando...</> : "Crear CAMBIO"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL DEVOLUCIÓN ═══ */}
      <Modal isOpen={showReturnModal} toggle={() => setShowReturnModal(false)}>
        <ModalHeader toggle={() => setShowReturnModal(false)}>
          🔄 Registrar Devolución
        </ModalHeader>
        <ModalBody>
          <p className="text-muted mb-3">
            Al marcar como devolución, los productos se ingresarán automáticamente al inventario de devoluciones.
          </p>
          <FormGroup>
            <Label>Razón de la devolución</Label>
            <Input type="textarea" rows={3} value={returnReason}
              onChange={e => setReturnReason(e.target.value)}
              placeholder="Ej: Cliente no le quedó la talla, producto dañado en transporte..." />
          </FormGroup>
          <FormGroup>
            <Label>Condición del producto</Label>
            <Input type="select" value={returnCondition} onChange={e => setReturnCondition(e.target.value)}>
              <option value="BUENO">Bueno (revendible)</option>
              <option value="DAÑADO">Dañado</option>
              <option value="USADO">Usado</option>
            </Input>
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowReturnModal(false)}>Cancelar</Button>
          <Button color="dark" onClick={handleReturn}>Confirmar Devolución</Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL ANULACIÓN ═══ */}
      <Modal isOpen={showVoidModal} toggle={() => setShowVoidModal(false)}>
        <ModalHeader toggle={() => setShowVoidModal(false)}>
          ❌ Anular Venta
        </ModalHeader>
        <ModalBody>
          <p className="text-muted mb-3">
            La venta se marcará como anulada y se descontará del resumen contable.
          </p>
          <FormGroup>
            <Label>Razón de la anulación</Label>
            <Input type="textarea" rows={3} value={voidReason}
              onChange={e => setVoidReason(e.target.value)}
              placeholder="Ej: Cliente canceló el pedido, error en la orden..." />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowVoidModal(false)}>Cancelar</Button>
          <Button color="danger" onClick={handleVoid}>Confirmar Anulación</Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL RESULTADO FULFILLMENT ═══ */}
      <Modal isOpen={showFulfillmentModal} toggle={() => setShowFulfillmentModal(false)} size="lg">
        <ModalHeader toggle={() => setShowFulfillmentModal(false)}>
          📦 Resultado del Procesamiento — Bodega PT / Devoluciones
        </ModalHeader>
        <ModalBody>
          {fulfillmentResult && (
            <>
              {!fulfillmentResult.bodegaPtFound && (
                <Alert color="warning" className="mb-3">
                  ⚠ No se encontró la ubicación <strong>BODEGA_PT</strong> o <strong>Bodega Devoluciones</strong> configurada en el sistema.
                  Todas las ventas fueron enviadas a producción.
                </Alert>
              )}

              {/* Ventas despachadas desde inventario */}
              {(fulfillmentResult.fulfilledFromInventory || []).length > 0 && (
                <div className="mb-4">
                  <h6 className="text-success font-weight-bold mb-2">
                    ✅ Despachadas desde Inventario ({fulfillmentResult.fulfilledCount})
                  </h6>
                  <p className="text-muted mb-2" style={{ fontSize: 12 }}>
                    Estas ventas tenían stock disponible en Bodega PT / Devoluciones. El inventario fue descontado y las ventas
                    pasaron a estado <strong>PRODUCIDO</strong> — listas para enviar.
                  </p>
                  <Table size="sm" bordered responsive>
                    <thead style={{ backgroundColor: "#d4edda" }}>
                      <tr>
                        <th># Venta</th>
                        <th>Cliente</th>
                        <th>N° envío</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fulfillmentResult.fulfilledFromInventory.map((f, i) => (
                        <tr key={i}>
                          <td><Badge color="success">{f.saleNumber}</Badge></td>
                          <td>{f.customerName}</td>
                          <td>
                            {f.shipmentNumber ? (
                              <Badge color="primary">{f.shipmentNumber}</Badge>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td><small className="text-muted">{f.message}</small></td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}

              {/* Órdenes de producción creadas */}
              {(fulfillmentResult.productionOrdersCreated || []).length > 0 && (
                <div className="mb-3">
                  <h6 className="text-primary font-weight-bold mb-2">
                    🏭 Órdenes de Producción Creadas ({fulfillmentResult.productionCount})
                  </h6>
                  <p className="text-muted mb-2" style={{ fontSize: 12 }}>
                    Estas ventas no tenían stock suficiente en Bodega PT / Devoluciones.
                    Se generaron órdenes de producción y tareas para su fabricación.
                  </p>
                  <Table size="sm" bordered responsive>
                    <thead style={{ backgroundColor: "#cce5ff" }}>
                      <tr>
                        <th>Código OP</th>
                        <th>Cliente</th>
                        <th>Ventas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fulfillmentResult.productionOrdersCreated.map((p, i) => (
                        <tr key={i}>
                          <td><Badge color="primary">{p.productionOrderCode}</Badge></td>
                          <td>{p.customerName}</td>
                          <td>{p.salesCount} venta(s)</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {fulfillmentResult.tasksError && (
                    <Alert color="warning" className="mt-2 mb-0">
                      <small>⚠ Atención en generación de tareas: {fulfillmentResult.tasksError}</small>
                    </Alert>
                  )}
                </div>
              )}

              {(fulfillmentResult.kioskOutflows || []).length > 0 && (
                <div className="mb-3">
                  <h6 className="text-dark font-weight-bold mb-2">
                    Boleta salida kiosko (cuero → oficina / OPL)
                  </h6>
                  <p className="text-muted mb-2" style={{ fontSize: 12 }}>
                    Se descontó material en kiosko según faltante frente a taller; no suma inventario en destino.
                  </p>
                  <Table size="sm" bordered responsive>
                    <thead style={{ backgroundColor: "#fff3cd" }}>
                      <tr>
                        <th>Boleta</th>
                        <th>Material</th>
                        <th>Kiosko</th>
                        <th className="text-right">Cant.</th>
                        <th>Venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fulfillmentResult.kioskOutflows || []).map((k, i) => (
                        <tr key={i}>
                          <td><Badge color="warning">{k.ticketNumber}</Badge></td>
                          <td style={{ fontSize: 11 }}>{k.materialName || k.materialId}</td>
                          <td style={{ fontSize: 11 }}>{k.kioskName || k.kioskLocationId}</td>
                          <td className="text-right">{k.quantity}</td>
                          <td><Badge color="secondary">{k.saleNumber}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                </div>
              )}

              {/* Sin resultados */}
              {fulfillmentResult.fulfilledCount === 0 && fulfillmentResult.productionCount === 0 && (
                <Alert color="info">No se procesó ninguna venta.</Alert>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="primary" onClick={() => setShowFulfillmentModal(false)}>Entendido</Button>
        </ModalFooter>
      </Modal>

      {/* ═══ MODAL RESOLVER VENTA MIXTA ═══ */}
      <Modal isOpen={!!resolveSale} toggle={closeResolveMixedModal} size="lg">
        <ModalHeader toggle={closeResolveMixedModal}>
          Resolver venta {resolveSale ? `#${resolveSale.saleNumber}` : ""}
        </ModalHeader>
        <ModalBody>
          {resolveLoading ? (
            <div className="text-center py-3">
              <Spinner size="sm" /> <span className="ml-2">Cargando detalle de items...</span>
            </div>
          ) : (
            <>
              <Alert color="info" className="mb-3" style={{ fontSize: 12 }}>
                Se mantiene el <strong>mismo numero de venta y cliente</strong>. Por item,&nbsp;<strong>Producir</strong> forma
                lineas solo en una OP (el resto de la venta no se mueve).
                Las lineas en <strong>Despachar</strong> quedan en esta venta; “Listo para despacho” requiere <strong>cerrar todas</strong> las lineas:
                stock PT/Devoluciones donde corresponda y recepciones completas en PT para lo producido.
              </Alert>

              {resolveError && <Alert color="danger" className="mb-3">{resolveError}</Alert>}

              {resolveItems.length === 0 ? (
                <Alert color="warning">La venta no tiene items detallados para resolver.</Alert>
              ) : (
                <Table size="sm" bordered responsive>
                  <thead className="thead-light">
                    <tr>
                      <th>Producto</th>
                      <th className="text-right">Pide</th>
                      <th className="text-right">Devoluciones</th>
                      <th className="text-right">Bodega PT</th>
                      <th className="text-right">Total</th>
                      <th>Cuero (si OP)</th>
                      <th>Accion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resolveItems.map((it, idx) => {
                      const key = it.saleItemId != null ? String(it.saleItemId) : `idx-${idx}`;
                      const action = resolveActions[key] || "PRODUCE";
                      const stockDev = Number(it.stockDevoluciones || 0);
                      const stockPt = Number(it.stockBodegaPt || 0);
                      const stockTotal = Number(it.stockTotal || (stockDev + stockPt));
                      const needed = Number(it.quantity || 0);
                      const dispatchOk = stockTotal >= needed;
                      return (
                        <tr key={key}>
                          <td>
                            <strong>{it.productCode}</strong> {it.productName}
                            {it.colorName && <span className="text-muted"> · {it.colorName}</span>}
                            {it.size && <span className="text-muted"> · Talla {it.size}</span>}
                          </td>
                          <td className="text-right"><strong>{needed}</strong></td>
                          <td className="text-right">
                            {stockDev > 0 ? <Badge color="success">{stockDev}</Badge> : <span className="text-muted">0</span>}
                          </td>
                          <td className="text-right">
                            {stockPt > 0 ? <Badge color="info">{stockPt}</Badge> : <span className="text-muted">0</span>}
                          </td>
                          <td className="text-right">
                            <strong style={{ color: dispatchOk ? "#28a745" : "#dc3545" }}>{stockTotal}</strong>
                          </td>
                          <td style={{ fontSize: 10, maxWidth: 220 }}>
                            {action === "PRODUCE" && Array.isArray(it.leatherExplanation) && it.leatherExplanation.length > 0 ? (
                              <ul className="pl-3 mb-0 text-muted">
                                {it.leatherExplanation.map((ln, li) => (
                                  <li key={li}>{ln}</li>
                                ))}
                              </ul>
                            ) : action === "PRODUCE" && it.leatherStatus && it.leatherStatus !== "N/A" ? (
                              <span className="text-muted">
                                {it.leatherStatus === "TALLER" && "Cuero en taller suficiente"}
                                {it.leatherStatus === "KIOSKO" && "Cubrible desde kiosko al procesar"}
                                {it.leatherStatus === "BLOQUEADO" && "Sin cuero suficiente"}
                                {it.leatherStatus === "SIN_CONFIG" && "Sin mapeo producto/color → cuero"}
                              </span>
                            ) : (
                              <span className="text-muted">—</span>
                            )}
                          </td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <Button
                                color={action === "DISPATCH" ? "success" : "secondary"}
                                outline={action !== "DISPATCH"}
                                size="sm"
                                disabled={!dispatchOk}
                                title={dispatchOk ? "Despachar desde inventario" : "Sin stock suficiente"}
                                onClick={() => setResolveAction(key, "DISPATCH")}
                              >
                                Despachar
                              </Button>
                              <Button
                                color={action === "PRODUCE" ? "primary" : "secondary"}
                                outline={action !== "PRODUCE"}
                                size="sm"
                                onClick={() => setResolveAction(key, "PRODUCE")}
                              >
                                Producir
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              )}

              {resolveItems.length > 0 && (
                <div className="text-muted" style={{ fontSize: 11 }}>
                  Resumen: {resolveItems.filter((it) => (resolveActions[String(it.saleItemId)] || "PRODUCE") === "DISPATCH").length} para despacho ·
                  {" "}{resolveItems.filter((it) => (resolveActions[String(it.saleItemId)] || "PRODUCE") === "PRODUCE").length} a OP
                </div>
              )}
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" outline onClick={closeResolveMixedModal} disabled={resolveSubmitting}>
            Cancelar
          </Button>
          <Button
            color="primary"
            onClick={submitResolveMixed}
            disabled={resolveSubmitting || resolveLoading || resolveItems.length === 0}
          >
            {resolveSubmitting ? (<><Spinner size="sm" /> Ejecutando...</>) : "Ejecutar"}
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        isOpen={Boolean(felInvoiceModal)}
        toggle={closeFelInvoiceModal}
        centered
        size="lg"
      >
        {felInvoiceModal?.phase === "preview" && (() => {
          const preview = buildFelInvoicePreview(felInvoiceModal.sale);
          const sale = felInvoiceModal.sale;
          const confirming = felInvoiceLoadingId === sale?.id;
          const retry = isFelInvoiceRetry(sale);
          const storedTotal = parseFloat(sale?.totalAmount || 0);
          const totalMismatch = preview?.total > 0
            && Math.abs(preview.total - storedTotal) > 0.01;
          return (
            <>
              <ModalHeader toggle={closeFelInvoiceModal}>
                {retry ? "Reintentar" : "Generar"} factura FEL — venta {preview?.saleNumber || sale?.id}
              </ModalHeader>
              <ModalBody>
                {retry && (
                  <Alert color="info" className="py-2">
                    Esta venta ya tiene un intento fallido. Al confirmar se reenvía la certificación FEL
                    (mismo ID de transacción si aplica).
                  </Alert>
                )}
                {totalMismatch && (
                  <Alert color="warning" className="py-2">
                    El total guardado en la venta ({formatQ(storedTotal)}) no coincide con la suma de
                    productos ({formatQ(preview.total)}). La factura usará la suma de líneas.
                  </Alert>
                )}
                <p className="text-muted small mb-3">
                  Revise los datos que se enviarán a certificación FEL antes de confirmar.
                </p>
                {preview && (
                  <>
                    <Row className="mb-3">
                      <Col md="6">
                        <p className="mb-1"><strong>Cliente:</strong> {preview.customerName}</p>
                        <p className="mb-1"><strong>NIT / CF:</strong> {preview.customerTaxId}</p>
                        <p className="mb-1"><strong>Dirección:</strong> {preview.address}</p>
                      </Col>
                      <Col md="6">
                        <p className="mb-1"><strong>Teléfono:</strong> {preview.phone}</p>
                        <p className="mb-1"><strong>Correo:</strong> {preview.email}</p>
                        <p className="mb-1"><strong>Fecha de facturación:</strong> {preview.billingDate}</p>
                        <p className="mb-1">
                          <strong>Tipo FEL:</strong> {preview.documentType} (est. {preview.establishmentCode})
                        </p>
                        <p className="mb-0"><strong>Total venta:</strong> {formatQ(preview.total)}</p>
                      </Col>
                    </Row>
                    <Table responsive size="sm" className="mb-0">
                      <thead>
                        <tr>
                          <th>Descripción</th>
                          <th style={{ width: 70 }}>Cant.</th>
                          <th style={{ width: 90 }}>P. unit.</th>
                          <th style={{ width: 90 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.lines.map((line, idx) => (
                          <tr key={idx}>
                            <td>{line.description}</td>
                            <td>{line.quantity}</td>
                            <td>{formatQ(line.unitPrice)}</td>
                            <td>{formatQ(line.lineTotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan="3" className="text-right"><strong>Total factura</strong></td>
                          <td><strong>{formatQ(preview.total)}</strong></td>
                        </tr>
                      </tfoot>
                    </Table>
                  </>
                )}
              </ModalBody>
              <ModalFooter>
                <Button color="secondary" outline onClick={closeFelInvoiceModal} disabled={confirming}>
                  Cancelar
                </Button>
                <Button color="success" onClick={confirmGenerateFelInvoice} disabled={confirming || !preview?.lines?.length}>
                  {confirming
                    ? (<><Spinner size="sm" /> Certificando...</>)
                    : (retry ? "Reintentar certificación FEL" : "Generar factura FEL")}
                </Button>
              </ModalFooter>
            </>
          );
        })()}

        {felInvoiceModal?.phase === "result" && (() => {
          const invoice = felInvoiceModal.invoice;
          const isTest = String(invoice?.felSerie || "").toUpperCase().includes("PRUEBAS");
          const canDownloadXml = invoice?.status === "CERTIFIED" && invoice?.hasCertifiedXml;
          const canDownloadFelReport = Boolean(invoice?.felUuid);
          const handleDownloadFelReport = () => {
            try {
              setError("");
              openFelInvoiceReport(invoice.felUuid);
            } catch (e) {
              setError(e.message || "No se pudo abrir la factura FEL.");
            }
          };
          const handleDownloadFelXml = async () => {
            if (!invoice?.id) return;
            try {
              setFelXmlDownloading(true);
              setError("");
              await downloadTaxInvoiceCertifiedXml(invoice.id);
            } catch (e) {
              setError(e.message || "No se pudo descargar el XML certificado.");
            } finally {
              setFelXmlDownloading(false);
            }
          };
          return (
            <>
              <ModalHeader toggle={closeFelInvoiceModal}>Factura FEL generada</ModalHeader>
              <ModalBody>
                <p className="mb-2">
                  <strong>Estado:</strong>{" "}
                  <Badge color={invoice?.status === "CERTIFIED" ? "success" : invoice?.status === "FAILED" ? "danger" : "warning"}>
                    {invoice?.status || "—"}
                  </Badge>
                  {invoice?.documentType && (
                    <>{" "}· <strong>Tipo:</strong> {invoice.documentType}</>
                  )}
                </p>
                {isTest && (
                  <Alert color="warning" className="py-2">
                    Ambiente de <strong>pruebas</strong> INFILE — documento sin validez fiscal.
                  </Alert>
                )}
                {invoice?.felUuid && (
                  <p className="mb-1 small"><strong>Autorización (UUID):</strong> {invoice.felUuid}</p>
                )}
                {(invoice?.felSerie || invoice?.felNumero) && (
                  <p className="mb-1 small">
                    <strong>Serie / Número:</strong> {invoice.felSerie || "—"} / {invoice.felNumero || "—"}
                  </p>
                )}
                {invoice?.status === "CERTIFIED" && !invoice?.hasCertifiedXml && (
                  <p className="text-muted small mb-0">
                    El XML certificado no quedó almacenado en esta emisión.
                  </p>
                )}
                {invoice?.felError && (
                  <Alert color="danger" className="mb-0 mt-2">{invoice.felError}</Alert>
                )}
              </ModalBody>
              <ModalFooter>
                {canEditFel && invoice?.id && (
                  <Button
                    color="warning"
                    outline
                    type="button"
                    onClick={() => openFelEditModal({
                      id: felInvoiceModal.sale?.id,
                      invoiceId: invoice.id,
                      invoiceFelUuid: invoice.felUuid,
                      invoiceFelSerie: invoice.felSerie,
                      invoiceFelNumero: invoice.felNumero,
                      invoiceFelCertifiedAt: invoice.felCertifiedAt,
                    })}
                  >
                    Corregir factura FEL
                  </Button>
                )}
                {canDownloadFelReport && (
                  <Button color="primary" outline type="button" onClick={handleDownloadFelReport}>
                    Descargar factura PDF
                  </Button>
                )}
                {canDownloadXml && (
                  <Button color="success" outline onClick={handleDownloadFelXml} disabled={felXmlDownloading}>
                    {felXmlDownloading ? (<><Spinner size="sm" /> Descargando...</>) : "Descargar XML certificado"}
                  </Button>
                )}
                <Button color="primary" onClick={closeFelInvoiceModal}>Cerrar</Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>

      <EditTaxInvoiceFelModal
        isOpen={Boolean(felEditTarget)}
        toggle={() => setFelEditTarget(null)}
        invoiceId={felEditTarget?.invoiceId}
        initialValues={{
          felUuid: felEditTarget?.felUuid,
          felSerie: felEditTarget?.felSerie,
          felNumero: felEditTarget?.felNumero,
          felCertifiedAt: felEditTarget?.felCertifiedAt,
        }}
        onSaved={handleFelMetadataSaved}
      />
    </div>
  );
}

export default OnlineSales;
