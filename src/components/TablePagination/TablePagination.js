import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Col, Input, Row } from "reactstrap";

const PAGE_SIZES = [10, 20, 25, 50, 100];

/**
 * Divide una lista en páginas. Si un filtro la achica, vuelve a la última página que exista.
 * `showItem` lleva a la página donde está el primer elemento que cumple la condición.
 */
export function usePagination(items, initialPageSize = 20) {
  const [pageSize, setPageSizeState] = useState(initialPageSize);
  const [pageIndex, setPageIndex] = useState(0);
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const currentIndex = Math.min(pageIndex, pageCount - 1);

  useEffect(() => {
    if (currentIndex !== pageIndex) setPageIndex(currentIndex);
  }, [currentIndex, pageIndex]);

  const pageItems = useMemo(
    () => items.slice(currentIndex * pageSize, currentIndex * pageSize + pageSize),
    [items, currentIndex, pageSize]
  );

  const gotoPage = useCallback(
    (index) => setPageIndex(Math.max(0, Math.min(index, pageCount - 1))),
    [pageCount]
  );
  const setPageSize = useCallback((size) => {
    setPageSizeState(size);
    setPageIndex(0);
  }, []);
  const showItem = useCallback(
    (predicate) => {
      const index = items.findIndex(predicate);
      if (index >= 0) setPageIndex(Math.floor(index / pageSize));
    },
    [items, pageSize]
  );

  return { pageItems, pageIndex: currentIndex, pageCount, pageSize, total, gotoPage, setPageSize, showItem };
}

/** Mismo control que las listas con react-table: registros por página a la izquierda y navegación a la derecha. */
export default function TablePagination({ pagination, className = "mt-3" }) {
  const { pageIndex, pageCount, pageSize, total, gotoPage, setPageSize } = pagination;
  if (total === 0) return null;
  const sizes = PAGE_SIZES.includes(pageSize) ? PAGE_SIZES : [...PAGE_SIZES, pageSize].sort((a, b) => a - b);
  const first = pageIndex === 0;
  const last = pageIndex >= pageCount - 1;

  return (
    <Row className={`${className} align-items-center`}>
      <Col md="6">
        <div className="d-flex align-items-center flex-wrap">
          <span className="mr-2">Mostrar:</span>
          <Input
            type="select"
            bsSize="sm"
            aria-label="Registros por página"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            style={{ width: "auto" }}
          >
            {sizes.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </Input>
          <span className="ml-2">registros por página · {total} en total</span>
        </div>
      </Col>
      <Col md="6" className="text-md-right mt-2 mt-md-0">
        <div className="d-flex align-items-center justify-content-md-end">
          <span className="mr-3">
            Página <strong>{pageIndex + 1} de {pageCount}</strong>
          </span>
          <Button color="primary" size="sm" className="mr-1" aria-label="Primera página" disabled={first}
            onClick={() => gotoPage(0)}>
            {"<<"}
          </Button>
          <Button color="primary" size="sm" className="mr-1" aria-label="Página anterior" disabled={first}
            onClick={() => gotoPage(pageIndex - 1)}>
            {"<"}
          </Button>
          <Button color="primary" size="sm" className="mr-1" aria-label="Página siguiente" disabled={last}
            onClick={() => gotoPage(pageIndex + 1)}>
            {">"}
          </Button>
          <Button color="primary" size="sm" aria-label="Última página" disabled={last}
            onClick={() => gotoPage(pageCount - 1)}>
            {">>"}
          </Button>
        </div>
      </Col>
    </Row>
  );
}
