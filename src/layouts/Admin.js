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
import { Route, Routes, useLocation } from "react-router-dom";
import NotificationAlert from "react-notification-alert";

import AdminNavbar from "components/Navbars/AdminNavbar.js";
import Footer from "components/Footer/Footer.js";
import Sidebar from "components/Sidebar/Sidebar.js";
import FixedPlugin from "components/FixedPlugin/FixedPlugin.js";
import ProtectedRoute from "components/ProtectedRoute.js";
import DefaultLandingRedirect from "components/DefaultLandingRedirect.js";
import { setNotificationRef } from "utils/notificationHelper";

import routes from "routes.js";

const routePermissionCodes = (permissions) => {
  if (!permissions) return null;
  const codes = Object.values(permissions).flat().filter(Boolean);
  return codes.length > 0 ? codes : null;
};

var ps;

function Admin(props) {
  const location = useLocation();

  const [backgroundColor, setBackgroundColor] = React.useState("black");
  const [activeColor, setActiveColor] = React.useState("info");
  const [sidebarMini, setSidebarMini] = React.useState(false);
  const mainPanel = React.useRef();
  const notificationAlert = React.useRef();
  
  React.useEffect(() => {
    setNotificationRef(notificationAlert);
  }, []);
  React.useEffect(() => {
    if (navigator.platform.indexOf("Win") > -1) {
      document.documentElement.className += " perfect-scrollbar-on";
      document.documentElement.classList.remove("perfect-scrollbar-off");
      ps = new PerfectScrollbar(mainPanel.current);
    }
    // Estilo para cambiar el color de fondo del sidebar
    const style = document.createElement('style');
    style.textContent = `
      .sidebar:after {
        background: #283240 !important;
        background-image: none !important;
      }
      .sidebar {
        background-color: #283240 !important;
      }
    `;
    document.head.appendChild(style);
    return function cleanup() {
      if (navigator.platform.indexOf("Win") > -1) {
        ps.destroy();
        document.documentElement.className += " perfect-scrollbar-off";
        document.documentElement.classList.remove("perfect-scrollbar-on");
      }
      document.head.removeChild(style);
    };
  });
  React.useEffect(() => {
    document.documentElement.scrollTop = 0;
    document.scrollingElement.scrollTop = 0;
    mainPanel.current.scrollTop = 0;
  }, [location]);
  const getRoutes = (routesList) => {
    const routeByPath = new Map();

    const collect = (items) => {
      (items || []).forEach((prop) => {
        if (prop.collapse) {
          collect(prop.views);
          return;
        }
        if (prop.layout !== "/admin") {
          return;
        }
        const codes = routePermissionCodes(prop.permissions);
        const existing = routeByPath.get(prop.path);
        if (existing) {
          const merged = [...new Set([...(existing.permission || []), ...(codes || [])])];
          routeByPath.set(prop.path, {
            ...existing,
            permission: merged.length > 0 ? merged : null,
          });
          return;
        }
        routeByPath.set(prop.path, {
          path: prop.path,
          component: prop.component,
          permission: codes,
        });
      });
    };

    collect(routesList);

    return Array.from(routeByPath.values()).map((route) => (
      <Route
        path={route.path}
        element={
          <ProtectedRoute permission={route.permission}>
            {route.component}
          </ProtectedRoute>
        }
        key={route.path}
      />
    ));
  };
  const handleActiveClick = (color) => {
    setActiveColor(color);
  };
  const handleBgClick = (color) => {
    setBackgroundColor(color);
  };
  const handleMiniClick = () => {
    if (document.body.classList.contains("sidebar-mini")) {
      setSidebarMini(false);
    } else {
      setSidebarMini(true);
    }
    document.body.classList.toggle("sidebar-mini");
  };
  return (
    <div className="wrapper">
      <NotificationAlert ref={notificationAlert} />
      <Sidebar
        {...props}
        routes={routes}
        bgColor={backgroundColor}
        activeColor={activeColor}
      />
      <div className="main-panel" ref={mainPanel}>
        <AdminNavbar {...location} handleMiniClick={handleMiniClick} />
        <Routes>
          <Route index element={<DefaultLandingRedirect />} />
          {getRoutes(routes)}
        </Routes>
        {
          // we don't want the Footer to be rendered on full screen maps page
          location.pathname.indexOf("full-screen-map") !== -1 ? null : (
            <Footer fluid />
          )
        }
      </div>
      {/* <FixedPlugin
        bgColor={backgroundColor}
        activeColor={activeColor}
        sidebarMini={sidebarMini}
        handleActiveClick={handleActiveClick}
        handleBgClick={handleBgClick}
        handleMiniClick={handleMiniClick}
      /> */}
    </div>
  );
}

export default Admin;
