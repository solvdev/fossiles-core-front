import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
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
import Select from "react-select";
import { getKioskSalesByCategory } from "services/kioskSalesByCategoryService";
import { getLocations } from "services/locationService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError } from "utils/notificationHelper";
import { formatCurrency } from "views/kiosks/pos/posUtils";
import * as XLSX from "xlsx";
import "./reportsDesign.css";

const FILTER_MONTH = "month";
const FILTER_RANGE = "range";
const UNCATEGORIZED = "Sin categoría";

const selectStyles = {
  control: (base, state) => ({
    ...base,
    minHeight: 38,
    borderRadius: 8,
    borderColor: state.isFocused ? "#0b6e71" : "#d9e1e8",
    boxShadow: "none",
    "&:hover": { borderColor: "#0b6e71" },
  }),
  menu: (base) => ({ ...base, zIndex: 5 }),
};

/** Días del mes (mes 1..12) con aritmética de calendario, sin Date local ni toISOString. */
export const daysInCalendarMonth = (year, month) => {
  const y = Number(year);
  const m = Number(month);
  if (m === 2) {
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return leap ? 29 : 28;
  }
  return [31, 0, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1] || 0;
};

/** YYYY-MM → { from, to } inclusive del mes, solo con partes del string. */
export const monthToInclusiveRange = (yearMonth) => {
  const text = String(yearMonth || "").trim();
  const year = text.slice(0, 4);
  const month = text.slice(5, 7);
  const last = daysInCalendarMonth(year, month);
  if (!last || year.length !== 4 || month.length !== 2) return { from: "", to: "" };
  const dd = String(last).padStart(2, "0");
  return { from: `${year}-${month}-01`, to: `${year}-${month}-${dd}` };
};

export const categoryLabel = (row) => {
  const name = row?.categoryName;
  if (name != null && String(name).trim() !== "") return String(name);
  return UNCATEGORIZED;
};

/** NUMERIC(12,3): hasta 3 decimales, sin ceros a la derecha; conserva negativos. */
export const formatUnits = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(3)));
};

const isKioskLocation = (location) => {
  const text = `${location?.categoria || ""} ${location?.name || ""} ${location?.code || ""}`.toUpperCase();
  return text.includes("KIOS") || String(location?.code || "").toUpperCase().startsWith("K");
};

const currentMonthValue = () => getTodayYmdGuatemala().slice(0, 7);

