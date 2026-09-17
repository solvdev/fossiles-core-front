import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
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
  metricEntries: true,
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

const normalizeColorName = (name) =>
  String(name || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const colorMatchKey = (item) => {
  const id = item?.id ?? item?.colorId;
  if (id != null && id !== "" && String(id) !== "none") return `id:${id}`;
  const name = normalizeColorName(item?.name || item?.colorName || item?.label);
  if (name && name !== "SIN COLOR") return `name:${name}`;
  return "none";
};

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
const entriesOf = (cell) => Number(cell?.quantityIn || 0);
const ticketsOf = (cell) => Number(cell?.tickets || 0);
const cellHasActivity = (cell) => qtyOf(cell) > 0 || stockOf(cell) > 0 || entriesOf(cell) > 0;

const cellByColor = (product, color) => {
  const cells = product?.colors || [];
  const id = color?.id ?? color?.colorId;
  if (id != null && id !== "" && String(id) !== "none") {
    const byId = cells.find((cell) => cell.colorId != null && String(cell.colorId) === String(id));
    if (byId) return byId;
  }
  const wanted = colorMatchKey(color);
  return cells.find((cell) => colorMatchKey(cell) === wanted) || null;
};

const kioskCellOf = (product, kioskId) =>
  (product?.kiosks || []).find((cell) => String(cell.kioskLocationId) === String(kioskId)) || null;

const metricsForColors = (product, colors) => {
  if (!colors || !colors.length) {
    return {
      quantity: Number(product?.totalQuantity || 0),
      amount: Number(product?.totalAmount || 0),
      currentStock: Number(product?.currentStock || 0),
      quantityIn: Number(product?.totalQuantityIn || 0),
      tickets: Number(product?.totalTickets || 0),
    };
  }
  return colors.reduce(
    (acc, color) => {
      const cell = cellByColor(product, color);
      acc.quantity += qtyOf(cell);
      acc.amount += amountOf(cell);
      acc.currentStock += stockOf(cell);
      acc.quantityIn += entriesOf(cell);
      acc.tickets += ticketsOf(cell);
      return acc;
    },
    { quantity: 0, amount: 0, currentStock: 0, quantityIn: 0, tickets: 0 }
  );
};

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
  const [selectedColors, setSelectedColors] = useState([]);

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
    const valid = new Set((report?.colors || []).map((color) => colorMatchKey(color)));
    setSelectedColors((prev) => prev.filter((opt) => valid.has(opt.value)));
  }, [report]);

  const colorOptions = useMemo(
    () =>
      (report?.colors || []).map((color) => ({
        value: colorMatchKey(color),
        label: color.name,
        id: color.id,
        name: color.name,
      })),
    [report]
  );

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
    if (selectedColors.length) {
      const keys = new Set(selectedColors.map((opt) => opt.value));
      rows = rows.filter((product) =>
        (product.colors || []).some((cell) => keys.has(colorMatchKey(cell)) && cellHasActivity(cell))
      );
    } else if (!prefs.includeZeroSales) {
      rows = rows.filter((product) =>
        Number(product.totalQuantity || 0) > 0
        || Number(product.currentStock || 0) > 0
        || Number(product.totalQuantityIn || 0) > 0
      );
    }
    const qtyForSort = (product) => {
      if (!selectedColors.length) return Number(product.totalQuantity || 0);
      const keys = new Set(selectedColors.map((opt) => opt.value));
      return (product.colors || []).reduce((sum, cell) => (
        keys.has(colorMatchKey(cell)) ? sum + qtyOf(cell) : sum
      ), 0);
    };
    const sorted = [...rows];
    if (prefs.sortBy === "qtyAsc") {
      sorted.sort((a, b) => qtyForSort(a) - qtyForSort(b));
    } else if (prefs.sortBy === "name") {
      sorted.sort((a, b) => String(a.productName || "").localeCompare(String(b.productName || ""), "es"));
    } else if (prefs.sortBy === "code") {
      sorted.sort((a, b) => String(a.productCode || "").localeCompare(String(b.productCode || ""), "es"));
    } else {
      sorted.sort((a, b) => qtyForSort(b) - qtyForSort(a));
    }
    return sorted;
  }, [audienceFilter, categoryFilter, prefs.hidePackaging, prefs.includeZeroSales, prefs.sortBy, report, search, selectedColors]);

  const activeColors = useMemo(() => {
    const selectedKeys = new Set((selectedColors || []).map((opt) => opt.value));
    let colors = report?.colors || [];
    if (selectedKeys.size) {
      colors = colors.filter((color) => selectedKeys.has(colorMatchKey(color)));
    }
    if (!prefs.hideEmptyColors) return colors;
    return colors.filter((color) =>
      filteredProducts.some((product) => cellHasActivity(cellByColor(product, color)))
    );
  }, [filteredProducts, prefs.hideEmptyColors, report, selectedColors]);

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
        const metrics = metricsForColors(product, activeColors);
        acc.quantity += metrics.quantity;
        acc.amount += metrics.amount;
        acc.stock += metrics.currentStock;
        acc.entries += metrics.quantityIn;
        if (metrics.quantity > 0) acc.withSales += 1;
        else acc.withoutSales += 1;
        return acc;
      },
      { quantity: 0, amount: 0, stock: 0, entries: 0, withSales: 0, withoutSales: 0 }
    );
  }, [activeColors, filteredProducts]);

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
      hideZeroColorRows: selectedColors.length > 0,
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
    const entries = entriesOf(cell);
    const stock = stockOf(cell);
    const zero = !cellHasActivity(cell);
    const showQty = prefs.metricQty || (!prefs.metricAmount && !prefs.metricStock && !prefs.metricTickets && !prefs.metricShare && !prefs.metricEntries);
    return (
      <div className={zero ? "cell-zero" : "cell-sold"} style={{ background: heatBackground(qty, maxQty), padding: "2px 4px", borderRadius: 4 }}>
        {showQty && <div>Ventas {formatQty(qty)}</div>}
        {prefs.metricEntries && <div className="text-muted">Entradas {formatQty(entries)}</div>}
        {prefs.metricAmount && <div>{formatCurrency(amountOf(cell))}</div>}
        {prefs.metricStock && <div className="text-muted">Stock {formatQty(stock)}</div>}
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
              <CardTitle tag="h4">Ventas, entradas y stock de kiosko por producto y color</CardTitle>
              <p className="text-muted mb-0">
                Elige kiosko o todos, el periodo y qué columnas quieres ver. Aparecen ventas,
                entradas del periodo (recepción y traslados in) y stock actual, aunque no se haya vendido.
                Las ventas anuladas no se cuentan.
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
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Ventas</span>
            <span className="stat-value">{formatQty(visibleTotals.quantity)}</span>
          </div>
        </Col>
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Entradas</span>
            <span className="stat-value">{formatQty(visibleTotals.entries)}</span>
          </div>
        </Col>
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Stock actual</span>
            <span className="stat-value">{formatQty(visibleTotals.stock)}</span>
          </div>
        </Col>
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Monto</span>
            <span className="stat-value">{formatCurrency(visibleTotals.amount)}</span>
          </div>
        </Col>
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Con venta</span>
            <span className="stat-value">{visibleTotals.withSales}</span>
          </div>
        </Col>
        <Col md="2">
          <div className="stat-chip">
            <span className="stat-label">Sin venta</span>
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
                <Col md="6">
                  <span className="pref-label">Colores</span>
                  <Select
                    className="react-select color-select"
                    classNamePrefix="react-select"
                    placeholder="Todos los colores. Escribe para elegir uno o varios…"
                    isMulti
                    isClearable
                    isSearchable
                    options={colorOptions}
                    value={selectedColors}
                    onChange={(selected) => setSelectedColors(selected || [])}
                    noOptionsMessage={() => "No hay colores"}
                    menuPortalTarget={typeof document !== "undefined" ? document.body : null}
                    styles={{ menuPortal: (base) => ({ ...base, zIndex: 9999 }) }}
                  />
                  <p className="text-muted small mt-1 mb-2">
                    Vacío = todos. Si eliges un color, se quedan productos con ventas, entradas o stock de ese color.
                  </p>
                </Col>
                <Col md="3">
                  <span className="pref-label">Buscar producto</span>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o nombre" />
                </Col>
                <Col md="3">
                  <span className="pref-label">Vista</span>
                  <Input type="select" value={viewMode} onChange={(e) => updatePrefs({ viewMode: e.target.value })}>
                    <option value="matrix">Matriz producto × color</option>
                    <option value="detail">Detalle (una fila por color)</option>
                    {manyKiosks && <option value="byKiosk">Matriz producto × kiosko</option>}
                  </Input>
                </Col>
              </Row>
              <Row className="mt-2">
                <Col md="3">
                  <span className="pref-label">Público</span>
                  <Input type="select" value={audienceFilter} onChange={(e) => setAudienceFilter(e.target.value)}>
                    <option value="">Todos</option>
                    <option value="DAMA">Dama</option>
                    <option value="CABALLERO">Caballero</option>
                    <option value="UNISEX">Unisex</option>
                  </Input>
                </Col>
                <Col md="3">
                  <span className="pref-label">Categoría</span>
                  <Input type="select" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                    <option value="">Todas</option>
                    {categoryOptions.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </Input>
                </Col>
                <Col md="3">
                  <span className="pref-label">Orden</span>
                  <Input type="select" value={prefs.sortBy} onChange={(e) => updatePrefs({ sortBy: e.target.value })}>
                    <option value="qtyDesc">Más vendidos</option>
                    <option value="qtyAsc">Menos vendidos</option>
                    <option value="name">Nombre</option>
                    <option value="code">Código</option>
                  </Input>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="success" className="btn-block" onClick={handleExport} disabled={!filteredProducts.length}>
                    <i className="nc-icon nc-cloud-download-93" /> Exportar Excel
                  </Button>
                </Col>
              </Row>
              <div className="mt-3">
                <span className="pref-label">Columnas</span>
                <div className="pref-chip-row">
                  <PrefChip active={prefs.showCode} onClick={() => updatePrefs({ showCode: !prefs.showCode })}>Código</PrefChip>
                  <PrefChip active={prefs.showName} onClick={() => updatePrefs({ showName: !prefs.showName })}>Producto</PrefChip>
                  <PrefChip active={prefs.showCategory} onClick={() => updatePrefs({ showCategory: !prefs.showCategory })}>Categoría</PrefChip>
                  <PrefChip active={prefs.showAudience} onClick={() => updatePrefs({ showAudience: !prefs.showAudience })}>Público</PrefChip>
                </div>
                <span className="pref-label">Métricas</span>
                <div className="pref-chip-row">
                  <PrefChip active={prefs.metricQty} onClick={() => updatePrefs({ metricQty: !prefs.metricQty })}>Ventas</PrefChip>
                  <PrefChip active={prefs.metricEntries} onClick={() => updatePrefs({ metricEntries: !prefs.metricEntries })}>Entradas</PrefChip>
                  <PrefChip active={prefs.metricAmount} onClick={() => updatePrefs({ metricAmount: !prefs.metricAmount })}>Monto</PrefChip>
                  <PrefChip active={prefs.metricStock} onClick={() => updatePrefs({ metricStock: !prefs.metricStock })}>Stock</PrefChip>
                  <PrefChip active={prefs.metricTickets} onClick={() => updatePrefs({ metricTickets: !prefs.metricTickets })}>Facturas</PrefChip>
                  <PrefChip active={prefs.metricShare} onClick={() => updatePrefs({ metricShare: !prefs.metricShare })}>% del total</PrefChip>
                </div>
                <span className="pref-label">Filas</span>
                <div className="pref-chip-row">
                  <PrefChip active={prefs.includeZeroSales} onClick={() => updatePrefs({ includeZeroSales: !prefs.includeZeroSales })}>Incluir sin ventas</PrefChip>
                  <PrefChip active={prefs.hideEmptyColors} onClick={() => updatePrefs({ hideEmptyColors: !prefs.hideEmptyColors })}>Solo colores con movimiento</PrefChip>
                  <PrefChip active={prefs.hidePackaging} onClick={() => updatePrefs({ hidePackaging: !prefs.hidePackaging })}>Ocultar empaques</PrefChip>
                </div>
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
                  hideZeroColorRows={selectedColors.length > 0}
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

function PrefChip({ active, onClick, children }) {
  return (
    <button type="button" className={`pref-chip${active ? " is-on" : ""}`} onClick={onClick}>
      {children}
    </button>
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
              <th key={colorMatchKey(color)} className="text-center">{color.name}</th>
            ))}
            <th className="text-center">Total</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const totals = metricsForColors(product, colors);
            return (
            <tr key={product.productId} className={!cellHasActivity(totals) ? "row-no-sales" : ""}>
              <ProductIdentityCells product={product} prefs={prefs} />
              {colors.map((color) => (
                <td key={colorMatchKey(color)} className="text-center">
                  {renderMetricStack(cellByColor(product, color))}
                </td>
              ))}
              <td className="text-center font-weight-bold">
                {renderMetricStack(totals)}
              </td>
            </tr>
            );
          })}
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
                  quantityIn: product.totalQuantityIn,
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

