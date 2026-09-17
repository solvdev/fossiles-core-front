import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
} from "reactstrap";
import Select from "react-select";
import { useAuth } from "contexts/AuthContext";
import { getLocations } from "services/locationService";
import { getKioskSalesByProductColorReport } from "services/kioskPosService";
import {
  getMonthStartYmdGuatemala,
  getTodayYmdGuatemala,
  getWeekStartYmdGuatemala,
  getYesterdayYmdGuatemala,
} from "utils/dateTimeHelper";
import {
  exportKioskSalesByProductColorExcel,
  formatShare,
  periodLabel,
} from "utils/kioskSalesByProductColorExport";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency, formatQty } from "views/kiosks/pos/posUtils";
import "./KioskPerformance.css";

const ALL_KIOSKS_OPTION = { value: "", label: "Todos los kioskos" };
const PREFS_KEY = "fossiles.kioskSalesByColor.prefs";

const DEFAULT_PREFS = {
  showCode: true,
  showName: true,
  showCategory: false,
  showAudience: false,
  metricQty: true,
  metricAmount: false,
  metricStock: true,
  metricTickets: false,
  metricShare: false,
  includeZeroSales: true,
  hideEmptyColors: false,
  hidePackaging: true,
  viewMode: "matrix",
  sortBy: "qtyDesc",
};

const isKioskLocation = (location) => {
  const categoria = String(location?.categoria || "").toUpperCase();
  const name = String(location?.name || "").toUpperCase();
  const code = String(location?.code || "").toUpperCase();
  return categoria.includes("KIOS") || name.includes("KIOS") || code.startsWith("K");
};

const colorKey = (id) => (id == null || id === "" ? "none" : String(id));

const loadPrefs = () => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
};

const qtyOf = (cell) => Number(cell?.quantity || 0);
const amountOf = (cell) => Number(cell?.amount || 0);
const stockOf = (cell) => Number(cell?.currentStock || 0);
const ticketsOf = (cell) => Number(cell?.tickets || 0);

const cellByColor = (product, colorId) =>
  (product?.colors || []).find((cell) => colorKey(cell.colorId) === colorKey(colorId)) || null;

const kioskCellOf = (product, kioskId) =>
  (product?.kiosks || []).find((cell) => String(cell.kioskLocationId) === String(kioskId)) || null;

const heatBackground = (qty, maxQty) => {
  const n = Number(qty || 0);
  if (n <= 0 || maxQty <= 0) return undefined;
  const t = Math.min(1, n / maxQty);
  return `rgba(16, 185, 129, ${0.12 + t * 0.42})`;
};

