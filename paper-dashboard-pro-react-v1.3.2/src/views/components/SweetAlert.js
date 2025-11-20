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
// react component used to create sweet alerts
import ReactBSAlert from "react-bootstrap-sweetalert";

// reactstrap components
import { Button, Card, CardBody, CardText, Row, Col } from "reactstrap";

function SweetAlert() {
  const [alert, setAlert] = React.useState(null);
  // to stop the warning of calling setState of unmounted component
  React.useEffect(() => {
    return function cleanup() {
      var id = window.setTimeout(null, 0);
      while (id--) {
        window.clearTimeout(id);
      }
    };
  }, []);
  const basicAlert = () => {
    setAlert(
      <ReactBSAlert
        style={{ display: "block", marginTop: "-100px" }}
        title="Here's a message!"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      />
    );
  };
  const titleAndTextAlert = () => {
    setAlert(
      <ReactBSAlert
        style={{ display: "block", marginTop: "-100px" }}
        title="Here's a message!"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      >
        It's pretty, isn't it?
      </ReactBSAlert>
    );
  };
  const successAlert = () => {
    setAlert(
      <ReactBSAlert
        success
        style={{ display: "block", marginTop: "-100px" }}
        title="Good job!"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      >
        You clicked the button!
      </ReactBSAlert>
    );
  };
  const htmlAlert = () => {
    setAlert(
      <ReactBSAlert
        style={{ display: "block", marginTop: "-100px" }}
        title="HTML example"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      >
        You can use <b>bold</b> text,{" "}
        <a href="https://www.creative-tim.com/">links</a> and other HTML tags
      </ReactBSAlert>
    );
  };
  const warningWithConfirmMessage = () => {
    setAlert(
      <ReactBSAlert
        warning
        style={{ display: "block", marginTop: "-100px" }}
        title="Are you sure?"
        onConfirm={() => successDelete()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        cancelBtnBsStyle="danger"
        confirmBtnText="Yes, delete it!"
        cancelBtnText="Cancel"
        showCancel
        btnSize=""
      >
        You will not be able to recover this imaginary file!
      </ReactBSAlert>
    );
  };
  const warningWithConfirmAndCancelMessage = () => {
    setAlert(
      <ReactBSAlert
        warning
        style={{ display: "block", marginTop: "-100px" }}
        title="Are you sure?"
        onConfirm={() => successDelete()}
        onCancel={() => cancelDetele()}
        confirmBtnBsStyle="info"
        cancelBtnBsStyle="danger"
        confirmBtnText="Yes, delete it!"
        cancelBtnText="Cancel"
        showCancel
        btnSize=""
      >
        You will not be able to recover this imaginary file!
      </ReactBSAlert>
    );
  };
  const autoCloseAlert = () => {
    setAlert(
      <ReactBSAlert
        style={{ display: "block", marginTop: "-100px" }}
        title="Auto close alert!"
        onConfirm={() => hideAlert()}
        showConfirm={false}
      >
        I will close in 2 seconds.
      </ReactBSAlert>
    );
    setTimeout(hideAlert, 2000);
  };
  const inputAlert = () => {
    setAlert(
      <ReactBSAlert
        input
        showCancel
        style={{ display: "block", marginTop: "-100px" }}
        title="Input something"
        onConfirm={(e) => inputConfirmAlert(e)}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        cancelBtnBsStyle="danger"
        btnSize=""
      />
    );
  };
  const inputConfirmAlert = (e) => {
    setAlert(
      <ReactBSAlert
        style={{ display: "block", marginTop: "-100px" }}
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
        title={
          <p>
            You entered: <b>{e}</b>
          </p>
        }
      />
    );
  };
  const successDelete = () => {
    setAlert(
      <ReactBSAlert
        success
        style={{ display: "block", marginTop: "-100px" }}
        title="Deleted!"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      >
        Your imaginary file has been deleted.
      </ReactBSAlert>
    );
  };
  const cancelDetele = () => {
    setAlert(
      <ReactBSAlert
        danger
        style={{ display: "block", marginTop: "-100px" }}
        title="Cancelled"
        onConfirm={() => hideAlert()}
        onCancel={() => hideAlert()}
        confirmBtnBsStyle="info"
        btnSize=""
      >
        Your imaginary file is safe :)
      </ReactBSAlert>
    );
  };
  const hideAlert = () => {
    setAlert(null);
  };
  return (
    <>
      <div className="content">
        {alert}
        <h5>Sweet Alert 2</h5>
        <p>
          A beautiful plugin, that replace the classic alert, Handcrafted by our
          friend{" "}
          <a
            target="_blank"
            href="https://github.com/djorg83"
            rel="noopener noreferrer"
          >
            Daniel Jorgensen
          </a>
          . Please check out the{" "}
          <a
            href="https://github.com/djorg83/react-bootstrap-sweetalert"
            target="_blank"
            rel="noopener noreferrer"
          >
            full documentation.
          </a>
        </p>
        <div className="places-sweet-alerts">
          <Row>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>Basic example</CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={basicAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>A title with a text under</CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={titleAndTextAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>A success message</CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={successAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>Custom HTML description</CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={htmlAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
          </Row>
          <Row>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>
                    A warning message, with a function attached to the "Confirm"
                    Button...
                  </CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={warningWithConfirmMessage}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>
                    ...and by passing a parameter, you can execute something
                    else for "Cancel"
                  </CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={warningWithConfirmAndCancelMessage}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>
                    A message with auto close timer set to 2 seconds
                  </CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={autoCloseAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
            <Col md="3">
              <Card>
                <CardBody className="text-center">
                  <CardText>Modal window with input field</CardText>
                  <Button
                    className="btn-round"
                    color="default"
                    onClick={inputAlert}
                    outline
                  >
                    Try me!
                  </Button>
                </CardBody>
              </Card>
            </Col>
          </Row>
        </div>
      </div>
    </>
  );
}

export default SweetAlert;
