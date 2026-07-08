import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import {
  CHARGE_STATUS_LABELS,
  ENTRY_TYPE_LABELS,
  formatAccountMoney,
  getConceptLabel,
  getCreditBadgeStyle,
  getCustomerAccountStatement,
  getDueBadgeStyle,
  getLfSalesDocuments,
  splitAccountBalance,
  voidCustomerAccountEntry,
} from "services/customerAccountService";
import { showError, showSuccess } from "utils/notificationHelper";
import {
  buildSingleCustomerReportPrintHtml,
  openCustomerAccountReportPrintWindow,
} from "utils/customerAccountReportPrintHtml";

function buildChargePrefill(doc, partial = null, shipment = null) {
  if (shipment) {
    return {
      productionOrderId: doc.productionOrderId,
      orderCode: doc.orderCode,
      orderKind: doc.orderKind,
      vendorShipmentNumber: doc.vendorShipmentNumber,
      partialReleaseId: partial?.partialReleaseId ?? null,
      productShipmentId: shipment.productShipmentId,
      shipmentNumber: shipment.shipmentNumber,
      estimatedTotal: shipment.estimatedTotal ?? partial?.estimatedTotal ?? doc.estimatedTotal,
    };
  }

  const unchargedShipments = [];
  (doc.partialReleases || []).forEach((pr) => {
    (pr.shipments || []).forEach((s) => {
      if (s.chargeStatus === "NONE" || !s.chargeEntryId) {
        unchargedShipments.push({ partial: pr, shipment: s });
      }
    });
  });

  if (unchargedShipments.length === 1) {
    const { partial, shipment: s } = unchargedShipments[0];
    return buildChargePrefill(doc, partial, s);
  }

  return {
    productionOrderId: doc.productionOrderId,
    orderCode: doc.orderCode,
    orderKind: doc.orderKind,
    vendorShipmentNumber: doc.vendorShipmentNumber,
    estimatedTotal: doc.estimatedTotal,
  };
}

