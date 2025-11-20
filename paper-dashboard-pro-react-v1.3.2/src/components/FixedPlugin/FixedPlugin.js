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
import React, { Component } from "react";
// react plugin used to create switch buttons
import Switch from "react-bootstrap-switch";

import { Button } from "reactstrap";

function FixedPlugin(props) {
  const [classes, setClasses] = React.useState("dropdown show");
  const handleClick = () => {
    if (classes === "dropdown") {
      setClasses("dropdown show");
    } else {
      setClasses("dropdown");
    }
  };
  return (
    <div className="fixed-plugin">
      <div className={classes}>
        <div onClick={handleClick}>
          <i className="fa fa-cog fa-2x" />
        </div>
        <ul className="dropdown-menu show">
          <li className="header-title">SIDEBAR BACKGROUND</li>
          <li className="adjustments-line">
            <div className="badge-colors text-center">
              <span
                className={
                  props.bgColor === "black"
                    ? "badge filter badge-dark active"
                    : "badge filter badge-dark"
                }
                data-color="black"
                onClick={() => {
                  props.handleBgClick("black");
                }}
              />
              <span
                className={
                  props.bgColor === "brown"
                    ? "badge filter badge-default active"
                    : "badge filter badge-default"
                }
                data-color="black"
                onClick={() => {
                  props.handleBgClick("brown");
                }}
              />
              <span
                className={
                  props.bgColor === "white"
                    ? "badge filter badge-light active"
                    : "badge filter badge-light"
                }
                data-color="white"
                onClick={() => {
                  props.handleBgClick("white");
                }}
              />
            </div>
          </li>
          <li className="header-title">SIDEBAR ACTIVE COLOR</li>
          <li className="adjustments-line">
            <div className="badge-colors text-center">
              <span
                className={
                  props.activeColor === "primary"
                    ? "badge filter badge-primary active"
                    : "badge filter badge-primary"
                }
                data-color="primary"
                onClick={() => {
                  props.handleActiveClick("primary");
                }}
              />
              <span
                className={
                  props.activeColor === "info"
                    ? "badge filter badge-info active"
                    : "badge filter badge-info"
                }
                data-color="info"
                onClick={() => {
                  props.handleActiveClick("info");
                }}
              />
              <span
                className={
                  props.activeColor === "success"
                    ? "badge filter badge-success active"
                    : "badge filter badge-success"
                }
                data-color="success"
                onClick={() => {
                  props.handleActiveClick("success");
                }}
              />
              <span
                className={
                  props.activeColor === "warning"
                    ? "badge filter badge-warning active"
                    : "badge filter badge-warning"
                }
                data-color="warning"
                onClick={() => {
                  props.handleActiveClick("warning");
                }}
              />
              <span
                className={
                  props.activeColor === "danger"
                    ? "badge filter badge-danger active"
                    : "badge filter badge-danger"
                }
                data-color="danger"
                onClick={() => {
                  props.handleActiveClick("danger");
                }}
              />
            </div>
          </li>
          <li className="header-title">SIDEBAR MINI</li>
          <li className="adjustments-line">
            <div className="togglebutton switch-sidebar-mini">
              <Switch
                onChange={props.handleMiniClick}
                value={props.sidebarMini}
                onColor="info"
                offColor="info"
              />
            </div>
          </li>
          <li className="button-container">
            <Button
              href="https://www.creative-tim.com/product/paper-dashboard-pro-react"
              color="primary"
              block
              className="btn-round"
              target="_blank"
            >
              Buy now
            </Button>
          </li>
          <li className="button-container">
            <Button
              href="https://demos.creative-tim.com/paper-dashboard-pro-react/#/documentation/tutorial"
              color="default"
              block
              className="btn-round"
              outline
              target="_blank"
            >
              <i className="nc-icon nc-paper" /> Documentation
            </Button>
          </li>
          <li className="button-container">
            <Button
              href="https://www.creative-tim.com/product/paper-dashboard-react"
              color="info"
              block
              className="btn-round"
              target="_blank"
            >
              Get free version
            </Button>
          </li>
        </ul>
      </div>
    </div>
  );
}

export default FixedPlugin;
