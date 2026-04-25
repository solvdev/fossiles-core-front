import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from 'contexts/AuthContext';
import AccessDenied from './AccessDenied';

/**
 * Higher Order Component para proteger rutas basándose en permisos
 * 
 * @param {Object} props
 * @param {React.Component} props.children - Componente a renderizar si tiene permisos
 * @param {string|string[]} props.permission - Código(s) de permiso requerido(s)
 * @param {boolean} props.requireAll - Si es true, requiere todos los permisos; si es false, requiere al menos uno
 * @param {string} props.redirectTo - Ruta a la que redirigir si no está autenticado (default: '/auth/login')
 * @param {boolean} props.showAccessDenied - Si es true, muestra AccessDenied en lugar de redirigir
 */
const ProtectedRoute = ({
  children,
  permission,
  requireAll = false,
  redirectTo = '/auth/login',
  showAccessDenied = true,
}) => {
  const { hasPermission, hasAnyPermission, hasAllPermissions, loading, initialized, user, permissions, refreshUserData } = useAuth();
  const location = useLocation();
  const [retryCount, setRetryCount] = React.useState(0);
  const [isRetrying, setIsRetrying] = React.useState(false);
  const maxRetries = 5; // Aumentar reintentos

  // Si hay usuario pero no hay permisos cargados y ya se inicializó, intentar recargar
  React.useEffect(() => {
    if (user && initialized && !loading && permissions.length === 0 && retryCount < maxRetries && !isRetrying) {
      setIsRetrying(true);
      const timer = setTimeout(async () => {
        console.log(`Reintentando cargar permisos (intento ${retryCount + 1}/${maxRetries})...`);
        try {
          await refreshUserData();
        } catch (error) {
          console.error('Error al recargar permisos:', error);
        } finally {
          setRetryCount(prev => prev + 1);
          setIsRetrying(false);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [user, initialized, loading, permissions.length, retryCount, maxRetries, isRetrying, refreshUserData]);

  // Si aún se están cargando los datos, mostrar loading
  if (loading || !initialized) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Cargando...</span>
          </div>
          <p className="mt-3 text-muted">Verificando permisos...</p>
        </div>
      </div>
    );
  }

  // Si hay usuario pero los permisos aún están vacíos y estamos en proceso de reintentos, mostrar loading
  if (user && permissions.length === 0 && (retryCount < maxRetries || isRetrying)) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '100vh' }}>
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Cargando...</span>
          </div>
          <p className="mt-3 text-muted">Cargando permisos...</p>
        </div>
      </div>
    );
  }

  // Si no hay permiso requerido, permitir acceso
  if (!permission) {
    return children;
  }

  // Verificar permisos
  let hasAccess = false;
  if (Array.isArray(permission)) {
    hasAccess = requireAll 
      ? hasAllPermissions(permission)
      : hasAnyPermission(permission);
  } else {
    hasAccess = hasPermission(permission);
  }

  // Si no tiene acceso, mostrar AccessDenied o redirigir
  if (!hasAccess) {
    if (showAccessDenied) {
      const deniedLabel = Array.isArray(permission) ? permission.join(', ') : permission;
      return <AccessDenied requiredPermission={deniedLabel} />;
    }
    return <Navigate to={redirectTo} state={{ from: location }} replace />;
  }

  // Si tiene acceso, renderizar el componente
  return children;
};

export default ProtectedRoute;
