import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Alert,
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
import { createManualTaxInvoice } from "services/taxInvoiceService";
import { lookupTaxpayerByNit } from "services/kioskPosService";
import { formatFelCustomerName, isValidGuatemalaNit, normalizeNit } from "views/kiosks/pos/posUtils";

const emptyLine = () => ({ description: "", quantity: "1", unitPrice: "" });

function AccountingInvoiceForm() {
  const navigate = useNavigate();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [taxLookupLoading, setTaxLookupLoading] = useState(false);
  const [form, setForm] = useState({
    customerTaxId: "CF",
    customerName: "CONSUMIDOR FINAL",
    documentType: "FACT",
    address: "",
    phone: "",
    email: "",
    notes: "",
    lines: [emptyLine()],
  });

  const updateLine = (index, field, value) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)),
    }));
  };

  const addLine = () => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyLine()] }));

  const removeLine = (index) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.length <= 1 ? prev.lines : prev.lines.filter((_, i) => i !== index),
    }));
  };

  const lookupTaxId = async () => {
    const nit = normalizeNit(form.customerTaxId);
    if (!nit || nit === "CF") {
      setForm((prev) => ({ ...prev, customerTaxId: "CF", customerName: "CONSUMIDOR FINAL" }));
      return;
    }
    if (!isValidGuatemalaNit(nit)) {
      setError("El NIT ingresado no es válido.");
      return;
    }
    try {
      setTaxLookupLoading(true);
      setError("");
      const result = await lookupTaxpayerByNit(nit);
      setForm((prev) => ({
        ...prev,
        customerTaxId: result?.taxId || nit,
        customerName: formatFelCustomerName(result?.customerName || prev.customerName || ""),
      }));
    } catch (err) {
      setError(err.message || "No se pudo consultar el NIT.");
    } finally {
      setTaxLookupLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const lines = form.lines
      .map((line) => ({
        description: String(line.description || "").trim(),
        quantity: Number(line.quantity || 0),
        unitPrice: Number(line.unitPrice || 0),
      }))
      .filter((line) => line.description && line.quantity > 0 && line.unitPrice > 0);

    if (lines.length === 0) {
      setError("Agregue al menos una línea válida.");
      return;
    }

    try {
      setSaving(true);
      const invoice = await createManualTaxInvoice({
        customerTaxId: normalizeNit(form.customerTaxId) || "CF",
        customerName: form.customerName,
        documentType: form.documentType,
        address: form.address || null,
        phone: form.phone || null,
        email: form.email || null,
        notes: form.notes || null,
        lines,
      });
      navigate(`/admin/accounting/invoices/${invoice.id}`);
    } catch (err) {
      setError(err.message || "No se pudo crear la factura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <CardTitle tag="h4">Nueva factura manual</CardTitle>
        </CardHeader>
        <CardBody>
          {error && <Alert color="danger">{error}</Alert>}
          <form onSubmit={handleSubmit}>
            <Row>
              <Col md="3">
                <FormGroup>
                  <Label>NIT / CF</Label>
                  <Input value={form.customerTaxId}
                    onChange={(e) => setForm((prev) => ({
                      ...prev,
                      customerTaxId: e.target.value,
                      customerName: normalizeNit(e.target.value) === "CF" ? "CONSUMIDOR FINAL" : prev.customerName,
                    }))} />
                </FormGroup>
              </Col>
              <Col md="5">
                <FormGroup>
                  <Label>Nombre en factura</Label>
                  <Input value={form.customerName}
                    onChange={(e) => setForm((prev) => ({ ...prev, customerName: e.target.value }))} />
                </FormGroup>
              </Col>
              <Col md="4" className="d-flex align-items-end">
                <Button type="button" color="info" className="mb-3 mr-2" onClick={lookupTaxId} disabled={taxLookupLoading}>
                  {taxLookupLoading ? <Spinner size="sm" /> : "Consultar NIT"}
                </Button>
              </Col>
            </Row>

            <Row>
              <Col md="4"><FormGroup><Label>Dirección</Label><Input value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} /></FormGroup></Col>
              <Col md="4"><FormGroup><Label>Teléfono</Label><Input value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} /></FormGroup></Col>
              <Col md="4"><FormGroup><Label>Correo</Label><Input value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} /></FormGroup></Col>
            </Row>

            <Row>
              <Col md="4">
                <FormGroup>
                  <Label>Tipo de documento</Label>
                  <Input
                    type="select"
                    value={form.documentType}
                    onChange={(e) => setForm((p) => ({ ...p, documentType: e.target.value }))}
                  >
                    <option value="FACT">Factura (FACT)</option>
                    <option value="FCAM" disabled>Factura Cambiaria (FCAM) — próximamente</option>
                  </Input>
                  <small className="text-muted">
                    FCAM requiere el complemento de Abonos exigido por SAT; aún no está disponible.
                  </small>
                </FormGroup>
              </Col>
            </Row>

            <FormGroup>
              <Label>Notas</Label>
              <Input type="textarea" rows="2" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
            </FormGroup>

            <div className="d-flex justify-content-between align-items-center mb-2">
              <h5 className="mb-0">Líneas</h5>
              <Button type="button" color="default" size="sm" onClick={addLine}>Agregar línea</Button>
            </div>
            <Table responsive size="sm">
              <thead>
                <tr>
                  <th>Descripción</th>
                  <th style={{ width: 120 }}>Cantidad</th>
                  <th style={{ width: 140 }}>Precio unit.</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {form.lines.map((line, index) => (
                  <tr key={index}>
                    <td><Input value={line.description} onChange={(e) => updateLine(index, "description", e.target.value)} /></td>
                    <td><Input type="number" min="0" step="0.001" value={line.quantity} onChange={(e) => updateLine(index, "quantity", e.target.value)} /></td>
                    <td><Input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e) => updateLine(index, "unitPrice", e.target.value)} /></td>
                    <td><Button type="button" color="danger" size="sm" onClick={() => removeLine(index)}>×</Button></td>
                  </tr>
                ))}
              </tbody>
            </Table>

            <div className="text-right">
              <Button color="default" className="mr-2" type="button" onClick={() => navigate("/admin/accounting/invoices")}>
                Cancelar
              </Button>
              <Button color="primary" type="submit" disabled={saving}>
                {saving ? <Spinner size="sm" /> : "Crear y certificar"}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}

export default AccountingInvoiceForm;
