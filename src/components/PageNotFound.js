import React from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, CardBody, Col, Row } from "reactstrap";
import { useAuth } from "contexts/AuthContext";
import { resolveDefaultLandingRoute } from "utils/defaultLandingRoute";

/** Ruta del panel que no corresponde a ninguna pantalla: se muestra dentro del diseño, con el menú y el pie en su lugar. */
const PageNotFound = () => {
  const navigate = useNavigate();
  const { permissions, hasRole } = useAuth();
  const landingRoute = resolveDefaultLandingRoute(permissions, { isEncargada: hasRole("ENCARGADA") });

  return (
    <div className="content">
      <Row className="justify-content-center">
        <Col md="8" lg="6">
          <Card className="mt-5">
            <CardBody className="text-center py-5">
              <i className="nc-icon nc-zoom-split mb-4" style={{ fontSize: "96px", color: "#9a9a9a" }} />
              <h2 className="mb-3" style={{ color: "#2c2c2c", fontWeight: "600" }}>Página no encontrada</h2>
              <p className="text-muted mb-4">La dirección no corresponde a ninguna pantalla del sistema.</p>
              <Button color="primary" onClick={() => navigate(landingRoute)}>
                Ir al inicio
              </Button>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default PageNotFound;
