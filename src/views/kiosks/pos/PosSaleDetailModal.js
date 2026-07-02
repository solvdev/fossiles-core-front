import React, { useEffect, useState } from "react";
import {
  Badge,
  Button,
  Input,
  Label,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  Spinner,
  Table,
  Alert,
} from "reactstrap";
import { registerDepositSlip, updateKioskSalePayment, voidKioskSale } from "services/kioskPosService";
import { formatDateTimeGt } from "utils/dateTimeHelper";
import { downloadTaxInvoiceCertifiedXml, openFelInvoiceReport } from "services/taxInvoiceService";
import EditTaxInvoiceFelModal from "components/accounting/EditTaxInvoiceFelModal";
import { useAuth } from "contexts/AuthContext";
import { canEditTaxInvoiceFel } from "utils/taxInvoiceEditHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatCurrency, formatQty, isDepositApplicable, isSalePendingDeposit } from "./posUtils";

const formatDateTime = (value) => formatDateTimeGt(value);

const paymentLabel = (method) => {
  const normalized = String(method || "").toUpperCase();
  const map = {
    EFECTIVO: "Efectivo",
    TARJETA: "Tarjeta",
    MIXTO: "Mixto",
    TRANSFERENCIA: "Transferencia (legacy)",
  };
  return map[normalized] || method || "—";
};

const felStatusBadge = (status) => {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "CERTIFIED") return <Badge color="success">Certificada</Badge>;
  if (normalized === "FAILED") return <Badge color="danger">Error FEL</Badge>;
  if (normalized === "PENDING") return <Badge color="warning">Pendiente</Badge>;
  if (!normalized) return <Badge color="secondary">Sin FEL</Badge>;
  return <Badge color="info">{status}</Badge>;
};

