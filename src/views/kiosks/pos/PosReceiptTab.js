import React, { useCallback, useEffect, useState } from "react";
import { getShipmentsByStatus, getShipmentsInTransit } from "services/productDistributionService";
import { showError } from "utils/notificationHelper";
import ShipmentReceiptPanel, { shipmentPendingTotal } from "components/distribution/ShipmentReceiptPanel";
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
      const [inTransit, delivered] = await Promise.all([
        getShipmentsInTransit(locationId),
        getShipmentsByStatus("DELIVERED").catch(() => []),
      ]);
      // Entregados con unidades aún en tránsito: el kiosko las recibe cuando lleguen.
      const withPending = (delivered || []).filter(
        (s) => Number(s.locationId) === locationId && shipmentPendingTotal(s) > 0
      );
      const rows = [...(inTransit || []), ...withPending];
      setShipments(rows);
      if (onPendingCountChange) {
        onPendingCountChange(rows.length);
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