function DocumentRow({ doc, onCharge, expanded, onToggle }) {
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
        <td className="text-right">{formatAccountMoney(doc.estimatedTotal)}</td>
        <td className="text-right">{formatAccountMoney(doc.chargedAmount)}</td>
        <td className="text-right">{formatAccountMoney(doc.balanceDue)}</td>
        <td className="text-right">
          {hasPartials && (
            <Button color="link" size="sm" className="p-0 mr-2" onClick={onToggle}>
              {expanded ? "▾" : "▸"} Parciales
            </Button>
          )}
          <Button
            color="primary"
            size="sm"
            outline
            className="btn-round"
            onClick={() => onCharge(buildChargePrefill(doc))}
          >
            Crear cargo
          </Button>
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
                    <td className="text-right">{formatAccountMoney(pr.estimatedTotal)}</td>
                    <td className="text-right">{formatAccountMoney(pr.chargedAmount)}</td>
                    <td className="text-right">{formatAccountMoney(pr.balanceDue)}</td>
                    <td>
                      {(pr.shipments || []).map((s) => (
                        <div key={s.productShipmentId} className="small d-flex flex-wrap align-items-center">
                          <span className="mr-2">
                            {s.shipmentNumber} · {CHARGE_STATUS_LABELS[s.chargeStatus] || s.chargeStatus}
                            {s.estimatedTotal != null ? ` · Est. ${formatAccountMoney(s.estimatedTotal)}` : ""}
                            {s.balanceDue != null ? ` · Saldo ${formatAccountMoney(s.balanceDue)}` : ""}
                          </span>
                          {(s.chargeStatus === "NONE" || !s.chargeEntryId) && (
                            <Button
                              color="success"
                              size="sm"
                              className="btn-round py-0 px-2"
                              onClick={() => onCharge(buildChargePrefill(doc, pr, s))}
                            >
                              Cargo
                            </Button>
                          )}
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
  const [voidModalOpen, setVoidModalOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");
  const [voiding, setVoiding] = useState(false);

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

  const handleVoid = async () => {
    if (!voidTarget?.id || !voidReason.trim()) {
      showError("Indique el motivo de anulación.");
      return;
    }
    setVoiding(true);
    try {
      await voidCustomerAccountEntry(voidTarget.id, voidReason.trim());
      showSuccess("Movimiento anulado.");
      setVoidModalOpen(false);
      setVoidTarget(null);
      setVoidReason("");
      load();
    } catch (err) {
      showError(err.message || "No se pudo anular");
    } finally {
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
                  <Button color="success" size="sm" className="btn-round mr-1" onClick={() => openEntryModal("11")}>
                    Descarga (11)
                  </Button>
                  <Button color="warning" size="sm" className="btn-round mr-1" onClick={() => setReturnModalOpen(true)}>
                    Devolución / Descuento
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
                    <strong>{formatAccountMoney(statement.totalCharges)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Pagos</small>
                    <strong>{formatAccountMoney(statement.totalPayments)}</strong>
                  </Col>
                  <Col md="2">
                    <small className="text-muted d-block">Devoluciones</small>
                    <strong>{formatAccountMoney(statement.totalReturns)}</strong>
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
                  {loading ? (
                    <div className="text-center py-4">Cargando...</div>
                  ) : lines.length === 0 ? (
                    <Alert color="info">No hay movimientos en el período seleccionado.</Alert>
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
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={line.id}>
                            <td>{line.entryDate}</td>
                            <td>{getConceptLabel(line.movementConceptCode)}</td>
                            <td>{ENTRY_TYPE_LABELS[line.entryType] || line.entryType}</td>
                            <td>{line.receiptNumber || line.reference || "—"}</td>
                            <td>{line.invoiceNumber || line.vendorShipmentNumber || "—"}</td>
                            <td>
                              {line.documentNumber || line.productionOrderCode || "—"}
                              {line.orderKind ? ` (${line.orderKind})` : ""}
                            </td>
                            <td className="text-right">
                              {Number(line.debit) > 0 ? formatAccountMoney(line.debit) : "—"}
                            </td>
                            <td className="text-right">
                              {Number(line.credit) > 0 ? formatAccountMoney(line.credit) : "—"}
                            </td>
                            <td className="text-right">
                              {line.runningBalance != null ? formatAccountMoney(line.runningBalance) : "—"}
                            </td>
                            <td className="text-right">
                              {line.status === "ACTIVE" && (
                                <Button
                                  color="danger"
                                  size="sm"
                                  outline
                                  className="btn-round"
                                  onClick={() => {
                                    setVoidTarget(line);
                                    setVoidReason("");
                                    setVoidModalOpen(true);
                                  }}
                                >
                                  Anular
                                </Button>
                              )}
                              {line.status === "VOID" && <Badge color="secondary">Anulado</Badge>}
                            </td>
                          </tr>
                        ))}
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
                    Los cargos se registran manualmente. Use concepto 11 para descargar lo cobrado al cliente.
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
        toggle={() => setReturnModalOpen(false)}
        customerId={Number(customerId)}
        customerInfo={customerInfo}
        onSaved={() => {
          showSuccess("Liquidación registrada.");
          load();
        }}
      />

      <Modal isOpen={voidModalOpen} toggle={() => setVoidModalOpen(false)}>
        <ModalHeader toggle={() => setVoidModalOpen(false)}>Anular movimiento</ModalHeader>
        <ModalBody>
          <p>
            {voidTarget &&
              `${ENTRY_TYPE_LABELS[voidTarget.entryType] || voidTarget.entryType} — ${voidTarget.entryDate}`}
          </p>
          <FormGroup>
            <Label>Motivo</Label>
            <Input type="textarea" rows={3} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
          </FormGroup>
        </ModalBody>
        <ModalFooter>
          <Button color="secondary" onClick={() => setVoidModalOpen(false)} disabled={voiding}>
            Cancelar
          </Button>
          <Button color="danger" onClick={handleVoid} disabled={voiding}>
            {voiding ? "Anulando..." : "Confirmar anulación"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

export default CustomerAccountStatement;
