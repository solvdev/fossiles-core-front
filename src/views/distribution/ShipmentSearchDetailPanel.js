import React, { useEffect } from "react";
import { Badge, Button, Table } from "reactstrap";
import { formatDateGt, formatDateTimeGt } from "utils/dateTimeHelper";
import { shipmentLines, shipmentStatusMeta, lineVariantLabel } from "utils/kioskShipmentsExport";
import { extractShipmentUserObservation } from "utils/shipmentNotesObservationHelper";
import { formatPackingItemLabel, getShipmentPackingItems } from "utils/shipmentPackingHelper";
import { originLabel, provenanceMeta } from "./shipmentsSearchFilters";

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const fmtQty = (v) => {
  const n = num(v);
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
};

function Step({ label, date, who, done }) {
  return (
    <div className={`shs-step${done ? " done" : ""}`}>
      <b>{label}</b>
      {date ? formatDateTimeGt(date) : "—"}
      {who ? <span className="shs-sub">{who}</span> : null}
    </div>
  );
}

/** Detalle de un envío sin salir del listado (Esc o clic fuera lo cierra). */
function ShipmentSearchDetailPanel({ item, onClose, onPrint, onExcel, onOpenDistribution }) {
  useEffect(() => {
    if (!item) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  if (!item) return null;
  const prov = provenanceMeta(item.provenance);
  const status = shipmentStatusMeta(item.status);
  const lines = shipmentLines(item);
  const packing = getShipmentPackingItems(item);
  const observation = extractShipmentUserObservation(item.notes);
  const origin = item.dispatchOrigin;
  const originText = !origin
    ? "No movió Devoluciones ni Bodega PT (o aún no sale)."
    : origin === "MIXTO"
      ? "Salió de las dos cubetas: Devoluciones y Bodega PT (faltante autorizado al enviar)."
      : `Salió de ${originLabel(origin)}.`;
  const hasReceipt = lines.some((l) => l.quantityReceived != null);

  return (
    <>
      <div className="shs-drawer-bg" onClick={onClose} aria-hidden="true" />
      <aside className="shs-drawer" role="dialog" aria-label={`Detalle del envío ${item.shipmentNumber || item.id}`}>
        <header>
          <div className="shs-dtop">
            <div>
              <div className="shs-num" style={{ fontSize: "1.05rem" }}>
                {item.shipmentNumber || `#${item.id}`}
              </div>
              <span className="shs-sub">
                {item.locationName || "Sin kiosco"}
                {item.locationCode ? ` · ${item.locationCode}` : ""}
                {item.locationDepartamento ? ` · ${item.locationDepartamento}` : ""}
              </span>
            </div>
            <Button close onClick={onClose} aria-label="Cerrar" />
          </div>
          <div className="shs-chips">
            <span className={`shs-prov ${prov.cls}`}>{prov.label}</span>
            <Badge color={status.color}>{status.label}</Badge>
            {item.receiptDifference ? <span className="shs-flag">Diferencia en recepción</span> : null}
          </div>
        </header>
        <div className="shs-body">
          <div className="shs-timeline">
            <Step label="Creado" date={item.createdAt} who={item.createdByName} done />
            <Step label="Enviado" date={item.sentAt} who={item.sentByName} done={Boolean(item.sentAt)} />
            <Step label="Recibido" date={item.receivedAt} who={item.receivedByName} done={Boolean(item.receivedAt)} />
          </div>
          <dl className="shs-kv">
            <div>
              <dt>Distribución</dt>
              <dd className="shs-num">
                {item.distributionNumber || (item.provenance === "DIRECTO" ? "Ninguna (envío directo)" : "—")}
              </dd>
            </div>
            <div>
              <dt>Orden de producción</dt>
              <dd className="shs-num">
                {item.productionOrderCode
                  ? `${item.productionOrderCode}${item.productionOrderType ? ` (${item.productionOrderType})` : ""}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt>Fecha del documento</dt>
              <dd>{item.documentDate ? formatDateGt(item.documentDate) : "—"}</dd>
            </div>
            <div>
              <dt>Unidades</dt>
              <dd>
                {fmtQty(item.totalUnits)} enviadas
                {hasReceipt ? ` · ${fmtQty(item.totalReceived)} recibidas` : ""}
              </dd>
            </div>
          </dl>
          <div className="shs-box">
            <h6>Origen de descarga</h6>
            <div>{originText}</div>
          </div>
          <div>
            <h6 className="shs-label mb-2">Productos</h6>
            {lines.length ? (
              <div style={{ overflowX: "auto" }}>
                <Table size="sm" className="mb-0">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th>Color</th>
                      <th>Talla</th>
                      <th className="text-right">Enviado</th>
                      {hasReceipt ? <th className="text-right">Recibido</th> : null}
                      {hasReceipt ? <th className="text-right">Dif.</th> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l, idx) => {
                      const diff =
                        l.quantityReceived == null
                          ? null
                          : l.quantityDifference != null
                            ? num(l.quantityDifference)
                            : num(l.quantityReceived) - num(l.quantity);
                      const variant = lineVariantLabel(l);
                      return (
                        <tr key={l.id || `${l.productId}-${l.colorId}-${l.size}-${idx}`}>
                          <td className="shs-num">{l.productCode}</td>
                          <td>
                            {l.productName}
                            {variant ? <span className="shs-sub">{variant}</span> : null}
                          </td>
                          <td>{l.colorName || "—"}</td>
                          <td>{l.size || "—"}</td>
                          <td className="text-right">{fmtQty(l.quantity)}</td>
                          {hasReceipt ? (
                            <td className="text-right">{l.quantityReceived == null ? "—" : fmtQty(l.quantityReceived)}</td>
                          ) : null}
                          {hasReceipt ? (
                            <td className={`text-right${diff ? " shs-diffneg" : ""}`}>{diff == null ? "—" : fmtQty(diff)}</td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </Table>
              </div>
            ) : (
              <p className="text-muted mb-0">
                {item.provenance === "HISTORICO"
                  ? "Envío histórico: se registró antes de Preparar envíos y no tiene líneas de producto."
                  : "Este envío no tiene líneas de producto."}
              </p>
            )}
          </div>
          {packing.length ? (
            <div className="shs-box">
              <h6>Material de empaque</h6>
              {packing.map((p) => (
                <div key={p.materialId}>
                  {formatPackingItemLabel(p)} · {fmtQty(p.quantity)}
                </div>
              ))}
            </div>
          ) : null}
          {observation || item.receivedNotes ? (
            <div className="shs-box">
              <h6>Notas</h6>
              {observation ? <div>{observation}</div> : null}
              {item.receivedNotes ? <div className="shs-sub">Recepción: {item.receivedNotes}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="shs-foot">
          <Button color="primary" size="sm" onClick={() => onPrint(item)}>
            Imprimir PDF
          </Button>
          <Button color="success" size="sm" outline onClick={() => onExcel(item)}>
            Excel
          </Button>
          {item.distributionId ? (
            <Button color="link" size="sm" onClick={() => onOpenDistribution(item.distributionId)}>
              Ver distribución {item.distributionNumber || ""}
            </Button>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export default ShipmentSearchDetailPanel;
