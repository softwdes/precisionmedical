/**
 * Autocomplete de pacientes — para elegir el padre/apoderado de un menor en B.2.
 *
 * GET /api/admin/patients/autocomplete?q=...&excludeId=<id>
 *
 * Se separa de `/api/admin/patients/search` a propósito: ese endpoint alimenta
 * el PreCall y NO devuelve `dateOfBirth`, que acá es indispensable por dos
 * razones —
 *   1. autocompletar los campos del apoderado al seleccionarlo, y
 *   2. mostrar su edad, porque un apoderado menor de edad no puede firmar
 *      consentimientos y el UI lo tiene que marcar antes de que se elija.
 *
 * `excludeId` saca al propio paciente de los resultados: nadie es su propio
 * apoderado.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { db, calcAge } from '@precision-medical/database';

function fullNameOR(q: string) {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return [];
  const first = parts[0]!, last = parts[parts.length - 1]!;
  return [
    { firstName: { contains: first, mode: 'insensitive' as const }, lastName: { contains: last, mode: 'insensitive' as const } },
    { firstName: { contains: last,  mode: 'insensitive' as const }, lastName: { contains: first, mode: 'insensitive' as const } },
  ];
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') ?? '').trim();
  const excludeId = searchParams.get('excludeId');

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const patients = await db.patient.findMany({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [
        ...fullNameOR(q),
        { firstName:   { contains: q, mode: 'insensitive' } },
        { lastName:    { contains: q, mode: 'insensitive' } },
        { phone:       { contains: q } },
        { phone2:      { contains: q } },
        { email:       { contains: q, mode: 'insensitive' } },
        { patientCode: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 8,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, patientCode: true, firstName: true, lastName: true,
      phone: true, phone2: true, email: true, dateOfBirth: true,
      addressLine1: true, addressCity: true, addressState: true, addressZip: true,
    },
  });

  return NextResponse.json({
    results: patients.map((p) => {
      const age = calcAge(p.dateOfBirth);
      return {
        id:       p.id,
        // `label` y `subtitle` son el contrato que espera el <Autocomplete>
        label:    `${p.firstName} ${p.lastName}`.trim(),
        subtitle: [p.patientCode, p.phone ?? p.phone2, p.email].filter(Boolean).join(' · '),
        // Campos extra para autocompletar el formulario del apoderado
        patientCode:  p.patientCode,
        firstName:    p.firstName,
        lastName:     p.lastName,
        phone:        p.phone ?? p.phone2 ?? '',
        email:        p.email ?? '',
        // ISO corto (YYYY-MM-DD) para que entre directo en un <input type="date">
        dateOfBirth:  p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : '',
        addressLine1: p.addressLine1 ?? '',
        addressCity:  p.addressCity ?? '',
        addressState: p.addressState ?? '',
        addressZip:   p.addressZip ?? '',
        age,
        // El UI usa esto para marcar en rose y bloquear la selección
        isMinor: age !== null && age < 18,
      };
    }),
  });
}
