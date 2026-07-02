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
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getProductInventoryByLocationVariants } from "services/productInventoryService";
import { getKioscoStock } from "services/kioscoInventoryService";
import { formatInventorySizesLine } from "utils/inventoryVariantHelper";
import { showError } from "utils/notificationHelper";
import { formatQty } from "./posUtils";

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
  const stock = safeNumber(variant.quantity);
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
        productCategoryName: row.productCategoryName,
        variants: [],
      });
    }
    grouped.get(key).variants.push(row);
  });
  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      variants: sortVariants(group.variants),
      totalQuantity: group.variants.reduce((sum, variant) => sum + safeNumber(variant.quantity), 0),
    }))
    .sort((a, b) => {
      const byCode = safeText(a.productCode).localeCompare(safeText(b.productCode), "es", {
        sensitivity: "base",
      });
      if (byCode !== 0) return byCode;
      return safeText(a.productName).localeCompare(safeText(b.productName), "es", {
        sensitivity: "base",
      });
    });
};

const inventoryKey = (productId, colorId) => `${productId || "p"}:${colorId ?? "none"}`;

const normalizeKioscoRows = (rows) =>
  (rows || []).map((row) => ({
    id: row.id,
    productId: row.productId,
    productCode: row.productCode,
    productName: row.productName,
    productCategoryName: row.productCategoryName || "",
    colorId: row.colorId,
    colorName: row.colorName,
    quantity: safeNumber(row.currentStock),
    min: safeNumber(row.minimumStock),
    sizes: row.sizes && typeof row.sizes === "object" ? row.sizes : null,
    locationId: row.locationId,
  }));

const mergeInventoryRows = (kioscoRows, legacyRows) => {
  const normalizedKiosco = normalizeKioscoRows(kioscoRows);
  const merged = [...normalizedKiosco];

  const legacyByKey = new Map();
  (legacyRows || []).forEach((row) => {
    legacyByKey.set(inventoryKey(row.productId, row.colorId), row);
  });

  const mergedByKey = new Set();
  merged.forEach((row) => {
    const key = inventoryKey(row.productId, row.colorId);
    mergedByKey.add(key);
    const legacy = legacyByKey.get(key);
    if (legacy) {
      row.sizes = row.sizes || legacy.sizes || null;
      row.productCategoryName = row.productCategoryName || legacy.productCategoryName || "";
    }
  });

  (legacyRows || []).forEach((legacy) => {
    const key = inventoryKey(legacy.productId, legacy.colorId);
    if (mergedByKey.has(key)) return;
    merged.push({
      ...legacy,
      quantity: safeNumber(legacy.quantity),
      min: safeNumber(legacy.min),
    });
  });

  return merged;
};

function PosInventoryTab({ kioskLocationId, kioskName, active }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("ALL");

  const loadInventory = useCallback(async () => {
    if (!kioskLocationId) {
      setRows([]);
      return;
    }
    try {
      setLoading(true);
      const [kioscoData, legacyData] = await Promise.all([
        getKioscoStock(kioskLocationId),
        getProductInventoryByLocationVariants(kioskLocationId).catch(() => []),
      ]);
      setRows(mergeInventoryRows(kioscoData, legacyData));
    } catch (err) {
      setRows([]);
      showError(err.message || "No se pudo cargar el inventario detallado del kiosko.");
    } finally {
      setLoading(false);
    }
  }, [kioskLocationId]);

  useEffect(() => {
    if (active !== false) {
      loadInventory();
    }
  }, [active, loadInventory]);

  const products = useMemo(() => buildProducts(rows), [rows]);
  const query = useMemo(() => normalize(search), [search]);

  const filteredProducts = useMemo(() => {
    return products
      .map((product) => {
        const filteredVariants = product.variants.filter((variant) => {
          const status = variantStatus(variant);
          if (stockFilter === "LOW" && !status.low) return false;
          if (stockFilter === "OUT" && status.label !== "Sin stock") return false;
          if (!query) return true;
          const text = normalize(
            `${product.productCode || ""} ${product.productName || ""} ${product.productCategoryName || ""} ${
              variant.colorName || ""
            } ${formatInventorySizesLine(variant.sizes) || ""}`
          );
          return text.includes(query);
        });
        if (filteredVariants.length === 0) return null;
        return {
          ...product,
          variants: filteredVariants,
          totalQuantity: filteredVariants.reduce((sum, item) => sum + safeNumber(item.quantity), 0),
        };
      })
      .filter(Boolean);
  }, [products, query, stockFilter]);

  const summary = useMemo(() => {
    const allVariants = rows || [];
    const lowVariants = allVariants.filter((variant) => variantStatus(variant).low).length;
    const sizeVariants = allVariants.filter((variant) => formatInventorySizesLine(variant.sizes)).length;
    return {
      products: products.length,
      variants: allVariants.length,
      totalQuantity: allVariants.reduce((sum, variant) => sum + safeNumber(variant.quantity), 0),
      lowVariants,
      sizeVariants,
    };
  }, [products, rows]);

  if (!kioskLocationId) {
    return (
      <Alert color="info" className="mb-0">
        Selecciona un kiosko para ver su inventario.
      </Alert>
    );
  }

  return (
    <div className="kiosk-pos-inventory-tab">
      <Card className="kiosk-pos-block">
        <CardHeader className="d-flex flex-wrap align-items-center justify-content-between">
          <div>
            <CardTitle tag="h5" className="mb-1">
              Inventario detallado{kioskName ? ` — ${kioskName}` : ""}
            </CardTitle>
            <small className="text-muted">
              Detalle por producto, color y tallas (cuando aplica, por ejemplo cinchos).
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

          <Row className="mb-3">
            <Col md="8">
              <Input
                className="kiosk-pos-input-lg"
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por código, producto, categoría, color o talla..."
              />
            </Col>
            <Col md="4" className="mt-2 mt-md-0">
              <Input
                className="kiosk-pos-input-lg"
                type="select"
                value={stockFilter}
                onChange={(e) => setStockFilter(e.target.value)}
              >
                <option value="ALL">Todos los niveles de stock</option>
                <option value="LOW">Solo stock bajo / sin stock</option>
                <option value="OUT">Solo sin stock</option>
              </Input>
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
                          <th>Tallas</th>
                          <th className="text-right">Stock</th>
                          <th className="text-right">Mínimo</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {product.variants.map((variant) => {
                          const status = variantStatus(variant);
                          return (
                            <tr
                              key={`${product.key}-${variant.id || `${variant.colorId || "none"}-${variant.locationId || "loc"}`}`}
                              className={status.low ? "kiosk-pos-inventory-row-low" : ""}
                            >
                              <td>{safeText(variant.colorName) || <span className="text-muted">Sin color</span>}</td>
                              <td className="kiosk-pos-inventory-size-cell">
                                {formatInventorySizesLine(variant.sizes) || (
                                  <span className="text-muted">No aplica</span>
                                )}
                              </td>
                              <td className="text-right font-weight-bold">{formatQty(variant.quantity)}</td>
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
    </div>
  );
}

export default PosInventoryTab;
