import React, { useMemo } from "react";
import { Alert, Button, Modal, ModalBody, ModalFooter, ModalHeader, Table } from "reactstrap";

/**
 * Agrupa lo que no alcanza en bodega para los kioscos marcados, como se arma a mano en Producción:
 * OPK (NORMAL, KIOSCOS) para productos sin talla y OPC (CINCHOS_FOSSILES, KIOSCOS) para cinchos por talla.
 */
export function groupShortagesForProduction(kiosks) {
  const opk = new Map();
  const opc = new Map();
  (kiosks || []).forEach((kiosk) => {
    (kiosk.lines || []).forEach((line) => {
      const qty = Number(line.shortage) || 0;
      if (qty <= 0) return;
      const key = `${line.productId}|${line.colorId ?? ""}`;
      const target = line.size ? opc : opk;
      const row = target.get(key) || {
        productId: line.productId,
        productCode: line.productCode,
        productName: line.productName,
        colorId: line.colorId ?? null,
        colorName: line.colorName,
        quantity: 0,
        sizes: {},
        kiosks: new Set(),
      };
      row.quantity += qty;
      if (line.size) row.sizes[line.size] = (row.sizes[line.size] || 0) + qty;
      row.kiosks.add(kiosk.name);
      target.set(key, row);
    });
  });
  const sortRows = (rows) =>
    rows.sort((a, b) => b.quantity - a.quantity || String(a.productCode).localeCompare(String(b.productCode)));
  return { opk: sortRows([...opk.values()]), opc: sortRows([...opc.values()]) };
}

const sizesLabel = (sizes) =>
  Object.keys(sizes)
    .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
    .map((size) => `${size}:${sizes[size]}`)
    .join("  ");

/**
 * Valores iniciales para el formulario de nueva orden de producción. Reposición NO crea órdenes: solo las sugiere;
 * la orden se revisa y se guarda en Órdenes de producción, ligada a la distribución de reposición.
 */
export function buildSuggestedOrder(kind, rows, { distribution, windowDays }) {
  const distributionText = distribution?.distributionNumber ? ` (${distribution.distributionNumber})` : "";
  const observations = `Sugerida por la reposición de kioscos${distributionText}: faltante en bodega, venta de ${windowDays} días.`;
  const isCincho = kind === "OPC";
  return {
    orderType: isCincho ? "CINCHOS_FOSSILES" : "NORMAL",
    forKiosk: true,
    customerName: "KIOSCOS",
    observations,
    distributionId: distribution?.id ?? null,
    distributionNumber: distribution?.distributionNumber ?? null,
    items: rows.map((r) => ({
      productId: r.productId,
      colorId: r.colorId ?? null,
      quantity: r.quantity,
      sizes: isCincho ? { ...r.sizes } : {},
      observations: "",
    })),
  };
}

function ReplenishmentProductionModal({ isOpen, toggle, kiosks, windowDays, distribution, onOpenOrder }) {
  const groups = useMemo(() => groupShortagesForProduction(kiosks), [kiosks]);
  const opkUnits = groups.opk.reduce((sum, r) => sum + r.quantity, 0);
  const opcUnits = groups.opc.reduce((sum, r) => sum + r.quantity, 0);
  const hasDistribution = Boolean(distribution?.id);

  const open = (kind) => {
    const rows = kind === "OPC" ? groups.opc : groups.opk;
    if (onOpenOrder) onOpenOrder(buildSuggestedOrder(kind, rows, { distribution, windowDays }));
  };

  const renderRows = (rows, withSizes) =>
    rows.map((r) => (
      <tr key={`${r.productId}|${r.colorId ?? ""}`}>
        <td>
          <strong>{r.productCode}</strong> {r.productName}
        </td>
        <td>{r.colorName || "—"}</td>
        {withSizes ? <td className="text-nowrap">{sizesLabel(r.sizes)}</td> : null}
        <td className="text-right">{r.quantity}</td>
        <td className="small kr-muted-text">{r.kiosks.size} kiosco(s)</td>
      </tr>
    ));

  return (
    <Modal isOpen={isOpen} toggle={toggle} size="lg" className="kr-modal dist-contrast">
      <ModalHeader toggle={toggle}>OPK sugerida para el faltante</ModalHeader>
      <ModalBody>
        {groups.opk.length === 0 && groups.opc.length === 0 ? (
          <p className="kr-muted-text mb-0">Los kioscos marcados no tienen faltante en bodega.</p>
        ) : (
          <>
            <Alert color="info" className="py-2 small kr-alert-info">
              Lo que no alcanza en Bodega PT + Devoluciones para los kioscos marcados. Reposición no crea órdenes:
              «Abrir orden» lleva a Órdenes de producción con estos productos ya cargados para que la revises y la
              guardes ahí.
              {hasDistribution
                ? ` Queda ligada a ${distribution.distributionNumber}: lo que produzca sale dentro de esa distribución.`
                : " Crea primero la distribución de reposición para que la orden quede ligada a ella."}
            </Alert>
            {groups.opk.length > 0 ? (
              <>
                <div className="d-flex justify-content-between align-items-center mt-2 flex-wrap">
                  <h6 className="mb-1">OPK · KIOSCOS — {groups.opk.length} producto(s), {opkUnits} unidades</h6>
                  <Button color="primary" size="sm" onClick={() => open("OPK")} disabled={!hasDistribution}>
                    Abrir OPK sugerida
                  </Button>
                </div>
                <Table size="sm" className="small">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Color</th>
                      <th className="text-right">Unidades</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderRows(groups.opk, false)}</tbody>
                </Table>
              </>
            ) : null}
            {groups.opc.length > 0 ? (
              <>
                <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap">
                  <h6 className="mb-1">OPC cinchos · KIOSCOS — {groups.opc.length} producto(s), {opcUnits} unidades</h6>
                  <Button color="primary" size="sm" onClick={() => open("OPC")} disabled={!hasDistribution}>
                    Abrir OPC sugerida
                  </Button>
                </div>
                <Table size="sm" className="small">
                  <thead>
                    <tr>
                      <th>Producto</th>
                      <th>Color</th>
                      <th>Tallas</th>
                      <th className="text-right">Unidades</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>{renderRows(groups.opc, true)}</tbody>
                </Table>
              </>
            ) : null}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <Button color="secondary" outline onClick={toggle}>
          Cerrar
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export default ReplenishmentProductionModal;
