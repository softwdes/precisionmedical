/**
 * Layout de Mis Pacientes (doctor) con slot @modal — habilita la intercepción
 * de /doctor/case/[id]: abrir un caso desde la lista lo muestra como modal
 * sobre la lista (que conserva búsqueda y estado). URL directa o refresh
 * renderizan la página completa.
 */
export default function DoctorPatientsLayout({
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
