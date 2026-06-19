import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Spinner,
  Table,
} from "reactstrap";
import {
  deletePartialRelease,
  getProductionOrderPartialReleases,
} from "services/productionOrderService";
import { isCinchoOrderType } from "utils/cinchoProductionHelper";
import {
  countPartialReleaseSavedLines,
  orderAllowsPartialReleases,
  releaseLineCount,
  releaseTotalUnits,
} from "utils/partialReleaseHelper";
import { classifyPrepareOrder, isEntreCuerosCustomerOpv } from "utils/prepareShipmentsOrderHelper";
import { showError, showSuccess } from "utils/notificationHelper";
import { formatDateGt } from "utils/dateTimeHelper";
import PartialReleaseEditorModal from "components/production/PartialReleaseEditorModal";
import OpcGenerateShipmentModal from "components/production/OpcGenerateShipmentModal";

const STATUS_COLORS = { DRAFT: "secondary", CONFIRMED: "info", SHIPPED: "success" };
const SHIPMENT_STATUS_ES = {
  DRAFT: "Borrador",
  CONFIRMED: "Confirmado",
  SENT: "Enviado",
  DELIVERED: "Entregado",
  CANCELLED: "Anulado",
};
const tShipmentStatus = (status) => SHIPMENT_STATUS_ES[String(status || "").toUpperCase()] || status || "—";

const partialReleaseStatusLabel = (release) => {
  if (release?.status === "SHIPPED") return "Envío generado";
  if (release?.status === "CONFIRMED") return "Confirmado";
  if (release?.status === "DRAFT") return "Borrador";
  return release?.status || "—";
};

