import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Col,
  Collapse,
  FormGroup,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Nav,
  NavItem,
  NavLink,
  Row,
  TabContent,
  TabPane,
  Table,
} from "reactstrap";
import classnames from "classnames";
import CustomerAccountEntryModal from "components/customers/CustomerAccountEntryModal";
import CustomerAccountReturnModal from "components/customers/CustomerAccountReturnModal";
import CustomerAccountDischargeModal from "components/customers/CustomerAccountDischargeModal";
import CustomerAccountChargeDetailModal from "components/customers/CustomerAccountChargeDetailModal";
import {
  ADJUSTMENT_DIFFERENT_ORDER_MESSAGE,
  CHARGE_STATUS_LABELS,
  ENTRY_TYPE_LABELS,
  adjustmentsBlockTarget,
  buildChargePrefill,
  canGenerateOrderCharge,
  chargeRequiresReassignment,
  creditNotesAmount,
  endSingleFlight,
  filterStatementDisplayLines,
  formatAccountMoney,
  formatDueDateLabel,
  amountExceedsOpenBalance,
  formatEstimatedAmount,
  formatReassignedFromNote,
  formatReceivableTargetLabel,
  formatStatementLineAmount,
  getConceptLabel,
  getCreditBadgeStyle,
  getCustomerAccountStatement,
  getDueBadgeStyle,
  getLfSalesDocuments,
  getReceivableDocuments,
  groupStatementLines,
  isChargeLine,
  isOverdueReceivableLine,
  movedCreditTotal,
  splitAccountBalance,
  sumStatementTotals,
  tryBeginSingleFlight,
  voidCustomerAccountEntry,
} from "services/customerAccountService";
import { getTodayYmdGuatemala } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  buildSingleCustomerReportPrintHtml,
  openCustomerAccountReportPrintWindow,
} from "utils/customerAccountReportPrintHtml";

