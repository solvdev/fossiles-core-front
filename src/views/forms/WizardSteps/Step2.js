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
import classnames from "classnames";

// reactstrap components
import { Row, Col } from "reactstrap";

const Step2 = React.forwardRef((props, ref) => {
  const [design, setdesign] = React.useState(false);
  const [code, setcode] = React.useState(false);
  const [develop, setdevelop] = React.useState(false);
  React.useImperativeHandle(ref, () => ({
    isValidated: undefined,
    state: {
      design,
      code,
      develop,
    },
  }));
  return (
    <>
      <h5 className="info-text">What are you doing? (checkboxes)</h5>
      <Row className="justify-content-center">
        <Col lg="10">
          <Row>
            <Col sm="4">
              <div
                className={classnames("choice", {
                  active: design,
                })}
                data-toggle="wizard-checkbox"
                onClick={() => setdesign(!design)}
              >
                <input
                  defaultValue="Design"
                  name="jobb"
                  type="checkbox"
                  defaultChecked={design}
                />
                <div className="icon">
                  <i className="nc-icon nc-ruler-pencil" />
                </div>
                <h6>Design</h6>
              </div>
            </Col>
            <Col sm="4">
              <div
                className={classnames("choice", { active: code })}
                data-toggle="wizard-checkbox"
                onClick={() => setcode(!code)}
              >
                <input
                  defaultValue="Code"
                  name="jobb"
                  type="checkbox"
                  defaultChecked={code}
                />
                <div className="icon">
                  <i className="nc-icon nc-laptop" />
                </div>
                <h6>Code</h6>
              </div>
            </Col>
            <Col sm="4">
              <div
                className={classnames("choice", {
                  active: develop,
                })}
                data-toggle="wizard-checkbox"
                onClick={() => setdevelop(!develop)}
              >
                <input
                  defaultValue="Develop"
                  name="jobb"
                  type="checkbox"
                  defaultChecked={develop}
                />
                <div className="icon">
                  <i className="nc-icon nc-atom" />
                </div>
                <h6>Develop</h6>
              </div>
            </Col>
          </Row>
        </Col>
      </Row>
    </>
  );
});

export default Step2;
