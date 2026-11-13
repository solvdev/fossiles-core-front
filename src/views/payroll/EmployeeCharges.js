import React, { useCallback, useEffect, useState } from "react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Col, Input, Row, Spinner, Table } from "reactstrap";
import ConfirmModal from "components/ConfirmModal/ConfirmModal";
import { useAuth } from "contexts/AuthContext";
import {
  cancelEmployeeCharge,
  decideEmployeeCharge,
  getEmployeeCharges,
  markEmployeeChargePaid,
} from "services/payrollService";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatAmount } from "utils/payrollPrintHtml";
import TablePagination, { usePagination } from "components/TablePagination/TablePagination";

const STATUS_COLORS = { PENDIENTE: "warning", PARCIAL: "info", PAGADO: "success", ANULADO: "secondary" };
const SETTLEMENT_LABELS = { DESCUENTO: "Descuento en planilla", TRANSFERENCIA: "Transferencia", EFECTIVO: "Efectivo" };

const fmtDate = (iso) => {
  const [y, m, d] = String(iso || "").split("-");
  return y && m && d ? `${d}/${m}/${y}` : "—";
};
const isOpen = (charge) => charge.status === "PENDIENTE" || charge.status === "PARCIAL";

/**
 * Planta se descuenta en planilla: si su cargo aún no tiene decisión (venía de otro grupo) solo puede quedar en
 * descuento. Quien ya salió (baja o inactivo) puede saldar lo pendiente por transferencia o en efectivo.
 */
const settlementOptions = (charge) =>
  charge.payGroup === "PLANTA" && charge.employeeActive !== false ? ["DESCUENTO"] : Object.keys(SETTLEMENT_LABELS);

/**
 * Compras de colaborador con 50 %. Planta se descuenta completo en planilla; en administración
 * Contabilidad decide si se descuenta, se transfiere o se paga en efectivo.
 */
function EmployeeCharges() {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission("PLANILLA.CARGOS.EDITAR");
  const [status, setStatus] = useState("");
  const [charges, setCharges] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCharges((await getEmployeeCharges({ status })) || []);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (charge, action, message) => {
    setBusyId(charge.id);
    try {
      await action();
      showSuccess(message);
      await load();
    } catch (error) {
      showError(error.message);
    } finally {
      setBusyId(null);
    }
  };

  const pendingDecision = charges.filter((c) => isOpen(c) && !c.settlementMethod).length;
  const pagination = usePagination(charges, 25);

  return (
    <div className="content">
      <Card>
        <CardHeader>
          <Row className="align-items-center">
            <Col md="8">
              <CardTitle tag="h4" className="mb-0">Cargos a colaboradores</CardTitle>
              <p className="text-muted small mb-0 mt-1">
                Compras de colaborador al 50 %. Planta: descuento en planilla. Administración: Contabilidad decide la
                forma de pago. Kioscos: sin compras.
                {pendingDecision > 0 && <strong> {pendingDecision} esperan decisión.</strong>}
              </p>
            </Col>
            <Col md="4">
              <Input type="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="PARCIAL">Parciales</option>
                <option value="PAGADO">Pagados</option>
                <option value="ANULADO">Anulados</option>
              </Input>
            </Col>
          </Row>
        </CardHeader>
        <CardBody>
          {loading ? (
            <Spinner size="sm" />
          ) : (
            <>
            <Table size="sm" responsive striped>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Colaborador</th>
                  <th>Descripción</th>
                  <th className="text-right">Monto</th>
                  <th className="text-right">Saldo</th>
                  <th>Liquidación</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {charges.length === 0 && (
                  <tr>
                    <td colSpan="8" className="text-muted">No hay cargos.</td>
                  </tr>
                )}
                {pagination.pageItems.map((charge) => {
                  const plant = charge.payGroup === "PLANTA";
                  const left = charge.employeeActive === false;
                  const reserved = Number(charge.reservedInDrafts) > 0;
                  const options = settlementOptions(charge);
                  const editable = canEdit && isOpen(charge) && !reserved
                    && (options.length > 1 || !charge.settlementMethod);
                  const draft = drafts[charge.id] ?? charge.settlementMethod ?? "";
                  const untouched = Number(charge.balance) === Number(charge.amount) && !reserved;
                  return (
                    <tr key={charge.id}>
                      <td>{fmtDate(charge.chargedOn)}</td>
                      <td>
                        {charge.employeeName}
                        <div className="small text-muted">
                          {plant ? "Planta" : "Administración"}
                          {left && " · de baja"}
                        </div>
                      </td>
                      <td>{charge.description}</td>
                      <td className="text-right">{formatAmount(charge.amount)}</td>
                      <td className="text-right">
                        {formatAmount(charge.balance)}
                        {reserved && <div className="small text-muted">{formatAmount(charge.reservedInDrafts)} en borrador</div>}
                      </td>
                      <td>
                        {editable ? (
                          <Input type="select" bsSize="sm" value={draft}
                            onChange={(e) => setDrafts({ ...drafts, [charge.id]: e.target.value })}>
                            <option value="">Sin decidir</option>
                            {options.map((value) => (
                              <option key={value} value={value}>{SETTLEMENT_LABELS[value]}</option>
                            ))}
                          </Input>
                        ) : (
                          SETTLEMENT_LABELS[charge.settlementMethod] || "Sin decidir"
                        )}
                      </td>
                      <td><Badge color={STATUS_COLORS[charge.status]}>{charge.status}</Badge></td>
                      <td className="text-nowrap">
                        {editable && draft && draft !== charge.settlementMethod && (
                          <Button size="sm" color="primary" disabled={busyId === charge.id}
                            onClick={() => act(charge, () => decideEmployeeCharge(charge.id, draft), "Decisión guardada.")}>
                            Guardar
                          </Button>
                        )}
                        {canEdit && isOpen(charge) && (charge.settlementMethod === "TRANSFERENCIA" || charge.settlementMethod === "EFECTIVO") && (
                          <Button size="sm" color="success" disabled={busyId === charge.id}
                            onClick={() => setConfirm({
                              title: "Marcar como pagado",
                              message: `El colaborador pagó ${formatAmount(charge.balance)} por ${SETTLEMENT_LABELS[charge.settlementMethod].toLowerCase()}.`,
                              confirmText: "Marcar pagado",
                              confirmColor: "success",
                              action: () => act(charge, () => markEmployeeChargePaid(charge.id), "Cargo saldado."),
                            })}>
                            Pagado
                          </Button>
                        )}
                        {canEdit && isOpen(charge) && untouched && (
                          <Button size="sm" color="danger" outline disabled={busyId === charge.id}
                            onClick={() => setConfirm({
                              title: "Anular cargo",
                              message: "Solo para cargos registrados por error. No se puede deshacer.",
                              confirmText: "Anular",
                              confirmColor: "danger",
                              action: () => act(charge, () => cancelEmployeeCharge(charge.id), "Cargo anulado."),
                            })}>
                            Anular
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            <TablePagination pagination={pagination} />
            </>
          )}
        </CardBody>
      </Card>

      <ConfirmModal
        isOpen={Boolean(confirm)}
        toggle={() => setConfirm(null)}
        title={confirm?.title}
        message={confirm?.message}
        confirmText={confirm?.confirmText}
        confirmColor={confirm?.confirmColor}
        onConfirm={async () => {
          await confirm.action();
          setConfirm(null);
        }}
      />
    </div>
  );
}

export default EmployeeCharges;