function ProductionOrderPartialReleasesPanel({
  order,
  onRefresh,
  context = "order-form",
  onEditShipment,
  onSendShipment,
}) {
  const orderId = order?.id;
  const eligible = orderId && orderAllowsPartialReleases(order);
  const cincho = isCinchoOrderType(order?.orderType);
  const prepareKind = classifyPrepareOrder(order);
  const panelTitle = cincho
    ? "Liberaciones parciales (OPC)"
    : prepareKind === "OPCK"
      ? "Liberaciones parciales (OPCK)"
      : prepareKind === "OPK"
        ? "Liberaciones parciales (OPK)"
        : isEntreCuerosCustomerOpv(order)
          ? "Liberaciones parciales (Entre Cueros)"
          : "Liberaciones parciales (Luis Felipe)";

  const [listData, setListData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState("edit");
  const [editingRelease, setEditingRelease] = useState(null);
  const [shipmentModalOpen, setShipmentModalOpen] = useState(false);
  const [shipmentRelease, setShipmentRelease] = useState(null);
  const [sendingReleaseId, setSendingReleaseId] = useState(null);

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    try {
      const data = await getProductionOrderPartialReleases(orderId);
      setListData(data);
    } catch (err) {
      showError(err.message || "No se pudieron cargar las liberaciones");
      setListData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    if (eligible) load();
  }, [eligible, load]);

  const closeEditor = () => {
    setEditorOpen(false);
    setEditingRelease(null);
    setEditorMode("edit");
  };

  const openNewEditor = () => {
    setEditingRelease(null);
    setEditorMode("edit");
    setEditorOpen(true);
  };

  const openEditEditor = (release) => {
    setEditingRelease(release);
    setEditorMode("edit");
    setEditorOpen(true);
  };

  const openReviewGenerate = (release) => {
    setEditingRelease(release);
    setEditorMode("review-generate");
    setEditorOpen(true);
  };

  const handleAfterSave = async () => {
    await load();
    if (onRefresh) onRefresh();
  };

  const handleDelete = async (release) => {
    if (!release?.id || !window.confirm(`¿Eliminar ${release.label || "este envío parcial"}?`)) return;
    try {
      await deletePartialRelease(release.id);
      showSuccess("Envío parcial eliminado");
      await load();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message);
    }
  };

  const handleGenerateShipmentClick = async (release) => {
    if (!release?.id) return;
    if (cincho) {
      setShipmentRelease(release);
      setShipmentModalOpen(true);
      return;
    }
    openReviewGenerate(release);
  };

  const handleSendShipmentClick = async (release) => {
    if (!release?.shipmentId || !onSendShipment) return;
    setSendingReleaseId(release.id);
    try {
      await onSendShipment(release);
      await load();
      if (onRefresh) onRefresh();
    } catch (err) {
      showError(err.message || "No se pudo enviar");
    } finally {
      setSendingReleaseId(null);
    }
  };

  if (!eligible) return null;

  const releases = listData?.releases || [];
  const availabilityRows = listData?.orderItemAvailability || [];
  const isPrepare = context === "prepare-shipments";

  return (
    <Card className={`mt-3 border-primary${isPrepare ? "" : ""}`}>
      <CardHeader className="d-flex justify-content-between align-items-center py-2">
        <strong>{panelTitle}</strong>
        <Button color="primary" size="sm" onClick={openNewEditor} disabled={loading}>
          Nuevo envío parcial
        </Button>
      </CardHeader>
      <CardBody>
        {isPrepare && prepareKind === "OPK" && (
          <Alert color="info" className="py-2 small mb-2">
            <strong>Generar envío</strong> solo crea el documento confirmado.
            Después use el botón <strong>Enviar</strong> (en esta tabla o abajo) para ponerlo en tránsito.
          </Alert>
        )}
        {isPrepare && (
          <p className="text-muted small mb-2">
            Cree cada entrega como un envío parcial, marque qué productos van y genere el documento aquí;
            aparecerá abajo en la lista para imprimir.
          </p>
        )}
        {!isPrepare && (
          <p className="text-muted small mb-2">
            Defina qué cantidades salen en cada entrega sin crear otra OP. Ej.: pedido 100 → parcial 86 → envío 1;
            luego parcial 14 → envío 2.
          </p>
        )}
        {loading && <Spinner size="sm" />}
        {!loading && releases.length === 0 && (
          <Alert color="light" className="mb-0 py-2">
            Sin envíos parciales. Use <strong>Nuevo envío parcial</strong> para elegir productos de esta orden.
          </Alert>
        )}
        {releases.length > 0 && (
          <Table size="sm" bordered responsive className="mb-0">
            <thead>
              <tr>
                <th>#</th>
                <th>Etiqueta</th>
                <th>Estado</th>
                <th>Creado por</th>
                <th>Fecha creación</th>
                <th>Envío</th>
                <th style={{ width: 280 }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => {
                const rowCount = releaseLineCount(r);
                const savedLineCount = countPartialReleaseSavedLines(r, order?.orderType);
                const totalUnits = releaseTotalUnits(r, order?.orderType);
                const canGenerate = r.status === "CONFIRMED" && !r.shipmentNumber;
                const canSend =
                  Boolean(r.shipmentId) &&
                  String(r.shipmentStatus || "").trim().toUpperCase() === "CONFIRMED" &&
                  Boolean(onSendShipment);
                return (
                  <tr key={r.id}>
                    <td>{r.sequence}</td>
                    <td>
                      {r.label}
                      {savedLineCount > 0 ? (
                        <small className="d-block text-muted">
                          {savedLineCount} producto(s) · {totalUnits} uds
                        </small>
                      ) : rowCount > 0 && r.status === "CONFIRMED" ? (
                        <small className="d-block text-danger">
                          {rowCount} línea(s) sin cantidad (todo en cero)
                        </small>
                      ) : r.status === "CONFIRMED" ? (
                        <small className="d-block text-danger">Sin líneas guardadas</small>
                      ) : null}
                    </td>
                    <td>
                      <Badge color={STATUS_COLORS[r.status] || "secondary"}>
                        {partialReleaseStatusLabel(r)}
                      </Badge>
                      {r.shipmentStatus && (
                        <small className="d-block text-muted mt-1">
                          Envío: <strong>{tShipmentStatus(r.shipmentStatus)}</strong>
                        </small>
                      )}
                    </td>
                    <td>{r.createdByName || "—"}</td>
                    <td>{r.createdAt ? formatDateGt(r.createdAt) : "—"}</td>
                    <td>
                      {r.shipmentNumber ? <code>{r.shipmentNumber}</code> : "—"}
                    </td>
                    <td>
                      {r.status !== "SHIPPED" && (
                        <Button
                          color="link"
                          size="sm"
                          className="p-0 mr-2"
                          onClick={() => openEditEditor(r)}
                        >
                          Editar parcial
                        </Button>
                      )}
                      {r.status === "SHIPPED" && r.shipmentId && onEditShipment && (
                        <Button
                          color="link"
                          size="sm"
                          className="p-0 mr-2"
                          onClick={() => onEditShipment(r)}
                          title="Editar productos del envío generado"
                        >
                          Editar envío
                        </Button>
                      )}
                      {r.status === "DRAFT" && (
                        <Button
                          color="link"
                          size="sm"
                          className="p-0 mr-2 text-danger"
                          onClick={() => handleDelete(r)}
                        >
                          Eliminar
                        </Button>
                      )}
                      {canGenerate && (
                        <Button color="success" size="sm" onClick={() => handleGenerateShipmentClick(r)} className="mr-1">
                          Generar envío
                        </Button>
                      )}
                      {canSend && (
                        <Button
                          color="primary"
                          size="sm"
                          disabled={sendingReleaseId === r.id}
                          onClick={() => handleSendShipmentClick(r)}
                        >
                          {sendingReleaseId === r.id ? <Spinner size="sm" /> : "Enviar"}
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardBody>

      <PartialReleaseEditorModal
        isOpen={editorOpen}
        toggle={closeEditor}
        order={order}
        release={editingRelease}
        availabilityRows={availabilityRows}
        mode={editorMode}
        onSaved={handleAfterSave}
        onGenerated={handleAfterSave}
      />

      {cincho && shipmentRelease && (
        <OpcGenerateShipmentModal
          isOpen={shipmentModalOpen}
          toggle={() => {
            setShipmentModalOpen(false);
            setShipmentRelease(null);
          }}
          order={order}
          partialRelease={shipmentRelease}
          onGenerated={() => {
            handleAfterSave();
            setShipmentModalOpen(false);
            setShipmentRelease(null);
          }}
        />
      )}
    </Card>
  );
}

export default ProductionOrderPartialReleasesPanel;