function DetailTable({ products, colors, prefs, totalQty, maxQty, hideZeroColorRows }) {
  const rows = [];
  products.forEach((product) => {
    colors.forEach((color) => {
      const cell = cellByColor(product, color);
      if (!cell) return;
      if (!cellHasActivity(cell) && (hideZeroColorRows || !prefs.includeZeroSales)) return;
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
            {prefs.metricQty && <th className="text-right">Ventas</th>}
            {prefs.metricEntries && <th className="text-right">Entradas</th>}
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
              <tr key={`${product.productId}-${colorMatchKey(color)}`} className={qty <= 0 ? "row-no-sales" : ""}>
                {prefs.showCode && <td>{product.productCode || "—"}</td>}
                {prefs.showName && <td>{product.productName || "—"}</td>}
                {prefs.showCategory && <td>{product.categoryName || "—"}</td>}
                {prefs.showAudience && <td>{product.audienceCategory || "—"}</td>}
                <td>{color.name}</td>
                {prefs.metricQty && (
                  <td className="text-right" style={{ background: heatBackground(qty, maxQty) }}>{formatQty(qty)}</td>
                )}
                {prefs.metricEntries && <td className="text-right">{formatQty(entriesOf(cell))}</td>}
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
    if (prefs.metricQty) columns.push({ label: "Ventas", width: 12, numeric: true, excelValue: (row) => Number(row.quantity || 0) });
    if (prefs.metricEntries) columns.push({ label: "Entradas", width: 12, numeric: true, excelValue: (row) => Number(row.quantityIn || 0) });
    if (prefs.metricAmount) columns.push({ label: "Monto", width: 12, numeric: true, excelValue: (row) => Number(row.amount || 0) });
    if (prefs.metricStock) columns.push({ label: "Stock", width: 10, numeric: true, excelValue: (row) => Number(row.stock || 0) });
    if (prefs.metricTickets) columns.push({ label: "Facturas", width: 10, numeric: true, excelValue: (row) => Number(row.tickets || 0) });
    if (prefs.metricShare) columns.push({ label: "% total", width: 10, excelValue: (row) => formatShare(row.quantity, totalQty) });
    return columns;
  }
  const groups = prefs.viewMode === "byKiosk" ? kiosks.map((k) => ({ key: String(k.id), label: k.code || k.name })) : colors.map((c) => ({ key: colorMatchKey(c), label: c.name }));
  groups.forEach((group) => {
    if (prefs.metricQty) columns.push({ label: `${group.label} ventas`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.quantity || 0) });
    if (prefs.metricEntries) columns.push({ label: `${group.label} entradas`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.quantityIn || 0) });
    if (prefs.metricAmount) columns.push({ label: `${group.label} Q`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.amount || 0) });
    if (prefs.metricStock) columns.push({ label: `${group.label} stock`, width: 12, numeric: true, excelValue: (row) => Number(row.cells?.[group.key]?.stock || 0) });
  });
  if (prefs.metricQty) columns.push({ label: "Total ventas", width: 12, numeric: true, excelValue: (row) => Number(row.quantity || 0) });
  if (prefs.metricEntries) columns.push({ label: "Total entradas", width: 12, numeric: true, excelValue: (row) => Number(row.quantityIn || 0) });
  if (prefs.metricAmount) columns.push({ label: "Total Q", width: 12, numeric: true, excelValue: (row) => Number(row.amount || 0) });
  if (prefs.metricStock) columns.push({ label: "Total stock", width: 12, numeric: true, excelValue: (row) => Number(row.stock || 0) });
  return columns;
}

