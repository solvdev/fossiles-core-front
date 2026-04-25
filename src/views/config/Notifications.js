import React, { useState } from "react";
import { Card, CardHeader, CardBody, CardTitle, Row, Col, Table, Button, Input, Label } from "reactstrap";

function Notifications() {
  const [settings, setSettings] = useState([]);
  return (
    <div className="content">
      <Row><Col md="12">
        <Card><CardHeader><CardTitle tag="h4">Notificaciones / Emails</CardTitle></CardHeader>
          <CardBody>
            <Row className="mb-3">
              <Col md="6"><Label>Email de Notificaciones</Label>
                <Input type="email" placeholder="notificaciones@empresa.com" />
              </Col>
              <Col md="6"><Label>Activar Notificaciones</Label>
                <Input type="select"><option value="yes">Sí</option><option value="no">No</option></Input>
              </Col>
            </Row>
            <Table responsive><thead className="text-primary"><tr><th>Evento</th><th>Email</th><th>Estado</th><th className="text-right">Acciones</th></tr></thead>
              <tbody><tr><td colSpan="4" className="text-center text-muted">No hay configuraciones</td></tr></tbody>
            </Table>
          </CardBody>
        </Card>
      </Col></Row>
    </div>
  );
}
export default Notifications;

