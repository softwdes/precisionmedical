/**
 * Layout del Calendario con slot @modal — habilita la intercepción de
 * /front-office/[id]: al abrir el caso desde el panel de una cita, el detalle
 * se renderiza como modal ENCIMA del calendario (que queda montado con su
 * semana, filtros y la cita seleccionada). Con URL directa o refresh, la página
 * completa de /front-office/[id] carga como siempre.
 */
export default function CalendarLayout({
  children,
  modal,
}: {
  children: React.ReactNode;
  modal: React.ReactNode;
}): React.ReactElement {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
