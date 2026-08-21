import React, { useCallback, useEffect, useMemo, useState } from "react";
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
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getProductInventoryByLocationVariants } from "services/productInventoryService";
import { getKioscoStock } from "services/kioscoInventoryService";
import { getProducts } from "services/productService";
import { getProductCategories } from "services/productCategoryService";
import { formatInventorySizesLine } from "utils/inventoryVariantHelper";
import {
  filterVisibleKioskStockRows,
  getHardwareConditionLabel,
  normalizeHardwareCondition,
} from "utils/productCinchoHelper";
import {
  PRODUCT_AUDIENCE_OPTIONS,
  getProductAudienceLabel,
  normalizeAudienceCategory,
  productMatchesAudienceFilter,
} from "utils/productAudienceHelper";
import { showError } from "utils/notificationHelper";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { formatQty, normalizePosHardwareCondition, posVariantStockQty } from "./posUtils";
import KioskInventoryCountReport from "../KioskInventoryCountReport";

const safeText = (value) => String(value || "").trim();
const safeNumber = (value) => {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
};

const normalize = (value) =>
  safeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const variantStatus = (variant) => {
  const stock = posVariantStockQty(variant);
  const min = safeNumber(variant.min);
  if (stock <= 0) {
    return { label: "Sin stock", color: "danger", low: true };
  }
  if (min > 0 && stock <= min) {
    return { label: "Stock bajo", color: "warning", low: true };
  }
  return { label: "Normal", color: "success", low: false };
};

const sortVariants = (variants) =>
  [...(variants || [])].sort((a, b) => {
    const colorCompare = safeText(a.colorName).localeCompare(safeText(b.colorName), "es", {
      sensitivity: "base",
    });
    if (colorCompare !== 0) return colorCompare;
    const hwA = normalizePosHardwareCondition(a.hardwareCondition);
    const hwB = normalizePosHardwareCondition(b.hardwareCondition);
    if (hwA !== hwB) return hwA.localeCompare(hwB);
    return safeText(a.productCode).localeCompare(safeText(b.productCode), "es", { sensitivity: "base" });
  });

