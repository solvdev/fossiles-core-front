import React, { useState, useEffect, useMemo } from "react";
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Row,
  Col,
  Table,
  Button,
  Badge,
  Alert,
  Spinner,
  Collapse,
  Input,
  Modal,
  ModalHeader,
  ModalBody,
} from "reactstrap";
import { useNavigate } from "react-router-dom";
import {
  getDistributions,
  getShipmentsByDistribution,
  deleteDistribution,
} from "services/productDistributionService";
import { getAuthHeader } from "services/authService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatNowGt } from "utils/dateTimeHelper";
import QRCode from "qrcode";
import { getPublicFrontBaseUrl, buildPtDispatchDistributionUrl } from "utils/ptDispatchQr";

function ProductDistributions() {
  const navigate = useNavigate();
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [reportLoadingId, setReportLoadingId] = useState(null);
  const [error, setError] = useState("");
  const [expandedDistributionId, setExpandedDistributionId] = useState(null);
  const [previewModal, setPreviewModal] = useState({
    open: false,
    distribution: null,
    shipments: [],
    loading: false,
    error: "",
    search: "",
    status: "ALL",
  });

  useEffect(() => {
    loadDistributions();
  }, []);

  const loadDistributions = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await getDistributions();
      setDistributions(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar distribuciones");
      showError(err.message || "Error al cargar distribuciones");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id, distributionNumber) => {
    if (!window.confirm(`¿Está seguro de eliminar la distribución ${distributionNumber}?`)) {
      return;
    }
    try {
      setError("");
      await deleteDistribution(id);
      showSuccess("Distribución eliminada correctamente");
      await loadDistributions();
    } catch (err) {
      setError(err.message || "Error al eliminar distribución");
      showError(err.message || "Error al eliminar distribución");
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      DRAFT: { color: "secondary", text: "Borrador" },
      CONFIRMED: { color: "info", text: "Confirmada" },
      SENT: { color: "warning", text: "Enviada" },
      COMPLETED: { color: "success", text: "Completada" },
    };
    const config = statusMap[status] || { color: "default", text: status };
    return <Badge color={config.color}>{config.text}</Badge>;
  };

  const statusToSpanish = (status) => {
    const map = {
      DRAFT: "Borrador",
      CONFIRMED: "Confirmada",
      SENT: "Enviada",
      DELIVERED: "Entregada",
      COMPLETED: "Completada",
      CANCELLED: "Cancelada",
      RECEIVED: "Recibida",
      IN_PROGRESS: "En proceso",
      PENDING: "Pendiente",
      READY: "Lista",
    };
    const normalized = String(status || "").trim().toUpperCase();
    return map[normalized] || String(status || "N/A");
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("es-GT", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      });
    } catch (e) {
      return dateString;
    }
  };

  const toggleExpandedRow = (distributionId) => {
    setExpandedDistributionId((prev) => (prev === distributionId ? null : distributionId));
  };

  const openPreviewModal = async (distribution) => {
    setPreviewModal({
      open: true,
      distribution,
      shipments: [],
      loading: true,
      error: "",
      search: "",
      status: "ALL",
    });
    try {
      const rows = await getShipmentsByDistribution(distribution.id);
      setPreviewModal((prev) => ({
        ...prev,
        shipments: Array.isArray(rows) ? rows : [],
        loading: false,
      }));
    } catch (err) {
      setPreviewModal((prev) => ({
        ...prev,
        loading: false,
        error: err.message || "No se pudieron cargar los envíos",
      }));
    }
  };

  const closePreviewModal = () => {
    setPreviewModal({
      open: false,
      distribution: null,
      shipments: [],
      loading: false,
      error: "",
      search: "",
      status: "ALL",
    });
  };

  const formatQty = (value) => {
    const parsed = Number(value || 0);
    if (!Number.isFinite(parsed)) return "0";
    return Math.abs(parsed % 1) < 0.000001 ? parsed.toFixed(0) : parsed.toFixed(2);
  };

  const parsePackingFromNotes = (notesRaw) => {
    const text = String(notesRaw || "");
    const lines = text.split("\n");
    const marker = "__PACKING_SUM__:";
    const line = lines.find((row) => row.startsWith(marker));
    if (!line) return [];
    try {
      const parsed = JSON.parse(line.slice(marker.length).trim());
      return (Array.isArray(parsed) ? parsed : [])
        .map((item) => ({
          materialId: Number(item?.materialId),
          name: String(item?.name || ""),
          quantity: Number(item?.quantity || 0),
        }))
        .filter((item) => item.materialId > 0 && item.quantity > 0);
    } catch (_err) {
      return [];
    }
  };

  const getShipmentPackingItems = (shipment) => {
    const apiItems = (shipment.packingItems || [])
      .map((item) => ({
        materialId: Number(item?.materialId),
        name: String(item?.name || ""),
        quantity: Number(item?.quantity || 0),
      }))
      .filter((item) => item.materialId > 0 && item.quantity > 0);
    if (apiItems.length > 0) return apiItems;
    return parsePackingFromNotes(shipment.notes);
  };

  const normalizeSku = (value) => String(value || "").trim().toUpperCase();

  const isSumPackingItem = (item, packingCatalog) => {
    const materialId = Number(item?.materialId);
    const itemSku = normalizeSku(item?.sku);
    const catalogSku = normalizeSku(packingCatalog?.[materialId]?.sku);
    const sku = itemSku || catalogSku;
    return sku.startsWith("SUM-");
  };

  const getShipmentSumPackingItems = (shipment, packingCatalog) =>
    getShipmentPackingItems(shipment).filter((item) => isSumPackingItem(item, packingCatalog));

  const loadPackingCatalog = async () => {
    try {
      const baseUrl = process.env.REACT_APP_API_URL || "http://localhost:8080/api";
      const response = await fetch(`${baseUrl}/materials/search?query=SUM-&activeOnly=true`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeader(),
        },
      });
      if (!response.ok) return {};
      const data = await response.json();
      const rows = Array.isArray(data) ? data : Array.isArray(data?.content) ? data.content : [];
      return rows.reduce((acc, row) => {
        const id = Number(row?.id);
        if (!Number.isFinite(id) || id <= 0) return acc;
        acc[id] = {
          name: String(row?.name || "").trim(),
          sku: String(row?.sku || "").trim(),
        };
        return acc;
      }, {});
    } catch (_err) {
      return {};
    }
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const openDistributionReport = async (distribution, triggerPrint = false) => {
    try {
      setReportLoadingId(distribution.id);
      const shipments = await getShipmentsByDistribution(distribution.id);
      const shipmentList = Array.isArray(shipments) ? shipments : [];
      const packingCatalog = await loadPackingCatalog();
      const frontBase = getPublicFrontBaseUrl();
      let distributionQrDataUrl = "";
      if (frontBase) {
        try {
          distributionQrDataUrl = await QRCode.toDataURL(
            buildPtDispatchDistributionUrl(frontBase, distribution.id),
            { width: 120, margin: 1 }
          );
        } catch (_e) {
          // skip
        }
      }
      const totalProductsInDistribution = shipmentList.reduce(
        (acc, shipment) =>
          acc +
          (shipment.products || []).reduce(
            (shipmentAcc, product) => shipmentAcc + Number(product?.quantity || 0),
            0
          ),
        0
      );
      const generatedAt = formatNowGt();

      const packingTotalsMap = {};
      const productTotalsMap = {};
      shipmentList.forEach((shipment) => {
        (shipment.products || []).forEach((product) => {
          const productId = Number(product?.productId || product?.id || 0);
          if (!Number.isFinite(productId) || productId <= 0) return;
          const colorId =
            product?.colorId === null || product?.colorId === undefined ? 0 : Number(product.colorId);
          const key = `${productId}:${Number.isFinite(colorId) ? colorId : 0}`;
          if (!productTotalsMap[key]) {
            productTotalsMap[key] = {
              productCode: String(product?.productCode || "").trim(),
              productName: String(product?.productName || "").trim() || `Producto #${productId}`,
              colorName: String(product?.colorName || "").trim() || "Sin color",
              qty: 0,
            };
          }
          productTotalsMap[key].qty += Number(product?.quantity || 0);
        });
        getShipmentSumPackingItems(shipment, packingCatalog).forEach((item) => {
          const materialId = Number(item.materialId);
          if (!Number.isFinite(materialId) || materialId <= 0) return;
          const catalogRow = packingCatalog[materialId] || {};
          const name = String(item.name || "").trim() || catalogRow.name || `Material #${materialId}`;
          if (!packingTotalsMap[materialId]) {
            packingTotalsMap[materialId] = { materialId, name, qty: 0 };
          }
          packingTotalsMap[materialId].qty += Number(item.quantity || 0);
        });
      });
      const packingTotals = Object.values(packingTotalsMap).sort((a, b) => a.name.localeCompare(b.name));
      const productTotals = Object.values(productTotalsMap).sort((a, b) => {
        const byCode = String(a.productCode || "").localeCompare(String(b.productCode || ""));
        if (byCode !== 0) return byCode;
        const byName = String(a.productName || "").localeCompare(String(b.productName || ""));
        if (byName !== 0) return byName;
        return String(a.colorName || "").localeCompare(String(b.colorName || ""));
      });

      const packingSummaryRows = packingTotals
        .map(
          (row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(row.name)}</td>
              <td style="text-align:right;">${escapeHtml(formatQty(row.qty))}</td>
            </tr>
          `
        )
        .join("");

      const productSummaryRows = productTotals
        .map(
          (row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(row.productCode || "-")}</td>
              <td>${escapeHtml(row.productName || "Producto")}</td>
              <td>${escapeHtml(row.colorName || "Sin color")}</td>
              <td style="text-align:right;">${escapeHtml(formatQty(row.qty))}</td>
            </tr>
          `
        )
        .join("");

      const packingByMaterialByKioskMap = {};
      shipmentList.forEach((shipment) => {
        const kioskName = String(shipment.locationName || shipment.locationCode || "Sin kiosko").trim();
        getShipmentSumPackingItems(shipment, packingCatalog).forEach((item) => {
          const materialId = Number(item.materialId);
          if (!Number.isFinite(materialId) || materialId <= 0) return;
          const catalogRow = packingCatalog[materialId] || {};
          const materialName = String(item.name || "").trim() || catalogRow.name || `Material #${materialId}`;
          if (!packingByMaterialByKioskMap[materialId]) {
            packingByMaterialByKioskMap[materialId] = {
              materialId,
              materialName,
              kiosks: {},
            };
          }
          if (!packingByMaterialByKioskMap[materialId].kiosks[kioskName]) {
            packingByMaterialByKioskMap[materialId].kiosks[kioskName] = 0;
          }
          packingByMaterialByKioskMap[materialId].kiosks[kioskName] += Number(item.quantity || 0);
        });
      });

      const packingByKioskRows = Object.values(packingByMaterialByKioskMap)
        .sort((a, b) => a.materialName.localeCompare(b.materialName))
        .map((materialRow) => {
          const kioskRows = Object.entries(materialRow.kiosks || {})
            .sort(([kioskA], [kioskB]) => kioskA.localeCompare(kioskB))
            .map(
              ([kioskName, quantity], index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${escapeHtml(kioskName)}</td>
                  <td style="text-align:right;">${escapeHtml(formatQty(quantity))}</td>
                </tr>
              `
            )
            .join("");

          return `
            <tr>
              <td colspan="3" style="background:#ecfeff; font-weight:700; color:#0f766e;">
                ${escapeHtml(materialRow.materialName)}
              </td>
            </tr>
            ${kioskRows || `<tr><td colspan="3">Sin detalle por kiosko</td></tr>`}
          `;
        })
        .join("");

      const shipmentTables = shipmentList
        .map((shipment, shipmentIndex) => {
          const shipmentTotalProducts = (shipment.products || []).reduce(
            (acc, product) => acc + Number(product?.quantity || 0),
            0
          );
          const productRows = (shipment.products || [])
            .map(
              (product, lineIndex) => `
                <tr>
                  <td>${shipmentIndex + 1}.${lineIndex + 1}</td>
                  <td>${escapeHtml(product.productCode || "-")}</td>
                  <td>${escapeHtml(product.productName || "Producto")}</td>
                  <td>${escapeHtml(product.colorName || "-")}</td>
                  <td>${escapeHtml(product.size || "-")}</td>
                  <td>${escapeHtml(product.hardwareCondition || "-")}</td>
                  <td style="text-align:right;">${escapeHtml(formatQty(product.quantity))}</td>
                </tr>
              `
            )
            .join("");

          const packingItems = getShipmentSumPackingItems(shipment, packingCatalog);
          const packingRows = packingItems
            .map(
              (item, lineIndex) => `
                <tr>
                  <td>${lineIndex + 1}</td>
                  <td>${escapeHtml(
                    String(item.name || "").trim() ||
                      packingCatalog[Number(item.materialId)]?.name ||
                      `Material #${item.materialId}`
                  )}</td>
                  <td style="text-align:right;">${escapeHtml(formatQty(item.quantity))}</td>
                </tr>
              `
            )
            .join("");

          return `
            <section class="shipment-box">
              <div class="shipment-header">
                <div><strong>Envío:</strong> ${escapeHtml(shipment.shipmentNumber || `#${shipment.id}`)}</div>
                <div><strong>Estado:</strong> ${escapeHtml(statusToSpanish(shipment.status))}</div>
              </div>
              <div class="shipment-header">
                <div><strong>Kiosko:</strong> ${escapeHtml(shipment.locationName || "-")}</div>
                <div><strong>Código:</strong> ${escapeHtml(shipment.locationCode || "-")}</div>
              </div>
              <div class="shipment-header">
                <div><strong>Total de productos por kiosko:</strong> ${escapeHtml(formatQty(shipmentTotalProducts))}</div>
                <div></div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Color</th>
                    <th>Talla</th>
                    <th>Herraje</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  ${productRows || `<tr><td colspan="7">Sin productos</td></tr>`}
                </tbody>
              </table>
              <div class="packing-title">Empaques de la distribución</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nombre</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  ${packingRows || `<tr><td colspan="3">Sin empaques</td></tr>`}
                </tbody>
              </table>
            </section>
          `;
        })
        .join("");

      const win = window.open("", "_blank");
      if (!win) {
        showError("No se pudo abrir la ventana del reporte. Revisa bloqueador de pop-ups.");
        return;
      }

      win.document.write(`
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Reporte ${escapeHtml(distribution.distributionNumber || distribution.id)}</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 14px; color: #0f172a; }
              h1 { font-size: 18px; margin: 0 0 4px; }
              .meta { font-size: 12px; color: #475569; margin-bottom: 8px; }
              .report-top {
                display: flex;
                flex-direction: row;
                align-items: flex-start;
                justify-content: space-between;
                gap: 12px;
                margin-bottom: 10px;
              }
              .report-top-main { flex: 1; min-width: 0; }
              .report-top-qr {
                flex-shrink: 0;
                text-align: center;
                max-width: 112px;
              }
              .report-top-qr img {
                width: 100px;
                height: 100px;
                display: inline-block;
              }
              .report-top-qr-caption {
                font-size: 10px;
                color: #475569;
                margin-top: 4px;
                font-weight: 600;
                line-height: 1.2;
              }
              .summary { border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; margin-bottom: 0; }
              /* Sin break-inside: avoid aquí: tablas grandes (resumen) superan una página y el preview
                 puede dejar la primera hoja en blanco debajo del encabezado. */
              .shipment-box {
                border: 1px solid #94a3b8;
                border-radius: 8px;
                padding: 8px;
                margin-bottom: 10px;
                break-inside: auto;
                page-break-inside: auto;
              }
              .shipment-header { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; margin-bottom: 6px; }
              .packing-title { margin-top: 8px; margin-bottom: 4px; font-size: 12px; font-weight: bold; color: #0f766e; }
              table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 6px; }
              th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; vertical-align: top; }
              th { background: #f1f5f9; font-weight: 700; }
              thead { display: table-header-group; }
              tbody { display: table-row-group; }
              @media print {
                body { margin: 8mm; }
                html, body { height: auto !important; overflow: visible !important; }
                .shipment-box { break-inside: auto !important; page-break-inside: auto !important; }
              }
            </style>
          </head>
          <body>
            <div class="report-top">
              <div class="report-top-main">
                <h1>Reporte de Distribución ${escapeHtml(distribution.distributionNumber || distribution.id)}</h1>
                <div class="meta">Generado: ${escapeHtml(generatedAt)}</div>
                <div class="summary">
                  <div><strong>Fecha:</strong> ${escapeHtml(formatDate(distribution.distributionDate))}</div>
                  <div><strong>Estado:</strong> ${escapeHtml(statusToSpanish(distribution.status))}</div>
                  <div><strong>Descripción:</strong> ${escapeHtml(distribution.description || "Sin descripción")}</div>
                  <div><strong>Envíos:</strong> ${shipmentList.length} | <strong>Total de productos en distribución:</strong> ${escapeHtml(formatQty(totalProductsInDistribution))}</div>
                  <div><strong>Regla:</strong> un envío por kiosko. La impresión separa en páginas de 10 productos.</div>
                </div>
              </div>
              ${
                distributionQrDataUrl
                  ? `<aside class="report-top-qr">
                <img src="${String(distributionQrDataUrl).replace(/"/g, "&quot;")}" alt="QR distribución" />
                <div class="report-top-qr-caption">Escanear en app Bodega PT — envíos de esta distribución</div>
              </aside>`
                  : ""
              }
            </div>
            <section class="shipment-box">
              <div class="packing-title">Resumen general de productos (acumulado por producto y color)</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>SKU</th>
                    <th>Producto</th>
                    <th>Color</th>
                    <th>Total requerido</th>
                  </tr>
                </thead>
                <tbody>
                  ${productSummaryRows || `<tr><td colspan="5">Sin productos registrados en esta distribución.</td></tr>`}
                </tbody>
              </table>
            </section>
            <section class="shipment-box">
              <div class="packing-title">Resumen general de empaques para solicitar a Materiales</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Empaque</th>
                    <th>Total requerido</th>
                  </tr>
                </thead>
                <tbody>
                  ${packingSummaryRows || `<tr><td colspan="3">Sin empaques registrados en esta distribución.</td></tr>`}
                </tbody>
              </table>
            </section>
            <section class="shipment-box">
              <div class="packing-title">Resumen general de empaques por kiosko</div>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Kiosko</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  ${packingByKioskRows || `<tr><td colspan="3">Sin empaques por kiosko en esta distribución.</td></tr>`}
                </tbody>
              </table>
            </section>
            ${shipmentTables || `<div class="summary">No hay envíos registrados para esta distribución.</div>`}
            ${
              triggerPrint
                ? `<script>
  window.onload = function () {
    function doPrint() {
      try { window.print(); } catch (_e) {}
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { setTimeout(doPrint, 100); });
    } else {
      setTimeout(doPrint, 150);
    }
  };
</script>`
                : ""
            }
          </body>
        </html>
      `);
      win.document.close();
    } catch (err) {
      showError(err.message || "No se pudo generar el reporte de la distribución.");
    } finally {
      setReportLoadingId(null);
    }
  };

  const filteredPreviewShipments = useMemo(() => {
    const term = String(previewModal.search || "").trim().toLowerCase();
    return (previewModal.shipments || []).filter((shipment) => {
      const shipmentStatus = String(shipment.status || "").toUpperCase();
      if (previewModal.status !== "ALL" && shipmentStatus !== previewModal.status) {
        return false;
      }
      if (!term) return true;
      const text = `${shipment.shipmentNumber || ""} ${shipment.locationName || ""} ${shipment.locationCode || ""}`.toLowerCase();
      return text.includes(term);
    });
  }, [previewModal.shipments, previewModal.search, previewModal.status]);

  const previewSummary = useMemo(() => {
    const shipments = filteredPreviewShipments;
    return {
      total: shipments.length,
      draft: shipments.filter((s) => String(s.status || "").toUpperCase() === "DRAFT").length,
      sent: shipments.filter((s) => String(s.status || "").toUpperCase() === "SENT").length,
      completed: shipments.filter((s) =>
        ["COMPLETED", "RECEIVED", "DELIVERED"].includes(String(s.status || "").toUpperCase())
      ).length,
    };
  }, [filteredPreviewShipments]);

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row>
                <Col md="6">
                  <CardTitle tag="h4">Distribuciones de Productos</CardTitle>
                </Col>
                <Col md="6" className="text-right">
                  <Button
                    color="primary"
                    size="sm"
                    onClick={() => navigate("/admin/product-distributions/new")}
                    className="mt-2"
                  >
                    <i className="nc-icon nc-simple-add mr-1" />
                    Nueva Distribución
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && (
                <Alert color="danger" className="mt-3">
                  {error}
                </Alert>
              )}

              {loading ? (
                <div className="text-center py-5">
                  <Spinner color="primary" />
                  <p className="mt-2">Cargando distribuciones...</p>
                </div>
              ) : distributions.length === 0 ? (
                <Alert color="info" className="mt-3">
                  No hay distribuciones registradas. Haz clic en "Nueva Distribución" para crear una.
                </Alert>
              ) : (
                <Table responsive>
                  <thead className="text-primary">
                    <tr>
                      <th>Número</th>
                      <th>Fecha</th>
                      <th>Estado</th>
                      <th>Envíos</th>
                      <th>Orden de Producción</th>
                      <th>Descripción</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map((distribution) => {
                      const expanded = expandedDistributionId === distribution.id;
                      return (
                        <React.Fragment key={distribution.id}>
                          <tr className={expanded ? "table-active" : ""}>
                            <td>
                              <strong>{distribution.distributionNumber}</strong>
                            </td>
                            <td>{formatDate(distribution.distributionDate)}</td>
                            <td>{getStatusBadge(distribution.status)}</td>
                            <td>
                              <Badge color="info">{distribution.shipmentCount || 0}</Badge>
                            </td>
                            <td>
                              {distribution.productionOrderCode ? (
                                <Badge color="primary">{distribution.productionOrderCode}</Badge>
                              ) : (
                                <small className="text-muted">-</small>
                              )}
                            </td>
                            <td>
                              <small className="text-muted">
                                {distribution.description || "Sin descripción"}
                              </small>
                            </td>
                            <td>
                              <Button
                                color={expanded ? "secondary" : "info"}
                                size="sm"
                                onClick={() => toggleExpandedRow(distribution.id)}
                                className="mr-2"
                                title="Mostrar opciones de edición"
                              >
                                <i className={`nc-icon ${expanded ? "nc-minimal-up" : "nc-minimal-down"}`} />
                              </Button>
                              {distribution.status === "DRAFT" && (
                                <Button
                                  color="danger"
                                  size="sm"
                                  onClick={() => handleDelete(distribution.id, distribution.distributionNumber)}
                                >
                                  <i className="nc-icon nc-simple-remove" />
                                </Button>
                              )}
                            </td>
                          </tr>
                          <tr>
                            <td colSpan="7" className="p-0 border-0">
                              <Collapse isOpen={expanded}>
                                <div className="p-3 mb-2" style={{ background: "#f7fbfc", border: "1px solid #e3edf0" }}>
                                  <Row>
                                    <Col md="8">
                                      <div className="mb-2">
                                        <strong>{distribution.distributionNumber}</strong>{" "}
                                        <small className="text-muted">- {formatDate(distribution.distributionDate)}</small>
                                      </div>
                                      <small className="text-muted d-block">
                                        {distribution.description || "Sin descripción"}
                                      </small>
                                      <div className="mt-2">
                                        <Badge color="info" className="mr-2">
                                          Envíos: {distribution.shipmentCount || 0}
                                        </Badge>
                                        {distribution.productionOrderCode ? (
                                          <Badge color="primary">OP: {distribution.productionOrderCode}</Badge>
                                        ) : null}
                                      </div>
                                    </Col>
                                    <Col md="4" className="text-right">
                                      <Button
                                        color="info"
                                        size="sm"
                                        className="mr-2 mb-2"
                                        onClick={() => openPreviewModal(distribution)}
                                      >
                                        <i className="nc-icon nc-zoom-split mr-1" />
                                        Ver envíos
                                      </Button>
                                      <Button
                                        color="light"
                                        size="sm"
                                        className="mr-2 mb-2"
                                        onClick={() => navigate(`/admin/product-distributions/${distribution.id}`)}
                                      >
                                        <i className="nc-icon nc-ruler-pencil mr-1" />
                                        Editar
                                      </Button>
                                      <Button
                                        color="primary"
                                        size="sm"
                                        className="mr-2 mb-2"
                                        onClick={() => navigate("/admin/prepare-shipments")}
                                      >
                                        <i className="nc-icon nc-delivery-fast mr-1" />
                                        Preparar Envíos
                                      </Button>
                                      <Button
                                        color="secondary"
                                        size="sm"
                                        className="mr-2 mb-2"
                                        disabled={reportLoadingId === distribution.id}
                                        onClick={() => openDistributionReport(distribution, false)}
                                      >
                                        {reportLoadingId === distribution.id ? (
                                          <Spinner size="sm" className="mr-1" />
                                        ) : (
                                          <i className="nc-icon nc-paper mr-1" />
                                        )}
                                        Ver reporte
                                      </Button>
                                      <Button
                                        color="dark"
                                        size="sm"
                                        className="mb-2"
                                        disabled={reportLoadingId === distribution.id}
                                        onClick={() => openDistributionReport(distribution, true)}
                                      >
                                        {reportLoadingId === distribution.id ? (
                                          <Spinner size="sm" className="mr-1" />
                                        ) : (
                                          <i className="nc-icon nc-cloud-download-93 mr-1" />
                                        )}
                                        PDF / Imprimir
                                      </Button>
                                    </Col>
                                  </Row>
                                </div>
                              </Collapse>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
      <Modal isOpen={previewModal.open} toggle={closePreviewModal} size="xl" scrollable>
        <ModalHeader toggle={closePreviewModal}>
          {previewModal.distribution
            ? `Envíos — ${previewModal.distribution.distributionNumber}`
            : "Envíos de distribución"}
        </ModalHeader>
        <ModalBody>
          {previewModal.distribution && (
            <Row className="mb-3">
              <Col md="3"><strong>Fecha:</strong> {formatDate(previewModal.distribution.distributionDate)}</Col>
              <Col md="3"><strong>Estado:</strong> {getStatusBadge(previewModal.distribution.status)}</Col>
              <Col md="3"><strong>Envíos:</strong> <Badge color="info">{previewSummary.total}</Badge></Col>
              <Col md="3"><strong>OP:</strong> {previewModal.distribution.productionOrderCode || "—"}</Col>
            </Row>
          )}
          <Alert color="light" className="border">
            Un envío por kiosko. La impresión separa en páginas de 10 productos automáticamente.
          </Alert>
          <Row className="mb-2">
            <Col md="6">
              <Input
                type="search"
                placeholder="Buscar por envío o kiosko..."
                value={previewModal.search}
                onChange={(e) => setPreviewModal((prev) => ({ ...prev, search: e.target.value }))}
              />
            </Col>
            <Col md="6" className="text-right">
              <Button size="sm" color={previewModal.status === "ALL" ? "primary" : "secondary"} outline={previewModal.status !== "ALL"} className="mr-1" onClick={() => setPreviewModal((prev) => ({ ...prev, status: "ALL" }))}>Todos</Button>
              <Button size="sm" color={previewModal.status === "DRAFT" ? "primary" : "secondary"} outline={previewModal.status !== "DRAFT"} className="mr-1" onClick={() => setPreviewModal((prev) => ({ ...prev, status: "DRAFT" }))}>Borrador ({previewSummary.draft})</Button>
              <Button size="sm" color={previewModal.status === "SENT" ? "primary" : "secondary"} outline={previewModal.status !== "SENT"} className="mr-1" onClick={() => setPreviewModal((prev) => ({ ...prev, status: "SENT" }))}>Enviados ({previewSummary.sent})</Button>
              <Button size="sm" color={previewModal.status === "COMPLETED" ? "primary" : "secondary"} outline={previewModal.status !== "COMPLETED"} onClick={() => setPreviewModal((prev) => ({ ...prev, status: "COMPLETED" }))}>Completados ({previewSummary.completed})</Button>
            </Col>
          </Row>
          {previewModal.loading ? (
            <div className="text-center py-4"><Spinner color="primary" /></div>
          ) : previewModal.error ? (
            <Alert color="danger">{previewModal.error}</Alert>
          ) : filteredPreviewShipments.length === 0 ? (
            <Alert color="info">No hay envíos para los filtros seleccionados.</Alert>
          ) : (
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th>Envío</th>
                  <th>Kiosko</th>
                  <th>Estado</th>
                  <th>Productos</th>
                  <th>Empaques</th>
                </tr>
              </thead>
              <tbody>
                {filteredPreviewShipments.map((shipment) => (
                  <tr key={shipment.id}>
                    <td><strong>{shipment.shipmentNumber}</strong></td>
                    <td>{shipment.locationName} ({shipment.locationCode})</td>
                    <td>{getStatusBadge(shipment.status)}</td>
                    <td>{shipment.products?.length || 0}</td>
                    <td>{(shipment.packingItems || []).length}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
          {previewModal.distribution && (
            <div className="text-right mt-3">
              <Button
                color="info"
                onClick={() => {
                  const distId = previewModal.distribution.id;
                  closePreviewModal();
                  navigate(`/admin/product-distributions/${distId}`);
                }}
              >
                Abrir edición completa
              </Button>
            </div>
          )}
        </ModalBody>
      </Modal>
    </div>
  );
}

export default ProductDistributions;

