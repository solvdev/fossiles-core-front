/*!

=========================================================
* Paper Dashboard PRO React - v1.3.2
=========================================================

* Product Page: https://www.creative-tim.com/product/paper-dashboard-pro-react
* Copyright 2023 Creative Tim (https://www.creative-tim.com)

* Coded by Creative Tim

=========================================================

* The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

*/
import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Route, Routes, Navigate, useLocation } from "react-router-dom";

import AuthLayout from "layouts/Auth.js";
import AdminLayout from "layouts/Admin.js";
import ProtectedRoute from "components/ProtectedRoute";
import DefaultLandingRedirect from "components/DefaultLandingRedirect";
import { AuthProvider } from "contexts/AuthContext";
import { useAuth } from "contexts/AuthContext";
import { isAuthenticated, validateToken } from "services/authService";
import PublicMaterialKardexMobile from "views/public/PublicMaterialKardexMobile";
import PublicPtDispatchLanding from "views/public/PublicPtDispatchLanding";
import SolvDeskButton from "components/solvdesk/SolvDeskButton";

import "bootstrap/dist/css/bootstrap.css";
import "assets/scss/paper-dashboard.scss?v=1.3.1";
import "assets/demo/demo.css";
import "perfect-scrollbar/css/perfect-scrollbar.css";

// Importar el interceptor de fetch para detectar tokens expirados
import "utils/fetchInterceptor";

/**
 * Componente que valida el token al inicio y maneja las redirecciones
 */
function AppRoutes() {
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);
  const location = useLocation();
  const { user: authUser } = useAuth();
  const showSupportWidget = isValid && location.pathname.startsWith("/admin");

  useEffect(() => {
    const checkAuth = async () => {
      // Si no hay token en localStorage, no está autenticado
      if (!isAuthenticated()) {
        setIsValid(false);
        setIsValidating(false);
        return;
      }

      // Si hay token, validarlo con el backend
      try {
        const tokenValid = await validateToken();
        setIsValid(tokenValid);
      } catch (error) {
        console.error('Error al validar token:', error);
        setIsValid(false);
      } finally {
        setIsValidating(false);
      }
    };

    checkAuth();
  }, [location.pathname]);

  // Evita que el scroll del mouse cambie inputs numéricos (type="number")
  useEffect(() => {
    const onWheel = () => {
      const el = document.activeElement;
      if (!el) return;
      if (el.tagName !== "INPUT") return;
      if (el.type !== "number") return;
      if (el.disabled || el.readOnly) return;
      el.blur();
    };

    window.addEventListener("wheel", onWheel, true);
    return () => window.removeEventListener("wheel", onWheel, true);
  }, []);

  // Mostrar loading mientras se valida el token
  if (isValidating) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column'
      }}>
        <div className="spinner-border text-primary" role="status">
          <span className="sr-only">Cargando...</span>
        </div>
        <p className="mt-3">Verificando autenticación...</p>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/admin/materials-kardex/:materialId" element={<PublicMaterialKardexMobile />} />
        <Route path="/public/materials-kardex/:materialId" element={<PublicMaterialKardexMobile />} />
        <Route path="/public/pt-dispatch/online" element={<PublicPtDispatchLanding />} />
        <Route path="/public/pt-dispatch/distribution-shipment" element={<PublicPtDispatchLanding />} />
        <Route path="/public/pt-dispatch/distribution" element={<PublicPtDispatchLanding />} />

        {/* Rutas públicas de autenticación - redirigir si el token es válido */}
        <Route
          path="/auth/*"
          element={
            isValid ? <DefaultLandingRedirect /> : <AuthLayout />
          }
        />

        {/* Rutas protegidas del admin */}
        <Route
          path="/admin/*"
          element={
            isValid ? (
              <ProtectedRoute>
                <AdminLayout />
              </ProtectedRoute>
            ) : (
              <Navigate to="/auth/login" replace />
            )
          }
        />

        {/* Redirigir según autenticación */}
        <Route
          path="/"
          element={
            isValid ? (
              <DefaultLandingRedirect />
            ) : (
              <Navigate to="/auth/login" replace />
            )
          }
        />

        {/* Cualquier otra ruta */}
        <Route
          path="*"
          element={
            isValid ? (
              <DefaultLandingRedirect />
            ) : (
              <Navigate to="/auth/login" replace />
            )
          }
        />
      </Routes>

      {showSupportWidget && (
        <SolvDeskButton
          systemId={process.env.REACT_APP_SOLVDESK_SYSTEM_ID}
          apiKey={process.env.REACT_APP_SOLVDESK_API_KEY}
          userEmail={authUser?.email || ""}
          userName={
            authUser?.firstName && authUser?.lastName
              ? `${authUser.firstName} ${authUser.lastName}`
              : authUser?.username || authUser?.email || ""
          }
        />
      )}
    </>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <BrowserRouter>
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  </BrowserRouter>
);
