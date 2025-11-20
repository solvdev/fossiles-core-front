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
// react plugin used to create DropdownMenu for selecting items
import Select from "react-select";

// reactstrap components
import { FormGroup, Input, Row, Col } from "reactstrap";

const Step3 = React.forwardRef((props, ref) => {
  const [select, setSelect] = React.useState(null);
  React.useImperativeHandle(ref, () => ({
    isValidated: undefined,
    state: {
      select,
    },
  }));
  return (
    <>
      <Row className="justify-content-center">
        <Col sm="12">
          <h5 className="info-text">Are you living in a nice area?</h5>
        </Col>
        <Col sm="7">
          <FormGroup>
            <label>Street Name</label>
            <Input type="text" />
          </FormGroup>
        </Col>
        <Col sm="3">
          <FormGroup>
            <label>Street No.</label>
            <Input type="text" />
          </FormGroup>
        </Col>
        <Col sm="5">
          <FormGroup>
            <label>City</label>
            <Input type="text" />
          </FormGroup>
        </Col>
        <Col sm="5">
          <FormGroup>
            <label>Country</label>
            <Select
              name=""
              className="react-select"
              placeholder="Single Select"
              classNamePrefix="react-select"
              value={select}
              onChange={(value) => setState(value)}
              options={[
                {
                  value: "Afghanistan",
                  label: " Afghanistan ",
                },
                { value: "Albania", label: " Albania " },
                { value: "Algeria", label: " Algeria " },
                {
                  value: "American Samoa",
                  label: " American Samoa ",
                },
                { value: "Andorra", label: " Andorra " },
                { value: "Angola", label: " Angola " },
                { value: "Anguilla", label: " Anguilla " },
                { value: "Antarctica", label: " Antarctica " },
              ]}
            />
          </FormGroup>
        </Col>
      </Row>
    </>
  );
});

export default Step3;
