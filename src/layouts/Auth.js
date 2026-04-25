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
import React from "react";
// javascript plugin used to create scrollbars on windows
import PerfectScrollbar from "perfect-scrollbar";
import { Route, Routes, Navigate } from "react-router-dom";

import Footer from "components/Footer/Footer.js";
import { isAuthenticated } from "services/authService";

import routes from "routes.js";

var ps;

function Pages() {
  const fullPages = React.useRef();
  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      ps = new PerfectScrollbar(fullPages.current);
    }
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
      }
    };
  });
  const getRoutes = (routes) => {
    return routes.map((prop, key) => {
      if (prop.collapse) {
        return getRoutes(prop.views);
      }
      if (prop.layout === "/auth") {
        return (
          <Route path={prop.path} element={prop.component} key={key} exact />
        );
      } else {
        return null;
      }
    });
  };
  return (
    <>
      <div className="wrapper wrapper-full-page" ref={fullPages}>
        <div className="full-page section-image">
          <Routes>
            {getRoutes(routes)}
            {/* Ruta por defecto: redirigir a login si no hay coincidencia */}
            <Route path="*" element={<Navigate to="/auth/login" replace />} />
          </Routes>
          <Footer fluid />
        </div>
      </div>
    </>
  );
}

export default Pages;
