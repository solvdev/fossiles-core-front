import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
  Button,
  Row,
  Col,
  FormGroup,
  Label,
  Input,
  Alert,
  Spinner,
  Table,
  CustomInput,
} from "reactstrap";
import { getProductInventoryOutflowsReport } from "services/productInventoryService";
import { getLocations } from "services/locationService";
import { getProducts } from "services/productService";
import { showError } from "utils/notificationHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { exportProductInventoryOutflowReportExcel } from "utils/productInventoryOutflowReportExcel";
import {
  buildProductInventoryOutflowReportPrintHtml,
  openProductInventoryOutflowPrintWindow,
} from "utils/productInventoryOutflowReportPrintHtml";

const SOURCE_CATEGORIES = [
  { value: "PRODUCTION_ORDER", label: "Orden de producción" },
  { value: "DISTRIBUTION", label: "Distribución" },
  { value: "ONLINE_SALE", label: "Venta en línea" },
  { value: "KIOSK", label: "Kiosko" },
  { value: "TRANSFER", label: "Traslado" },
  { value: "ADJUSTMENT", label: "Ajuste" },
  { value: "OTHER", label: "Otro" },
];

const ORDER_TYPES = [
  { value: "CINCHOS", label: "CINCHOS" },
  { value: "CINCHOS_FOSSILES", label: "CINCHOS FOSSILES" },
  { value: "CINCHOS_MARCAS", label: "CINCHOS MARCAS" },
  { value: "NORMAL", label: "NORMAL" },
  { value: "MARCAS", label: "MARCAS (OPV)" },
  { value: "OPV", label: "OPV" },
  { value: "DISTRIBUTION", label: "DISTRIBUTION" },
  { value: "VENTA_EN_LINEA", label: "VENTA EN LÍNEA" },
  { value: "CLIENTE_KIOSKO", label: "CLIENTE KIOSKO" },
  { value: "INTERNA", label: "INTERNA (OPI)" },
];

function defaultDateRange() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { startDate: fmt(start), endDate: fmt(end) };
}

function docLabel(r) {
  return [r.referenceNumber, r.orderCode, r.distributionCode].filter(Boolean).join(" / ") || "—";
}

function buildFiltersSummary(filters) {
  const parts = [`Periodo: ${filters.startDate} — ${filters.endDate}`];
  if (filters.locationId) parts.push(`Ubicación ID: ${filters.locationId}`);
  if (filters.productId) parts.push(`Producto ID: ${filters.productId}`);
  if (filters.sourceCategories?.length) {
    parts.push(`Origen: ${filters.sourceCategories.join(", ")}`);
  }
  if (filters.orderTypes?.length) {
    parts.push(`Tipos OP: ${filters.orderTypes.join(", ")}`);
  }
  return parts.join(" · ");
}

function FilterCheckboxes({ options, selected, onToggle, idPrefix }) {
  return (
    <div className="border rounded p-2" style={{ maxHeight: "140px", overflowY: "auto" }}>
      {options.map((opt) => (
        <CustomInput
          key={opt.value}
          type="checkbox"
          id={`${idPrefix}-${opt.value}`}
          label={opt.label}
          checked={selected.includes(opt.value)}
          onChange={() => onToggle(opt.value)}
          className="mb-1"
        />
      ))}
    </div>
  );
}

