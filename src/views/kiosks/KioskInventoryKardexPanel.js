import React, { useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Col,
  FormGroup,
  Input,
  Label,
  Row,
  Spinner,
  Table,
} from "reactstrap";
import { getKioscoKardex, getKioscoKardexMovimientos } from "services/kioscoInventoryService";
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { isPackagingProductCode } from "utils/kioskPackagingHelper";
import {
  PRODUCT_AUDIENCE_OPTIONS,
  getProductAudienceLabel,
  productMatchesAudienceFilter,
} from "utils/productAudienceHelper";
import {
  CINCHO_FILTER_OPTIONS,
  getCinchoTypeLabel,
  productMatchesCinchoFilter,
} from "utils/productCinchoHelper";
import { showError } from "utils/notificationHelper";
import {
  formatKioscoMovementDetail,
  formatKioscoMovementReference,
  formatKioscoMovementRoute,
  getKioscoMovementSignedQuantity,
  getKioscoMovementTypeLabel,
  isKioscoTransferMovement,
} from "utils/kioskMovementHelper";
import { FilterableSelect } from "components/distribution/FilterableSelect";
import { validateKardexRangeForm } from "./kioskInventoryFormHelper";
import "./KioskInventoryKardexPanel.css";

const KARDEX_COLUMNS = [
  { key: "inventarioInicial", label: "Ini." },
  { key: "comprasAjustes", label: "Comp." },
  { key: "anulacionCompras", label: "A.C." },
  { key: "entradas", label: "Ent." },
  { key: "ventas", label: "Vtas." },
  { key: "anulacionVenta", label: "A.V." },
  { key: "salida", label: "Sal." },
  { key: "inventarioFinal", label: "Fin." },
];

const fmtPeriodDate = (value) => formatDateGt(value, { month: "short" });

const MOVEMENT_TYPE_OPTIONS = [
  { value: "", label: "Todos" },
  { value: "ENTRADA", label: "Entrada" },
  { value: "TRASLADO_ENTRADA", label: "Traslado entrada" },
  { value: "TRASLADO_SALIDA", label: "Traslado salida" },
  { value: "VENTA", label: "Venta" },
  { value: "ANULACION", label: "Anulación" },
  { value: "AJUSTE", label: "Ajuste" },
  { value: "DEVOLUCION_CLIENTE", label: "Dev. cliente" },
  { value: "DEVOLUCION_DEPOSITO", label: "Dev. bodega" },
  { value: "MERMA", label: "Merma" },
  { value: "CAMBIO", label: "Cambio" },
];

const rowKey = (row) => `${row.productId}-${row.colorId || "nc"}`;

const sumKardexRows = (rows) =>
  KARDEX_COLUMNS.reduce((acc, col) => {
    acc[col.key] = rows.reduce((s, r) => s + Number(r[col.key] || 0), 0);
    return acc;
  }, {});

