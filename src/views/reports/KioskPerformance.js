import React, { useState } from "react";
import { Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Button } from "reactstrap";

function KioskPerformance() {
  return (
    <div className="content">
      <Row><Col md="12">
        <Card><CardHeader><CardTitle tag="h4">Desempeño de Kioscos</CardTitle></CardHeader>
          <CardBody>
            <p className="text-muted">Top sellers, rotación, devoluciones</p>
            <Button color="primary" className="btn-round mb-3"><i className="nc-icon nc-zoom-split" /> Generar Reporte</Button>
            <Table responsive><thead className="text-primary"><tr><th>Kiosko</th><th>Ventas</th><th>Rotación</th><th>Devoluciones</th></tr></thead>
              <tbody><tr><td colSpan="4" className="text-center text-muted">Genere el reporte</td></tr></tbody>
            </Table>
          </CardBody>
        </Card>
      </Col></Row>
    </div>
  );
}
export default KioskPerformance;

