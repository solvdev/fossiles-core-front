import React from "react";
import { useLocation } from "react-router-dom";

/**
 * Página mínima si alguien abre el QR en navegador (el flujo real es escanear desde la app móvil).
 */
const PublicPtDispatchLanding = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const pathLower = location.pathname.toLowerCase();
  const isDistributionShipment = pathLower.includes("distribution-shipment");
  const isDistributionList = pathLower.includes("/pt-dispatch/distribution") && !isDistributionShipment;
  const onlineSaleId = params.get("onlineSaleId") || "";
  const productionOrderId = params.get("productionOrderId") || "";
  const shipmentId = params.get("shipmentId") || "";
  const distributionId = params.get("distributionId") || "";

  return (
    <div style={{ padding: 24, fontFamily: "system-ui, sans-serif", maxWidth: 480, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20 }}>Despacho Bodega PT</h1>
      <p style={{ color: "#334155", lineHeight: 1.5 }}>
        Este código está pensado para la app <strong>Inventario Fossiles</strong> en modo{" "}
        <strong>Bodega PT</strong>. Abrí la app, modo Bodega PT, y usá &quot;Escanear despacho&quot;.
      </p>
      {isDistributionShipment ? (
        <p>
          <strong>Envío distribución</strong> ID: {shipmentId || "—"}
        </p>
      ) : isDistributionList ? (
        <p>
          <strong>Distribución</strong> ID: {distributionId || "—"} (todos los envíos en la app)
        </p>
      ) : (
        <>
          <p>
            <strong>Venta en línea</strong> ID: {onlineSaleId || "—"}
          </p>
          {productionOrderId ? (
            <p>
              <strong>Orden producción</strong> ID: {productionOrderId}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
};

export default PublicPtDispatchLanding;
