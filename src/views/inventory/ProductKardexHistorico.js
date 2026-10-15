import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
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
  Table,
} from "reactstrap";
import {
  getProductKardexHistoricoFilters,
  searchProductKardexHistorico,
} from "services/productInventoryService";
import { getProducts } from "services/productService";
import { getLocations } from "services/locationService";
import { showError } from "utils/notificationHelper";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { exportRowsToCsv } from "utils/reportExportHelper";

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  archiveReference: "",
  locationId: "",
  productId: "",
  movementType: "",
  from: "",
  to: "",
  reference: "",
};

const formatQty = (value) => {
  if (value === null || value === undefined) return "-";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : n.toFixed(3);
};

/**
 * Kardex de producto archivado por limpiezas de inventario. Solo consulta: estos movimientos
 * ya no cuentan en los saldos actuales.
 */
function ProductKardexHistorico() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [archives, setArchives] = useState([]);
  const [movementTypes, setMovementTypes] = useState([]);
  const [products, setProducts] = useState([]);
  const [locations, setLocations] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [filterData, productList, locationList] = await Promise.all([
          getProductKardexHistoricoFilters(),
          getProducts().catch(() => []),
          getLocations().catch(() => []),
        ]);
        setArchives(filterData?.archives || []);
        setMovementTypes(filterData?.movementTypes || []);
        setProducts(Array.isArray(productList) ? productList : []);
        setLocations(Array.isArray(locationList) ? locationList : []);
      } catch (err) {
        showError(err.message || "No se pudieron cargar los filtros del kardex histórico.");
      }
    })();
  }, []);

  const load = useCallback(async (activeFilters, pageNumber) => {
    try {
      setLoading(true);
      const data = await searchProductKardexHistorico({ ...activeFilters, page: pageNumber, size: PAGE_SIZE });
      setResult(data);
    } catch (err) {
      showError(err.message || "No se pudo consultar el kardex histórico.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(applied, page);
  }, [applied, page, load]);

  const applyFilters = () => {
    setPage(0);
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPage(0);
    setApplied(EMPTY_FILTERS);
  };

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const exportPage = () => {
    exportRowsToCsv("kardex_historico", [
      { label: "Fecha", value: (r) => formatDateTimeGt(r.movementDate) },
      { label: "Ubicacion", value: (r) => r.locationName || r.locationCode || r.locationId },
      { label: "Codigo", value: (r) => r.productCode || r.productId },
      { label: "Producto", value: (r) => r.productName || "" },
      { label: "Color", value: (r) => r.colorName || "" },
      { label: "Talla", value: (r) => r.sizeLabel || "" },
      { label: "Movimiento", value: (r) => r.movementType },
      { label: "Cantidad", value: (r) => formatQty(r.quantity) },
      { label: "Saldo antes", value: (r) => formatQty(r.quantityBefore) },
      { label: "Saldo despues", value: (r) => formatQty(r.quantityAfter) },
      { label: "Referencia", value: (r) => r.referenceNumber || "" },
      { label: "Descripcion", value: (r) => r.description || "" },
      { label: "Limpieza", value: (r) => r.archiveReference },
    ], result?.content || []);
  };

  const rows = result?.content || [];
  const totalPages = result?.totalPages || 0;

  return (
    <div className="content">
      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <div className="d-flex justify-content-between align-items-start flex-wrap">
                <div>
                  <CardTitle tag="h4" className="mb-1">Kardex histórico de producto</CardTitle>
                  <p className="text-muted mb-0">
                    Movimientos archivados al limpiar el inventario de bodega. Solo consulta: ya no
                    cuentan en los saldos actuales.
                  </p>
                </div>
                <Button color="secondary" size="sm" onClick={exportPage} disabled={rows.length === 0}>
                  <i className="nc-icon nc-cloud-download-93 mr-1" />
                  CSV (página)
                </Button>
              </div>
              {archives.length > 0 && (
                <div className="mt-2">
                  {archives.map((a) => (
                    <Badge key={a.archiveReference} color="info" className="mr-2">
                      {a.archiveReference} · {formatDateTimeGt(a.archivedAt)} · {a.movements} mov.
                    </Badge>
                  ))}
                </div>
              )}
            </CardHeader>
            <CardBody>
              <Row>
                <Col md="3">
                  <FormGroup>
                    <Label>Limpieza</Label>
                    <Input type="select" value={filters.archiveReference}
                      onChange={(e) => setFilter("archiveReference", e.target.value)}>
                      <option value="">Todas</option>
                      {archives.map((a) => (
                        <option key={a.archiveReference} value={a.archiveReference}>{a.archiveReference}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Ubicación</Label>
                    <Input type="select" value={filters.locationId}
                      onChange={(e) => setFilter("locationId", e.target.value)}>
                      <option value="">Todas</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name || l.code}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Producto</Label>
                    <Input type="select" value={filters.productId}
                      onChange={(e) => setFilter("productId", e.target.value)}>
                      <option value="">Todos</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Tipo de movimiento</Label>
                    <Input type="select" value={filters.movementType}
                      onChange={(e) => setFilter("movementType", e.target.value)}>
                      <option value="">Todos</option>
                      {movementTypes.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </Input>
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Desde</Label>
                    <Input type="date" value={filters.from} onChange={(e) => setFilter("from", e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Hasta</Label>
                    <Input type="date" value={filters.to} onChange={(e) => setFilter("to", e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup>
                    <Label>Documento / referencia</Label>
                    <Input type="text" value={filters.reference} placeholder="Ej: ENV-00529"
                      onChange={(e) => setFilter("reference", e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }} />
                  </FormGroup>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <FormGroup className="w-100">
                    <Button color="primary" className="mr-2" onClick={applyFilters} disabled={loading}>Buscar</Button>
                    <Button color="default" outline onClick={clearFilters} disabled={loading}>Limpiar</Button>
                  </FormGroup>
                </Col>
              </Row>

              {loading && !result ? (
                <div className="text-center py-4"><Spinner color="primary" /></div>
              ) : rows.length === 0 ? (
                <Alert color="light" className="mb-0">
                  {archives.length === 0
                    ? "Todavía no hay movimientos archivados."
                    : "No hay movimientos con estos filtros."}
                </Alert>
              ) : (
                <>
                  <div className="d-flex justify-content-between align-items-center mb-2">
                    <small className="text-muted">
                      {result.totalElements} movimiento(s) · página {page + 1} de {Math.max(totalPages, 1)}
                    </small>
                    {loading && <Spinner size="sm" color="primary" />}
                  </div>
                  <Table responsive size="sm" hover>
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Ubicación</th>
                        <th>Producto</th>
                        <th>Color / talla</th>
                        <th>Movimiento</th>
                        <th className="text-right">Cantidad</th>
                        <th className="text-right">Saldo antes</th>
                        <th className="text-right">Saldo después</th>
                        <th>Referencia</th>
                        <th>Descripción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const qty = Number(r.quantity || 0);
                        return (
                          <tr key={r.id}>
                            <td className="text-nowrap">{formatDateTimeGt(r.movementDate)}</td>
                            <td>{r.locationName || r.locationCode || r.locationId}</td>
                            <td>
                              <strong>{r.productCode || r.productId}</strong>
                              <div className="small text-muted">{r.productName}</div>
                            </td>
                            <td>
                              {r.colorName || "-"}
                              {r.sizeLabel ? <Badge color="light" className="ml-1">T{r.sizeLabel}</Badge> : null}
                            </td>
                            <td><Badge color="secondary">{r.movementType}</Badge></td>
                            <td className={`text-right ${qty < 0 ? "text-danger" : "text-success"}`}>
                              {qty > 0 ? "+" : ""}{formatQty(r.quantity)}
                            </td>
                            <td className="text-right">{formatQty(r.quantityBefore)}</td>
                            <td className="text-right">{formatQty(r.quantityAfter)}</td>
                            <td className="text-nowrap">{r.referenceNumber || "-"}</td>
                            <td className="small">{r.description || "-"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                  <div className="d-flex justify-content-end">
                    <Button size="sm" color="default" outline className="mr-2"
                      disabled={loading || page === 0} onClick={() => setPage((p) => Math.max(p - 1, 0))}>
                      Anterior
                    </Button>
                    <Button size="sm" color="default" outline
                      disabled={loading || page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                      Siguiente
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default ProductKardexHistorico;
