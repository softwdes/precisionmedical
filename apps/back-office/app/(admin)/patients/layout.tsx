/**
 * Layout de Pacientes con slot @modal — habilita la intercepción de
 * /front-office/[id]: al abrir un caso desde la lista, el detalle se renderiza
 * como modal ENCIMA de la lista (que queda montada con su búsqueda y estado).
 * Con URL directa o refresh, la página completa de /front-office/[id] carga
 * como siempre.
 */
export default function PatientsLayout({
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
