import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Invoicing() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/admin/accounting/invoices", { replace: true });
  }, [navigate]);

  return null;
}

export default Invoicing;
