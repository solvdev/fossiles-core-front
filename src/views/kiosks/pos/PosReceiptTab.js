import React, { useCallback, useEffect, useState } from "react";
import { getShipmentsInTransit, getShipmentsByStatus } from "services/productDistributionService";
import { showError } from "utils/notificationHelper";
import ShipmentReceiptPanel from "components/distribution/ShipmentReceiptPanel";
import PosReceiptModal from "./PosReceiptModal";

function PosReceiptTab({ kioskLocationId, kioskName, onReceiptConfirmed, onPendingCountChange }) {
  const [shipments, setShipments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const loadShipments = useCallback(async () => {
    const locationId =
      kioskLocationId != null && kioskLocationId !== "" ? Number(kioskLocationId) : null;
    if (!locationId || Number.isNaN(locationId)) {
      setShipments([]);
      if (onPendingCountChange) onPendingCountChange(0);
      return;
    }
    try {
      setLoading(true);
      const [inTransit, deliveredRows] = await Promise.all([
        getShipmentsInTransit(locationId),
        getShipmentsByStatus("DELIVERED"),
      ]);
      const deliveredForKiosk = (deliveredRows || []).filter(
        (row) => Number(row.locationId) === locationId
      );
      const merged = [...(inTransit || []), ...deliveredForKiosk];
      const byId = new Map();
      merged.forEach((shipment) => {
        if (shipment?.id != null) {
          byId.set(shipment.id, shipment);
        }
      });
      const rows = Array.from(byId.values());
      setShipments(rows);
      if (onPendingCountChange) {
        onPendingCountChange(rows.filter((s) => String(s.status || "").toUpperCase() === "SENT").length);
      }
    } catch (err) {
      showError(err.message || "No se pudieron cargar las distribuciones pendientes.");
      setShipments([]);
      if (onPendingCountChange) onPendingCountChange(0);
    } finally {
      setLoading(false);
    }
  }, [kioskLocationId, onPendingCountChange]);

  useEffect(() => {
    loadShipments();
  }, [loadShipments]);

  const handleSelectShipment = (shipment) => {
    if (!shipment) {
      setSelectedShipment(null);
      setModalOpen(false);
      return;
    }
    setSelectedShipment(shipment);
    setModalOpen(true);
  };

  const closeReceiptModal = () => {
    setModalOpen(false);
    setSelectedShipment(null);
  };

  const handleConfirmed = async () => {
    await loadShipments();
    if (onReceiptConfirmed) {
      await onReceiptConfirmed();
    }
  };

  return (
    <>
      <ShipmentReceiptPanel
        shipments={shipments}
        loading={loading}
        kioskName={kioskName}
        onRefresh={loadShipments}
        refreshDisabled={loading}
        onSelectShipment={handleSelectShipment}
        emptyMessage="No hay envíos pendientes de recepción para este kiosko."
      />

      <PosReceiptModal
        isOpen={modalOpen}
        shipment={selectedShipment}
        onClose={closeReceiptModal}
        onConfirmed={handleConfirmed}
      />
    </>
  );
}

export default PosReceiptTab;
