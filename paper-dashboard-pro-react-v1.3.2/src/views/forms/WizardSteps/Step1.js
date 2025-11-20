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
import {
  Input,
  InputGroupAddon,
  InputGroupText,
  InputGroup,
  Row,
  Col,
} from "reactstrap";

// core components
import PictureUpload from "components/CustomUpload/PictureUpload.js";

const Step1 = React.forwardRef((props, ref) => {
  const [firstname, setfirstname] = React.useState("");
  const [lastname, setlastname] = React.useState("");
  const [email, setemail] = React.useState("");
  const [firstnameState, setfirstnameState] = React.useState("");
  const [lastnameState, setlastnameState] = React.useState("");
  const [emailState, setemailState] = React.useState("");
  const [firstnameFocus, setfirstnameFocus] = React.useState("");
  const [lastnameFocus, setlastnameFocus] = React.useState("");
  const [emailFocus, setemailFocus] = React.useState("");
  React.useImperativeHandle(ref, () => ({
    isValidated: () => {
      return isValidated();
    },
    state: {
      firstname,
      lastname,
      email,
      firstnameState,
      lastnameState,
      emailState,
    },
  }));
  // function that returns true if value is email, false otherwise
  const verifyEmail = (value) => {
    var emailRex =
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    if (emailRex.test(value)) {
      return true;
    }
    return false;
  };
  // function that verifies if a string has a given length or not
  const verifyLength = (value, length) => {
    if (value.length >= length) {
      return true;
    }
    return false;
  };
  const isValidated = () => {
    if (
      firstnameState === "has-success" &&
      lastnameState === "has-success" &&
      emailState === "has-success"
    ) {
      return true;
    } else {
      if (firstnameState !== "has-success") {
        setfirstnameState("has-danger");
      }
      if (lastnameState !== "has-success") {
        setlastnameState("has-danger");
      }
      if (emailState !== "has-success") {
        setemailState("has-danger");
      }
      return false;
    }
  };
  return (
    <>
      <h5 className="info-text">
        Let's start with the basic information (with validation)
      </h5>
      <Row className="justify-content-center">
        <Col sm="4">
          <PictureUpload />
        </Col>
        <Col sm="6">
          <InputGroup
            className={classnames(firstnameState, {
              "input-group-focus": firstnameFocus,
            })}
          >
            <InputGroupAddon addonType="prepend">
              <InputGroupText>
                <i className="nc-icon nc-single-02" />
              </InputGroupText>
            </InputGroupAddon>
            <Input
              name="firstname"
              placeholder="First Name (required)"
              type="text"
              onChange={(e) => {
                if (!verifyLength(e.target.value, 1)) {
                  setfirstnameState("has-danger");
                } else {
                  setfirstnameState("has-success");
                }
                setfirstname(e.target.value);
              }}
              onFocus={(e) => setfirstnameFocus(true)}
              onBlur={(e) => setfirstnameFocus(false)}
            />
            {firstnameState === "has-danger" ? (
              <label className="error">This field is required.</label>
            ) : null}
          </InputGroup>
          <InputGroup
            className={classnames(lastnameState, {
              "input-group-focus": lastnameFocus,
            })}
          >
            <InputGroupAddon addonType="prepend">
              <InputGroupText>
                <i className="nc-icon nc-circle-10" />
              </InputGroupText>
            </InputGroupAddon>
            <Input
              name="lastname"
              placeholder="Last Name (required)"
              type="text"
              onChange={(e) => {
                if (!verifyLength(e.target.value, 1)) {
                  setlastnameState("has-danger");
                } else {
                  setlastnameState("has-success");
                }
                setlastname(e.target.value);
              }}
              onFocus={(e) => setlastnameFocus(true)}
              onBlur={(e) => setlastnameFocus(false)}
            />
            {lastnameState === "has-danger" ? (
              <label className="error">This field is required.</label>
            ) : null}
          </InputGroup>
        </Col>
        <Col className="mt-3" lg="10">
          <InputGroup
            className={classnames(emailState, {
              "input-group-focus": emailFocus,
            })}
          >
            <InputGroupAddon addonType="prepend">
              <InputGroupText>
                <i className="nc-icon nc-send" />
              </InputGroupText>
            </InputGroupAddon>
            <Input
              name="email"
              placeholder="Email (required)"
              type="email"
              onChange={(e) => {
                if (!verifyEmail(e.target.value)) {
                  setemailState("has-danger");
                } else {
                  setemailState("has-success");
                }
                setemail(e.target.value);
              }}
              onFocus={(e) => setemailFocus(true)}
              onBlur={(e) => setemailFocus(false)}
            />
            {emailState === "has-danger" ? (
              <label className="error">This field is required.</label>
            ) : null}
          </InputGroup>
        </Col>
      </Row>
    </>
  );
});

export default Step1;
