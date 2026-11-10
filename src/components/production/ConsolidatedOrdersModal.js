import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Badge, Button, Col, Input, Modal, ModalBody, ModalFooter, ModalHeader, Nav, NavItem, NavLink, Row, Spinner, Table,
} from "reactstrap";
import {
  createProductionOrderGroup,
  dissolveProductionOrderGroup,
  getProductionOrderGroup,
  getProductionOrderGroupCandidates,
  getProductionOrderGroups,
} from "services/productionOrderGroupService";
import { openProductionOrderGroupSheet } from "utils/productionOrderGroupPrintHtml";
import { formatDateGt } from "utils/dateTimeHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { contar } from "utils/textHelper";

const FAMILIES = [
  { key: "OPV", label: "OPV · marroquinería" },
  { key: "OPC", label: "OPC · cinchos" },
];

/**
 * OP consolidada de Luis Felipe: el jefe marca varias OPV (o varias OPC) pequeñas y las
 * convierte en una sola OP de producción. Las órdenes originales siguen con su envío y su
 * cobro; la consolidada se planifica, se imprime y se trabaja como una sola.
 */
export default function ConsolidatedOrdersModal({ isOpen, onClose, onChanged }) {
  const [family, setFamily] = useState("OPV");
  const [groups, setGroups] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [selected, setSelected] = useState([]);
  const [observations, setObservations] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, c] = await Promise.all([getProductionOrderGroups(), getProductionOrderGroupCandidates(family)]);
      setGroups(Array.isArray(g) ? g : []);
      setCandidates(Array.isArray(c) ? c : []);
      setSelected([]);
    } catch (err) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  }, [family]);

  useEffect(() => { if (isOpen) load(); }, [isOpen, load]);

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const selectedUnits = candidates.filter((c) => selected.includes(c.id)).reduce((s, c) => s + (c.units || 0), 0);

  // Filtro: OP o cliente, estado, entrega hasta y tamaño máximo (las consolidadas son para órdenes pequeñas).
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [deliveryTo, setDeliveryTo] = useState("");
  const [maxUnits, setMaxUnits] = useState("");
  const statuses = useMemo(() => Array.from(new Set(candidates.map((c) => c.status).filter(Boolean))), [candidates]);
  const q = search.trim().toLowerCase();
  const matchesText = (code, customer) => !q
    || String(code || "").toLowerCase().includes(q) || String(customer || "").toLowerCase().includes(q);
  const visible = candidates.filter((c) => matchesText(c.code, c.customerName)
    && (status === "ALL" || c.status === status)
    && (!deliveryTo || (c.deliveryDate && String(c.deliveryDate).slice(0, 10) <= deliveryTo))
    && (maxUnits === "" || (c.units || 0) <= Number(maxUnits)));
  const filtering = !!q || status !== "ALL" || !!deliveryTo || maxUnits !== "";
  const clearFilters = () => { setSearch(""); setStatus("ALL"); setDeliveryTo(""); setMaxUnits(""); };
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.includes(c.id));
  const toggleVisible = () => setSelected((cur) => (allVisibleSelected
    ? cur.filter((id) => !visible.some((c) => c.id === id))
    : [...cur, ...visible.map((c) => c.id).filter((id) => !cur.includes(id))]));

  const create = async () => {
    setBusy("create");
    try {
      const g = await createProductionOrderGroup(selected, observations.trim() || null);
      showSuccess(`OP consolidada ${g.code} creada con ${contar(g.orders.length, "orden", "órdenes")}.`);
      setObservations("");
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const dissolve = async (g) => {
    // eslint-disable-next-line no-alert
    if (!window.confirm(`¿Desagrupar ${g.code}? Sus órdenes vuelven a planificarse sueltas. Las tareas ya creadas no cambian.`)) return;
    setBusy(`dissolve-${g.id}`);
    try {
      await dissolveProductionOrderGroup(g.id);
      showSuccess(`${g.code} desagrupada.`);
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      showError(err.message);
    } finally {
      setBusy(null);
    }
  };

  const print = (g) => {
    openProductionOrderGroupSheet(() => getProductionOrderGroup(g.id)).catch((err) => showError(err.message));
  };

  // Las consolidadas activas se filtran por su código o por cualquiera de sus órdenes y clientes.
  const familyGroups = groups.filter((g) => g.family === family
    && (!q || String(g.code || "").toLowerCase().includes(q)
      || (g.orders || []).some((o) => matchesText(o.code, o.customerName))));

  return (
    <Modal isOpen={isOpen} toggle={busy ? undefined : onClose} size="lg" scrollable>
      <ModalHeader toggle={busy ? undefined : onClose}>OP consolidada · Luis Felipe</ModalHeader>
      <ModalBody>
        <p className="text-muted mb-3" style={{ fontSize: 13 }}>
          Junte varias órdenes pequeñas de Luis Felipe en una sola OP de producción. Se planifica, se imprime y
          se trabaja como una; cada orden conserva su envío, su cobro y su empaque.
        </p>
        <Nav tabs className="mb-3">
          {FAMILIES.map((f) => (
            <NavItem key={f.key}>
              <NavLink role="button" className={family === f.key ? "active" : ""} onClick={() => setFamily(f.key)}>
                {f.label}
              </NavLink>
            </NavItem>
          ))}
        </Nav>

        <Row form className="mb-3 align-items-end">
          <Col md="4" className="mb-2">
            <Input type="search" bsSize="sm" placeholder="Buscar OP o cliente" aria-label="Buscar OP o cliente"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </Col>
          <Col md="3" className="mb-2">
            <Input type="select" bsSize="sm" aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="ALL">Todos los estados</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </Input>
          </Col>
          <Col md="3" className="mb-2">
            <small className="text-muted d-block">Entrega hasta</small>
            <Input type="date" bsSize="sm" aria-label="Entrega hasta" value={deliveryTo} onChange={(e) => setDeliveryTo(e.target.value)} />
          </Col>
          <Col md="2" className="mb-2">
            <small className="text-muted d-block">Máx. uds.</small>
            <Input type="number" min="0" bsSize="sm" aria-label="Máximo de unidades" placeholder="—"
              value={maxUnits} onChange={(e) => setMaxUnits(e.target.value)} />
          </Col>
        </Row>

        {loading ? (
          <div className="text-center py-4"><Spinner /></div>
        ) : (
          <>
            <h6 className="mb-2">Consolidadas activas</h6>
            {familyGroups.length === 0 ? (
              <p className="text-muted small">
                {groups.some((g) => g.family === family) ? "Ninguna consolidada coincide con la búsqueda." : `No hay consolidadas de ${family} todavía.`}
              </p>
            ) : (
              <Table size="sm" responsive className="mb-4">
                <thead><tr><th>OP consolidada</th><th>Órdenes</th><th className="text-right">Uds.</th><th>Entrega</th><th /></tr></thead>
                <tbody>
                  {familyGroups.map((g) => (
                    <tr key={g.id}>
                      <td className="align-middle"><Badge color="secondary" style={{ background: "#6f42c1" }}>{g.code}</Badge></td>
                      <td className="align-middle small">{(g.orders || []).map((o) => o.code).join(", ")}</td>
                      <td className="align-middle text-right">{g.totalUnits}</td>
                      <td className="align-middle small">{g.deliveryDate ? formatDateGt(g.deliveryDate) : "—"}</td>
                      <td className="align-middle text-right" style={{ whiteSpace: "nowrap" }}>
                        <Button size="sm" outline color="secondary" className="mr-1" onClick={() => print(g)}>Hoja</Button>
                        <Button size="sm" outline color="danger" disabled={!!busy} onClick={() => dissolve(g)}>
                          {busy === `dissolve-${g.id}` ? <Spinner size="sm" /> : "Desagrupar"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}

            <h6 className="mb-2">Nueva consolidada de {family}</h6>
            {candidates.length < 2 ? (
              <Alert color="light" className="mb-0">
                {candidates.length === 0
                  ? `No hay ${family} abiertas de Luis Felipe sin consolidar.`
                  : `Solo hay una ${family} de Luis Felipe sin consolidar; hacen falta al menos dos.`}
              </Alert>
            ) : (
              <>
                <div className="d-flex align-items-center mb-1" style={{ gap: 8, fontSize: 12 }}>
                  <span className="text-muted">
                    {filtering ? `${visible.length} de ${candidates.length} órdenes` : contar(candidates.length, "orden", "órdenes")}
                  </span>
                  {filtering && <Button color="link" size="sm" className="p-0" onClick={clearFilters}>Quitar filtro</Button>}
                  <span className="ml-auto" />
                  <Button size="sm" outline color="secondary" disabled={visible.length === 0} onClick={toggleVisible}>
                    {allVisibleSelected ? "Desmarcar visibles" : "Marcar visibles"}
                  </Button>
                </div>
                <Table size="sm" responsive hover className="mb-2">
                  <thead><tr><th style={{ width: 36 }} /><th>Orden</th><th>Cliente</th><th>Estado</th><th>Entrega</th><th className="text-right">Uds.</th></tr></thead>
                  <tbody>
                    {visible.length === 0 && (
                      <tr><td colSpan={6} className="text-muted small text-center py-3">Ninguna orden coincide con el filtro.</td></tr>
                    )}
                    {visible.map((c) => (
                      <tr key={c.id} role="button" onClick={() => toggle(c.id)}>
                        <td><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggle(c.id)} aria-label={`Marcar ${c.code}`} onClick={(e) => e.stopPropagation()} /></td>
                        <td><strong>{c.code}</strong></td>
                        <td className="small">{c.customerName || ""}</td>
                        <td className="small">{c.status}</td>
                        <td className="small">{c.deliveryDate ? formatDateGt(c.deliveryDate) : "—"}</td>
                        <td className="text-right">{c.units}</td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Input
                  type="text" maxLength={500} placeholder="Nota para la mesa (opcional)"
                  value={observations} onChange={(e) => setObservations(e.target.value)} className="mb-1"
                />
              </>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <span className="mr-auto text-muted small">
          {selected.length > 0 ? `${contar(selected.length, "orden", "órdenes")} · ${selectedUnits} uds.` : ""}
        </span>
        <Button color="secondary" outline onClick={onClose} disabled={!!busy}>Cerrar</Button>
        <Button color="primary" disabled={selected.length < 2 || !!busy} onClick={create}>
          {busy === "create" ? <Spinner size="sm" /> : "Crear OP consolidada"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