function PosSaleDetailModal({
  isOpen,
  onClose,
  sale,
  loading,
  cashSession,
  cashSessionOpen,
  kioskLocationId,
  onSaleUpdated,
}) {
  const { hasRole, hasAnyRole, hasPermission } = useAuth();
  const canEditFel = canEditTaxInvoiceFel({ hasRole, hasAnyRole, hasPermission });
  const [downloadingXml, setDownloadingXml] = useState(false);
  const [felEditOpen, setFelEditOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("EFECTIVO");
  const [amountReceived, setAmountReceived] = useState("");
  const [cashAmount, setCashAmount] = useState("");
  const [cardAmount, setCardAmount] = useState("");
  const [cardAuthNumber, setCardAuthNumber] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [voidReason, setVoidReason] = useState("");
  const [voidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [depositSlipNumber, setDepositSlipNumber] = useState("");
  const [savingDeposit, setSavingDeposit] = useState(false);

  useEffect(() => {
    if (!sale) return;
    setPaymentMethod(String(sale.paymentMethod || "EFECTIVO").toUpperCase());
    setAmountReceived(sale.amountReceived != null ? String(sale.amountReceived) : "");
    setCashAmount(sale.cashAmount != null ? String(sale.cashAmount) : "");
    setCardAmount(sale.cardAmount != null ? String(sale.cardAmount) : "");
    setCardAuthNumber(sale.cardAuthNumber || "");
    setCardLast4(sale.cardLast4 || "");
    setDepositSlipNumber(sale.depositSlipNumber || "");
    setEditingPayment(false);
  }, [sale?.id, sale?.paymentMethod, sale?.depositSlipNumber]);

  if (!isOpen) return null;

  const isVoid = String(sale?.status || "").toUpperCase() === "VOID";
  const canEditPayment =
    Boolean(cashSessionOpen) &&
    !isVoid &&
    String(sale?.status || "").toUpperCase() === "COMPLETED";
  const canVoidSale =
    Boolean(cashSessionOpen) &&
    !isVoid &&
    String(sale?.status || "").toUpperCase() === "COMPLETED" &&
    (sale?.cashSessionId == null ||
      Number(sale.cashSessionId) === Number(cashSession?.id));
  const depositApplicable = isDepositApplicable(sale);
  const pendingDeposit = isSalePendingDeposit(sale);
  const requiresCardData =
    paymentMethod === "TARJETA" || (paymentMethod === "MIXTO" && Number(cardAmount || 0) > 0);
  const cardDataIncomplete =
    requiresCardData && (!cardAuthNumber.trim() || !/^\d{4}$/.test(cardLast4.trim()));

  const handleRegisterDeposit = async () => {
    if (!sale?.id || !depositSlipNumber.trim()) {
      showError("Indica el número de boleta de depósito.");
      return;
    }
    try {
      setSavingDeposit(true);
      const updated = await registerDepositSlip(
        sale.id,
        { depositSlipNumber: depositSlipNumber.trim() },
        kioskLocationId ? Number(kioskLocationId) : undefined
      );
      showSuccess("Boleta de depósito registrada.");
      if (onSaleUpdated) onSaleUpdated(updated);
    } catch (err) {
      showError(err.message || "No se pudo registrar la boleta de depósito.");
    } finally {
      setSavingDeposit(false);
    }
  };

  const invoice = sale?.invoice || null;
  const felStatus = invoice?.status || sale?.felStatus;
  const felUuid = invoice?.felUuid || sale?.felUuid;
  const felSerie = invoice?.felSerie || sale?.felSerie;
  const felNumero = invoice?.felNumero || sale?.felNumero;
  const felError = invoice?.felError || sale?.felError;
  const canDownloadXml = felStatus === "CERTIFIED" && invoice?.hasCertifiedXml && invoice?.id;
  const canDownloadFelReport = Boolean(felUuid);

  const handleDownloadFelReport = () => {
    try {
      openFelInvoiceReport(felUuid);
    } catch (err) {
      showError(err.message || "No se pudo abrir la factura FEL.");
    }
  };

  const handleDownloadXml = async () => {
    if (!invoice?.id) return;
    try {
      setDownloadingXml(true);
      await downloadTaxInvoiceCertifiedXml(invoice.id);
    } catch (err) {
      showError(err.message || "No se pudo descargar el XML certificado.");
    } finally {
      setDownloadingXml(false);
    }
  };

  const handleSavePayment = async () => {
    if (!sale?.id) return;
    if (cardDataIncomplete) {
      showError("Indica autorización y últimos 4 dígitos de la tarjeta.");
      return;
    }
    try {
      setSavingPayment(true);
      const updated = await updateKioskSalePayment(
        sale.id,
        {
          paymentMethod,
          amountReceived: amountReceived !== "" ? Number(amountReceived) : null,
          cashAmount: cashAmount !== "" ? Number(cashAmount) : null,
          cardAmount: cardAmount !== "" ? Number(cardAmount) : null,
          cardAuthNumber: requiresCardData ? cardAuthNumber.trim() : null,
          cardLast4: requiresCardData ? cardLast4.trim() : null,
        },
        kioskLocationId ? Number(kioskLocationId) : undefined
      );
      showSuccess("Forma de pago actualizada.");
      setEditingPayment(false);
      if (onSaleUpdated) onSaleUpdated(updated);
    } catch (err) {
      showError(err.message || "No se pudo corregir el pago.");
    } finally {
      setSavingPayment(false);
    }
  };

  const handleVoidSale = async () => {
    if (!sale?.id || !voidReason.trim()) {
      showError("Indica el motivo de anulación.");
      return;
    }
    try {
      setVoiding(true);
      const updated = await voidKioskSale(
        sale.id,
        { reason: voidReason.trim() },
        kioskLocationId ? Number(kioskLocationId) : undefined
      );
      showSuccess("Venta anulada correctamente.");
      setVoidConfirmOpen(false);
      setVoidReason("");
      if (onSaleUpdated) onSaleUpdated(updated);
    } catch (err) {
      showError(err.message || "No se pudo anular la venta.");
    } finally {
      setVoiding(false);
    }
  };

  return (
    <Modal isOpen={isOpen} toggle={onClose} size="lg" className="kiosk-pos-sale-detail-modal">
      <ModalHeader toggle={onClose}>
        Detalle de venta {sale?.saleNumber ? `· ${sale.saleNumber}` : ""}
        {sale?.testSale && (
          <Badge color="warning" className="ml-2">
            Venta de prueba
          </Badge>
        )}
        {isVoid && (
          <Badge color="danger" className="ml-2">
            Anulada
          </Badge>
        )}
      </ModalHeader>
      <ModalBody>
        {loading && (
          <div className="text-center py-4">
            <Spinner /> Cargando detalle...
          </div>
        )}

        {!loading && !sale && (
          <p className="text-muted mb-0">No se encontró la venta.</p>
        )}

        {!loading && sale && (
          <>
            <div className="kiosk-pos-sale-detail-grid mb-3">
              <div>
                <div className="kiosk-pos-detail-label">Fecha</div>
                <div>{formatDateTime(sale.soldAt || sale.saleDate)}</div>
              </div>
              <div>
                <div className="kiosk-pos-detail-label">Kiosko</div>
                <div>{sale.kioskName || "—"}</div>
              </div>
              <div>
                <div className="kiosk-pos-detail-label">Vendedor</div>
                <div>{sale.soldByName || sale.soldByUsername || "—"}</div>
              </div>
              <div>
                <div className="kiosk-pos-detail-label">Forma de pago</div>
                <div>
                  {paymentLabel(sale.paymentMethod)}
                  {(sale.cardAuthNumber || sale.cardLast4) && (
                    <>
                      <br />
                      <span className="text-muted">
                        {sale.cardAuthNumber ? `Aut. ${sale.cardAuthNumber}` : ""}
                        {sale.cardAuthNumber && sale.cardLast4 ? " · " : ""}
                        {sale.cardLast4 ? `**** ${sale.cardLast4}` : ""}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div>
                <div className="kiosk-pos-detail-label">Cliente / NIT</div>
                <div>
                  {sale.customerName || "CONSUMIDOR FINAL"}
                  <br />
                  <span className="text-muted">{sale.customerTaxId || "CF"}</span>
                </div>
              </div>
              <div>
                <div className="kiosk-pos-detail-label">Estado</div>
                <div>{sale.status || "—"}</div>
              </div>
            </div>

            {(sale.promotionName || sale.notes || sale.comments) && (
              <div className="kiosk-pos-sale-detail-notes mb-3">
                {sale.promotionName && (
                  <div>
                    <strong>Promoción:</strong> {sale.promotionName}
                    {sale.discountAmount != null && Number(sale.discountAmount) > 0 && (
                      <span> (−{formatCurrency(sale.discountAmount)})</span>
                    )}
                  </div>
                )}
                {sale.notes && (
                  <div>
                    <strong>Notas:</strong> {sale.notes}
                  </div>
                )}
                {sale.comments && (
                  <div>
                    <strong>Comentarios:</strong> {sale.comments}
                  </div>
                )}
              </div>
            )}

            {canEditPayment && (
              <div className="mb-3 p-3 border rounded">
                {!editingPayment ? (
                  <Button color="info" size="sm" outline onClick={() => setEditingPayment(true)}>
                    Corregir pago
                  </Button>
                ) : (
                  <>
                    <Label className="kiosk-pos-label">Forma de pago</Label>
                    <Input
                      type="select"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                      className="mb-2"
                    >
                      <option value="EFECTIVO">Efectivo</option>
                      <option value="TARJETA">Tarjeta</option>
                      <option value="MIXTO">Mixto</option>
                    </Input>
                    {paymentMethod === "EFECTIVO" && (
                      <>
                        <Label className="kiosk-pos-label">Monto recibido</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={amountReceived}
                          onChange={(e) => setAmountReceived(e.target.value)}
                          className="mb-2"
                        />
                      </>
                    )}
                    {paymentMethod === "MIXTO" && (
                      <div className="row">
                        <div className="col-md-6">
                          <Label className="kiosk-pos-label">Efectivo</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cashAmount}
                            onChange={(e) => setCashAmount(e.target.value)}
                          />
                        </div>
                        <div className="col-md-6">
                          <Label className="kiosk-pos-label">Tarjeta</Label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={cardAmount}
                            onChange={(e) => setCardAmount(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    {requiresCardData && (
                      <div className="row">
                        <div className="col-md-6">
                          <Label className="kiosk-pos-label">Número de autorización</Label>
                          <Input
                            value={cardAuthNumber}
                            onChange={(e) => setCardAuthNumber(e.target.value)}
                            placeholder="Ej: 123456"
                          />
                        </div>
                        <div className="col-md-6">
                          <Label className="kiosk-pos-label">Últimos 4 dígitos</Label>
                          <Input
                            value={cardLast4}
                            onChange={(e) => setCardLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="0000"
                            maxLength={4}
                            inputMode="numeric"
                          />
                        </div>
                      </div>
                    )}
                    {cardDataIncomplete && (
                      <p className="text-danger small mt-1 mb-0">
                        Indica autorización y últimos 4 dígitos de la tarjeta.
                      </p>
                    )}
                    <div className="mt-2">
                      <Button
                        color="success"
                        size="sm"
                        className="mr-2"
                        onClick={handleSavePayment}
                        disabled={savingPayment || cardDataIncomplete}
                      >
                        {savingPayment ? <Spinner size="sm" /> : "Guardar pago"}
                      </Button>
                      <Button color="secondary" size="sm" outline onClick={() => setEditingPayment(false)}>
                        Cancelar
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div
              className={`kiosk-pos-sale-detail-deposit mb-3 p-3 rounded${
                pendingDeposit ? " kiosk-pos-sale-detail-deposit-pending" : " bg-light"
              }`}
            >
              <div className="d-flex align-items-center justify-content-between mb-2">
                <strong>Boleta de depósito</strong>
                {sale.depositSlipNumber ? (
                  <Badge color="success" className="kiosk-pos-deposit-state-badge">
                    Aplica · Registrada
                  </Badge>
                ) : depositApplicable ? (
                  <Badge color="warning" className="kiosk-pos-deposit-state-badge">
                    Aplica · Pendiente
                  </Badge>
                ) : (
                  <Badge color="secondary" className="kiosk-pos-deposit-state-badge">
                    No aplica
                  </Badge>
                )}
              </div>
              {depositApplicable && (
                <Alert color="warning" className="py-2 mb-2">
                  Esta venta incluye efectivo y aún no tiene boleta de depósito registrada.
                </Alert>
              )}
              {sale.depositSlipNumber ? (
                <>
                  <div className="small mb-1">
                    <strong>Número:</strong> {sale.depositSlipNumber}
                  </div>
                  {sale.depositRecordedAt && (
                    <div className="small text-muted">
                      Registrada {formatDateTime(sale.depositRecordedAt)}
                      {sale.depositRecordedByName ? ` por ${sale.depositRecordedByName}` : ""}
                    </div>
                  )}
                </>
              ) : depositApplicable ? (
                <>
                  <Label className="kiosk-pos-label">Número de boleta</Label>
                  <Input
                    type="text"
                    maxLength={40}
                    value={depositSlipNumber}
                    onChange={(e) => setDepositSlipNumber(e.target.value)}
                    placeholder="Ej. 1234567890"
                    className="mb-2"
                  />
                  <Button color="warning" size="sm" onClick={handleRegisterDeposit} disabled={savingDeposit}>
                    {savingDeposit ? <Spinner size="sm" /> : "Registrar boleta"}
                  </Button>
                  {sale?.testSale ? (
                    <div className="small text-muted mt-2 mb-0">
                      Venta de prueba: la boleta se registra igual para validar el flujo operativo.
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="small text-muted mb-0">
                  Solo aplica a ventas completadas en efectivo o mixtas con efectivo.
                </div>
              )}
            </div>

            <div className="kiosk-pos-sale-detail-fel mb-3 p-3 bg-light rounded">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <strong>Factura electrónica (FEL)</strong>
                {felStatusBadge(felStatus)}
              </div>
              {(felSerie || felNumero) && (
                <div className="small mb-1">
                  <strong>Serie / Número:</strong> {felSerie || "—"} / {felNumero || "—"}
                </div>
              )}
              {invoice?.internalNumber && (
                <div className="small mb-1">
                  <strong>No. interno:</strong> {invoice.internalNumber}
                </div>
              )}
              {felUuid && (
                <div className="small mb-1">
                  <strong>Autorización UUID:</strong> {felUuid}
                </div>
              )}
              {felError && (
                <div className="small text-danger mb-1">
                  <strong>Error:</strong> {felError}
                </div>
              )}
              {invoice?.felCertifiedAt && (
                <div className="small mb-1">
                  <strong>Fecha emisión:</strong> {formatDateTime(invoice.felCertifiedAt)}
                </div>
              )}
              <div className="d-flex flex-wrap mt-2" style={{ gap: "0.5rem" }}>
                {canEditFel && invoice?.id && (
                  <Button color="warning" size="sm" outline type="button" onClick={() => setFelEditOpen(true)}>
                    Corregir factura FEL
                  </Button>
                )}
                {canDownloadFelReport && (
                  <Button color="primary" size="sm" outline type="button" onClick={handleDownloadFelReport}>
                    Descargar factura PDF
                  </Button>
                )}
                {canDownloadXml && (
                  <Button color="success" size="sm" type="button" onClick={handleDownloadXml} disabled={downloadingXml}>
                    {downloadingXml ? "Descargando..." : "Descargar XML certificado"}
                  </Button>
                )}
              </div>
            </div>

            <EditTaxInvoiceFelModal
              isOpen={felEditOpen}
              toggle={() => setFelEditOpen(false)}
              invoiceId={invoice?.id}
              initialValues={{
                felUuid,
                felSerie,
                felNumero,
                felCertifiedAt: invoice?.felCertifiedAt || sale?.felCertifiedAt,
              }}
              onSaved={async () => {
                if (onSaleUpdated) {
                  await onSaleUpdated();
                }
              }}
            />

            <h6 className="mb-2">Productos vendidos</h6>
            <Table responsive size="sm" className="mb-3">
              <thead className="text-primary">
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Color</th>
                  <th>Cant.</th>
                  <th>P. unit.</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {(sale.items || []).map((item) => (
                  <tr key={item.id || `${item.productId}-${item.colorId}`}>
                    <td>{item.productCode || "—"}</td>
                    <td>{item.productName || "—"}</td>
                    <td>{item.colorName || "—"}</td>
                    <td>{formatQty(item.quantity)}</td>
                    <td>{formatCurrency(item.unitPrice)}</td>
                    <td>{formatCurrency(item.lineTotal)}</td>
                  </tr>
                ))}
                {(!sale.items || sale.items.length === 0) && (
                  <tr>
                    <td colSpan="6" className="text-center text-muted">
                      Sin líneas de detalle.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>

            <div className="kiosk-pos-sale-detail-totals">
              <div className="d-flex justify-content-between">
                <span>Subtotal</span>
                <strong>{formatCurrency(sale.subtotal ?? sale.totalAmount)}</strong>
              </div>
              {sale.discountAmount != null && Number(sale.discountAmount) > 0 && (
                <div className="d-flex justify-content-between text-success">
                  <span>Descuento</span>
                  <strong>−{formatCurrency(sale.discountAmount)}</strong>
                </div>
              )}
              <div className="d-flex justify-content-between kiosk-pos-sale-detail-total-row">
                <span>Total cobrado</span>
                <strong>{formatCurrency(sale.totalAmount)}</strong>
              </div>
              {sale.paymentMethod === "EFECTIVO" && sale.amountReceived != null && (
                <>
                  <div className="d-flex justify-content-between text-muted small">
                    <span>Recibido</span>
                    <span>{formatCurrency(sale.amountReceived)}</span>
                  </div>
                  {Number(sale.changeAmount || 0) > 0 && (
                    <div className="d-flex justify-content-between text-muted small">
                      <span>Cambio</span>
                      <span>{formatCurrency(sale.changeAmount)}</span>
                    </div>
                  )}
                </>
              )}
              {sale.paymentMethod === "MIXTO" && (
                <>
                  <div className="d-flex justify-content-between text-muted small">
                    <span>Efectivo</span>
                    <span>{formatCurrency(sale.cashAmount)}</span>
                  </div>
                  <div className="d-flex justify-content-between text-muted small">
                    <span>Tarjeta</span>
                    <span>{formatCurrency(sale.cardAmount)}</span>
                  </div>
                </>
              )}
              <div className="d-flex justify-content-between text-muted small mt-1">
                <span>Total unidades</span>
                <span>{formatQty(sale.totalItems)}</span>
              </div>
            </div>
          </>
        )}
      </ModalBody>
      <ModalFooter>
        {canVoidSale && !voidConfirmOpen && (
          <Button color="danger" outline onClick={() => setVoidConfirmOpen(true)}>
            Anular venta
          </Button>
        )}
        {voidConfirmOpen && (
          <div className="d-flex flex-wrap align-items-center mr-auto">
            <Input
              type="text"
              placeholder="Motivo de anulación"
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              className="mr-2 mb-2"
              style={{ minWidth: 220 }}
            />
            <Button color="danger" size="sm" className="mr-2 mb-2" onClick={handleVoidSale} disabled={voiding}>
              {voiding ? <Spinner size="sm" /> : "Confirmar anulación"}
            </Button>
            <Button color="secondary" size="sm" outline className="mb-2" onClick={() => setVoidConfirmOpen(false)}>
              Cancelar
            </Button>
          </div>
        )}
        <Button color="secondary" onClick={onClose}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default PosSaleDetailModal;