function KioskInventoryKardexPanel({ locationId }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedProductRowKey, setSelectedProductRowKey] = useState("");
  const [audienceFilter, setAudienceFilter] = useState("");
  const [cinchoFilter, setCinchoFilter] = useState("");
  const [movementTypeFilter, setMovementTypeFilter] = useState("");
  const [productKindFilter, setProductKindFilter] = useState("");
  const [kardexReport, setKardexReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedRowKey, setSelectedRowKey] = useState(null);
  const [detailMovements, setDetailMovements] = useState([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const productRowOptions = useMemo(() => {
    if (!kardexReport?.rows?.length) return [];
    return [...kardexReport.rows]
      .sort((a, b) => {
        const codeCmp = String(a.productCode || "").localeCompare(String(b.productCode || ""), "es", { sensitivity: "base" });
        if (codeCmp !== 0) return codeCmp;
        return String(a.colorName || "").localeCompare(String(b.colorName || ""), "es", { sensitivity: "base" });
      })
      .map((row) => {
        const key = rowKey(row);
        const colorPart = row.colorName ? ` · ${row.colorName}` : "";
        const code = row.productCode || `#${row.productId}`;
        const name = row.productName || "";
        return {
          value: key,
          label: `${code} — ${name}${colorPart}`,
          searchText: `${code} ${name} ${row.colorName || ""} ${getProductAudienceLabel(row.audienceCategory)} ${getCinchoTypeLabel(row.cinchoType)}`.toLowerCase(),
        };
      });
  }, [kardexReport]);

  const filteredRows = useMemo(() => {
    if (!kardexReport?.rows) return [];
    return kardexReport.rows.filter((row) => {
      if (selectedProductRowKey && rowKey(row) !== selectedProductRowKey) return false;
      if (productKindFilter === "packaging" && !isPackagingProductCode(row.productCode)) return false;
      if (productKindFilter === "product" && isPackagingProductCode(row.productCode)) return false;
      if (!productMatchesAudienceFilter(row, audienceFilter)) return false;
      if (!productMatchesCinchoFilter(row, cinchoFilter)) return false;
      return true;
    });
  }, [kardexReport, selectedProductRowKey, productKindFilter, audienceFilter, cinchoFilter]);

  const filteredTotals = useMemo(() => sumKardexRows(filteredRows), [filteredRows]);

  const filteredDetailMovements = useMemo(() => {
    if (!movementTypeFilter) return detailMovements;
    return detailMovements.filter((m) => String(m.movementType || "") === movementTypeFilter);
  }, [detailMovements, movementTypeFilter]);

  const hasActiveFilters = Boolean(
    selectedProductRowKey || audienceFilter || cinchoFilter || productKindFilter
  );

  const handleGenerate = async () => {
    const validationError = validateKardexRangeForm({ locationId, from, to });
    if (validationError) {
      showError(validationError);
      return;
    }
    try {
      setLoading(true);
      setSelectedRowKey(null);
      setDetailMovements([]);
      setSelectedProductRowKey("");
      setAudienceFilter("");
      setCinchoFilter("");
      const report = await getKioscoKardex(Number(locationId), from, to);
      setKardexReport(report || null);
    } catch (err) {
      showError(err.message || "No se pudo generar el kardex.");
      setKardexReport(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRow = async (row) => {
    const key = rowKey(row);
    if (selectedRowKey === key) {
      setSelectedRowKey(null);
      setDetailMovements([]);
      return;
    }
    try {
      setSelectedRowKey(key);
      setDetailLoading(true);
      const reportFrom = kardexReport?.from || from;
      const reportTo = kardexReport?.to || to;
      const movements = await getKioscoKardexMovimientos(Number(locationId), reportFrom, reportTo, {
        productId: row.productId,
        colorId: row.colorId || undefined,
      });
      setDetailMovements(movements || []);
    } catch (err) {
      showError(err.message || "No se pudieron cargar los movimientos.");
      setDetailMovements([]);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div className="kiosk-inventory-kardex-panel">
      <Row className="mb-2">
        <Col md="2">
          <FormGroup className="mb-0">
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="2">
          <FormGroup className="mb-0">
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </FormGroup>
        </Col>
        <Col md="2">
          <FormGroup className="mb-0">
            <Label>Empaque</Label>
            <Input
              type="select"
              value={productKindFilter}
              onChange={(e) => {
                setProductKindFilter(e.target.value);
                setSelectedProductRowKey("");
              }}
            >
              <option value="">Producto y empaque</option>
              <option value="product">Solo productos</option>
              <option value="packaging">Solo empaques SUM-</option>
            </Input>
          </FormGroup>
        </Col>
        <Col md="4" className="d-flex align-items-end">
          <Button color="primary" onClick={() => void handleGenerate()} disabled={loading}>
            {loading ? <><Spinner size="sm" className="mr-1" /> Generando...</> : "Generar kardex"}
          </Button>
        </Col>
      </Row>

      {kardexReport && (
        <div className="kiosk-kardex-report-meta mb-3">
          <span className="kiosk-kardex-report-meta-item">
            <span className="kiosk-kardex-report-meta-label">Kiosko</span>
            <strong>{kardexReport.locationName || kardexReport.locationCode || "—"}</strong>
          </span>
          <span className="kiosk-kardex-report-meta-item">
            <span className="kiosk-kardex-report-meta-label">Período</span>
            <strong>
              {kardexReport.from ? fmtPeriodDate(kardexReport.from) : "—"}
              {" — "}
              {kardexReport.to ? fmtPeriodDate(kardexReport.to) : "—"}
            </strong>
          </span>
        </div>
      )}

      {kardexReport && (
        <Row className="mb-3 align-items-end">
          <Col md="5">
            <FormGroup className="mb-0">
              <Label style={{ fontSize: 12 }}>
                Producto / color en el periodo
                <Badge color="light" className="ml-2 border" style={{ fontSize: 10, color: "#374151" }}>
                  {productRowOptions.length} fila{productRowOptions.length !== 1 ? "s" : ""}
                </Badge>
              </Label>
              <FilterableSelect
                value={selectedProductRowKey}
                onChange={setSelectedProductRowKey}
                options={productRowOptions.filter((opt) => {
                  const row = kardexReport.rows.find((r) => rowKey(r) === opt.value);
                  if (!row) return false;
                  if (productKindFilter === "packaging" && !isPackagingProductCode(row.productCode)) return false;
                  if (productKindFilter === "product" && isPackagingProductCode(row.productCode)) return false;
                  if (!productMatchesAudienceFilter(row, audienceFilter)) return false;
                  if (!productMatchesCinchoFilter(row, cinchoFilter)) return false;
                  return true;
                })}
                placeholder="Buscar por código, nombre o color..."
                emptyLabel="Todos los productos del periodo"
              />
            </FormGroup>
          </Col>
          <Col md="7">
            <Label style={{ fontSize: 12 }}>Cat. SX y cincho</Label>
            <div className="d-flex flex-wrap kiosk-kardex-filter-chips" style={{ gap: 6 }}>
              <Button
                size="sm"
                color={audienceFilter === "" ? "primary" : "light"}
                onClick={() => {
                  setAudienceFilter("");
                  setSelectedProductRowKey("");
                }}
              >
                Cat. SX: Todas
              </Button>
              {PRODUCT_AUDIENCE_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  size="sm"
                  color={audienceFilter === opt.value ? "primary" : "light"}
                  onClick={() => {
                    setAudienceFilter(opt.value);
                    setSelectedProductRowKey("");
                  }}
                >
                  {opt.label}
                </Button>
              ))}
              <span className="kiosk-kardex-filter-divider" />
              {CINCHO_FILTER_OPTIONS.map((opt) => (
                <Button
                  key={opt.value || "all"}
                  size="sm"
                  color={cinchoFilter === opt.value ? "info" : "light"}
                  onClick={() => {
                    setCinchoFilter(opt.value);
                    setSelectedProductRowKey("");
                  }}
                >
                  {opt.label === "Todos" ? "Cinchos: Todos" : opt.label}
                </Button>
              ))}
            </div>
          </Col>
        </Row>
      )}

      {!locationId ? (
        <Alert color="light" className="border mb-0 kiosk-inv-hint-alert">
          Selecciona un <strong>kiosko</strong> arriba y un rango de fechas para generar el reporte.
        </Alert>
      ) : loading ? (
        <div className="text-center py-3"><Spinner /> Generando reporte...</div>
      ) : !kardexReport ? (
        <Alert color="light" className="border mb-0">
          Indica el rango de fechas y presiona &quot;Generar kardex&quot;.
        </Alert>
      ) : filteredRows.length === 0 ? (
        <Alert color="light" className="border mb-0">
          No hay filas que coincidan con los filtros en este periodo.
        </Alert>
      ) : (
        <>
          {hasActiveFilters && (
            <div className="mb-2" style={{ fontSize: 12, color: "#6b7280" }}>
              Mostrando {filteredRows.length} de {kardexReport.rows.length} filas
            </div>
          )}
          <div className="kiosk-kardex-summary-wrap">
            <Table responsive size="sm" className="kiosk-kardex-summary-table mb-0">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Color</th>
                  {KARDEX_COLUMNS.map((col) => (
                    <th key={col.key} className="text-right">{col.label}</th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => {
                  const key = rowKey(row);
                  const active = selectedRowKey === key;
                  return (
                    <tr
                      key={key}
                      className={active ? "kiosk-kardex-row-active" : "kiosk-kardex-row-clickable"}
                      onClick={() => void handleSelectRow(row)}
                    >
                      <td>
                        {row.productCode}
                        <span className="text-muted"> {row.productName}</span>
                        {isPackagingProductCode(row.productCode) && (
                          <Badge color="info" className="ml-1" style={{ fontSize: 9 }}>SUM-</Badge>
                        )}
                      </td>
                      <td>{row.colorName || "—"}</td>
                      {KARDEX_COLUMNS.map((col) => (
                        <td key={col.key} className="text-right">{row[col.key]}</td>
                      ))}
                      <td className="text-muted" style={{ fontSize: 11 }}>{active ? "▼" : "▶"}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="kiosk-kardex-totals-row">
                  <td colSpan={2}>
                    {hasActiveFilters ? "Subtotal filtrado" : "Totales"}
                  </td>
                  {KARDEX_COLUMNS.map((col) => (
                    <td key={col.key} className="text-right">{filteredTotals[col.key] ?? 0}</td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </Table>
          </div>

          {selectedRowKey && (
            <div className="kiosk-kardex-detail mt-3">
              <div className="d-flex flex-wrap align-items-center mb-2" style={{ gap: 8 }}>
                <strong style={{ fontSize: 13 }}>
                  Movimientos detallados
                  {kardexReport?.from && kardexReport?.to ? (
                    <span style={{ fontWeight: 400, color: "#6b7280", marginLeft: 8 }}>
                      ({fmtPeriodDate(kardexReport.from)} — {fmtPeriodDate(kardexReport.to)})
                    </span>
                  ) : null}
                </strong>
                <Input
                  type="select"
                  bsSize="sm"
                  style={{ width: 200 }}
                  value={movementTypeFilter}
                  onChange={(e) => setMovementTypeFilter(e.target.value)}
                >
                  {MOVEMENT_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value || "all"} value={opt.value}>{opt.label}</option>
                  ))}
                </Input>
              </div>
              {detailLoading ? (
                <div className="text-center py-2"><Spinner size="sm" /></div>
              ) : filteredDetailMovements.length === 0 ? (
                <Alert color="light" className="border mb-0" style={{ fontSize: 12 }}>
                  Sin movimientos en el periodo para este producto.
                </Alert>
              ) : (
                <Table responsive size="sm" className="kiosk-kardex-detail-table mb-0">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Origen → Destino</th>
                      <th className="text-right">Cant.</th>
                      <th className="text-right">Antes</th>
                      <th className="text-right">Después</th>
                      <th>Referencia</th>
                      <th>Usuario</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDetailMovements.map((m) => (
                      <tr
                        key={m.id}
                        className={isKioscoTransferMovement(m) ? "kiosk-kardex-transfer-row" : undefined}
                      >
                        <td style={{ whiteSpace: "nowrap" }}>{formatDateTimeGt(m.createdAt)}</td>
                        <td>{getKioscoMovementTypeLabel(m.movementType)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>{formatKioscoMovementRoute(m)}</td>
                        <td className="text-right">{getKioscoMovementSignedQuantity(m)}</td>
                        <td className="text-right">{m.stockBefore}</td>
                        <td className="text-right">{m.stockAfter}</td>
                        <td>{formatKioscoMovementReference(m)}</td>
                        <td>{m.username || m.userId || "—"}</td>
                        <td style={{ maxWidth: 220 }}>{formatKioscoMovementDetail(m)}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default KioskInventoryKardexPanel;
