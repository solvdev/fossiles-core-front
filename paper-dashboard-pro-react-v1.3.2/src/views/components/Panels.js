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

// reactstrap components
import {
  Card,
  CardHeader,
  CardBody,
  CardTitle,
  Collapse,
  NavItem,
  NavLink,
  Nav,
  TabContent,
  TabPane,
  Row,
  Col,
} from "reactstrap";

function Panels() {
  const [horizontalTabs, setHorizontalTabs] = React.useState("home");
  const [verticalTabs, setVerticalTabs] = React.useState("info");
  const [pageTabs, setPageTabs] = React.useState("homePages");
  const [openedCollapses, setOpenedCollapses] = React.useState([
    "collapseOne",
    "collapse1",
  ]);
  // with this function we create an array with the opened collapses
  // it is like a toggle function for all collapses from this page
  const collapsesToggle = (collapse) => {
    if (openedCollapses.includes(collapse)) {
      setOpenedCollapses(openedCollapses.filter((item) => item !== collapse));
    } else {
      openedCollapses.push(collapse);
      setOpenedCollapses([...openedCollapses, collapse]);
    }
  };
  return (
    <>
      <div className="content">
        <Row>
          <Col md="6">
            <Card>
              <CardBody>
                <div
                  aria-multiselectable={true}
                  className="card-collapse"
                  id="accordion"
                  role="tablist"
                >
                  <CardTitle tag="h4">Collapsible Accordion</CardTitle>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes("collapseOne")}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapseOne")}
                      >
                        Collapsible Group Item #1{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapseOne")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes("collapseTwo")}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapseTwo")}
                      >
                        Collapsible Group Item #2{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapseTwo")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes(
                          "collapseThree"
                        )}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapseThree")}
                      >
                        Collapsible Group Item #3{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapseThree")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                </div>
              </CardBody>
            </Card>
          </Col>
          <Col md="6">
            <Card className="card-plain">
              <CardBody>
                <div
                  aria-multiselectable={true}
                  className="card-collapse"
                  id="accordion"
                  role="tablist"
                >
                  <CardTitle tag="h4">
                    Collapsible Accordion on Plain Card
                  </CardTitle>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes("collapse1")}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapse1")}
                      >
                        Collapsible Group Item #1{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapse1")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes("collapse2")}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapse2")}
                      >
                        Collapsible Group Item #2{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapse2")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                  <Card className="card-plain">
                    <CardHeader role="tab">
                      <a
                        aria-expanded={openedCollapses.includes("collapse3")}
                        href="#pablo"
                        data-parent="#accordion"
                        data-toggle="collapse"
                        onClick={() => collapsesToggle("collapse3")}
                      >
                        Collapsible Group Item #3{" "}
                        <i className="nc-icon nc-minimal-down" />
                      </a>
                    </CardHeader>
                    <Collapse
                      role="tabpanel"
                      isOpen={openedCollapses.includes("collapse3")}
                    >
                      <CardBody>
                        Anim pariatur cliche reprehenderit, enim eiusmod high
                        life accusamus terry richardson ad squid. 3 wolf moon
                        officia aute, non cupidatat skateboard dolor brunch.
                        Food truck quinoa nesciunt laborum eiusmod. Brunch 3
                        wolf moon tempor, sunt aliqua put a bird on it squid
                        single-origin coffee nulla assumenda shoreditch et.
                        Nihil anim keffiyeh helvetica, craft beer labore wes
                        anderson cred nesciunt sapiente ea proident. Ad vegan
                        excepteur butcher vice lomo. Leggings occaecat craft
                        beer farm-to-table, raw denim aesthetic synth nesciunt
                        you probably haven't heard of them accusamus labore
                        sustainable VHS.
                      </CardBody>
                    </Collapse>
                  </Card>
                </div>
              </CardBody>
            </Card>
          </Col>
        </Row>
        <br />
        <Row>
          <Col md="6">
            <Card>
              <CardHeader>
                <h5>Horizontal Tabs</h5>
              </CardHeader>
              <CardBody>
                <div className="nav-tabs-navigation">
                  <div className="nav-tabs-wrapper">
                    <Nav id="tabs" role="tablist" tabs>
                      <NavItem>
                        <NavLink
                          aria-expanded={horizontalTabs === "home"}
                          data-toggle="tab"
                          href="#pablo"
                          role="tab"
                          className={horizontalTabs === "home" ? "active" : ""}
                          onClick={() => setHorizontalTabs("home")}
                        >
                          Home
                        </NavLink>
                      </NavItem>
                      <NavItem>
                        <NavLink
                          aria-expanded={horizontalTabs === "profile"}
                          data-toggle="tab"
                          href="#pablo"
                          role="tab"
                          className={
                            horizontalTabs === "profile" ? "active" : ""
                          }
                          onClick={() => setHorizontalTabs("profile")}
                        >
                          Profile
                        </NavLink>
                      </NavItem>
                      <NavItem>
                        <NavLink
                          aria-expanded={horizontalTabs === "messages"}
                          data-toggle="tab"
                          href="#pablo"
                          role="tab"
                          className={
                            horizontalTabs === "messages" ? "active" : ""
                          }
                          onClick={() => setHorizontalTabs("messages")}
                        >
                          Messages
                        </NavLink>
                      </NavItem>
                    </Nav>
                  </div>
                </div>
                <TabContent
                  className="text-center"
                  id="my-tab-content"
                  activeTab={horizontalTabs}
                >
                  <TabPane tabId="home" role="tabpanel">
                    <p>
                      Larger, yet dramatically thinner. More powerful, but
                      remarkably power efficient. With a smooth metal surface
                      that seamlessly meets the new Retina HD display.
                    </p>
                  </TabPane>
                  <TabPane tabId="profile" role="tabpanel">
                    <p>Here is your profile.</p>
                  </TabPane>
                  <TabPane tabId="messages" role="tabpanel">
                    <p>Here are your messages.</p>
                  </TabPane>
                </TabContent>
              </CardBody>
            </Card>
          </Col>
          <Col md="6">
            <Card>
              <CardHeader>
                <h5>Vertical Tabs</h5>
              </CardHeader>
              <CardBody>
                <Row>
                  <Col lg="4" md="5" sm="4" xs="6">
                    <div className="nav-tabs-navigation verical-navs p-0">
                      <div className="nav-tabs-wrapper">
                        <Nav
                          className="flex-column nav-stacked"
                          role="tablist"
                          tabs
                        >
                          <NavItem>
                            <NavLink
                              data-toggle="tab"
                              href="#pablo"
                              role="tab"
                              className={
                                verticalTabs === "info" ? "active" : ""
                              }
                              onClick={() => setVerticalTabs("info")}
                            >
                              Info
                            </NavLink>
                          </NavItem>
                          <NavItem>
                            <NavLink
                              data-toggle="tab"
                              href="#pablo"
                              role="tab"
                              className={
                                verticalTabs === "description" ? "active" : ""
                              }
                              onClick={() => setVerticalTabs("description")}
                            >
                              Description
                            </NavLink>
                          </NavItem>
                          <NavItem>
                            <NavLink
                              data-toggle="tab"
                              href="#pablo"
                              role="tab"
                              className={
                                verticalTabs === "concept" ? "active" : ""
                              }
                              onClick={() => setVerticalTabs("concept")}
                            >
                              Concept
                            </NavLink>
                          </NavItem>
                          <NavItem>
                            <NavLink
                              data-toggle="tab"
                              href="#pablo"
                              role="tab"
                              className={
                                verticalTabs === "support" ? "active" : ""
                              }
                              onClick={() => setVerticalTabs("support")}
                            >
                              Support
                            </NavLink>
                          </NavItem>
                          <NavItem>
                            <NavLink
                              data-toggle="tab"
                              href="#pablo"
                              role="tab"
                              className={
                                verticalTabs === "extra" ? "active" : ""
                              }
                              onClick={() => setVerticalTabs("extra")}
                            >
                              Extra
                            </NavLink>
                          </NavItem>
                        </Nav>
                      </div>
                    </div>
                  </Col>
                  <Col lg="8" md="7" sm="8" xs="6">
                    {/* Tab panes */}
                    <TabContent activeTab={verticalTabs}>
                      <TabPane tabId="info">
                        <p>
                          Larger, yet dramatically thinner. More powerful, but
                          remarkably power efficient. With a smooth metal
                          surface that seamlessly meets the new Retina HD
                          display.
                        </p>
                        <p>
                          It’s one continuous form where hardware and software
                          function in perfect unison, creating a new generation
                          of phone that’s better by any measure.
                        </p>
                      </TabPane>
                      <TabPane tabId="description">
                        <p>
                          The first thing you notice when you hold the phone is
                          how great it feels in your hand. The cover glass
                          curves down around the sides to meet the anodized
                          aluminum enclosure in a remarkable, simplified design.
                        </p>
                        <p>
                          There are no distinct edges. No gaps. Just a smooth,
                          seamless bond of metal and glass that feels like one
                          continuous surface.
                        </p>
                      </TabPane>
                      <TabPane tabId="concept">
                        <p>
                          It’s one continuous form where hardware and software
                          function in perfect unison, creating a new generation
                          of phone that’s better by any measure.
                        </p>
                        <p>
                          Larger, yet dramatically thinner. More powerful, but
                          remarkably power efficient. With a smooth metal
                          surface that seamlessly meets the new Retina HD
                          display.
                        </p>
                      </TabPane>
                      <TabPane tabId="support">
                        <p>
                          From the seamless transition of glass and metal to the
                          streamlined profile, every detail was carefully
                          considered to enhance your experience. So while its
                          display is larger, the phone feels just right.
                        </p>
                        <p>
                          It’s one continuous form where hardware and software
                          function in perfect unison, creating a new generation
                          of phone that’s better by any measure.
                        </p>
                      </TabPane>
                      <TabPane tabId="extra">
                        <p>
                          It’s one continuous form where hardware and software
                          function in perfect unison, creating a new generation
                          of phone that’s better by any measure.
                        </p>
                        <p>
                          Larger, yet dramatically thinner. More powerful, but
                          remarkably power efficient. With a smooth metal
                          surface that seamlessly meets the new Retina HD
                          display.
                        </p>
                      </TabPane>
                    </TabContent>
                  </Col>
                </Row>
              </CardBody>
            </Card>
          </Col>
        </Row>
        <Row>
          <Col className="ml-auto mr-auto" md="8">
            <Card className="card-plain card-subcategories">
              <CardHeader>
                <CardTitle className="text-center" tag="h4">
                  Page Subcategories
                </CardTitle>
                <br />
              </CardHeader>
              <CardBody>
                {/* color-classes: "nav-pills-primary", "nav-pills-info", "nav-pills-success", "nav-pills-warning","nav-pills-danger" */}
                <Nav
                  className="nav-pills-primary nav-pills-icons justify-content-center"
                  pills
                  role="tablist"
                >
                  <NavItem>
                    <NavLink
                      data-toggle="tab"
                      href="#pablo"
                      role="tablist"
                      className={pageTabs === "homePages" ? "active" : ""}
                      onClick={() => setPageTabs("homePages")}
                    >
                      <i className="now-ui-icons objects_umbrella-13" />
                      Home
                    </NavLink>
                  </NavItem>
                  <NavItem>
                    <NavLink
                      data-toggle="tab"
                      href="#pablo"
                      role="tablist"
                      className={pageTabs === "messagesPages" ? "active" : ""}
                      onClick={() => setPageTabs("messagesPages")}
                    >
                      <i className="now-ui-icons shopping_shop" />
                      Messages
                    </NavLink>
                  </NavItem>
                  <NavItem>
                    <NavLink
                      data-toggle="tab"
                      href="#pablo"
                      role="tablist"
                      className={pageTabs === "settingsPages" ? "active" : ""}
                      onClick={() => setPageTabs("settingsPages")}
                    >
                      <i className="now-ui-icons ui-2_settings-90" />
                      Settings
                    </NavLink>
                  </NavItem>
                </Nav>
                <TabContent
                  className="tab-space tab-subcategories"
                  activeTab={pageTabs}
                >
                  <TabPane tabId="homePages">
                    Collaboratively administrate empowered markets via
                    plug-and-play networks. Dynamically procrastinate B2C users
                    after installed base benefits. <br />
                    <br />
                    Dramatically visualize customer directed convergence without
                    revolutionary ROI.
                  </TabPane>
                  <TabPane tabId="messagesPages">
                    Efficiently unleash cross-media information without
                    cross-media value. Quickly maximize timely deliverables for
                    real-time schemas. <br />
                    <br />
                    Dramatically maintain clicks-and-mortar solutions without
                    functional solutions.
                  </TabPane>
                  <TabPane tabId="settingsPages">
                    Completely synergize resource taxing relationships via
                    premier niche markets. Professionally cultivate one-to-one
                    customer service with robust ideas. <br />
                    <br />
                    Dynamically innovate resource-leveling customer service for
                    state of the art customer service.
                  </TabPane>
                </TabContent>
              </CardBody>
            </Card>
          </Col>
        </Row>
      </div>
    </>
  );
}

export default Panels;
