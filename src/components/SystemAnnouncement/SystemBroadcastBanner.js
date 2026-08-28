import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  getActiveAnnouncement,
  subscribeToAnnouncements,
} from "services/systemAnnouncementService";

// Función para emitir sonido suave de alerta usando Web Audio API
const playAlertBeep = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.15); // A5

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    // Ignorar si el navegador bloquea audio antes de interacción
  }
};

export default function SystemBroadcastBanner() {
  const [announcement, setAnnouncement] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const lastAnnounceIdRef = useRef(null);

  // Cargar anuncio inicial
  const loadInitialAnnouncement = useCallback(async () => {
    const active = await getActiveAnnouncement();
    if (active && active.isActive && active.remainingSeconds > 0) {
      setAnnouncement(active);
      setRemainingSeconds(active.remainingSeconds);
      lastAnnounceIdRef.current = active.id;
    } else {
      setAnnouncement(null);
      setRemainingSeconds(null);
    }
  }, []);

  useEffect(() => {
    loadInitialAnnouncement();

    const unsubscribe = subscribeToAnnouncements(
      (newAnnounce) => {
        if (newAnnounce && newAnnounce.isActive) {
          setAnnouncement(newAnnounce);
          setRemainingSeconds(newAnnounce.remainingSeconds || 0);

          // Si es un anuncio nuevo, emitir sonido
          if (lastAnnounceIdRef.current !== newAnnounce.id) {
            lastAnnounceIdRef.current = newAnnounce.id;
            playAlertBeep();
          }
        } else {
          setAnnouncement(null);
          setRemainingSeconds(null);
        }
      },
      () => {
        // Al descartar alerta
        setAnnouncement(null);
        setRemainingSeconds(null);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [loadInitialAnnouncement]);

  // Reloj de cuenta regresiva segundo a segundo
  useEffect(() => {
    if (!announcement || remainingSeconds === null || remainingSeconds <= 0) {
      return;
    }

    const interval = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [announcement, remainingSeconds]);

  if (!announcement || remainingSeconds === null) {
    return null;
  }

  const formatCountdown = (secs) => {
    if (secs <= 0) return "00:00";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const isUrgent = remainingSeconds <= 60;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 99999,
        backgroundColor: isUrgent ? "#d63031" : "#e17055",
        color: "#ffffff",
        boxShadow: "0 4px 15px rgba(0,0,0,0.3)",
        borderBottom: "2px solid rgba(255,255,255,0.4)",
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "10px",
        animation: isUrgent ? "pulse-banner 1.5s infinite" : "none",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <style>{`
        @keyframes pulse-banner {
          0% { background-color: #d63031; }
          50% { background-color: #e84118; }
          100% { background-color: #d63031; }
        }
        .countdown-badge-live {
          background: #ffffff;
          color: #d63031;
          font-weight: 800;
          font-size: 18px;
          padding: 4px 14px;
          border-radius: 20px;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 1px;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2);
        }
      `}</style>

      {/* Lado izquierdo: Icono y Mensaje */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: "260px" }}>
        <i
          className="nc-icon nc-bell-55"
          style={{ fontSize: "24px", color: "#fff", animation: "fa-spin 2s infinite linear" }}
        />
        <div>
          <div style={{ fontWeight: 800, fontSize: "15px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {announcement.title || "AVISO DEL SISTEMA"}
          </div>
          <div style={{ fontSize: "13px", opacity: 0.95, lineHeight: 1.3 }}>
            {announcement.message || "Por favor guarde todos sus cambios antes del reinicio."}
          </div>
        </div>
      </div>

      {/* Lado derecho: Cuenta Regresiva */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {remainingSeconds > 0 ? (
          <div className="countdown-badge-live">
            <i className="nc-icon nc-time-alarm" style={{ fontSize: "16px" }} />
            <span>{formatCountdown(remainingSeconds)}</span>
          </div>
        ) : (
          <div className="countdown-badge-live" style={{ backgroundColor: "#2d3436", color: "#fff" }}>
            <i className="nc-icon nc-refresh-69" />
            <span>Reinicio en curso...</span>
          </div>
        )}
      </div>
    </div>
  );
}
