import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
} from "reactstrap";
import { formatAccountMoney, searchReceivableDocuments } from "services/customerAccountService";
import {
  buildRutasCxcPrintHtml,
  groupRutasCxcRowsByRoute,
  normalizeRutasCxcRows,
  openBlankPrintWindow,
  writeHtmlToPrintWindow,
} from "utils/customerAccountReportPrintHtml";
import { getRegionLabel, listRegions, listRoutes, parseRouteLocationCode } from "utils/deliveryRouteCatalog";
import { showError, showSuccess } from "utils/notificationHelper";

const COMPANY_BY_KIND = {
  OPV: "CATALOGO FOSSILES",
  OPC: "GRUPO COMERCIAL FUTURA",
};

function CustomerAccountRutasPrintModal({
  isOpen,
  toggle,
  orderKind = "OPV",
  search = "",
  initialRegionCode = "",
  initialRouteNumber = "",
}) {
  const [scope, setScope] = useState("GLOBAL"); // GLOBAL | ROUTE
  const [regionCode, setRegionCode] = useState("");
  const [routeNumber, setRouteNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState("");
  const [rawRows, setRawRows] = useState([]);

  const companyName = COMPANY_BY_KIND[orderKind] || COMPANY_BY_KIND.OPV;
  const portfolioLabel = orderKind === "OPC" ? "GCF" : "Fossiles";
  const regions = useMemo(() => listRegions(), []);
  const routes = useMemo(() => (regionCode ? listRoutes(regionCode) : []), [regionCode]);

  useEffect(() => {
    if (!isOpen) return;
    setScope("GLOBAL");
    setRegionCode(initialRegionCode || "");
    setRouteNumber(initialRouteNumber ? String(initialRouteNumber) : "");
    setError("");
    setRawRows([]);
  }, [isOpen, orderKind, initialRegionCode, initialRouteNumber]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadPreview = async () => {
      setLoading(true);
      setError("");
      try {
        const docs = await searchReceivableDocuments({
          search: search.trim(),
          orderKind,
          hasCharge: true,
          regionCode: scope === "ROUTE" && regionCode ? regionCode : undefined,
          routeNumber: scope === "ROUTE" && routeNumber ? Number(routeNumber) : undefined,
          allOrderTypes: false,
          limit: 5000,
        });
        if (cancelled) return;
        setRawRows(Array.isArray(docs) ? docs : []);
      } catch (err) {
        if (cancelled) return;
        setRawRows([]);
        setError(err.message || "No se pudieron cargar los documentos para el preview.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void loadPreview();
    return () => {
      cancelled = true;
    };
  }, [isOpen, orderKind, search, scope, regionCode, routeNumber]);

  const normalizedRows = useMemo(() => normalizeRutasCxcRows(rawRows), [rawRows]);

  const filteredRows = useMemo(() => {
    if (scope !== "ROUTE" || !routeNumber) return normalizedRows;
    const routeNum = Number(routeNumber);
    return normalizedRows.filter((row) => {
      const parsed = parseRouteLocationCode(row.clasif || row.routeLocationCode);
      return parsed?.routeNumber === routeNum;
    });
  }, [normalizedRows, scope, routeNumber]);

  const routeGroups = useMemo(() => groupRutasCxcRowsByRoute(filteredRows), [filteredRows]);

  const previewTotal = useMemo(
    () => filteredRows.reduce((sum, row) => sum + (Number(row.saldos ?? row.balanceDue) || 0), 0),
    [filteredRows]
  );

  const selectedRouteLabel = useMemo(() => {
    if (scope !== "ROUTE" || !routeNumber) return "";
    const region = regionCode ? getRegionLabel(regionCode) : "";
    return `${region ? `${region} · ` : ""}Ruta ${routeNumber}`;
  }, [scope, regionCode, routeNumber]);

  const canPrint = !loading && filteredRows.length > 0 && (scope === "GLOBAL" || Boolean(routeNumber));

  const handlePrint = () => {
    if (scope === "ROUTE" && !routeNumber) {
      showError("Selecciona la ruta a imprimir.");
      return;
    }
    if (!filteredRows.length) {
      showError("No hay documentos cargados para imprimir con esa selección.");
      return;
    }
    const printWindow = openBlankPrintWindow();
    if (!printWindow) {
      showError("No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas.");
      return;
    }
    setPrinting(true);
    try {
      const html = buildRutasCxcPrintHtml({
        rows: filteredRows,
        orderKind,
        groupByRoute: scope === "GLOBAL",
        routeLabel: scope === "ROUTE" ? selectedRouteLabel : "",
      });
      writeHtmlToPrintWindow(printWindow, html);
      showSuccess("Reporte listo para imprimir.");
      toggle();
    } catch (err) {
      try {
        printWindow.close();
      } catch (_e) {
        /* ignore */
      }
      showError(err.message || "No se pudo generar el reporte.");
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg">
      <ModalHeader toggle={toggle}>
        Imprimir RUTAS CxC — {portfolioLabel}
      </ModalHeader>
      <ModalBody>
        <Alert color="info" className="py-2">
          Empresa del reporte: <strong>{companyName}</strong>. Elige un reporte{" "}
          <strong>global</strong> (separado por rutas) o una <strong>ruta específica</strong>.
        </Alert>

        <div className="d-flex flex-wrap mb-3" style={{ gap: 8 }}>
          <Button
            size="sm"
            color={scope === "GLOBAL" ? "primary" : "light"}
            onClick={() => setScope("GLOBAL")}
          >
            Global ({portfolioLabel})
          </Button>
          <Button
            size="sm"
            color={scope === "ROUTE" ? "primary" : "light"}
            onClick={() => setScope("ROUTE")}
          >
            Por ruta
          </Button>
        </div>

        {scope === "ROUTE" && (
          <div className="row mb-3">
            <div className="col-md-6">
              <FormGroup className="mb-md-0">
                <Label>Región</Label>
                <Input
                  type="select"
                  value={regionCode}
                  onChange={(e) => {
                    setRegionCode(e.target.value);
                    setRouteNumber("");
                  }}
                >
                  <option value="">Seleccione región</option>
                  {regions.map((r) => (
                    <option key={r.code} value={r.code}>
                      {r.label}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </div>
            <div className="col-md-6">
              <FormGroup className="mb-md-0">
                <Label>Ruta</Label>
                <Input
                  type="select"
                  value={routeNumber}
                  disabled={!regionCode}
                  onChange={(e) => setRouteNumber(e.target.value)}
                >
                  <option value="">Seleccione ruta</option>
                  {routes.map((r) => (
                    <option key={r.routeNumber} value={r.routeNumber}>
                      Ruta {r.routeNumber}
                    </option>
                  ))}
                </Input>
              </FormGroup>
            </div>
          </div>
        )}

        {error && <Alert color="danger">{error}</Alert>}

        <div className="d-flex flex-wrap align-items-center justify-content-between mb-2">
          <strong>Preview del reporte</strong>
          <div>
            <Badge color="secondary" className="mr-1">
              {filteredRows.length} documento(s)
            </Badge>
            <Badge color="warning">Total {formatAccountMoney(previewTotal)}</Badge>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-4">
            <Spinner size="sm" className="mr-2" /> Cargando preview...
          </div>
        ) : filteredRows.length === 0 ? (
          <Alert color="secondary" className="mb-0">
            {scope === "ROUTE" && !routeNumber
              ? "Selecciona región y ruta para ver el preview."
              : "No hay documentos cargados para esta selección."}
          </Alert>
        ) : (
          <div style={{ maxHeight: 360, overflow: "auto", border: "1px solid #dee2e6", borderRadius: 6 }}>
            {routeGroups.map((group) => (
              <div key={group.key} className="p-2 border-bottom">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <strong style={{ fontSize: 13 }}>{group.label}</strong>
                  <span className="text-muted small">
                    {group.documentCount} doc. · {formatAccountMoney(group.totalSaldos)}
                  </span>
                </div>
                <Table size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Documento</th>
                      <th>Clave</th>
                      <th>Cliente</th>
                      <th className="text-right">Cargos</th>
                      <th className="text-right">Abonos</th>
                      <th className="text-right">Saldos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.slice(0, 8).map((row, idx) => (
                      <tr key={`${row.chargeEntryId || row.documentNumber}-${idx}`}>
                        <td>{row.documentNumber || "—"}</td>
                        <td>{row.legacyCode || "—"}</td>
                        <td>{row.customerName || "—"}</td>
                        <td className="text-right">{formatAccountMoney(row.cargos)}</td>
                        <td className="text-right">{formatAccountMoney(row.abonos)}</td>
                        <td className="text-right">{formatAccountMoney(row.saldos)}</td>
                      </tr>
                    ))}
                    {group.rows.length > 8 && (
                      <tr>
                        <td colSpan={6} className="text-muted small">
                          … y {group.rows.length - 8} más en esta ruta
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            ))}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" onClick={toggle} disabled={printing}>
          Cancelar
        </Button>
        <Button color="primary" onClick={handlePrint} disabled={!canPrint || printing}>
          {printing ? (
            <>
              <Spinner size="sm" className="mr-1" /> Generando...
            </>
          ) : (
            "Imprimir selección"
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default CustomerAccountRutasPrintModal;
