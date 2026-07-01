/**
 * seed-law-firms.mjs
 * Siembra los 15 bufetes de abogados en la tabla lawyers.
 * Datos tomados del sistema de referencia (02/2026).
 * Phase 1A: mock data — migración en bloque pendiente.
 *
 * Uso: node packages/database/prisma/seed-law-firms.mjs
 *   o: pnpm --filter @precision-medical/database seed:law-firms
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const LAW_FIRMS = [
  {
    firmName: 'Apollo Primary',
    address:  'apollo',
    phone:    '(000) 000-0000',
    notes:    'DEVIN ADD THIS',
  },
  {
    firmName: 'Bobby Udall',
    address:  '76 East 6790 South, Midvale, Utah 84047',
    phone:    '(801) 980-7777',
  },
  {
    firmName: 'Fernandez Law',
    address:  'direccion123',
    phone:    '(828) 282-8281',
    notes:    'for test only',
  },
  {
    firmName: 'Flickinger Boulton Robson Weeks',
    address:  '3000 N. University Ave #300, Provo, Utah 84604',
    phone:    '(801) 500-4000',
  },
  {
    firmName: 'Garcia Law',
    address:  '10931 Beckstead Ln, South Jordan, Utah 84095',
    phone:    '(801) 900-3227',
  },
  {
    firmName: 'Good Guys Injury Law',
    address:  '11693 S 700 E #100, Draper, Utah 84020',
    phone:    '(801) 448-0642',
  },
  {
    firmName: 'Hart and Hart',
    address:  '631 North 300 West, Salt Lake City, Utah 84103',
    phone:    '(801) 534-1100',
  },
  {
    firmName: 'Howard Lewis & Petersen PC',
    address:  '120 E 300 N, Provo, Utah 84606',
    phone:    '(801) 373-6345',
  },
  {
    firmName: 'Jacob Jensen & Associates',
    address:  '6629 S 1300 E, Salt Lake City, Utah 84121',
    phone:    '(801) 996-8662',
  },
  {
    firmName: 'Johnson Livingston',
    address:  '195 South Orem Blvd, Suite 1, Orem, Utah 84058',
    phone:    '(801) 948-9670',
  },
  {
    firmName: 'Tabbaa Law',
    address:  '1201 West Peachtree Street NW Suite 2310, Atlanta, GA 30309',
    phone:    '(770) 370-7881',
  },
  {
    firmName: 'Taylor Law',
    address:  '2880 West 4700 South Suite I, Salt Lake City, Utah 84129',
    phone:    '(801) 512-2335',
  },
  {
    firmName: 'The Advocates',
    address:  '737 East Winchester Street, Salt Lake City, Utah 84107',
    phone:    '(801) 429-9359',
  },
  {
    firmName: 'The Schriever Law Firm',
    address:  '174 South Main Street, Spanish Fork, Utah 84660',
    phone:    '(385) 462-2824',
  },
  {
    firmName: 'We Win Injury Law',
    address:  '1173 South 250 West Suite 311, St. George, Utah 84770',
    phone:    '(435) 422-4020',
  },
];

async function main() {
  console.log(`Sembrando ${LAW_FIRMS.length} bufetes...`);

  let created = 0;
  let skipped = 0;

  for (const firm of LAW_FIRMS) {
    const existing = await db.lawyer.findFirst({
      where: { firmName: { equals: firm.firmName, mode: 'insensitive' } },
      select: { id: true },
    });

    if (existing) {
      console.log(`  ↷ Ya existe: ${firm.firmName}`);
      skipped++;
      continue;
    }

    await db.lawyer.create({
      data: {
        entityType: 'FIRM',
        firmName:   firm.firmName,
        address:    firm.address ?? null,
        phone:      firm.phone   ?? null,
        notes:      firm.notes   ?? null,
        status:     'ACTIVE',
      },
    });

    console.log(`  ✓ Creado: ${firm.firmName}`);
    created++;
  }

  console.log(`\nDone: ${created} creados, ${skipped} ya existían.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
