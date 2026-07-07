import React from "react";
import { Col, Row } from "reactstrap";
import "./KioskInventory.css";

const STAT_ITEMS = [
  { key: "totalKiosks", label: "Kioskos", accent: "accent-blue" },
  { key: "totalUnits", label: "Unidades totales", accent: "accent-green" },
  { key: "totalLowStockRows", label: "Items stock bajo", accent: "accent-amber" },
  { key: "totalStockRows", label: "Filas inventario", accent: "accent-slate" },
];

function KioskInventoryStatsBar({ consolidated }) {
  if (!consolidated) return null;

  return (
    <Row className="kiosk-inv-stats mb-3">
      {STAT_ITEMS.map((item) => (
        <Col md="3" sm="6" xs="12" key={item.key} className="mb-2 mb-md-0">
          <div className={`kiosk-inv-stat-card ${item.accent}`}>
            <div className="kiosk-inv-stat-label">{item.label}</div>
            <div className="kiosk-inv-stat-value">{consolidated[item.key] ?? 0}</div>
          </div>
        </Col>
      ))}
    </Row>
  );
}

export default KioskInventoryStatsBar;