function buildExportRows({ prefs, products, colors, kiosks, hideZeroColorRows }) {
  if (prefs.viewMode === "detail") {
    const rows = [];
    products.forEach((product) => {
      colors.forEach((color) => {
        const cell = cellByColor(product, color);
        if (!cell) return;
        if (!cellHasActivity(cell) && (hideZeroColorRows || !prefs.includeZeroSales)) return;
        rows.push({
          productCode: product.productCode,
          productName: product.productName,
          categoryName: product.categoryName,
          audienceCategory: product.audienceCategory,
          colorName: color.name,
          quantity: qtyOf(cell),
          quantityIn: entriesOf(cell),
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
          quantityIn: entriesOf(cell),
          amount: amountOf(cell),
          stock: stockOf(cell),
        };
      });
    } else {
      colors.forEach((color) => {
        const cell = cellByColor(product, color);
        cells[colorMatchKey(color)] = {
          quantity: qtyOf(cell),
          quantityIn: entriesOf(cell),
          amount: amountOf(cell),
          stock: stockOf(cell),
        };
      });
    }
    const totals = prefs.viewMode === "byKiosk"
      ? {
          quantity: Number(product.totalQuantity || 0),
          quantityIn: Number(product.totalQuantityIn || 0),
          amount: Number(product.totalAmount || 0),
          stock: Number(product.currentStock || 0),
        }
      : metricsForColors(product, colors);
    return {
      productCode: product.productCode,
      productName: product.productName,
      categoryName: product.categoryName,
      audienceCategory: product.audienceCategory,
      quantity: totals.quantity,
      quantityIn: totals.quantityIn,
      amount: totals.amount,
      stock: totals.currentStock ?? totals.stock,
      cells,
    };
  });
}

export default KioskPerformance;