export default function ProductInventoryOutflowReportModal({ isOpen, toggle }) {
  const initialRange = useMemo(() => defaultDateRange(), []);

  const [startDate, setStartDate] = useState(initialRange.startDate);
  const [endDate, setEndDate] = useState(initialRange.endDate);
  const [locationId, setLocationId] = useState("");
  const [productId, setProductId] = useState("");
  const [sourceCategories, setSourceCategories] = useState([]);
  const [orderTypes, setOrderTypes] = useState([]);

  const [locations, setLocations] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const [locData, prodData] = await Promise.all([getLocations(), getProducts()]);
        if (!cancelled) {
          setLocations(Array.isArray(locData) ? locData : []);
          setProducts(Array.isArray(prodData) ? prodData : []);
        }
      } catch (_e) {
        /* optional catalogs */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const toggleSourceCategory = (value) => {
    setSourceCategories((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const toggleOrderType = (value) => {
    setOrderTypes((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    );
  };

  const handleSearch = useCallback(async () => {
    if (!startDate || !endDate) {
      setError("Indique fecha inicio y fin.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await getProductInventoryOutflowsReport({
        startDate,
        endDate,
        locationId: locationId || undefined,
        productId: productId || undefined,
        sourceCategories,
        orderTypes,
      });
      setRows(Array.isArray(result?.rows) ? result.rows : []);
      setReportMeta({
        totalCount: result?.totalCount ?? 0,
        truncated: !!result?.truncated,
        message: result?.message || null,
      });
    } catch (err) {
      setRows([]);
      setReportMeta(null);
      setError(err.message || "Error al cargar el reporte");
      showError(err.message || "Error al cargar el reporte");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, locationId, productId, sourceCategories, orderTypes]);

  const filtersSummary = buildFiltersSummary({
    startDate,
    endDate,
    locationId,
    productId,
    sourceCategories,
    orderTypes,
  });

  const handleExcel = () => {
    if (!rows.length) return;
    exportProductInventoryOutflowReportExcel(
      rows,
      `salidas-inventario_${startDate}_${endDate}.xlsx`
    );
  };

  const handlePdf = () => {
    if (!rows.length) return;
    const html = buildProductInventoryOutflowReportPrintHtml(rows, filtersSummary);
    if (!openProductInventoryOutflowPrintWindow(html)) {
      showError("Permita ventanas emergentes para imprimir o guardar como PDF.");
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="xl">
      <ModalHeader toggle={toggle}>Reporte de salidas de inventario</ModalHeader>
      <ModalBody>
        <Row>
          <Col md="3">
            <FormGroup>
              <Label>Fecha inicio</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Fecha fin</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Ubicación origen</Label>
              <Input type="select" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                <option value="">Todas</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name || l.code}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Producto</Label>
              <Input type="select" value={productId} onChange={(e) => setProductId(e.target.value)}>
                <option value="">Todos</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} — {p.name}
                  </option>
                ))}
              </Input>
            </FormGroup>
          </Col>
        </Row>

        <Row className="mb-2">
          <Col md="6">
            <Label className="d-block mb-1">Origen del movimiento (opcional)</Label>
            <FilterCheckboxes
              options={SOURCE_CATEGORIES}
              selected={sourceCategories}
              onToggle={toggleSourceCategory}
              idPrefix="src-cat"
            />
          </Col>
          <Col md="6">
            <Label className="d-block mb-1">Tipos de OP (opcional)</Label>
            <FilterCheckboxes
              options={ORDER_TYPES}
              selected={orderTypes}
              onToggle={toggleOrderType}
              idPrefix="op-type"
            />
          </Col>
        </Row>

        {error && (
          <Alert color="danger" className="py-2">
            {error}
          </Alert>
        )}
        {reportMeta?.message && (
          <Alert color="warning" className="py-2">
            {reportMeta.message}
          </Alert>
        )}

        <div className="d-flex align-items-center mb-2 flex-wrap" style={{ gap: "8px" }}>
          <Button color="primary" size="sm" onClick={handleSearch} disabled={loading}>
            {loading ? (
              <>
                <Spinner size="sm" className="mr-1" /> Buscando…
              </>
            ) : (
              "Buscar"
            )}
          </Button>
          <Button color="success" size="sm" outline disabled={!rows.length} onClick={handleExcel}>
            Exportar Excel
          </Button>
          <Button color="info" size="sm" outline disabled={!rows.length} onClick={handlePdf}>
            Imprimir / PDF
          </Button>
          {reportMeta != null && !loading && (
            <span className="text-muted small ml-2">{reportMeta.totalCount} fila(s)</span>
          )}
        </div>

        <ReportPreviewTable rows={rows} loading={loading} />
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline size="sm" onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function ReportPreviewTable({ rows, loading }) {
  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner />
      </div>
    );
  }
  if (!rows.length) {
    return (
      <Alert color="light" className="mb-0 mt-2">
        Use Buscar para cargar salidas del periodo. Sin datos hasta entonces.
      </Alert>
    );
  }
  return (
    <div className="table-responsive mt-2" style={{ maxHeight: "360px", overflowY: "auto" }}>
      <Table striped size="sm" className="mb-0">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Origen</th>
            <th>Tipo OP</th>
            <th>Documento</th>
            <th>Producto</th>
            <th>Color</th>
            <th>Ubic. origen</th>
            <th>Destino</th>
            <th className="text-right">Cant.</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{formatDateTimeGt(r.movementDate)}</td>
              <td>{r.sourceLabel || r.sourceCategory}</td>
              <td>{r.orderType || "—"}</td>
              <td>{docLabel(r)}</td>
              <td>
                {r.productCode} {r.productName}
              </td>
              <td>{r.colorName || "—"}</td>
              <td>{r.locationName || "—"}</td>
              <td>{r.destinationLocationName || "—"}</td>
              <td className="text-right">
                {r.quantity != null ? Math.abs(parseFloat(r.quantity)).toFixed(3) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}

