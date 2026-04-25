import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardBody, Button, Row, Col } from 'reactstrap';

/**
 * Componente que se muestra cuando un usuario no tiene permisos para acceder a una sección
 */
const AccessDenied = ({ requiredPermission, message }) => {
  const navigate = useNavigate();

  return (
    <div className="content">
      <Row className="justify-content-center">
        <Col md="8" lg="6">
          <Card className="mt-5">
            <CardBody className="text-center py-5">
              <div className="mb-4">
                <i 
                  className="nc-icon nc-lock-circle-open" 
                  style={{ fontSize: '120px', color: '#dc3545' }}
                />
              </div>
              
              <h2 className="mb-3" style={{ color: '#2c2c2c', fontWeight: '600' }}>
                Acceso Denegado
              </h2>
              
              <p className="text-muted mb-4" style={{ fontSize: '1.1em' }}>
                {message || 'No tienes permisos para acceder a esta sección.'}
              </p>
              
              {requiredPermission && (
                <div className="mb-4">
                  <p className="text-muted small">
                    Permiso requerido: <code className="text-danger">{requiredPermission}</code>
                  </p>
                </div>
              )}
              
              <p className="text-muted mb-4">
                Si crees que esto es un error, contacta al administrador del sistema.
              </p>
              
              <Button
                color="primary"
                size="lg"
                onClick={() => navigate('/admin/dashboard-production')}
                className="mt-3"
              >
                <i className="nc-icon nc-chart-bar-32 mr-2" />
                Volver al Dashboard
              </Button>
            </CardBody>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default AccessDenied;