function DocumentRow({ doc, customerId, onCharge, expanded, onToggle }) {
  const partials = doc.partialReleases || [];
  const hasPartials = partials.length > 0;

  return (
    <>
      <tr>
        <td>
          <Badge color={doc.orderKind === "OPC" ? "dark" : "primary"}>{doc.orderKind}</Badge>
        </td>
        <td>{doc.orderCode}</td>
        <td>
          {doc.vendorShipmentNumber || "—"}
          {doc.vendorShipmentVoided && (
            <Badge color="danger" className="ml-1">
              Anulado
            </Badge>
          )}
        </td>
        <td>{CHARGE_STATUS_LABELS[doc.chargeStatus] || doc.chargeStatus || "—"}</td>
        <td>{doc.deliveryDate || doc.startDate || "—"}</td>
        <td className="text-right">{formatEstimatedAmount(doc.estimatedTotal)}</td>
        <td className="text-right">{formatAccountMoney(doc.chargedAmount)}</td>
        <td className="text-right">{formatAccountMoney(doc.balanceDue)}</td>
        <td className="text-right">
          {hasPartials && (
            <Button color="link" size="sm" className="p-0 mr-2" onClick={onToggle}>
              {expanded ? "▾" : "▸"} Parciales
            </Button>
          )}
          {canGenerateOrderCharge(doc, { customerId }) && (
            <Button
              color="primary"
              size="sm"
              outline
              className="btn-round"
              onClick={() => onCharge(buildChargePrefill(doc))}
            >
              Crear cargo
            </Button>
          )}
        </td>
      </tr>
      {hasPartials && expanded && (
        <tr>
          <td colSpan={9} className="p-0">
            <Table size="sm" className="mb-0 bg-light">
              <thead>
                <tr>
                  <th>Parcial</th>
                  <th>Estado cargo</th>
                  <th className="text-right">Estimado</th>
                  <th className="text-right">Cargado</th>
                  <th className="text-right">Saldo</th>
                  <th>Envíos</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {partials.map((pr) => (
                  <tr key={pr.partialReleaseId ?? pr.label}>
                    <td>{pr.label || `#${pr.sequenceNum}`}</td>
                    <td>{CHARGE_STATUS_LABELS[pr.chargeStatus] || pr.chargeStatus || "—"}</td>
                    <td className="text-right">{formatEstimatedAmount(pr.estimatedTotal)}</td>
                    <td className="text-right">{formatAccountMoney(pr.chargedAmount)}</td>
                    <td className="text-right">{formatAccountMoney(pr.balanceDue)}</td>
                    <td>
                      {(pr.shipments || []).map((s) => (
                        <div key={s.productShipmentId} className="small d-flex flex-wrap align-items-center">
                          <span className="mr-2">
                            {s.shipmentNumber} · {CHARGE_STATUS_LABELS[s.chargeStatus] || s.chargeStatus}
                            {` · ${formatEstimatedAmount(s.estimatedTotal)}`}
                            {s.balanceDue != null ? ` · Saldo ${formatAccountMoney(s.balanceDue)}` : ""}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
            </Table>
          </td>
        </tr>
      )}
    </>
  );
}

function CustomerAccountStatement() {
  const { customerId } = useParams();
  const [statement, setStatement] = useState(null);
  const [lfDocuments, setLfDocuments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeTab, setActiveTab] = useState("movements");
  const [docKindTab, setDocKindTab] = useState("ALL");
  const [expandedOrders, setExpandedOrders] = useState({});
  const [entryModalOpen, setEntryModalOpen] = useState(false);
  const [defaultConceptCode, setDefaultConceptCode] = useState("1");
  const [entryPrefillDoc, setEntryPrefillDoc] = useState(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [dischargeModalOpen, setDischargeModalOpen] = useState(false);
  const [chargeDetailOpen, setChargeDetailOpen] = useState(false);
  const [selectedChargeLine, setSelectedChargeLine] = useState(null);
  const [returnPrefillCharge, setReturnPrefillCharge] = useState(null);
  const [dischargePrefillCharge, setDischargePrefillCharge] = useState(null);
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [reassignToChargeId, setReassignToChargeId] = useState("");
  const [voidTargets, setVoidTargets] = useState([]);
  const [voidTargetsLoading, setVoidTargetsLoading] = useState(false);
  const [showVoided, setShowVoided] = useState(false);
  const voidGate = useRef(false);
  const selectedChargeIdRef = useRef(null);

  const load = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    setError("");
    try {
      const [stmt, docs] = await Promise.all([
        getCustomerAccountStatement(customerId, {
          from: fromDate || undefined,
          to: toDate || undefined,
        }),
        getLfSalesDocuments(customerId, { withBalance: true }),
      ]);
      setStatement(stmt);
      setLfDocuments(Array.isArray(docs) ? docs : []);
      const selectedId = selectedChargeIdRef.current;
      if (selectedId != null) {
        const grouped = groupStatementLines(stmt?.lines || [], stmt?.openingBalance);
        const next = grouped.displayLines.find((line) => String(line.id) === String(selectedId));
        setSelectedChargeLine(next || null);
        if (!next) setChargeDetailOpen(false);
      }
    } catch (err) {
      setError(err.message || "Error al cargar estado de cuenta");
    } finally {
      setLoading(false);
    }
  }, [customerId, fromDate, toDate]);

  useEffect(() => {
    load();
  }, [load]);

  const customerInfo = useMemo(
    () => ({
      customerName: statement?.customerName,
      legacyCode: statement?.legacyCode,
      name: statement?.customerName,
    }),
    [statement]
  );

  const filteredDocuments = useMemo(() => {
    if (docKindTab === "ALL") return lfDocuments;
    return lfDocuments.filter((d) => d.orderKind === docKindTab);
  }, [lfDocuments, docKindTab]);

  const openEntryModal = (conceptCode, doc = null) => {
    setDefaultConceptCode(conceptCode);
    setEntryPrefillDoc(doc);
    setEntryModalOpen(true);
  };

  const needsReassignment = chargeRequiresReassignment(voidTarget);
  const movedTotal = needsReassignment ? movedCreditTotal(voidTarget) : 0;
  const reassignTarget = voidTargets.find((doc) => String(doc.chargeEntryId) === String(reassignToChargeId)) || null;
  const adjustmentsBlocked = needsReassignment && adjustmentsBlockTarget(voidTarget, reassignTarget);
  const balanceWarning =
    needsReassignment &&
    reassignTarget &&
    amountExceedsOpenBalance(movedTotal, reassignTarget.balanceDue);

  useEffect(() => {
    if (!voidModalOpen || !needsReassignment || !customerId) {
      setVoidTargets([]);
      setVoidTargetsLoading(false);
      return undefined;
    }
    let cancelled = false;
    setVoidTargetsLoading(true);
    getReceivableDocuments(customerId)
      .then((docs) => {
        if (cancelled) return;
        const rows = (Array.isArray(docs) ? docs : []).filter(
          (doc) => String(doc.chargeEntryId) !== String(voidTarget?.id)
        );
        setVoidTargets(rows);
      })
      .catch((err) => {
        if (!cancelled) {
          setVoidTargets([]);
          showError(err.message || "No se pudieron cargar los cargos destino");
        }
      })
      .finally(() => {
        if (!cancelled) setVoidTargetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [voidModalOpen, needsReassignment, customerId, voidTarget]);

  const openVoid = (line) => {
    setVoidTarget(line);
    setVoidReason("");
    setReassignToChargeId("");
    setVoidModalOpen(true);
  };

  const handleVoid = async () => {
    if (voidGate.current) return;
    if (!voidTarget?.id || !voidReason.trim()) {
      showError("Indique el motivo de anulación.");
      return;
    }
    if (needsReassignment && !reassignToChargeId) {
      showError("Seleccione el cargo al que se mueven los pagos y abonos.");
      return;
    }
    if (adjustmentsBlocked) {
      showError(ADJUSTMENT_DIFFERENT_ORDER_MESSAGE);
      return;
    }
    const requestId = tryBeginSingleFlight(voidGate);
    if (!requestId) return;
    setVoiding(true);
    try {
      await voidCustomerAccountEntry(voidTarget.id, voidReason.trim(), {
        requestId,
        reassignToChargeId: needsReassignment ? reassignToChargeId : undefined,
      });
      showSuccess("Movimiento anulado.");
      setVoidModalOpen(false);
      setVoidTarget(null);
      setVoidReason("");
      setReassignToChargeId("");
      load();
    } catch (err) {
      showError(err.message || "No se pudo anular");
    } finally {
      endSingleFlight(voidGate);
      setVoiding(false);
    }
  };

  const closingDue =
    Number(statement?.closingBalanceDue ?? splitAccountBalance(statement?.closingBalance).balanceDue) || 0;
  const closingCredit =
    Number(statement?.closingCreditBalance ?? splitAccountBalance(statement?.closingBalance).creditBalance) || 0;
  const closingDueOpv = Number(statement?.closingBalanceDueOpv) || 0;
  const closingDueOpc = Number(statement?.closingBalanceDueOpc) || 0;
  const lines = statement?.lines || [];
  const movementTotals = useMemo(() => sumStatementTotals(lines), [lines]);
  const { displayLines } = useMemo(
    () => groupStatementLines(lines, statement?.openingBalance),
    [lines, statement?.openingBalance]
  );
  const visibleLines = useMemo(
    () => filterStatementDisplayLines(displayLines, { showVoided }),
    [displayLines, showVoided]
  );

  const openChargeDetail = (line) => {
    selectedChargeIdRef.current = line?.id ?? null;
    setSelectedChargeLine(line);
    setChargeDetailOpen(true);
  };

  const openAdjustForCharge = (chargeLine) => {
    setChargeDetailOpen(false);
    openEntryModal("2", { appliedToEntryId: chargeLine.id });
  };

  const today = getTodayYmdGuatemala();

  const openDischargeForCharge = (chargeLine) => {
    setChargeDetailOpen(false);
    setDischargePrefillCharge(chargeLine);
    setDischargeModalOpen(true);
  };

  const openDiscountReturnForCharge = (chargeLine) => {
    setChargeDetailOpen(false);
    setReturnPrefillCharge(chargeLine);
    setReturnModalOpen(true);
  };

  const handlePrint = () => {
    if (!statement) return;
    const enriched = {
      ...statement,
      closingBalanceDue: closingDue,
      closingCreditBalance: closingCredit,
    };
    const html = buildSingleCustomerReportPrintHtml(enriched, lines, lfDocuments.length);
    if (!openCustomerAccountReportPrintWindow(html)) {
      showError("No se pudo abrir la ventana de impresión. Verifique el bloqueador de ventanas.");
    }
  };

  return (
    <div className="content">
      <Row className="mb-2">
        <Col>
          <Link to="/admin/customer-accounts" className="text-muted">
            ← Volver a cuentas por cobrar
          </Link>
        </Col>
      </Row>

      <Row>
        <Col md="12">
          <Card>
            <CardHeader>
              <Row className="align-items-center">
                <Col md="8">
                  <CardTitle tag="h4">{statement?.customerName || "Estado de cuenta"}</CardTitle>
                  <div className="text-muted" style={{ fontSize: "0.9rem" }}>
                    {statement?.legacyCode && (
                      <span>
                        Clave: <code>{statement.legacyCode}</code> ·{" "}
                      </span>
                    )}
                    {statement?.nit && <span>NIT: {statement.nit} · </span>}
                    {statement?.phone && <span>Tel: {statement.phone} · </span>}
                    Vendedor: Luis Felipe Argueta
                  </div>
                </Col>
                <Col md="4" className="text-right">
                  <div className="mb-2">
                    <div className="mb-1">
                      <span className="text-muted mr-2">Saldo por cobrar</span>
                      <span style={getDueBadgeStyle(closingDue)}>{formatAccountMoney(closingDue)}</span>
                    </div>
                    <div className="mb-1">
                      <span className="text-muted mr-2">OPV</span>
                      <span style={getDueBadgeStyle(closingDueOpv)}>{formatAccountMoney(closingDueOpv)}</span>
                      <span className="text-muted ml-2 mr-2">OPC</span>
                      <span style={getDueBadgeStyle(closingDueOpc)}>{formatAccountMoney(closingDueOpc)}</span>
                    </div>
                    <div>
                      <span className="text-muted mr-2">Crédito a favor</span>
                      <span style={getCreditBadgeStyle(closingCredit)}>{formatAccountMoney(closingCredit)}</span>
                    </div>
                  </div>
                  <Button color="primary" size="sm" className="btn-round mr-1" onClick={() => openEntryModal("1")}>
                    Nuevo movimiento
                  </Button>
                  <Button color="success" size="sm" className="btn-round mr-1" onClick={() => {
                    setDischargePrefillCharge(null);
                    setDischargeModalOpen(true);
                  }}>
                    Descarga (11)
                  </Button>
                  <Button color="warning" size="sm" className="btn-round mr-1" onClick={() => {
                    setReturnPrefillCharge(null);
                    setReturnModalOpen(true);
                  }}>
                    Descuento / Devolución
                  </Button>
                  <Button color="info" size="sm" className="btn-round" onClick={handlePrint} disabled={!statement}>
                    <i className="nc-icon nc-paper" /> Imprimir
                  </Button>
                </Col>
              </Row>
            </CardHeader>
            <CardBody>
              {error && <Alert color="danger">{error}</Alert>}

              <Row className="mb-3">
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Desde</Label>
                    <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3">
                  <FormGroup className="mb-md-0">
                    <Label>Hasta</Label>
                    <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                  </FormGroup>
                </Col>
                <Col md="3" className="d-flex align-items-end">
                  <Button color="secondary" size="sm" onClick={load} disabled={loading}>
                    Aplicar filtro
                  </Button>
                </Col>
              </Row>

              {statement && (
                <Row className="mb-3">
                  <Col md="2">
                    <small className="text-muted d-block">Saldo inicial</small>
                    <strong>{formatAccountMoney(statement.openingBalance)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Por cobrar OPV</small>
                    <strong style={{ color: "#e67e22" }}>{formatAccountMoney(closingDueOpv)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Por cobrar OPC</small>
                    <strong style={{ color: "#e67e22" }}>{formatAccountMoney(closingDueOpc)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Cargos</small>
                    <strong>{formatAccountMoney(movementTotals.totalCharges)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Ajustes (envío)</small>
                    <strong>{formatAccountMoney(movementTotals.totalAdjustments)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Pagos</small>
                    <strong>{formatAccountMoney(movementTotals.totalPayments)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Notas de crédito</small>
                    <strong>{formatAccountMoney(creditNotesAmount(statement.totalCreditNotes))}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Descuentos</small>
                    <strong>{formatAccountMoney(movementTotals.totalDiscounts)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Devoluciones</small>
                    <strong>{formatAccountMoney(movementTotals.totalReturns)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Saldo</small>
                    <strong>
                      {formatAccountMoney(
                        statement.closingBalance != null ? statement.closingBalance : statement.closingBalanceDue
                      )}
                    </strong>
                  </Col>
                </Row>
              )}

              <Nav tabs className="mb-3">
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "movements" })}
                    onClick={() => setActiveTab("movements")}
                    style={{ cursor: "pointer" }}
                  >
                    Movimientos
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={classnames({ active: activeTab === "documents" })}
                    onClick={() => setActiveTab("documents")}
                    style={{ cursor: "pointer" }}
                  >
                    Documentos OPV / OPC
                  </NavLink>
                </NavItem>
              </Nav>

              <TabContent activeTab={activeTab}>
                <TabPane tabId="movements">
                  <div className="d-flex flex-wrap align-items-center justify-content-between mb-2">
                    <p className="text-muted small mb-0 mr-3">
                      Solo se listan las <strong>Facturas</strong>. Pagos, abonos, notas de crédito, descargas y devoluciones del envío se ven con <strong>Ver detalle</strong>.
                      Los anulados no entran en los totales.
                    </p>
                    <FormGroup check className="mb-0">
                      <Label check>
                        <Input
                          type="checkbox"
                          checked={showVoided}
                          onChange={(e) => setShowVoided(e.target.checked)}
                        />
                        <span className="form-check-sign" />
                        Mostrar anulados
                      </Label>
                    </FormGroup>
                  </div>
                  {loading ? (
                    <div className="text-center py-4">Cargando...</div>
                  ) : visibleLines.length === 0 ? (
                    <Alert color="info">
                      {displayLines.length > 0
                        ? "No hay movimientos activos en el período. Active «Mostrar anulados» para verlos."
                        : "No hay movimientos en el período seleccionado."}
                    </Alert>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>Fecha</th>
                          <th>Concepto</th>
                          <th>Tipo</th>
                          <th>Recibo</th>
                          <th>No. Fact</th>
                          <th>Documento</th>
                          <th className="text-right">Débito</th>
                          <th className="text-right">Crédito</th>
                          <th className="text-right">Saldo</th>
                          <th>Vencimiento</th>
                          <th className="text-right">Crédito aplicado</th>
                          <th className="text-right">Saldo de línea</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLines.map((line) => {
                          const movedNote = formatReassignedFromNote(line, lines);
                          const showAging = line.entryType === "CHARGE" || line.entryType === "CHARGE_ADJUSTMENT";
                          const adjustments = (line.childEntries || []).filter(
                            (child) =>
                              child.entryType === "CHARGE_ADJUSTMENT" && (showVoided || child.status !== "VOID")
                          );
                          return (
                            <React.Fragment key={line.id}>
                              <tr className={isOverdueReceivableLine(line, today) ? "table-danger" : undefined}>
                                <td>{line.entryDate}</td>
                                <td>
                                  {getConceptLabel(line.movementConceptCode)}
                                  {movedNote && <div className="small text-muted">{movedNote}</div>}
                                </td>
                                <td>{ENTRY_TYPE_LABELS[line.entryType] || line.entryType}</td>
                                <td>{line.receiptNumber || line.reference || "—"}</td>
                                <td>{line.invoiceNumber || line.vendorShipmentNumber || "—"}</td>
                                <td>
                                  {line.documentNumber || line.productionOrderCode || "—"}
                                  {line.orderKind ? ` (${line.orderKind})` : ""}
                                  {isChargeLine(line) && line.childCount > 0 && (
                                    <Badge color="info" className="ml-1" style={{ fontSize: 10 }}>
                                      {line.childCount} liq.
                                    </Badge>
                                  )}
                                </td>
                                <td className="text-right">
                                  {Number(line.debit) > 0 ? formatAccountMoney(line.debit) : "—"}
                                </td>
                                <td className="text-right">
                                  {Number(line.credit) > 0 ? formatAccountMoney(line.credit) : "—"}
                                </td>
                                <td className="text-right">
                                  {line.runningBalance != null ? formatAccountMoney(line.runningBalance) : "—"}
                                  {isChargeLine(line) && line.chargeBalanceDue != null && Number(line.chargeBalanceDue) > 0 && (
                                    <div className="small text-muted">
                                      Pend. {formatAccountMoney(line.chargeBalanceDue)}
                                    </div>
                                  )}
                                </td>
                                <td>{showAging ? formatDueDateLabel(line.dueDate) : "—"}</td>
                                <td className="text-right">
                                  {showAging ? formatStatementLineAmount(line.allocatedCredit) : "—"}
                                </td>
                                <td className="text-right">
                                  {showAging ? formatStatementLineAmount(line.lineOpenBalance) : "—"}
                                </td>
                                <td className="text-right text-nowrap">
                                  {isChargeLine(line) && (
                                    <Button
                                      color="info"
                                      size="sm"
                                      outline
                                      className="btn-round mr-1"
                                      onClick={() => openChargeDetail(line)}
                                    >
                                      Ver detalle
                                    </Button>
                                  )}
                                  {isChargeLine(line) && line.status === "ACTIVE" && (
                                    <Button
                                      color="secondary"
                                      size="sm"
                                      outline
                                      className="btn-round mr-1"
                                      onClick={() => openAdjustForCharge(line)}
                                    >
                                      Ajustar
                                    </Button>
                                  )}
                                  {line.status === "ACTIVE" && (
                                    <Button
                                      color="danger"
                                      size="sm"
                                      outline
                                      className="btn-round"
                                      onClick={() => openVoid(line)}
                                    >
                                      Anular
                                    </Button>
                                  )}
                                  {line.status === "VOID" && <Badge color="secondary">Anulado</Badge>}
                                </td>
                              </tr>
                              {adjustments.map((adj) => {
                                const adjNote = formatReassignedFromNote(adj, lines);
                                return (
                                  <tr
                                    key={adj.id}
                                    className={isOverdueReceivableLine(adj, today) ? "table-danger" : undefined}
                                  >
                                    <td className="pl-4">{adj.entryDate}</td>
                                    <td>
                                      Ajuste de envío
                                      {adjNote && <div className="small text-muted">{adjNote}</div>}
                                    </td>
                                    <td>{ENTRY_TYPE_LABELS.CHARGE_ADJUSTMENT}</td>
                                    <td>{adj.reference || "—"}</td>
                                    <td>{adj.invoiceNumber || adj.vendorShipmentNumber || "—"}</td>
                                    <td>{adj.documentNumber || adj.productionOrderCode || "—"}</td>
                                    <td className="text-right">
                                      {Number(adj.debit) > 0 ? formatAccountMoney(adj.debit) : "—"}
                                    </td>
                                    <td className="text-right">—</td>
                                    <td className="text-right">
                                      {adj.runningBalance != null ? formatAccountMoney(adj.runningBalance) : "—"}
                                    </td>
                                    <td>{formatDueDateLabel(adj.dueDate)}</td>
                                    <td className="text-right">{formatStatementLineAmount(adj.allocatedCredit)}</td>
                                    <td className="text-right">{formatStatementLineAmount(adj.lineOpenBalance)}</td>
                                    <td className="text-right">
                                      {adj.status === "ACTIVE" && (
                                        <Button
                                          color="danger"
                                          size="sm"
                                          outline
                                          className="btn-round"
                                          onClick={() => openVoid(adj)}
                                        >
                                          Anular
                                        </Button>
                                      )}
                                      {adj.status === "VOID" && <Badge color="secondary">Anulado</Badge>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </Table>
                  )}
                </TabPane>

                <TabPane tabId="documents">
                  <Nav pills className="mb-3">
                    {["ALL", "OPV", "OPC"].map((kind) => (
                      <NavItem key={kind}>
                        <NavLink
                          className={classnames({ active: docKindTab === kind })}
                          onClick={() => setDocKindTab(kind)}
                          style={{ cursor: "pointer" }}
                        >
                          {kind === "ALL" ? "Todos" : kind}
                        </NavLink>
                      </NavItem>
                    ))}
                  </Nav>

                  {filteredDocuments.length === 0 ? (
                    <Alert color="info">Este cliente no tiene órdenes OPV u OPC de Luis Felipe.</Alert>
                  ) : (
                    <Table responsive>
                      <thead className="text-primary">
                        <tr>
                          <th>Tipo</th>
                          <th>Orden</th>
                          <th>ENVP</th>
                          <th>Estado cargo</th>
                          <th>Fecha</th>
                          <th className="text-right">Estimado</th>
                          <th className="text-right">Cargado</th>
                          <th className="text-right">Saldo</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDocuments.map((doc) => (
                          <DocumentRow
                            key={doc.productionOrderId}
                            doc={doc}
                            customerId={customerId}
                            expanded={expandedOrders[doc.productionOrderId]}
                            onToggle={() =>
                              setExpandedOrders((prev) => ({
                                ...prev,
                                [doc.productionOrderId]: !prev[doc.productionOrderId],
                              }))
                            }
                            onCharge={(prefill) => openEntryModal("1", prefill)}
                          />
                        ))}
                      </tbody>
                    </Table>
                  )}
                  <p className="text-muted small mb-0">
                    Los cargos se registran manualmente. Las descargas, descuentos y devoluciones se ven dentro de cada cargo con &quot;Ver detalle&quot;.
                  </p>
                </TabPane>
              </TabContent>
            </CardBody>
          </Card>
        </Col>
      </Row>

      <CustomerAccountEntryModal
        isOpen={entryModalOpen}
        toggle={() => {
          setEntryModalOpen(false);
          setEntryPrefillDoc(null);
        }}
        customerId={Number(customerId)}
        customerInfo={customerInfo}
        defaultConceptCode={defaultConceptCode}
        initialDoc={entryPrefillDoc}
        lfDocuments={lfDocuments}
        onSaved={() => {
          showSuccess("Movimiento registrado.");
          load();
        }}
      />

      <CustomerAccountReturnModal
        isOpen={returnModalOpen}
        toggle={() => {
          setReturnModalOpen(false);
          setReturnPrefillCharge(null);
        }}
        customerId={Number(customerId)}
        customerInfo={customerInfo}
        initialCharge={returnPrefillCharge}
        onSaved={() => {
          showSuccess("Movimiento registrado.");
          load();
        }}
      />

      <CustomerAccountDischargeModal
        isOpen={dischargeModalOpen}
        toggle={() => {
          setDischargeModalOpen(false);
          setDischargePrefillCharge(null);
        }}
        customerId={Number(customerId)}
        customerInfo={customerInfo}
        initialCharge={dischargePrefillCharge}
        onSaved={() => {
          showSuccess("Descarga registrada.");
          load();
        }}
      />

      <CustomerAccountChargeDetailModal
        isOpen={chargeDetailOpen}
        toggle={() => {
          selectedChargeIdRef.current = null;
          setChargeDetailOpen(false);
          setSelectedChargeLine(null);
        }}
        chargeLine={selectedChargeLine}
        customerId={Number(customerId)}
        knownLines={lines}
        onDischarge={openDischargeForCharge}
        onDiscountReturn={openDiscountReturnForCharge}
        onAdjust={openAdjustForCharge}
        onChanged={load}
        onVoidChild={(child) => {
          setChargeDetailOpen(false);
          openVoid(child);
        }}
      />

      <Modal isOpen={voidModalOpen} toggle={() => setVoidModalOpen(false)}>
        <ModalHeader toggle={() => setVoidModalOpen(false)}>Anular movimiento</ModalHeader>
        <ModalBody>
          <p>
            {voidTarget &&
              `${ENTRY_TYPE_LABELS[voidTarget.entryType] || voidTarget.entryType} — ${voidTarget.entryDate}`}
          </p>
          {needsReassignment && (
            <>
              <Alert color="info" className="py-2">
                Total a mover: <strong>{formatAccountMoney(movedTotal)}</strong>
              </Alert>
              <FormGroup>
                <Label>Mover pagos/abonos a *</Label>
                <Input
                  type="select"
                  value={reassignToChargeId}
                  onChange={(e) => setReassignToChargeId(e.target.value)}
                  disabled={voidTargetsLoading || voiding}
                >
                  <option value="">— Seleccione un cargo —</option>
                  {voidTargets.map((doc) => (
                    <option key={doc.chargeEntryId} value={doc.chargeEntryId}>
                      {formatReceivableTargetLabel(doc)}
                    </option>
                  ))}
                </Input>
                {voidTargetsLoading && <small className="text-muted">Cargando cargos...</small>}
                {!voidTargetsLoading && voidTargets.length === 0 && (
                  <small className="text-muted">No hay otro cargo activo con saldo para este cliente.</small>
                )}
              </FormGroup>
              {balanceWarning && (
                <Alert color="warning" className="py-2">
                  El total a mover ({formatAccountMoney(movedTotal)}) supera el saldo del cargo destino (
                  {formatAccountMoney(reassignTarget.balanceDue)}). El servidor puede rechazar el movimiento.
                </Alert>
              )}
              {adjustmentsBlocked && <Alert color="warning">{ADJUSTMENT_DIFFERENT_ORDER_MESSAGE}</Alert>}
            </>
          )}
          <FormGroup>
            <Label>Motivo</Label>
            <Input type="textarea" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setVoidModalOpen(false)} disabled={voiding}>
            Cancelar
          </Button>
          <Button
            color="danger"
            onClick={handleVoid}
            disabled={voiding || (needsReassignment && !reassignToChargeId) || adjustmentsBlocked}
          >
            {voiding ? "Anulando..." : "Confirmar anulación"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default CustomerAccountStatement;
