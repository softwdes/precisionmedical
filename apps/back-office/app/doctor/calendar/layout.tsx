/**
 * Layout de Mi Calendario (portal médico) con slot @modal — habilita la
 * intercepción de /doctor/case/[id]: al abrir el caso desde el panel de una
 * cita, el detalle se renderiza como modal ENCIMA del calendario, que queda
 * montado con su semana y la cita seleccionada.
 */
export default function DoctorCalendarLayout({
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
