/**
 * Patient search · para el PreCall step de B.2.
 *
 * GET /api/admin/patients/search?q=<query>
 *   → { results: [{ id, firstName, lastName, phone, email, patientCode, casesCount, lastCaseStatus, lastCaseCode }] }
 *
 * Phase 1A: busca en phoenix-dev (mock data).
 * Phase 2+: con BAA + RLS, los datos son PHI real.
 *
 * Busca por: firstName, lastName, phone, email, patientCode (insensitive
 * contains) y por FECHA DE NACIMIENTO, que se reconoce dentro del término
 * tecleado (ver `lib/fecha-buscada.ts`).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db } from '@precision-medical/database';
import { decryptScalars, decryptFieldOrOriginal as dec, isCipher } from '@/lib/decrypt';
import { checkPatientStaff } from '@/lib/patient-access';
import { telefonoDe } from '@/lib/telefono-paciente';
import { separarFecha, clausulasDeFecha } from '@/lib/fecha-buscada';
import { idsPorTelefono } from '@/lib/telefono-buscado';

export async function GET(req: NextRequest): Promise<NextResponse> {
  /**
   * Sesión propia, no prestada del middleware. La búsqueda por nombre NO se
   * recorta al provider a propósito (decisión de Erick 2026-09-11): el portal
   * médico agenda desde su calendario con este mismo endpoint, y a un doctor le
   * derivan pacientes que todavía no atendió. Lo que sí se cerró es ABRIR el
   * expediente —ficha, casos, documentos, historial—, que es donde está el PHI.
   */
  const acceso = await checkPatientStaff();
  if (acceso.deny) return acceso.deny;

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  /**
   * La fecha de nacimiento sale del término y se filtra aparte, en `AND`: acá
   * se está por AGENDAR a alguien, así que la fecha que dictan por teléfono
   * tiene que acotar la lista, no agrandarla. Ver `lib/fecha-buscada.ts`.
   */
  const { fechas, resto } = separarFecha(q);
  const porFecha = fechas.length ? [{ OR: clausulasDeFecha(fechas) }] : [];

  /**
   * Y el teléfono comparado por dígitos: acá se está agendando con el paciente
   * dictando el número por teléfono, que es justo cuando la puntuación con la
   * que quedó guardada la ficha no la sabe nadie. Ver `lib/telefono-buscado.ts`.
   */
  const idsTelefono = await idsPorTelefono(resto);

  const parts = resto.split(/\s+/).filter(Boolean);
  const fullNameClauses = parts.length >= 2
    ? [
        // "Sandra Lopez" → firstName:Sandra AND lastName:Lopez
        { firstName: { contains: parts[0]!, mode: 'insensitive' as const }, lastName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const } },
        // "Lopez Sandra" → firstName:Lopez AND lastName:Sandra
        { firstName: { contains: parts[parts.length - 1]!, mode: 'insensitive' as const }, lastName: { contains: parts[0]!, mode: 'insensitive' as const } },
      ]
    : [];

  const patients = await db.patient.findMany({
    where: {
      AND: [
        ...porFecha,
        // Sólo la fecha: no queda texto que buscar y el filtro ya está puesto.
        ...(resto
          ? [{
              OR: [
                ...fullNameClauses,
                { firstName: { contains: resto, mode: 'insensitive' as const } },
                { lastName: { contains: resto, mode: 'insensitive' as const } },
                { phone: { contains: resto } },
                // El celular también: buscar por él no encontraba a nadie, y más de la
                // mitad de los pacientes tiene el número ahí (ver `lib/telefono-paciente`).
                { phone2: { contains: resto } },
                { email: { contains: resto, mode: 'insensitive' as const } },
                { patientCode: { contains: resto, mode: 'insensitive' as const } },
                ...(idsTelefono.length ? [{ id: { in: idsTelefono } }] : []),
              ],
            }]
          : []),
      ],
    },
    take: 10,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      lastName: true,
      phone: true,
      phone2: true,
      email: true,
      dateOfBirth: true,
      // `deletedAt: null` en los dos: sin esto el resumen contaba los casos
      // archivados y el "último caso" podía ser uno archivado. Se veía en vivo:
      // una paciente con un caso archivado y uno real aparecía como "2 case(s)"
      // y mostraba el código del archivado.
      cases: {
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { caseCode: true, status: true },
      },
      _count: { select: { cases: { where: { deletedAt: null } } } },
      /**
       * Para que el llamador pueda distinguir a un paciente DADO DE BAJA.
       *
       * Antes no viajaba, así que ningún selector podía marcarlos ni bloquearlos
       * aunque quisiera: aparecían igual que uno activo. Ojo que esto es la baja
       * del PACIENTE (duplicado, data de prueba); un paciente con su CASO
       * archivado sigue activo y se agenda normal.
       */
      status: true,
    },
  });

  return NextResponse.json({
    results: patients.map((p) => {
      // Los escalares del paciente, de una pasada: parte de la data migrada del
      // v2 sigue con el sobre `e:…` y este endpoint no desciframos nada, así que
      // el buscador podía mostrar un nombre o un teléfono ilegible.
      const { cases, _count, dateOfBirth, ...escalares } = p;
      const d = decryptScalars(escalares);
      const codigoCrudo = cases[0]?.caseCode ?? null;
      return {
        id: d.id,
        patientCode: d.patientCode,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: telefonoDe(d),
        email: d.email,
        dateOfBirth: dateOfBirth ? dateOfBirth.toISOString().slice(0, 10) : null,
        casesCount: _count.cases,
        // Si no se puede descifrar va null, nunca el `e:…` crudo — mismo criterio
        // que el selector de casos.
        lastCaseCode: codigoCrudo && isCipher(codigoCrudo) ? dec(codigoCrudo) : codigoCrudo,
        lastCaseStatus: cases[0]?.status ?? null,
        isArchived: d.status === 'INACTIVE',
      };
    }),
  });
}
