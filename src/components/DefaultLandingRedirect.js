import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "contexts/AuthContext";
import { resolveDefaultLandingRoute } from "utils/defaultLandingRoute";

/**
 * Redirige al módulo inicial según permisos (POS para encargadas, dashboard si aplica, etc.).
 */
function DefaultLandingRedirect() {
  const { permissions, loading, initialized, hasRole } = useAuth();

  if (loading || !initialized) {
    return (
      <div
        className="d-flex justify-content-center align-items-center"
        style={{ minHeight: "100vh" }}
      >
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="sr-only">Cargando...</span>
          </div>
          <p className="mt-3 text-muted">Preparando inicio...</p>
        </div>
      </div>
    );
  }

  const target = resolveDefaultLandingRoute(permissions, {
    isEncargada: hasRole("ENCARGADA"),
  });

  return <Navigate to={target} replace />;
}

export default DefaultLandingRedirect;
