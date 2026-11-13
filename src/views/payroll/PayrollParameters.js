import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, Col, FormGroup, Input, Label, Row, Spinner, Table } from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { addPayrollParameter, getPayrollParameters } from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";

const LABELS = {
  IGSS_LABORAL_PCT: "IGSS laboral (%)",
  IGSS_PATRONAL_PCT: "IGSS patronal (%)",
  IRTRA_PCT: "IRTRA (%)",
  INTECAP_PCT: "INTECAP (%)",
  BONIFICACION_INCENTIVO_MENSUAL: "Bonificación incentivo mensual (Q)",
  ISR_DEDUCCION_PERSONAL: "ISR: deducción personal anual (Q)",
  ISR_TRAMO_LIMITE: "ISR: límite del primer tramo (Q)",
  ISR_TASA_TRAMO1_PCT: "ISR: tasa del primer tramo (%)",
  ISR_TASA_TRAMO2_PCT: "ISR: tasa del excedente (%)",
  ISR_CUOTA_FIJA_TRAMO2: "ISR: cuota fija del segundo tramo (Q)",
};

const fmtDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};

/** Porcentajes y montos legales con fecha de vigencia. Un cambio se registra como un valor nuevo desde una fecha. */
function PayrollParameters() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CORRIDAS.APROBAR");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ code: "IGSS_LABORAL_PCT", value: "", effectiveFrom: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows((await getPayrollParameters()) || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byCode = useMemo(() => {
    const grouped = {};
    rows.forEach((row) => {
      grouped[row.code] = grouped[row.code] || [];
      grouped[row.code].push(row);
    });
    return grouped;
  }, [rows]);

  const submit = async () => {
    if (form.value === "" || !form.effectiveFrom) {
      showError("Indique el valor y la fecha desde la que rige.");
      return;
    }
    if (!(Number(form.value) >= 0)) {
      showError("El valor no puede ser negativo.");
      return;
    }
    if (form.code.endsWith("_PCT") && Number(form.value) > 100) {
      showError("Un porcentaje no puede pasar de 100.");
      return;
    }
    setSaving(true);
    try {
      await addPayrollParameter({ ...form, value: Number(form.value), description: form.description.trim() || null });
      showSuccess("Valor registrado. Recalcule las planillas en borrador que lo usen.");
      setForm({ ...form, value: "", effectiveFrom: "", description: "" });
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Spinner size="sm" />;

  return (
    <>
      <p className="small text-muted">
        Cada planilla toma el valor vigente al cierre de su período; las aprobadas y pagadas no cambian.
      </p>
      <Table size="sm" responsive>
        <thead>
          <tr>
            <th>Parámetro</th>
            <th className="text-right">Valor</th>
            <th>Desde</th>
            <th>Descripción</th>
          </tr>
        </thead>
        <tbody>
          {Object.keys(LABELS).map((code) =>
            (byCode[code] || []).map((row, index) => (
              <tr key={row.id} className={row.current ? "" : "text-muted"}>
                <td>{index === 0 ? LABELS[code] : ""}</td>
                <td className="text-right">{Number(row.value).toLocaleString("en-US", { maximumFractionDigits: 4 })}</td>
                <td>
                  {fmtDate(row.effectiveFrom)} {row.current && <Badge color="success">vigente</Badge>}
                </td>
                <td className="small">{row.description}</td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      {canEdit && (
        <Row className="align-items-end">
          <Col md="4">
            <FormGroup>
              <Label>Parámetro</Label>
              <Input type="select" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}>
                {Object.entries(LABELS).map(([code, label]) => (
                  <option key={code} value={code}>{label}</option>
                ))}
              </Input>
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup>
              <Label>Nuevo valor</Label>
              <Input type="number" step="0.0001" min="0" value={form.value}
                onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </FormGroup>
          </Col>
          <Col md="2">
            <FormGroup>
              <Label>Rige desde</Label>
              <Input type="date" value={form.effectiveFrom}
                onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
            </FormGroup>
          </Col>
          <Col md="3">
            <FormGroup>
              <Label>Motivo</Label>
              <Input maxLength={200} value={form.description} placeholder="Acuerdo, decreto o circular"
                onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </FormGroup>
          </Col>
          <Col md="1">
            <FormGroup>
              <Button color="primary" disabled={saving} onClick={submit}>Registrar</Button>
            </FormGroup>
          </Col>
        </Row>
      )}
    </>
  );
}

export default PayrollParameters;
