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
  previewFulfillment,
  importOnlineSales, returnOnlineSale, voidOnlineSale, registerOnlineSaleShipment,
  PAYMENT_METHODS, SALESPERSONS, SOCIAL_NETWORKS, SHIPPING_CARRIERS, SALE_STATUSES
} from "../../services/onlineSaleService";
import { getWarehouseView } from "../../services/productionOrderService";
import * as XLSX from "xlsx";
import { formatNowGt } from "utils/dateTimeHelper";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

// ─── Helpers ─────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

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

const getSocialIcon = (sn) => {
  const found = SOCIAL_NETWORKS.find(s => s.value === sn);
  if (!found) return sn;
  return <span style={{ color: found.color, fontWeight: 600 }}>{found.icon} {found.label}</span>;
};

const getSimplePaymentLabel = (paymentMethod) => {
  const method = String(paymentMethod || "").toUpperCase();
  if (method.includes("CONTRA_ENTREGA") || method.includes("EFECTIVO")) return "EFECTIVO";
  if (method.includes("DEPOSITO") || method.includes("TRANSFERENCIA")) return "DEPOSITO";
  if (method.includes("VISA") || method.includes("TARJETA")) return "TARJETA";
  if (!method) return "—";
  return method.split("_")[0];
};

const escapeHtml = (value) => String(value || "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

const formatDateDisplay = (isoDate) => {
  if (!isoDate) return "";
  const [year, month, day] = String(isoDate).split("-");
  if (!year || !month || !day) return String(isoDate);
  return `${day}/${month}/${year}`;
};

const UNITS_WORDS = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const TENS_WORDS = ["", "DIEZ", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const HUNDREDS_WORDS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

const toWordsBelowHundred = (n) => {
  if (n < 10) return UNITS_WORDS[n];
  if (n >= 10 && n < 16) {
    const teens = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE"];
    return teens[n - 10];
  }
  if (n < 20) return `DIECI${UNITS_WORDS[n - 10].toLowerCase()}`.toUpperCase();
  if (n === 20) return "VEINTE";
  if (n < 30) return `VEINTI${UNITS_WORDS[n - 20].toLowerCase()}`.toUpperCase();
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  return unit ? `${TENS_WORDS[ten]} Y ${UNITS_WORDS[unit]}` : TENS_WORDS[ten];
};

const toWordsBelowThousand = (n) => {
  if (n === 0) return "";
  if (n === 100) return "CIEN";
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  const hundredText = HUNDREDS_WORDS[hundred];
  const restText = toWordsBelowHundred(rest);
  if (hundredText && restText) return `${hundredText} ${restText}`;
  return hundredText || restText;
};

const numberToWordsEs = (rawNumber) => {
  const number = Math.floor(Math.max(0, Number(rawNumber) || 0));
  if (number === 0) return "CERO";
  if (number >= 1000000000) return String(number);

  const millions = Math.floor(number / 1000000);
  const thousands = Math.floor((number % 1000000) / 1000);
  const hundreds = number % 1000;
  const parts = [];

  if (millions > 0) {
    if (millions === 1) parts.push("UN MILLON");
    else parts.push(`${toWordsBelowThousand(millions)} MILLONES`);
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("MIL");
    else parts.push(`${toWordsBelowThousand(thousands)} MIL`);
  }
  if (hundreds > 0) parts.push(toWordsBelowThousand(hundreds));
  return parts.join(" ").replaceAll("  ", " ").trim();
};

const amountToWordsQ = (amount) => {
  const numericAmount = Math.max(0, Number(amount) || 0);
  const whole = Math.floor(numericAmount);
  const cents = Math.round((numericAmount - whole) * 100);
  return `${numberToWordsEs(whole)} QUETZALES CON ${String(cents).padStart(2, "0")}/100`;
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
  "tarjeta": "VISALINK_PAGADO",
  "tarjeta pend": "VISALINK_PENDIENTE",
  "tarjeta web": "TARJETA_PAGADO",
  "tarjeta web pagado": "TARJETA_PAGADO",
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
  // Tabs
  const [activeTab, setActiveTab] = useState("ventas");

  // Data
  const [sales, setSales] = useState([]);
  const [warehouseOrders, setWarehouseOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [colors, setColors] = useState([]);
  const [summary, setSummary] = useState(null);
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
  const [fulfillmentPreview, setFulfillmentPreview] = useState({ bodegaPtFound: true, map: {} });
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
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipmentSale, setShipmentSale] = useState(null);
  const [shipmentForm, setShipmentForm] = useState({
    shippingCarrier: "FORZA_DELIVERY",
    guideNumber: "",
    observations: ""
  });

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
      const [data, sum, wOrders] = await Promise.all([
        getOnlineSalesByDate(filterDate),
        getDailySummary(filterDate),
        getWarehouseView(),
      ]);
      setSales(data || []);
      setSummary(sum);
      setWarehouseOrders(wOrders || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [filterDate]);

  // ─── Producción ──────────────────────────────────────────────────

  const loadEligibleSales = async () => {
    try {
      const data = await getEligibleForProduction(productionDateFrom || undefined, productionDateTo || undefined);
      setEligibleSales(data || []);
      setSelectedForPO(new Set());

      // Preview de inventario BODEGA_PT (sin procesar): muestra si se puede despachar directo
      try {
        const ids = (data || []).map((s) => s.id).filter(Boolean);
        if (ids.length === 0) {
          setFulfillmentPreview({ bodegaPtFound: true, map: {} });
        } else {
          const preview = await previewFulfillment(ids);
          const map = {};
          (preview?.rows || []).forEach((r) => {
            map[String(r.saleId)] = Boolean(r.canFulfillFromInventory);
          });
          setFulfillmentPreview({ bodegaPtFound: preview?.bodegaPtFound !== false, map });
        }
      } catch (e) {
        setFulfillmentPreview({ bodegaPtFound: true, map: {} });
      }
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => {
    if (activeTab === "produccion") loadEligibleSales();
    if (activeTab === "mensual") loadMonthlySales();
  }, [activeTab]); // eslint-disable-line

  const filteredEligibleSales = useMemo(() => {
    return (eligibleSales || []).filter(sale => {
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

  const selectAllEligibleSales = () => {
    setSelectedForPO(new Set((eligibleSales || []).map(s => s.id)));
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

  /**
   * Nuevo flujo: Bodega PT revisa inventario primero.
   * - Ventas con stock en BODEGA_PT → despacho directo (status PRODUCIDO)
   * - Ventas sin stock → se crean órdenes de producción
   */
  const handleProcessFulfillment = async () => {
    if (selectedForPO.size === 0) return;
    setLoadingPO(true);
    try {
      const result = await processFulfillment([...selectedForPO]);
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

  /** Flujo legado: crear orden de producción directamente (sin revisar inventario) */
  const handleCreatePO = async () => {
    if (selectedForPO.size === 0) return;
    setLoadingPO(true);
    try {
      const result = await createProductionOrderFromSales([...selectedForPO]);
      let msg = result.message || "Órdenes creadas";
      if (result.ordersCreated > 1 && result.productionOrderCodes) {
        msg = `${result.ordersCreated} OPs creadas: ${result.productionOrderCodes.join(", ")}`;
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
  const computedNet = useMemo(() => {
    return (formData.items || []).reduce((sum, it) => {
      const price = parseFloat(it.unitPrice) || 0;
      const qty = parseInt(it.quantity) || 1;
      return sum + (price * qty);
    }, 0);
  }, [formData.items]);
  const computedTotal = computedNet > 0 ? computedNet + computedShipping : 0;

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
    setShipmentForm({
      shippingCarrier: sale.shippingCarrier || "FORZA_DELIVERY",
      guideNumber: sale.guideNumber || "",
      observations: ""
    });
    setShowShipmentModal(true);
  };

  const buildShipmentDocumentHtml = (sale) => {
    const docNo = sale.shipmentNumber || String(sale.saleNumber || sale.id || "");
    const saleDateStr = sale.saleDate || today();
    const items = (sale.items && sale.items.length > 0) ? sale.items : [{
      productCode: sale.productCode,
      productName: sale.productName,
      colorName: sale.colorName,
      size: sale.size,
      quantity: sale.quantity || 1,
      unitPrice: sale.unitPrice || 0,
      subtotal: sale.netAmount || sale.totalAmount || 0
    }];
    const totalItems = items.reduce((sum, it) => sum + (parseInt(it.quantity, 10) || 0), 0);
    const netAmount = parseFloat(sale.netAmount) || 0;
    const totalAmount = parseFloat(sale.totalAmount) || 0;
    const carrierLabel = SHIPPING_CARRIERS.find(c => c.value === sale.shippingCarrier)?.label || sale.shippingCarrier || "—";
    const paymentLabel = getSimplePaymentLabel(sale.paymentMethod);
    const shippingAmount = parseFloat(sale.shippingCost) || 0;
    const rowsHtml = items.map((it) => {
      const qty = parseInt(it.quantity, 10) || 1;
      const unitPrice = parseFloat(it.unitPrice) || 0;
      const lineTotal = parseFloat(it.subtotal) || (unitPrice * qty);
      const description = [it.productName || "", it.colorName || "", it.size ? `Talla ${it.size}` : ""]
        .filter(Boolean)
        .join(" - ");
      return `
        <tr>
          <td>${escapeHtml(it.productCode || "")}</td>
          <td style="text-align:center">${qty}</td>
          <td>${escapeHtml(description)}</td>
          <td style="text-align:right">Q. ${unitPrice.toFixed(2)}</td>
          <td style="text-align:right">Q. ${lineTotal.toFixed(2)}</td>
        </tr>
      `;
    }).join("");

    return `
      <html>
        <head>
          <meta charset="UTF-8" />
          <title>Envio ${escapeHtml(docNo)}</title>
          <style>
            @page { size: letter; margin: 10mm; }
            body { font-family: Arial, sans-serif; color: #111; font-size: 12px; margin: 0; }
            .doc { border: 1px solid #777; min-height: 252mm; width: 100%; max-width: 100%; box-sizing: border-box; display: flex; flex-direction: column; overflow: hidden; }
            .section { border-bottom: 1px solid #777; padding: 8px 10px; }
            .top { display: flex; justify-content: space-between; align-items: flex-start; }
            .title { text-align: right; }
            .title h2 { margin: 0; letter-spacing: 1px; font-size: 22px; }
            .title .num { font-size: 24px; font-weight: bold; margin-top: 2px; }
            .line { display: flex; gap: 8px; margin: 2px 0; }
            .label { min-width: 70px; color: #333; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; table-layout: fixed; }
            th, td { border: 1px dashed #777; padding: 4px 6px; vertical-align: top; word-wrap: break-word; overflow-wrap: anywhere; }
            th { text-align: center; background: #f7f7f7; }
            .totals { width: 280px; margin-left: auto; margin-top: 8px; }
            .totals td { border: 1px solid #777; }
            .content-main { flex: 1; }
            .bottom-block { margin-top: auto; }
            .footer { padding: 8px 10px; font-size: 11px; }
            .signature { margin-top: 18px; width: 220px; border-top: 1px solid #777; text-align: center; padding-top: 2px; }
          </style>
        </head>
        <body>
          <div class="doc">
            <div class="section top">
              <div>
                <div style="font-size:14px;font-weight:bold;letter-spacing:1px">FOSSILES</div>
                <div style="font-size:20px;font-weight:bold">VENTA EN LINEA FOSSILES</div>
                <div>Km. 17 Carretera San Juan Sacatepequez</div>
                <div>17-05, Zona 6 de Mixco Guatemala C.A.</div>
                <div>Telefono PBX: 2462-5700</div>
              </div>
              <div class="title">
                <h2>ENVIO</h2>
                <div style="font-size:11px;color:#555;margin-top:2px">Preparación</div>
                <div>No. <span class="num">${escapeHtml(docNo)}</span></div>
              </div>
            </div>

            <div class="section">
              <div style="display:flex;justify-content:space-between;gap:16px">
                <div style="flex:1">
                  <div class="line"><span class="label">Cliente:</span><span>${escapeHtml(sale.customerName || "—")}</span></div>
                  <div class="line"><span class="label">Direccion:</span><span>${escapeHtml(sale.address || "—")}</span></div>
                  <div class="line"><span class="label">Telefono:</span><span>${escapeHtml(sale.phone || "—")}</span></div>
                  <div class="line"><span class="label">Enviar:</span><span>${escapeHtml(sale.phone2 || "—")}</span></div>
                </div>
                <div style="flex:1">
                  <div class="line"><span class="label">Pedido:</span><span>#${escapeHtml(String(sale.saleNumber || sale.id || ""))}</span></div>
                  <div class="line"><span class="label">N° envío:</span><span>${escapeHtml(sale.shipmentNumber || "—")}</span></div>
                  <div class="line"><span class="label">Fecha:</span><span>${escapeHtml(formatDateDisplay(saleDateStr))}</span></div>
                  <div class="line"><span class="label">Transporte:</span><span>${escapeHtml(carrierLabel)}</span></div>
                  <div class="line"><span class="label">No. Guía:</span><span>${escapeHtml(sale.guideNumber || "—")}</span></div>
                  <div class="line"><span class="label">Nit:</span><span>${escapeHtml(sale.invoiceTaxId || "CF")}</span></div>
                  <div class="line"><span class="label">Vendedor:</span><span>${escapeHtml(sale.salesperson || "—")}</span></div>
                </div>
              </div>
            </div>

            <div class="section content-main">
              <table>
                <thead>
                  <tr>
                    <th style="width:16%">Codigo</th>
                    <th style="width:10%">Cantidad</th>
                    <th>Descripcion</th>
                    <th style="width:15%">P.Unitario</th>
                    <th style="width:15%">Total</th>
                  </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
              </table>
              <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11px">
                <div>El total de articulos es: <strong>${totalItems.toFixed(2)}</strong></div>
                <div>Forma de pago: <strong>${escapeHtml(paymentLabel)}</strong></div>
              </div>
              <table class="totals">
                <tr><td>SUBTOTAL: Q.</td><td style="text-align:right">${netAmount.toFixed(2)}</td></tr>
                <tr><td>ENVIO: Q.</td><td style="text-align:right">${shippingAmount.toFixed(2)}</td></tr>
                <tr><td>DESCUENTO: Q.</td><td style="text-align:right">0.00</td></tr>
                <tr><td><strong>TOTAL: Q.</strong></td><td style="text-align:right"><strong>${totalAmount.toFixed(2)}</strong></td></tr>
              </table>
            </div>

            <div class="bottom-block">
              <div class="section" style="font-size:11px">
                <strong>TOTAL EN LETRAS:</strong> ${escapeHtml(amountToWordsQ(totalAmount))}
              </div>

              <div class="footer">
                <div class="signature">Vo.Bo.</div>
                <div style="margin-top:8px">DOCUMENTO DE PREPARACIÓN DE ENVÍO (referencia interna y paquetería).</div>
                <div>No indica que el pedido haya salido de bodega; el despacho se confirma en bodega PT.</div>
              </div>
            </div>
          </div>
        </body>
      </html>
    `;
  };

  const printShipmentDocument = (sale) => {
    const printWindow = window.open("", "_blank", "width=1000,height=800");
    if (!printWindow) {
      setError("No se pudo abrir la ventana de impresión. Verifique bloqueador de ventanas.");
      return;
    }
    printWindow.document.write(buildShipmentDocumentHtml(sale));
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  const downloadShipmentPdf = async (sale) => {
    if (!sale) return;
    const html = buildShipmentDocumentHtml(sale);
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
      pdf.save(`Envio-${sale.shipmentNumber || sale.saleNumber || sale.id}.pdf`);
    } catch (e) {
      setError(e?.message || "No se pudo generar el PDF del envío.");
    } finally {
      document.body.removeChild(host);
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
      const envLabel = updated.shipmentNumber
        ? `Preparación guardada · ${updated.shipmentNumber}`
        : "Datos de envío guardados";
      showNotification(`${envLabel} — pedido #${updated.saleNumber || updated.id}`);
      setShowShipmentModal(false);
      await downloadShipmentPdf(updated);
      printShipmentDocument(updated);
    } catch (e) {
      setError(e.message);
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
    filteredSales.forEach((s, i) => {
      const items = (s.items && s.items.length > 0) ? s.items : [
        { productCode: s.productCode, productName: s.productName, colorName: s.colorName,
          size: s.size, quantity: s.quantity || 1, unitPrice: s.unitPrice, subtotal: s.totalAmount }
      ];
      items.forEach((it, idx) => {
        rows.push({
          "No.": idx === 0 ? (s.saleNumber || i + 1) : "",
          "Nombre": idx === 0 ? (s.customerName || "") : "",
          "Teléfono": idx === 0 ? (s.phone || "") : "",
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

    // Si hay resumen, agregar hoja de resumen
    if (summary) {
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

    XLSX.writeFile(wb, `Ventas_Online_${filterDate}.xlsx`);
    showNotification("Excel descargado correctamente");
  };

  // ─── Exportar PDF ─────────────────────────────────────────────

  const exportToPDF = () => {
    const pmLabel = (v) => PAYMENT_METHODS.find(p => p.value === v)?.label || v || "";
    const snLabel = (v) => SOCIAL_NETWORKS.find(s => s.value === v)?.label || v || "";
    const stLabel = (v) => SALE_STATUSES.find(s => s.value === v)?.label || v || "";
    const carrierLabel = (v) => SHIPPING_CARRIERS.find(c => c.value === v)?.label || v || "";

    const totalBruto = filteredSales.reduce((s, r) => s + (parseFloat(r.totalAmount) || 0), 0);
    const totalNeto = filteredSales.reduce((s, r) => s + (parseFloat(r.netAmount) || 0), 0);
    const totalEnvios = totalBruto - totalNeto;

    const salesRows = filteredSales.map((s, i) => {
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

    const html = `<!DOCTYPE html><html><head><title>Ventas Online - ${filterDate}</title>
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
          <div>Fecha: <strong>${filterDate}</strong></div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:#999">Generado: ${formatNowGt()}</div>
        </div>
      </div>

      <div class="summary-cards">
        <div class="summary-card"><div class="value">${filteredSales.length}</div><div class="label">Total Ventas</div></div>
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
            📊 Resumen Diario
          </NavLink>
        </NavItem>
        <NavItem>
          <NavLink className={activeTab === "envios" ? "active" : ""} onClick={() => setActiveTab("envios")}
            style={{ cursor: "pointer" }}>
            🚚 Envíos
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
            🏭 Enviar a Producción
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
                        <th style={{ minWidth: 60 }}>Factura</th>
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
                          <td><strong>{formatQ(sale.totalAmount)}</strong></td>
                          <td>{formatQ(sale.shippingCost)}</td>
                          <td style={{ color: "#2e7d32", fontWeight: 600 }}>{formatQ(sale.netAmount)}</td>
                          <td>{renderInlineCell(sale, "shippingCarrier", "select",
                            SHIPPING_CARRIERS.map(c => ({ value: c.value, label: c.label })))}</td>
                          <td>{getSocialIcon(sale.socialNetwork)}</td>
                          <td style={{ fontSize: 11 }}>{sale.salesperson ? sale.salesperson.split(" ")[0] : "—"}</td>
                          <td>{getStatusBadge(sale.status)}</td>
                          <td>{renderInlineCell(sale, "guideNumber")}</td>
                          <td>{renderInlineCell(sale, "paymentAuthorization")}</td>
                          <td>{renderInlineCell(sale, "observations")}</td>
                          <td style={{ whiteSpace: "nowrap" }}>
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
                                <Button color="default" size="sm" onClick={() => printShipmentDocument(sale)} style={{ padding: "3px 8px" }}>
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

        {/* ═══ TAB RESUMEN ═══ */}
        <TabPane tabId="resumen">
          <Row className="mb-3">
            <Col md="3">
              <FormGroup>
                <Label className="font-weight-bold">Fecha</Label>
                <Input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
              </FormGroup>
            </Col>
            <Col md="2" className="d-flex align-items-end">
              <Button color="primary" size="sm" onClick={loadSales} style={{ marginRight: 4 }}>Actualizar</Button>
            </Col>
            <Col md="auto" className="d-flex align-items-end">
              <Button color="default" size="sm" onClick={exportToExcel} style={{ marginRight: 4 }}>
                <i className="nc-icon nc-cloud-download-93" /> Excel
              </Button>
              <Button color="default" size="sm" onClick={exportToPDF}>
                <i className="nc-icon nc-paper" /> PDF
              </Button>
            </Col>
          </Row>

          {summary ? (
            <>
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
                <p className="text-muted">Seleccione una fecha para ver el resumen.</p>
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
              <Row className="align-items-center">
                <Col>
                  <CardTitle tag="h4" className="mb-0">
                    🏭 Ventas Listas para Despacho / Producción
                  </CardTitle>
                  <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                    Solo se muestran ventas con pago confirmado que aún no están en proceso.
                    Bodega PT revisa inventario: lo que hay se despacha directo, lo que no hay genera OP de producción.
                  </p>
                </Col>
                <Col md="auto" className="d-flex align-items-center" style={{ gap: 8 }}>
                  <Button color="warning" size="sm" onClick={loadEligibleSales}>
                    <i className="nc-icon nc-refresh-69" /> Actualizar
                  </Button>
                  <Button
                    color="success"
                    disabled={selectedForPO.size === 0 || loadingPO}
                    onClick={handleProcessFulfillment}
                    title="Revisa inventario BODEGA_PT: despacha lo que hay, crea OP para lo que no hay"
                  >
                    {loadingPO ? <Spinner size="sm" /> : (
                      <>📦 Procesar desde Bodega PT ({selectedForPO.size})</>
                    )}
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              <Row className="mb-3">
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
                  <Button color="primary" size="sm" onClick={applyProductionDateFilter} style={{ marginRight: 6 }}>
                    Filtrar por fechas
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
                <Col md="3" className="d-flex align-items-end justify-content-end">
                  <Button color="info" size="sm" onClick={toggleSelectAll} style={{ marginRight: 6 }}>
                    Todas del filtro
                  </Button>
                  <Button color="secondary" size="sm" onClick={selectAllForDay} style={{ marginRight: 6 }}>
                    Todas del día
                  </Button>
                  <Button color="default" size="sm" onClick={selectAllEligibleSales} style={{ marginRight: 6 }}>
                    Todas generales
                  </Button>
                  <Button color="danger" size="sm" outline onClick={clearProductionSelection}>
                    Limpiar
                  </Button>
                </Col>
              </Row>

              <div className="mb-2 text-muted" style={{ fontSize: 12 }}>
                Mostrando <strong>{filteredEligibleSales.length}</strong> venta(s) elegible(s),
                seleccionadas en filtro: <strong>{selectedInFiltered}</strong>,
                seleccionadas totales: <strong>{selectedForPO.size}</strong>.
              </div>

              {filteredEligibleSales.length === 0 ? (
                <Alert color="info">
                  <strong>Sin ventas elegibles para el filtro aplicado.</strong> Ajusta fechas o usa "Ver todas".
                </Alert>
              ) : (
                <>
                  <Alert color="warning" className="mb-3">
                    <strong>⚡ PRIORIDAD:</strong> Las órdenes de producción de venta en línea son prioritarias.
                    Deben producirse el mismo día o al día siguiente.
                  </Alert>
                  <Table responsive hover size="sm" style={{ fontSize: 13 }}>
                    <thead style={{ background: "#fff3e0" }}>
                      <tr>
                        <th style={{ width: 56, textAlign: "center" }}>
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                            <small style={{ fontSize: 10, color: "#666" }}>Sel.</small>
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={toggleSelectAll}
                              title="Seleccionar todas las ventas visibles"
                              style={{ width: 16, height: 16, cursor: "pointer", accentColor: "#2e7d32" }}
                            />
                          </div>
                        </th>
                        <th>No.</th>
                        <th>Fecha</th>
                        <th>Cliente</th>
                        <th>Stock PT</th>
                        <th>Productos</th>
                        <th>Total</th>
                        <th>Forma de Pago</th>
                        <th>Red Social</th>
                        <th>Vendedor</th>
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
                          <td><strong>{sale.saleNumber}</strong></td>
                          <td>{sale.saleDate}</td>
                          <td>{sale.customerName}</td>
                          <td>
                            {fulfillmentPreview?.bodegaPtFound === false ? (
                              <Badge color="warning">Sin BODEGA_PT</Badge>
                            ) : (fulfillmentPreview?.map || {})[String(sale.id)] === true ? (
                              <Badge color="success">Sí</Badge>
                            ) : (fulfillmentPreview?.map || {})[String(sale.id)] === false ? (
                              <Badge color="danger">No</Badge>
                            ) : (
                              <Badge color="secondary">—</Badge>
                            )}
                          </td>
                          <td style={{ fontSize: 11 }}>
                            {(sale.items && sale.items.length > 0) ? sale.items.map((it, i) => (
                              <div key={i}>
                                <strong>{it.productCode}</strong> {it.productName}
                                {it.colorName && <span style={{ color: "#666" }}> · {it.colorName}</span>}
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
                          <td>{formatQ(sale.totalAmount)}</td>
                          <td>
                            <Badge color={sale.paymentMethod === "CONTRA_ENTREGA" ? "warning" : "success"}>
                              {sale.paymentMethodDisplay || sale.paymentMethod}
                            </Badge>
                          </td>
                          <td>{getSocialIcon(sale.socialNetwork)}</td>
                          <td style={{ fontSize: 11 }}>{sale.salesperson}</td>
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
                <Input type="text" readOnly value={`Q ${computedShipping}.00`}
                  style={{ background: "#f5f5f5" }} />
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
              onChange={e => setShipmentForm(prev => ({ ...prev, shippingCarrier: e.target.value }))}>
              {SHIPPING_CARRIERS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </Input>
          </FormGroup>
          <FormGroup>
            <Label>No. Guía (paquetería)</Label>
            <Input value={shipmentForm.guideNumber}
              onChange={e => setShipmentForm(prev => ({ ...prev, guideNumber: e.target.value }))}
              placeholder="Opcional si aún no la tienen; con transporte igual se asigna ENVL" />
          </FormGroup>
          <FormGroup className="mb-0">
            <Label>Observaciones</Label>
            <Input type="textarea" rows={3} value={shipmentForm.observations}
              onChange={e => setShipmentForm(prev => ({ ...prev, observations: e.target.value }))}
              placeholder="Notas del envío..." />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setShowShipmentModal(false)}>Cancelar</Button>
          <Button color="success" onClick={handleRegisterShipment}>Guardar preparación · PDF / imprimir</Button>
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
          📦 Resultado del Procesamiento — Bodega PT
        </ModalHeader>
        <ModalBody>
          {fulfillmentResult && (
            <>
              {!fulfillmentResult.bodegaPtFound && (
                <Alert color="warning" className="mb-3">
                  ⚠ No se encontró la ubicación <strong>BODEGA_PT</strong> configurada en el sistema.
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
                    Estas ventas tenían stock disponible en BODEGA PT. El inventario fue descontado y las ventas
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
                    Estas ventas no tenían stock suficiente en BODEGA PT.
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
    </div>
  );
}

export default OnlineSales;