const buildProducts = (rows) => {
  const grouped = new Map();
  (rows || []).forEach((row) => {
    const key = row.productId ?? `product-${safeText(row.productCode)}-${safeText(row.productName)}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        productId: row.productId,
        productCode: row.productCode,
        productName: row.productName,
        productCategoryId: row.productCategoryId ?? null,
        productCategoryName: row.productCategoryName,
        audienceCategory: normalizeAudienceCategory(row.audienceCategory),
        variants: [],
      });
    }
    const group = grouped.get(key);
    if (group.productCategoryId == null && row.productCategoryId != null) {
      group.productCategoryId = row.productCategoryId;
    }
    if (!group.productCategoryName && row.productCategoryName) {
      group.productCategoryName = row.productCategoryName;
    }
    if (row.audienceCategory) {
      group.audienceCategory = normalizeAudienceCategory(row.audienceCategory);
    }
    group.variants.push(row);
  });
  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      variants: sortVariants(group.variants),
      totalQuantity: group.variants.reduce((sum, variant) => sum + posVariantStockQty(variant), 0),
    }))
    .sort((a, b) => {
      const catCompare = safeText(a.productCategoryName).localeCompare(
        safeText(b.productCategoryName),
        "es",
        { sensitivity: "base" }
      );
      if (catCompare !== 0) return catCompare;
      const audCompare = getProductAudienceLabel(a.audienceCategory).localeCompare(
        getProductAudienceLabel(b.audienceCategory),
        "es",
        { sensitivity: "base" }
      );
      if (audCompare !== 0) return audCompare;
      const byCode = safeText(a.productCode).localeCompare(safeText(b.productCode), "es", {
        sensitivity: "base",
      });
      if (byCode !== 0) return byCode;
      return safeText(a.productName).localeCompare(safeText(b.productName), "es", {
        sensitivity: "base",
      });
    });
};

/** Misma regla que catálogo POS: si hay tallas, suma de tallas; si no, currentStock. */
const resolveSellableQuantity = (currentStock, sizes) => {
  if (sizes && typeof sizes === "object" && Object.keys(sizes).length > 0) {
    return Object.values(sizes).reduce((sum, qty) => sum + Math.max(0, safeNumber(qty)), 0);
  }
  return safeNumber(currentStock);
};

const normalizeKioscoRows = (rows) =>
  (rows || []).map((row) => {
    const sizes = row.sizes && typeof row.sizes === "object" ? row.sizes : null;
    const hardwareCondition = normalizePosHardwareCondition(row.hardwareCondition);
    return {
      id: row.id,
      productId: row.productId,
      productCode: row.productCode,
      productName: row.productName,
      productCategoryId: row.productCategoryId ?? row.categoryId ?? null,
      productCategoryName: row.productCategoryName || row.categoryName || "",
      audienceCategory: normalizeAudienceCategory(row.audienceCategory),
      colorId: row.colorId,
      colorName: row.colorName,
      hardwareCondition,
      hardwareLabel: getHardwareConditionLabel(hardwareCondition),
      quantity: resolveSellableQuantity(row.currentStock, sizes),
      min: safeNumber(row.minimumStock),
      sizes,
      locationId: row.locationId,
      source: "kiosco",
    };
  });

/**
 * Fuente de verdad: kiosco_stock (con herraje NUEVO/VIEJO).
 * Legacy solo si el kiosko aún no tiene filas en módulo kiosco (migración).
 * No se mezclan tallas/cantidades legacy sobre filas kiosco (causaba duplicados y stock falso).
 */
const buildInventoryRows = (kioscoRows, legacyRows, productMetaById) => {
  const enrichMeta = (row) => {
    const meta = row.productId != null ? productMetaById.get(Number(row.productId)) : null;
    if (meta) {
      if (row.productCategoryId == null) row.productCategoryId = meta.categoryId;
      if (!row.productCategoryName) row.productCategoryName = meta.categoryName || "";
      row.audienceCategory = normalizeAudienceCategory(meta.audienceCategory);
    } else {
      row.audienceCategory = normalizeAudienceCategory(row.audienceCategory);
    }
    return row;
  };

  const kioscoNormalized = normalizeKioscoRows(kioscoRows).map(enrichMeta);
  if (kioscoNormalized.length > 0) {
    return kioscoNormalized;
  }

  return (legacyRows || []).map((legacy) => {
    const hardware = normalizeHardwareCondition(legacy.hardwareCondition) || "NUEVO";
    return enrichMeta({
      ...legacy,
      productCategoryId: legacy.productCategoryId ?? null,
      audienceCategory: normalizeAudienceCategory(legacy.audienceCategory),
      hardwareCondition: hardware,
      hardwareLabel: getHardwareConditionLabel(hardware),
      quantity: resolveSellableQuantity(legacy.quantity, legacy.sizes),
      min: safeNumber(legacy.min),
      sizes: legacy.sizes && typeof legacy.sizes === "object" ? legacy.sizes : null,
      source: "legacy",
    });
  });
};

function PosInventoryTab({ kioskLocationId, kioskName, active }) {
  const [inventoryView, setInventoryView] = useState("STOCK");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");

  const loadInventory = useCallback(async () => {
    if (!kioskLocationId) {
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      const [kioscoData, legacyData, products, categories] = await Promise.all([
        getKioscoStock(kioskLocationId),
        getProductInventoryByLocationVariants(kioskLocationId).catch(() => []),
        getProducts().catch(() => []),
        getProductCategories().catch(() => []),
      ]);
      const categoryNameById = new Map();
      (Array.isArray(categories) ? categories : []).forEach((c) => {
        if (c?.id == null) return;
        categoryNameById.set(Number(c.id), c.name || c.code || String(c.id));
      });
      const productMetaById = new Map();
      (Array.isArray(products) ? products : []).forEach((p) => {
        if (p?.id == null) return;
        const categoryId = p.categoryId != null ? Number(p.categoryId) : null;
        productMetaById.set(Number(p.id), {
          categoryId,
          categoryName: categoryId != null ? categoryNameById.get(categoryId) || "" : "",
          audienceCategory: normalizeAudienceCategory(p.audienceCategory),
        });
      });
      setRows(
        filterVisibleKioskStockRows(
          buildInventoryRows(kioscoData, legacyData, productMetaById)
        )
      );
    } catch (err) {
      setRows([]);
      showError(err.message || "No se pudo cargar el inventario detallado del kiosko.");
    } finally {
      setLoading(false);
    }
  }, [kioskLocationId]);

  useEffect(() => {
    if (active !== false && inventoryView === "STOCK") {
      loadInventory();
    }
  }, [active, inventoryView, loadInventory]);

  const products = useMemo(() => buildProducts(rows), [rows]);
  const query = useMemo(() => normalize(search), [search]);

  const categoryOptions = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      const id = p.productCategoryId != null ? String(p.productCategoryId) : "none";
      if (map.has(id)) return;
      map.set(id, {
        value: id,
        label: p.productCategoryName || "Sin categoría",
        searchText: p.productCategoryName || "sin categoria",
      });
    });
    return [
      { value: "", label: "Todas las categorías", searchText: "todas" },
      ...Array.from(map.values()).sort((a, b) =>
        a.label.localeCompare(b.label, "es", { sensitivity: "base" })
      ),
    ];
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products
      .map((product) => {
        if (categoryFilter) {
          if (categoryFilter === "none") {
            if (product.productCategoryId != null) return null;
          } else if (String(product.productCategoryId) !== String(categoryFilter)) {
            return null;
          }
        }
        if (!productMatchesAudienceFilter(product, audienceFilter)) {
          return null;
        }
        const filteredVariants = product.variants.filter((variant) => {
          const status = variantStatus(variant);
          if (stockFilter === "LOW" && !status.low) return false;
          if (stockFilter === "OUT" && status.label !== "Sin stock") return false;
          if (!query) return true;
          const text = normalize(
            `${product.productCode || ""} ${product.productName || ""} ${product.productCategoryName || ""} ${
              getProductAudienceLabel(product.audienceCategory)
            } ${variant.colorName || ""} ${variant.hardwareLabel || ""} ${
              formatInventorySizesLine(variant.sizes) || ""
            }`
          );
          return text.includes(query);
        });
        if (filteredVariants.length === 0) return null;
        return {
          ...product,
          variants: filteredVariants,
          totalQuantity: filteredVariants.reduce((sum, item) => sum + posVariantStockQty(item), 0),
        };
      })
      .filter(Boolean);
  }, [products, query, stockFilter, categoryFilter, audienceFilter]);

  const summary = useMemo(() => {
    const allVariants = filteredProducts.flatMap((p) => p.variants);
    const lowVariants = allVariants.filter((variant) => variantStatus(variant).low).length;
    const sizeVariants = allVariants.filter((variant) => formatInventorySizesLine(variant.sizes)).length;
    return {
      products: filteredProducts.length,
      variants: allVariants.length,
      totalQuantity: allVariants.reduce((sum, variant) => sum + posVariantStockQty(variant), 0),
      lowVariants,
      sizeVariants,
    };
  }, [filteredProducts]);

  if (!kioskLocationId) {
    return (
      <Alert color="info" className="mb-0">
        Selecciona un kiosko para ver su inventario.
      </Alert>
    );
  }

  return (
    <div className="kiosk-pos-inventory-tab">
      <div className="d-flex flex-wrap mb-3" style={{ gap: 8 }}>
        <Button
          size="sm"
          color={inventoryView === "STOCK" ? "primary" : "secondary"}
          outline={inventoryView !== "STOCK"}
          onClick={() => setInventoryView("STOCK")}
        >
          Consulta de stock
        </Button>
        <Button
          size="sm"
          color={inventoryView === "MI_CONTEO" ? "primary" : "secondary"}
          outline={inventoryView !== "MI_CONTEO"}
          onClick={() => setInventoryView("MI_CONTEO")}
        >
          Mi conteo
        </Button>
      </div>

      {inventoryView === "MI_CONTEO" ? (
        <KioskInventoryCountReport locationId={kioskLocationId} internalMode />
      ) : (
        <Card className="kiosk-pos-block">
          <CardHeader className="d-flex flex-wrap align-items-center justify-content-between">
            <div>
              <CardTitle tag="h5" className="mb-1">
                Inventario detallado{kioskName ? ` — ${kioskName}` : ""}
              </CardTitle>
              <small className="text-muted">
                Stock real del módulo kiosco (herraje nuevo/viejo). Misma fuente que la venta POS.
              </small>
            </div>
            <Button color="default" size="sm" onClick={() => void loadInventory()} disabled={loading}>
              {loading ? <Spinner size="sm" /> : <i className="nc-icon nc-refresh-69" />} Recargar
            </Button>
          </CardHeader>
          <CardBody>
            <Row className="kiosk-pos-inventory-summary mb-3">
              <Col md="2" sm="6" xs="6">
                <div className="kiosk-pos-inventory-summary-item">
                  <span className="label">Productos</span>
                  <strong>{summary.products}</strong>
                </div>
              </Col>
              <Col md="2" sm="6" xs="6">
                <div className="kiosk-pos-inventory-summary-item">
                  <span className="label">Variantes</span>
                  <strong>{summary.variants}</strong>
                </div>
              </Col>
              <Col md="2" sm="6" xs="6">
                <div className="kiosk-pos-inventory-summary-item">
                  <span className="label">Unidades</span>
                  <strong>{formatQty(summary.totalQuantity)}</strong>
                </div>
              </Col>
              <Col md="3" sm="6" xs="6">
                <div className="kiosk-pos-inventory-summary-item">
                  <span className="label">Variantes con talla</span>
                  <strong>{summary.sizeVariants}</strong>
                </div>
              </Col>
              <Col md="3" sm="12" xs="12">
                <div className="kiosk-pos-inventory-summary-item warning">
                  <span className="label">Stock bajo / sin stock</span>
                  <strong>{summary.lowVariants}</strong>
                </div>
              </Col>
            </Row>

            <Row className="mb-3 align-items-end">
              <Col md="3">
                <Label className="mb-1 small">Categoría</Label>
                <FilterableSelect
                  options={categoryOptions}
                  value={categoryFilter}
                  onChange={setCategoryFilter}
                  placeholder="Ej. Billeteras..."
                />
              </Col>
              <Col md="3" className="mt-2 mt-md-0">
                <Label className="mb-1 small">Línea</Label>
                <div className="d-flex flex-wrap" style={{ gap: 6 }}>
                  <Button
                    size="sm"
                    color={!audienceFilter ? "primary" : "secondary"}
                    outline={Boolean(audienceFilter)}
                    onClick={() => setAudienceFilter("")}
                  >
                    Todas
                  </Button>
                  {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                    <Button
                      key={opt.value}
                      size="sm"
                      color={audienceFilter === opt.value ? "primary" : "secondary"}
                      outline={audienceFilter !== opt.value}
                      onClick={() =>
                        setAudienceFilter(audienceFilter === opt.value ? "" : opt.value)
                      }
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </Col>
              <Col md="2" className="mt-2 mt-md-0">
                <Label className="mb-1 small">Nivel de stock</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="select"
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value)}
                >
                  <option value="ALL">Todos los niveles</option>
                  <option value="LOW">Stock bajo / sin stock</option>
                  <option value="OUT">Solo sin stock</option>
                </Input>
              </Col>
              <Col md="4" className="mt-2 mt-md-0">
                <Label className="mb-1 small">Buscar</Label>
                <Input
                  className="kiosk-pos-input-lg"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Código, producto, categoría, línea, color, herraje..."
                />
              </Col>
            </Row>

            {loading ? (
              <div className="text-center py-4">
                <Spinner size="sm" /> Cargando inventario...
              </div>
            ) : filteredProducts.length === 0 ? (
              <Alert color="warning" className="mb-0">
                No hay datos que mostrar con los filtros actuales.
              </Alert>
            ) : (
              <div className="kiosk-pos-inventory-products">
                {filteredProducts.map((product) => (
                  <Card key={product.key} className="kiosk-pos-inventory-product-card">
                    <CardHeader className="py-2">
                      <div className="d-flex flex-wrap align-items-center justify-content-between">
                        <div>
                          <strong>{safeText(product.productCode) || "Sin código"}</strong>{" "}
                          <span>{safeText(product.productName) || "Producto"}</span>
                          {product.productCategoryName ? (
                            <Badge color="secondary" className="ml-2">
                              {product.productCategoryName}
                            </Badge>
                          ) : null}
                          <Badge color="info" className="ml-1">
                            {getProductAudienceLabel(product.audienceCategory)}
                          </Badge>
                        </div>
                        <Badge color="primary" pill>
                          Total: {formatQty(product.totalQuantity)}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardBody className="pt-2 pb-2">
                      <Table responsive size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Color</th>
                            <th>Herraje</th>
                            <th>Tallas</th>
                            <th className="text-right">Stock</th>
                            <th className="text-right">Mínimo</th>
                            <th>Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {product.variants.map((variant) => {
                            const status = variantStatus(variant);
                            const stockQty = posVariantStockQty(variant);
                            return (
                              <tr
                                key={`${product.key}-${variant.id || `${variant.colorId || "none"}-${variant.hardwareCondition || "NUEVO"}-${variant.locationId || "loc"}`}`}
                                className={status.low ? "kiosk-pos-inventory-row-low" : ""}
                              >
                                <td>
                                  {safeText(variant.colorName) || (
                                    <span className="text-muted">Sin color</span>
                                  )}
                                </td>
                                <td>
                                  {safeText(variant.hardwareLabel) ||
                                    getHardwareConditionLabel(variant.hardwareCondition)}
                                </td>
                                <td className="kiosk-pos-inventory-size-cell">
                                  {formatInventorySizesLine(variant.sizes) || (
                                    <span className="text-muted">No aplica</span>
                                  )}
                                </td>
                                <td className="text-right font-weight-bold">
                                  {formatQty(stockQty)}
                                </td>
                                <td className="text-right">{formatQty(variant.min)}</td>
                                <td>
                                  <Badge color={status.color}>{status.label}</Badge>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </Table>
                    </CardBody>
                  </Card>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}

export default PosInventoryTab;