function KioskSalesByCategoryReport() {
  const defaultMonth = currentMonthValue();
  const defaultRange = monthToInclusiveRange(defaultMonth);
  const [filterMode, setFilterMode] = useState(FILTER_MONTH);
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [kiosks, setKiosks] = useState([]);
  const [selectedKiosks, setSelectedKiosks] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Misma fuente que rotación / existencias: GET /locations, filtrado a kioscos (no hay endpoint dedicado).
        const locations = await getLocations();
        if (cancelled) return;
        setKiosks(
          (locations || [])
            .filter((location) => isKioskLocation(location) && !location.posTestMode)
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "es"))
        );
      } catch (err) {
        if (!cancelled) showError(err.message || "No se pudieron cargar los kioscos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const kioskOptions = useMemo(
    () => kiosks.map((k) => ({ value: k.id, label: k.code ? `${k.name} (${k.code})` : k.name })),
    [kiosks]
  );

  const resolveRange = () =>
    filterMode === FILTER_MONTH ? monthToInclusiveRange(monthValue) : { from: fromDate, to: toDate };

  const loadReport = async () => {
    const { from, to } = resolveRange();
    setLoading(true);
    setError("");
    try {
      const params = { from, to };
      if (selectedKiosks.length) {
        params.kioskIds = selectedKiosks.map((opt) => opt.value).join(",");
      }
      const data = await getKioskSalesByCategory(params);
      setReport(data);
    } catch (err) {
      setReport(null);
      const msg = err.message || "No se pudo generar el reporte de ventas de kioscos";
      setError(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    if (!report) return;
    const rows = [
      ["Categoría", "Unidades", "Total (con IVA) Q", "Total sin IVA Q"],
      ...(report.rows || []).map((row) => [
        categoryLabel(row),
        formatUnits(row.units),
        row.totalAmount,
        row.totalAmountNoIva,
      ]),
      [
        "Total general",
        formatUnits(report.totals?.units),
        report.totals?.totalAmount,
        report.totals?.totalAmountNoIva,
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ventas de kioscos");
    const { from, to } = report.from && report.to ? { from: report.from, to: report.to } : resolveRange();
    XLSX.writeFile(wb, `ventas_kioscos_${from || "desde"}_${to || "hasta"}.xlsx`);
  };

  const rows = report?.rows || [];
  const totals = report?.totals;

  return (
    <div className="content rpt-page">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex flex-wrap justify-content-between align-items-start" style={{ gap: 12 }}>
                <div>
                  <CardTitle tag="h4">Ventas de kioscos</CardTitle>
                  <p className="rpt-subtitle">
                    Ventas netas por categoría (pueden ser negativas). El total general es el que envía el servidor,
                    no una suma de la tabla.
                  </p>
                </div>
                <div className="rpt-controls">
                  <Button color="success" size="sm" onClick={exportExcel} disabled={loading || !report}>
                    <i className="nc-icon nc-cloud-download-93 mr-1" />
                    Excel
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div className="rpt-toolbar">
                <div>
                  <span className="rpt-label d-block">Periodo</span>
                  <div className="rpt-segment" role="group" aria-label="Tipo de filtro">
                    <button
                      type="button"
                      className={filterMode === FILTER_MONTH ? "is-active" : ""}
                      aria-pressed={filterMode === FILTER_MONTH}
                      onClick={() => setFilterMode(FILTER_MONTH)}
                    >
                      Mes
                    </button>
                    <button
                      type="button"
                      className={filterMode === FILTER_RANGE ? "is-active" : ""}
                      aria-pressed={filterMode === FILTER_RANGE}
                      onClick={() => {
                        const range = monthToInclusiveRange(monthValue);
                        if (range.from && range.to) {
                          setFromDate(range.from);
                          setToDate(range.to);
                        }
                        setFilterMode(FILTER_RANGE);
                      }}
                    >
                      Rango de fechas
                    </button>
                  </div>
                </div>
                {filterMode === FILTER_MONTH ? (
                  <div>
                    <Label for="kiosk-sales-month" className="rpt-label d-block">
                      Mes
                    </Label>
                    <Input
                      id="kiosk-sales-month"
                      type="month"
                      value={monthValue}
                      onChange={(e) => setMonthValue(e.target.value)}
                      style={{ minWidth: 180 }}
                    />
                  </div>
                ) : (
                  <>
                    <div>
                      <Label for="kiosk-sales-from" className="rpt-label d-block">
                        Desde
                      </Label>
                      <Input
                        id="kiosk-sales-from"
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label for="kiosk-sales-to" className="rpt-label d-block">
                        Hasta
                      </Label>
                      <Input
                        id="kiosk-sales-to"
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                      />
                    </div>
                  </>
                )}
                <div style={{ minWidth: 260, flex: "1 1 260px", maxWidth: 480 }}>
                  <Label for="kiosk-sales-kiosks" className="rpt-label d-block">
                    Kioscos
                  </Label>
                  <Select
                    inputId="kiosk-sales-kiosks"
                    isMulti
                    isClearable
                    placeholder="Todos los kioscos"
                    noOptionsMessage={() => "Sin kioscos"}
                    options={kioskOptions}
                    value={selectedKiosks}
                    onChange={(value) => setSelectedKiosks(value || [])}
                    styles={selectStyles}
                  />
                </div>
                <div className="d-flex align-items-end">
                  <Button color="primary" onClick={loadReport} disabled={loading}>
                    {loading ? (
                      <>
                        <Spinner size="sm" className="mr-1" /> Generar
                      </>
                    ) : (
                      "Generar"
                    )}
                  </Button>
                </div>
              </div>

              {error && <Alert color="danger">{error}</Alert>}

              {!report && !error && !loading && (
                <p className="text-muted mb-0">Elige el periodo y pulsa Generar.</p>
              )}

              {loading && !report && (
                <div className="rpt-empty">
                  <Spinner /> <div className="mt-2">Generando reporte…</div>
                </div>
              )}

              {report && (
                <div className="rpt-table-wrap" style={loading ? { opacity: 0.55 } : undefined}>
                  <Table className="rpt-table" hover={false} responsive>
                    <thead>
                      <tr>
                        <th>Categoría</th>
                        <th className="rpt-num">Unidades</th>
                        <th className="rpt-num">Total (con IVA) Q</th>
                        <th className="rpt-num">Total sin IVA Q</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!rows.length ? (
                        <tr>
                          <td colSpan="4" className="text-center text-muted">
                            No hay datos para mostrar
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, index) => (
                          <tr key={row.categoryId != null ? row.categoryId : `uncat-${index}`}>
                            <td className="rpt-name">{categoryLabel(row)}</td>
                            <td className="rpt-num">{formatUnits(row.units)}</td>
                            <td className="rpt-num">{formatCurrency(row.totalAmount)}</td>
                            <td className="rpt-num">{formatCurrency(row.totalAmountNoIva)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {totals && (
                      <tfoot>
                        <tr>
                          <td>Total general</td>
                          <td className="rpt-num">{formatUnits(totals.units)}</td>
                          <td className="rpt-num">{formatCurrency(totals.totalAmount)}</td>
                          <td className="rpt-num">{formatCurrency(totals.totalAmountNoIva)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </Table>
                </div>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default KioskSalesByCategoryReport;
