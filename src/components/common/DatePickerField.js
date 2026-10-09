import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import ReactDatetime from "react-datetime";
import moment from "moment";
import "moment/locale/es";

/**
 * Campo de fecha con calendario, en reemplazo del `<Input type="date">` del navegador.
 *
 * El contrato hacia fuera es el mismo que el del input nativo —entra y sale `yyyy-MM-dd`,
 * cadena vacía cuando no hay fecha— para poder cambiarlo en una pantalla sin tocar lo que
 * hay detrás. Lo que cambia es lo que ve el usuario: se muestra `dd/MM/yyyy`, que es como
 * se leen las fechas aquí, y el calendario sale en español.
 *
 * @param {string} value           yyyy-MM-dd, o "" si no hay
 * @param {Function} onChange      recibe yyyy-MM-dd, o "" al limpiar
 * @param {boolean} [soloHabiles]  apaga sábado y domingo: en la planta no se produce
 * @param {string} [minDate]       yyyy-MM-dd; no deja elegir nada anterior
 */
export default function DatePickerField({
  value,
  onChange,
  soloHabiles = false,
  minDate,
  disabled = false,
  placeholder = "dd/mm/aaaa",
  bsSize = "sm",
  className = "",
  id,
}) {
  const contenedor = useRef(null);
  const [abierto, setAbierto] = useState(false);

  /**
   * Coloca el calendario en coordenadas de ventana mientras está abierto.
   *
   * El calendario nace `position: absolute` dentro del campo, y varios de los sitios donde
   * se usa —las tablas de productos, las columnas del tablero— tienen `overflow: scroll`.
   * Ahí se recorta contra el borde del contenedor y del desplegable solo se ve una franja.
   *
   * Con `fixed` sale de cualquier contenedor con overflow. A cambio hay que recolocarlo a
   * mano en cada scroll, y por eso el listener va con captura: el que se mueve suele ser un
   * contenedor interno, no la ventana.
   */
  const colocar = useCallback(() => {
    const caja = contenedor.current;
    const picker = caja && caja.querySelector(".rdtPicker");
    const input = caja && caja.querySelector("input");
    if (!picker || !input) return;
    const r = input.getBoundingClientRect();
    const alto = picker.offsetHeight || 300;
    const ancho = picker.offsetWidth || 260;
    const cabeAbajo = r.bottom + alto + 8 <= window.innerHeight;
    picker.style.position = "fixed";
    picker.style.top = cabeAbajo
      ? `${Math.round(r.bottom + 2)}px`
      : `${Math.round(Math.max(4, r.top - alto - 2))}px`;
    picker.style.left = `${Math.round(Math.max(4, Math.min(r.left, window.innerWidth - ancho - 8)))}px`;
    picker.style.zIndex = 1060;
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return undefined;
    colocar();
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => {
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
    };
  }, [abierto, colocar]);

  const valorMoment = useMemo(() => {
    if (!value) return "";
    const m = moment(value, "YYYY-MM-DD", true);
    return m.isValid() ? m : "";
  }, [value]);

  const minMoment = useMemo(
    () => (minDate ? moment(minDate, "YYYY-MM-DD", true) : null),
    [minDate]
  );

  /**
   * react-datetime entrega un moment cuando la fecha es válida y la cadena cruda mientras
   * el usuario escribe. Solo se avisa hacia arriba de lo válido o de lo vacío: emitir la
   * cadena a medias haría que el padre guardara «23/0» como si fuera una fecha.
   */
  const manejarCambio = (v) => {
    if (!v) {
      onChange("");
      return;
    }
    if (moment.isMoment(v)) {
      if (v.isValid()) onChange(v.format("YYYY-MM-DD"));
      return;
    }
    if (typeof v === "string" && v.trim() === "") onChange("");
  };

  const esFechaValida = (current) => {
    if (soloHabiles) {
      const dia = current.day();
      if (dia === 0 || dia === 6) return false;
    }
    if (minMoment && current.isBefore(minMoment, "day")) return false;
    return true;
  };

  return (
    <div className={`fossiles-date ${className}`} ref={contenedor}>
      <ReactDatetime
        value={valorMoment}
        onChange={manejarCambio}
        dateFormat="DD/MM/YYYY"
        timeFormat={false}
        closeOnSelect
        locale="es"
        onOpen={() => setAbierto(true)}
        onClose={() => setAbierto(false)}
        // El input propio es lo que deja aplicarle las clases del template; el que trae
        // react-datetime sale sin ellas y se ve distinto al resto de campos.
        renderInput={(props) => (
          <input
            {...props}
            id={id}
            className={`form-control ${bsSize === "sm" ? "form-control-sm" : ""}`}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
          />
        )}
        isValidDate={soloHabiles || minMoment ? esFechaValida : undefined}
        // Marca el fin de semana aunque no se bloquee: ayuda a entender por qué el reparto
        // salta esos días.
        renderDay={(props, current) => {
          const finde = current.day() === 0 || current.day() === 6;
          return (
            <td {...props} className={`${props.className || ""}${finde ? " fossiles-finde" : ""}`}>
              {current.date()}
            </td>
          );
        }}
      />
    </div>
  );
}
