import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { isAuthenticated } from '../services/authService';
import { hasPermission } from '../utils/permissionHelper';
import { Alert, Spinner } from 'reactstrap';

/**
 * Componente para proteger rutas basado en permisos
 * Verifica que el usuario esté autenticado y tenga el permiso requerido
 */
const PermissionProtectedRoute = ({ children, requiredPermission, fallbackPath = "/admin/dashboard-production" }) => {
  const [isAuthorized, setIsAuthorized] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkPermission = async () => {
      // Primero verificar autenticación
      if (!isAuthenticated()) {
        setIsAuthorized(false);
        setLoading(false);
        return;
      }

      // Si no se requiere permiso específico, solo verificar autenticación
      if (!requiredPermission) {
        setIsAuthorized(true);
        setLoading(false);
        return;
      }

      // Verificar permiso
      try {
        const hasAccess = await hasPermission(requiredPermission);
        setIsAuthorized(hasAccess);
      } catch (error) {
        console.error('Error al verificar permiso:', error);
        setIsAuthorized(false);
      } finally {
        setLoading(false);
      }
    };

    checkPermission();
  }, [requiredPermission]);

  if (loading) {
    return (
      <div className="content" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <div className="text-center">
          <Spinner color="primary" />
          <p className="mt-3">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated()) {
    return <Navigate to="/auth/login" replace />;
  }

  if (!isAuthorized) {
    return (
      <div className="content">
        <Alert color="danger" className="m-4">
          <h4 className="alert-heading">Acceso Denegado</h4>
          <p>
            No tienes permisos para acceder a esta sección.
            {requiredPermission && (
              <span className="d-block mt-2">
                <strong>Permiso requerido:</strong> {requiredPermission}
              </span>
            )}
          </p>
          <hr />
          <p className="mb-0">
            <a href={fallbackPath} className="alert-link">
              Volver al inicio
            </a>
          </p>
        </Alert>
      </div>
    );
  }

  return children;
};

export default PermissionProtectedRoute;

