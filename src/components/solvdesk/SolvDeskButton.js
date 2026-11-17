import React, { useEffect, useMemo, useRef, useState } from "react";

const POS_KEY = "solvdesk-btn-pos";
const BTN_SIZE = 40;

function clampPos(pos) {
  const maxX = Math.max(0, window.innerWidth - BTN_SIZE);
  const maxY = Math.max(0, window.innerHeight - BTN_SIZE);
  return {
    x: Math.min(Math.max(0, pos.x), maxX),
    y: Math.min(Math.max(0, pos.y), maxY),
  };
}

function loadPos() {
  try {
    const raw = localStorage.getItem(POS_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return clampPos(p);
    }
  } catch (e) {
    // sin localStorage: usa la posición por defecto
  }
  return clampPos({
    x: window.innerWidth - BTN_SIZE - 12,
    y: window.innerHeight - BTN_SIZE - 12,
  });
}

export default function SolvDeskButton({
  systemId,
  apiKey,
  userEmail = "",
  userName = "",
  label = "Soporte",
}) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [pos, setPos] = useState(loadPos);
  const dragRef = useRef(null);

  useEffect(() => {
    const onResize = () => setPos((p) => clampPos(p));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onPointerDown = (e) => {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
    d.moved = true;
    setPos(clampPos({ x: d.origX + dx, y: d.origY + dy }));
  };

  const onPointerUp = (e) => {
    const d = dragRef.current;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (!d) return;
    if (d.moved) {
      try {
        localStorage.setItem(POS_KEY, JSON.stringify(pos));
      } catch (err) {
        // ignorar
      }
    } else {
      setHasOpened(true);
      setLoaded(false);
      setOpen(true);
    }
  };

  const src = useMemo(() => {
    const cleanSystemId = String(systemId || "").trim();
    const cleanApiKey = String(apiKey || "").trim();
    if (!cleanSystemId || !cleanApiKey) return "";

    let url = `https://solvdesk.vercel.app/widget/${cleanSystemId}?key=${encodeURIComponent(cleanApiKey)}`;
    if (userEmail) url += `&email=${encodeURIComponent(userEmail)}`;
    if (userName) url += `&name=${encodeURIComponent(userName)}`;
    return url;
  }, [systemId, apiKey, userEmail, userName]);

  if (!systemId || !apiKey) {
    return null;
  }

  return (
    <>
      <style>
        {`
          @keyframes solvdesk-spin {
            to { transform: rotate(360deg); }
          }
        `}
      </style>

      <button
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setHasOpened(true);
            setLoaded(false);
            setOpen(true);
          }
        }}
        style={{
          position: "fixed",
          left: `${pos.x}px`,
          top: `${pos.y}px`,
          width: `${BTN_SIZE}px`,
          height: `${BTN_SIZE}px`,
          zIndex: 9999,
          background: "#3b82f6",
          color: "#fff",
          border: "none",
          borderRadius: "999px",
          padding: 0,
          fontSize: "18px",
          cursor: "grab",
          touchAction: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: open ? 0 : 0.55,
          pointerEvents: open ? "none" : "auto",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.opacity = "0.55";
        }}
        title={`${label} (arrástralo para moverlo)`}
        aria-label="Abrir soporte"
      >
        💬
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9998,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "flex-end",
          }}
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            style={{
              width: "380px",
              height: "580px",
              margin: "24px",
              borderRadius: "16px",
              overflow: "hidden",
              background: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.4)",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Soporte"
          >
            {!loaded && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "#fff",
                  color: "#111827",
                  fontSize: "14px",
                  fontWeight: 600,
                  zIndex: 1,
                  gap: "10px",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: "18px",
                    height: "18px",
                    borderRadius: "999px",
                    border: "2px solid rgba(17, 24, 39, 0.2)",
                    borderTopColor: "rgba(59, 130, 246, 0.9)",
                    animation: "solvdesk-spin 700ms linear infinite",
                    flex: "0 0 auto",
                  }}
                />
                Cargando soporte…
              </div>
            )}

            {hasOpened && (
              <iframe
                src={src}
                style={{
                  width: "100%",
                  height: "100%",
                  border: "none",
                  visibility: open ? "visible" : "hidden",
                }}
                title="Soporte"
                loading="eager"
                onLoad={() => setLoaded(true)}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

