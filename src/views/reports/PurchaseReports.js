import React, { useState } from "react";
import { Nav, NavItem, NavLink, TabContent, TabPane } from "reactstrap";
import OrdersByStatusReport from "./purchases/OrdersByStatusReport";
import PurchasesBySupplierReport from "./purchases/PurchasesBySupplierReport";
import CurrentInventoryReport from "./purchases/CurrentInventoryReport";
import CriticalMaterialsReport from "./purchases/CriticalMaterialsReport";
import AccountingEntriesReport from "./purchases/AccountingEntriesReport";
import ExecutiveDashboard from "./purchases/ExecutiveDashboard";

function PurchaseReports() {
  const [activeTab, setActiveTab] = useState("1");

  const toggle = (tab) => {
    if (activeTab !== tab) setActiveTab(tab);
  };

  return (
    <div className="content">
      <div className="row">
        <div className="col-md-12">
          <div className="card">
            <div className="card-header">
              <h4 className="card-title">Reportes de Compras</h4>
            </div>
            <div className="card-body">
              <Nav tabs>
                <NavItem>
                  <NavLink
                    className={activeTab === "1" ? "active" : ""}
                    onClick={() => toggle("1")}
                  >
                    Dashboard Ejecutivo
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "2" ? "active" : ""}
                    onClick={() => toggle("2")}
                  >
                    Órdenes por Estado
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "3" ? "active" : ""}
                    onClick={() => toggle("3")}
                  >
                    Compras por Proveedor
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "4" ? "active" : ""}
                    onClick={() => toggle("4")}
                  >
                    Inventario Actual
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "5" ? "active" : ""}
                    onClick={() => toggle("5")}
                  >
                    Materiales Críticos
                  </NavLink>
                </NavItem>
                <NavItem>
                  <NavLink
                    className={activeTab === "6" ? "active" : ""}
                    onClick={() => toggle("6")}
                  >
                    Asientos Contables
                  </NavLink>
                </NavItem>
              </Nav>
              <TabContent activeTab={activeTab}>
                <TabPane tabId="1">
                  <ExecutiveDashboard />
                </TabPane>
                <TabPane tabId="2">
                  <OrdersByStatusReport />
                </TabPane>
                <TabPane tabId="3">
                  <PurchasesBySupplierReport />
                </TabPane>
                <TabPane tabId="4">
                  <CurrentInventoryReport />
                </TabPane>
                <TabPane tabId="5">
                  <CriticalMaterialsReport />
                </TabPane>
                <TabPane tabId="6">
                  <AccountingEntriesReport />
                </TabPane>
              </TabContent>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PurchaseReports;