function KioskPerformance() {
  const { user } = useAuth();
  const today = getTodayYmdGuatemala();
  const [prefs, setPrefs] = useState(loadPrefs);
  const [startDate, setStartDate] = useState(getMonthStartYmdGuatemala());
  const [endDate, setEndDate] = useState(today);
  const [dateFilterMode, setDateFilterMode] = useState("range");
  const [selectedKioskId, setSelectedKioskId] = useState("");
  const [kioskLocations, setKioskLocations] = useState([]);
  const [loadingKiosks, setLoadingKiosks] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const [search, setSearch] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [visibleColorIds, setVisibleColorIds] = useState({});

  const generatedByName = useMemo(() => {
    const composed = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
    return composed || user?.fullName || user?.name || user?.username || "";
  }, [user]);

  const kioskSelectOptions = useMemo(() => {
    const options = (kioskLocations || [])
      .map((loc) => ({
        value: String(loc.id),
        label: loc.code ? `${loc.name} (${loc.code})` : loc.name || `Kiosko ${loc.id}`,
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label), "es"));
    return [ALL_KIOSKS_OPTION, ...options];
  }, [kioskLocations]);

  const selectedKioskOption = useMemo(
    () =>
      kioskSelectOptions.find((opt) => String(opt.value) === String(selectedKioskId || "")) ||
      ALL_KIOSKS_OPTION,
    [kioskSelectOptions, selectedKioskId]
  );

  const updatePrefs = (patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const loadReport = useCallback(async () => {
    const from = startDate || today;
    const to = (dateFilterMode === "single" ? from : endDate) || from;
    setStartDate(from);
    setEndDate(to);
    try {
      setLoading(true);
      const data = await getKioskSalesByProductColorReport(
        from,
        to,
        selectedKioskId ? Number(selectedKioskId) : undefined,
        true
      );
      setReport(data || null);
    } catch (err) {
      setReport(null);
      showError(err.message || "No se pudo generar el reporte.");
    } finally {
      setLoading(false);
    }
  }, [dateFilterMode, endDate, selectedKioskId, startDate, today]);

  useEffect(() => {
    let cancelled = false;
    const loadKiosks = async () => {
      try {
        setLoadingKiosks(true);
        const locations = await getLocations();
        if (cancelled) return;
        setKioskLocations((locations || []).filter(isKioskLocation));
      } catch (err) {
        if (!cancelled) {
          setKioskLocations([]);
          showError(err.message || "No se pudieron cargar los kioskos.");
        }
      } finally {
        if (!cancelled) setLoadingKiosks(false);
      }
    };
    loadKiosks();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    loadReport();
  }, []);

  useEffect(() => {
    if (!report?.colors) return;
    setVisibleColorIds((prev) => {
      const next = { ...prev };
      report.colors.forEach((color) => {
        const key = colorKey(color.id);
        if (next[key] === undefined) next[key] = true;
      });
      return next;
    });
  }, [report]);

  const categoryOptions = useMemo(() => {
    const names = new Set();
    (report?.products || []).forEach((product) => {
      if (product.categoryName) names.add(product.categoryName);
    });
    return [...names].sort((a, b) => a.localeCompare(b, "es"));
  }, [report]);

  const filteredProducts = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = report?.products || [];
    if (prefs.hidePackaging) {
      rows = rows.filter((product) => !isPackagingProductCode(product.productCode));
    }
    if (audienceFilter) {
      rows = rows.filter((product) => String(product.audienceCategory || "") === audienceFilter);
    }
    if (categoryFilter) {
      rows = rows.filter((product) => String(product.categoryName || "") === categoryFilter);
    }
    if (term) {
      rows = rows.filter((product) => {
        const haystack = `${product.productCode || ""} ${product.productName || ""}`.toLowerCase();
        return haystack.includes(term);
      });
    }
    if (!prefs.includeZeroSales) {
      rows = rows.filter((product) => Number(product.totalQuantity || 0) > 0);
    }
    const sorted = [...rows];
    if (prefs.sortBy === "qtyAsc") {
      sorted.sort((a, b) => Number(a.totalQuantity || 0) - Number(b.totalQuantity || 0));
    } else if (prefs.sortBy === "name") {
      sorted.sort((a, b) => String(a.productName || "").localeCompare(String(b.productName || ""), "es"));
    } else if (prefs.sortBy === "code") {
      sorted.sort((a, b) => String(a.productCode || "").localeCompare(String(b.productCode || ""), "es"));
    } else {
      sorted.sort((a, b) => Number(b.totalQuantity || 0) - Number(a.totalQuantity || 0));
    }
    return sorted;
  }, [audienceFilter, categoryFilter, prefs.hidePackaging, prefs.includeZeroSales, prefs.sortBy, report, search]);

  const activeColors = useMemo(() => {
    const colors = (report?.colors || []).filter((color) => visibleColorIds[colorKey(color.id)] !== false);
    if (!prefs.hideEmptyColors) return colors;
    return colors.filter((color) =>
      filteredProducts.some((product) => qtyOf(cellByColor(product, color.id)) > 0)
    );
  }, [filteredProducts, prefs.hideEmptyColors, report, visibleColorIds]);

  const maxQty = useMemo(() => {
    let max = 0;
    filteredProducts.forEach((product) => {
      (product.colors || []).forEach((cell) => {
        max = Math.max(max, qtyOf(cell));
      });
      (product.kiosks || []).forEach((cell) => {
        max = Math.max(max, qtyOf(cell));
      });
    });
    return max;
  }, [filteredProducts]);

  const visibleTotals = useMemo(() => {
    return filteredProducts.reduce(
      (acc, product) => {
        const qty = Number(product.totalQuantity || 0);
        acc.quantity += qty;
        acc.amount += Number(product.totalAmount || 0);
        acc.stock += Number(product.currentStock || 0);
        if (qty > 0) acc.withSales += 1;
        else acc.withoutSales += 1;
        return acc;
      },
      { quantity: 0, amount: 0, stock: 0, withSales: 0, withoutSales: 0 }
    );
  }, [filteredProducts]);

  const applyQuickRange = (from, to, mode = "range") => {
    setDateFilterMode(mode);
    setStartDate(from);
    setEndDate(to);
  };

  const handleStartDateChange = (value) => {
    setStartDate(value);
    if (dateFilterMode === "single") setEndDate(value);
  };

  const manyKiosks = (report?.kiosks || []).length > 1;
  const viewMode = prefs.viewMode === "byKiosk" && !manyKiosks ? "matrix" : prefs.viewMode;

  const handleExport = () => {
    if (!filteredProducts.length) {
      showError("No hay datos para exportar con los filtros actuales.");
      return;
    }
    const columns = buildExportColumns({
      prefs: { ...prefs, viewMode },
      colors: activeColors,
      kiosks: report?.kiosks || [],
      totalQty: visibleTotals.quantity,
    });
    const rows = buildExportRows({
      prefs: { ...prefs, viewMode },
      products: filteredProducts,
      colors: activeColors,
      kiosks: report?.kiosks || [],
    });
    exportKioskSalesByProductColorExcel({
      report,
      rows,
      columns,
      kioskLabel: report?.kioskLabel,
      generatedByName,
    });
    showSuccess("Excel generado.");
  };

  const renderMetricStack = (cell) => {
    const qty = qtyOf(cell);
    const zero = qty <= 0;
    const showQty = prefs.metricQty || (!prefs.metricAmount && !prefs.metricStock && !prefs.metricTickets && !prefs.metricShare);
    return (
      <div className={zero ? "cell-zero" : "cell-sold"} style={{ background: heatBackground(qty, maxQty), padding: "2px 4px", borderRadius: 4 }}>
        {showQty && <div>{formatQty(qty)}</div>}
        {prefs.metricAmount && <div>{formatCurrency(amountOf(cell))}</div>}
        {prefs.metricStock && <div className="text-muted">Stock {formatQty(stockOf(cell))}</div>}
        {prefs.metricTickets && <div className="text-muted">{ticketsOf(cell)} fact.</div>}
        {prefs.metricShare && <div className="text-muted">{formatShare(qty, visibleTotals.quantity)}</div>}
      </div>
    );
  };

  return (
    <div className="content kiosk-color-report">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <CardTitle tag="h4">Ventas de kiosko por producto y color</CardTitle>
              <p className="text-muted mb-0">
                Elige kiosko o todos, el periodo y qué columnas quieres ver. Solo entran productos
                que el kiosko tiene en inventario. Las ventas anuladas no se cuentan.
              </p>
            </CardHeader>
            <CardBody>
              <Row className="mb-2">
                <Col md="2">
                  <Label>Tipo de filtro</Label>
                  <Input
                    type="select"
                    value={dateFilterMode}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setDateFilterMode(mode);
                      if (mode === "single" && startDate) setEndDate(startDate);
                    }}
                  >
                    <option value="single">Día exacto</option>
                    <option value="range">Rango de fechas</option>
                  </Input>
                </Col>
                <Col md="3">
                  <Label>{dateFilterMode === "single" ? "Día" : "Desde"}</Label>
                  <Input type="date" value={startDate} onChange={(e) => handleStartDateChange(e.target.value)} />
                </Col>
                {dateFilterMode === "range" && (
                  <Col md="3">
                    <Label>Hasta</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </Col>
                )}
                <Col md="2">
                  <Label>Kiosko</Label>
                  <Select
                    className="react-select"
                    classNamePrefix="react-select"
                    placeholder={loadingKiosks ? "Cargando kioskos..." : "Buscar kiosko..."}
                    isClearable
                    isSearchable
                    isLoading={loadingKiosks}
                    options={kioskSelectOptions}
                    value={selectedKioskOption}
                    onChange={(selected) => setSelectedKioskId(selected?.value || "")}
                    noOptionsMessage={() => "No hay kioskos"}
                  />
                </Col>
                <Col md="2" className="d-flex align-items-end">
                  <Button color="primary" className="btn-round btn-block" onClick={loadReport} disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner size="sm" className="mr-1" /> Cargando
                      </>
                    ) : (
                      <>
                        <i className="nc-icon nc-zoom-split" /> Generar
                      </>
                    )}
                  </Button>
                </Col>
              </Row>
              <div className="d-flex flex-wrap mb-3">
                <Button color="default" size="sm" className="mr-1 mb-1" onClick={() => applyQuickRange(today, today, "single")}>Hoy</Button>
                <Button color="default" size="sm" className="mr-1 mb-1" onClick={() => applyQuickRange(getYesterdayYmdGuatemala(), getYesterdayYmdGuatemala(), "single")}>Ayer</Button>
                <Button color="default" size="sm" className="mr-1 mb-1" onClick={() => applyQuickRange(getWeekStartYmdGuatemala(), today, "range")}>Esta semana</Button>
                <Button color="default" size="sm" className="mb-1" onClick={() => applyQuickRange(getMonthStartYmdGuatemala(), today, "range")}>Este mes</Button>
              </div>
              <p className="text-muted small mb-3">
                {report
                  ? `${report.kioskLabel} · ${periodLabel(report.startDate, report.endDate)} · ${filteredProducts.length} productos`
                  : "Selecciona fechas y genera el reporte."}
              </p>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md="3">
          <div className="stat-chip">
            <span className="stat-label">Cantidad vendida</span>
            <span className="stat-value">{formatQty(visibleTotals.quantity)}</span>
          </div>
        </Col>
        <Col md="3">
          <div className="stat-chip">
            <span className="stat-label">Monto</span>
            <span className="stat-value">{formatCurrency(visibleTotals.amount)}</span>
          </div>
        </Col>
        <Col md="3">
          <div className="stat-chip">
            <span className="stat-label">Productos con venta</span>
            <span className="stat-value">{visibleTotals.withSales}</span>
          </div>
        </Col>
        <Col md="3">
          <div className="stat-chip">
            <span className="stat-label">Productos sin venta</span>
            <span className="stat-value">{visibleTotals.withoutSales}</span>
          </div>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card className="prefs-card">
            <CardHeader>
              <CardTitle tag="h5">Qué datos quiero ver</CardTitle>
            </CardHeader>
            <CardBody>
              <Row>
                <Col md="3">
                  <Label>Columnas</Label>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.showCode} onChange={(e) => updatePrefs({ showCode: e.target.checked })} /> Código</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.showName} onChange={(e) => updatePrefs({ showName: e.target.checked })} /> Producto</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.showCategory} onChange={(e) => updatePrefs({ showCategory: e.target.checked })} /> Categoría</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.showAudience} onChange={(e) => updatePrefs({ showAudience: e.target.checked })} /> Público</Label></FormGroup>
                </Col>
                <Col md="3">
                  <Label>Métricas</Label>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.metricQty} onChange={(e) => updatePrefs({ metricQty: e.target.checked })} /> Cantidad</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.metricAmount} onChange={(e) => updatePrefs({ metricAmount: e.target.checked })} /> Monto</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.metricStock} onChange={(e) => updatePrefs({ metricStock: e.target.checked })} /> Stock actual</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.metricTickets} onChange={(e) => updatePrefs({ metricTickets: e.target.checked })} /> Facturas</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.metricShare} onChange={(e) => updatePrefs({ metricShare: e.target.checked })} /> % del total</Label></FormGroup>
                </Col>
                <Col md="3">
                  <Label>Filtros de filas</Label>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.includeZeroSales} onChange={(e) => updatePrefs({ includeZeroSales: e.target.checked })} /> Incluir sin ventas</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.hideEmptyColors} onChange={(e) => updatePrefs({ hideEmptyColors: e.target.checked })} /> Ocultar colores sin venta</Label></FormGroup>
                  <FormGroup check><Label check><Input type="checkbox" checked={prefs.hidePackaging} onChange={(e) => updatePrefs({ hidePackaging: e.target.checked })} /> Ocultar empaques</Label></FormGroup>
                  <FormGroup className="mt-2">
                    <Label>Vista</Label>
                    <Input type="select" value={viewMode} onChange={(e) => updatePrefs({ viewMode: e.target.value })}>
                      <option value="matrix">Matriz producto × color</option>
                      <option value="detail">Detalle (una fila por color)</option>
                      {manyKiosks && <option value="byKiosk">Matriz producto × kiosko</option>}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <Label>Buscar producto</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o nombre" />
                  <Label className="mt-2">Público</Label>
                  <Input type="select" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="DAMA">Dama</option>
                    <option value="CABALLERO">Caballero</option>
                    <option value="UNISEX">Unisex</option>
                  </Input>
                  <Label className="mt-2">Categoría</Label>
                  <Input type="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="">Todas</option>
                    {categoryOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Input>
                  <Label className="mt-2">Orden</Label>
                  <Input type="select" value={prefs.sortBy} onChange={(e) => updatePrefs({ sortBy: e.target.value })}>
                    <option value="qtyDesc">Más vendidos</option>
                    <option value="qtyAsc">Menos vendidos</option>
                    <option value="name">Nombre</option>
                    <option value="code">Código</option>
                  </Input>
                </Col>
              </Row>
              {(report?.colors || []).length > 0 && viewMode !== "byKiosk" && (
                <div className="mt-3">
                  <Label>Colores visibles</Label>
                  <div className="kiosk-color-picker-grid">
                    {(report.colors || []).map((color) => (
                      <label key={colorKey(color.id)}>
                        <Input
                          type="checkbox"
                          checked={visibleColorIds[colorKey(color.id)] !== false}
                          onChange={(e) =>
                            setVisibleColorIds((prev) => ({ ...prev, [colorKey(color.id)]: e.target.checked }))
                          }
                        />
                        {color.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <Button color="success" size="sm" onClick={handleExport} disabled={!filteredProducts.length}>
                  <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
                </Button>
              </div>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardBody>
              {loading && !report ? (
                <p className="text-center text-muted mb-0"><Spinner size="sm" /> Generando reporte…</p>
              ) : !filteredProducts.length ? (
                <p className="text-center text-muted mb-0">No hay productos con los filtros actuales.</p>
              ) : viewMode === "detail" ? (
                <DetailTable
                  products={filteredProducts}
                  colors={activeColors}
                  prefs={prefs}
                  totalQty={visibleTotals.quantity}
                  maxQty={maxQty}
                />
              ) : viewMode === "byKiosk" ? (
                <KioskMatrixTable
                  products={filteredProducts}
                  kiosks={report?.kiosks || []}
                  prefs={prefs}
                  renderMetricStack={renderMetricStack}
                />
              ) : (
                <ColorMatrixTable
                  products={filteredProducts}
                  colors={activeColors}
                  prefs={prefs}
                  renderMetricStack={renderMetricStack}
                />
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function ProductIdentityCells({ product, prefs }) {
  const stickyName = Boolean(prefs.showName);
  const stickyCode = !stickyName && Boolean(prefs.showCode);
  return (
    <>
      {prefs.showCode && <td className={stickyCode ? "sticky-col" : undefined}>{product.productCode || "—"}</td>}
      {prefs.showName && <td className={stickyName ? "sticky-col" : undefined}>{product.productName || "—"}</td>}
      {prefs.showCategory && <td>{product.categoryName || "—"}</td>}
      {prefs.showAudience && <td>{product.audienceCategory || "—"}</td>}
    </>
  );
}

function ColorMatrixTable({ products, colors, prefs, renderMetricStack }) {
  return (
    <div className="matrix-wrap">
      <table className="table table-sm matrix-table">
        <thead>
          <tr>
            {prefs.showCode && <th className={!prefs.showName ? "sticky-col" : ""}>Código</th>}
            {prefs.showName && <th className="sticky-col">Producto</th>}
            {prefs.showCategory && <th>Categoría</th>}
            {prefs.showAudience && <th>Público</th>}
            {colors.map((color) => (
              <th key={colorKey(color.id)} className="text-center">{color.name}</th>
            ))}
            <th className="text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.productId} className={Number(product.totalQuantity || 0) <= 0 ? "row-no-sales" : ""}>
              <ProductIdentityCells product={product} prefs={prefs} />
              {colors.map((color) => (
                <td key={colorKey(color.id)} className="text-center">
                  {renderMetricStack(cellByColor(product, color.id))}
                </td>
              ))}
              <td className="text-center font-weight-bold">
                {renderMetricStack({
                  quantity: product.totalQuantity,
                  amount: product.totalAmount,
                  currentStock: product.currentStock,
                  tickets: product.totalTickets,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function KioskMatrixTable({ products, kiosks, prefs, renderMetricStack }) {
  return (
    <div className="matrix-wrap">
      <table className="table table-sm matrix-table">
        <thead>
          <tr>
            {prefs.showCode && <th className={!prefs.showName ? "sticky-col" : ""}>Código</th>}
            {prefs.showName && <th className="sticky-col">Producto</th>}
            {prefs.showCategory && <th>Categoría</th>}
            {prefs.showAudience && <th>Público</th>}
            {kiosks.map((kiosk) => (
              <th key={kiosk.id} className="text-center">{kiosk.code || kiosk.name}</th>
            ))}
            <th className="text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.productId} className={Number(product.totalQuantity || 0) <= 0 ? "row-no-sales" : ""}>
              <ProductIdentityCells product={product} prefs={prefs} />
              {kiosks.map((kiosk) => (
                <td key={kiosk.id} className="text-center">
                  {renderMetricStack(kioskCellOf(product, kiosk.id))}
                </td>
              ))}
              <td className="text-center font-weight-bold">
                {renderMetricStack({
                  quantity: product.totalQuantity,
                  amount: product.totalAmount,
                  currentStock: product.currentStock,
                  tickets: product.totalTickets,
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailTable({ products, colors, prefs, totalQty, maxQty }) {
  const rows = [];
  products.forEach((product) => {
    colors.forEach((color) => {
      const cell = cellByColor(product, color.id);
      if (!cell) return;
      if (!prefs.includeZeroSales && qtyOf(cell) <= 0) return;
      rows.push({ product, color, cell });
    });
  });
  return (
    <div className="matrix-wrap">
      <table className="table table-sm matrix-table">
        <thead>
          <tr>
            {prefs.showCode && <th>Código</th>}
            {prefs.showName && <th>Producto</th>}
            {prefs.showCategory && <th>Categoría</th>}
            {prefs.showAudience && <th>Público</th>}
            <th>Color</th>
            {prefs.metricQty && <th className="text-right">Cantidad</th>}
            {prefs.metricAmount && <th className="text-right">Monto</th>}
            {prefs.metricStock && <th className="text-right">Stock</th>}
            {prefs.metricTickets && <th className="text-right">Facturas</th>}
            {prefs.metricShare && <th className="text-right">% total</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ product, color, cell }) => {
            const qty = qtyOf(cell);
            return (
              <tr key={`${product.productId}-${colorKey(color.id)}`} className={qty <= 0 ? "row-no-sales" : ""}>
                {prefs.showCode && <td>{product.productCode || "—"}</td>}
                {prefs.showName && <td>{product.productName || "—"}</td>}
                {prefs.showCategory && <td>{product.categoryName || "—"}</td>}
                {prefs.showAudience && <td>{product.audienceCategory || "—"}</td>}
                <td>{color.name}</td>
                {prefs.metricQty && (
                  <td className="text-right" style={{ background: heatBackground(qty, maxQty) }}>{formatQty(qty)}</td>
                )}
                {prefs.metricAmount && <td className="text-right">{formatCurrency(amountOf(cell))}</td>}
                {prefs.metricStock && <td className="text-right">{formatQty(stockOf(cell))}</td>}
                {prefs.metricTickets && <td className="text-right">{ticketsOf(cell)}</td>}
                {prefs.metricShare && <td className="text-right">{formatShare(qty, totalQty)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildExportColumns({ prefs, colors, kiosks, totalQty }) {
  const columns = [];
  if (prefs.showCode) columns.push({ label: "Código", width: 14, excelValue: (row) => row.productCode || "" });
  if (prefs.showName) columns.push({ label: "Producto", width: 28, excelValue: (row) => row.productName || "" });
  if (prefs.showCategory) columns.push({ label: "Categoría", width: 16, excelValue: (row) => row.categoryName || "" });
  if (prefs.showAudience) columns.push({ label: "Público", width: 12, excelValue: (row) => row.audienceCategory || "" });
  if (prefs.viewMode === "detail") {
    columns.push({ label: "Color", width: 16, excelValue: (row) => row.colorName || "" });
    if (prefs.metricQty) columns.push({ label: "Cantidad", width: 12, numeric: true, excelValue: (row) => Number(row.quantity || 0) });
    if (prefs.metricAmount) columns.push({ label: "Monto", width: 12, numeric: true, excelValue: (row) => Number(row.amount || 0) });
    if (prefs.metricStock) columns.push({ label: "Stock", width: 10, numeric: true, excelValue: (row) => Number(row.stock || 0) });
    if (prefs.metricTickets) columns.push({ label: "Facturas", width: 10, numeric: true, excelValue: (row) => Number(row.tickets || 0) });
    if (prefs.metricShare) columns.push({ label: "% total", width: 10, excelValue: (row) => formatShare(row.quantity, totalQty) });
    return columns;
  }
  const groups = prefs.viewMode === "byKiosk" ? kiosks.map((k) => ({ key: String(k.id), label: k.code || k.name })) : colors.map((c) => ({ key: colorKey(c.id), label: c.name }));
  groups.forEach((group) => {
    if (prefs.metricQty) columns.push({ label: `${group.label} cant.`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.quantity || 0) });
    if (prefs.metricAmount) columns.push({ label: `${group.label} Q`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.amount || 0) });
    if (prefs.metricStock) columns.push({ label: `${group.label} stock`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.stock || 0) });
  });
  if (prefs.metricQty) columns.push({ label: "Total cant.", width: 12, numeric: true, excelValue: (row) => Number(row.quantity || 0) });
  if (prefs.metricAmount) columns.push({ label: "Total Q", width: 12, numeric: true, excelValue: (row) => Number(row.amount || 0) });
  return columns;
}

function buildExportRows({ prefs, products, colors, kiosks }) {
  if (prefs.viewMode === "detail") {
    const rows = [];
    products.forEach((product) => {
      colors.forEach((color) => {
        const cell = cellByColor(product, color.id);
        if (!cell) return;
        if (!prefs.includeZeroSales && qtyOf(cell) <= 0) return;
        rows.push({
          productCode: product.productCode,
          productName: product.productName,
          categoryName: product.categoryName,
          audienceCategory: product.audienceCategory,
          colorName: color.name,
          quantity: qtyOf(cell),
          amount: amountOf(cell),
          stock: stockOf(cell),
          tickets: ticketsOf(cell),
        });
      });
    });
    return rows;
  }
  return products.map((product) => {
    const cells = {};
    if (prefs.viewMode === "byKiosk") {
      kiosks.forEach((kiosk) => {
        const cell = kioskCellOf(product, kiosk.id);
        cells[String(kiosk.id)] = {
          quantity: qtyOf(cell),
          amount: amountOf(cell),
          stock: stockOf(cell),
        };
      });
    } else {
      colors.forEach((color) => {
        const cell = cellByColor(product, color.id);
        cells[colorKey(color.id)] = {
          quantity: qtyOf(cell),
          amount: amountOf(cell),
          stock: stockOf(cell),
        };
      });
    }
    return {
      productCode: product.productCode,
      productName: product.productName,
      categoryName: product.categoryName,
      audienceCategory: product.audienceCategory,
      quantity: Number(product.totalQuantity || 0),
      amount: Number(product.totalAmount || 0),
      cells,
    };
  });
}

export default KioskPerformance;
