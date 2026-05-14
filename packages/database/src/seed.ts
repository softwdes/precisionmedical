import { db } from './index';

async function seed(): Promise<void> {
  console.warn('🌱 Seeding database...');

  // Countries
  const [us, bolivia, peru] = await Promise.all([
    db.country.upsert({
      where: { code: 'US' },
      update: {},
      create: { code: 'US', name: 'United States', currency: 'USD' },
    }),
    db.country.upsert({
      where: { code: 'BO' },
      update: {},
      create: { code: 'BO', name: 'Bolivia', currency: 'BOB' },
    }),
    db.country.upsert({
      where: { code: 'PE' },
      update: {},
      create: { code: 'PE', name: 'Peru', currency: 'PEN' },
    }),
  ]);

  console.warn(`✅ Countries: US(${us.id}), BO(${bolivia.id}), PE(${peru.id})`);

  // Departments
  const departments = [
    'Front Desk',
    'Medical Staff',
    'Administration',
    'IT / Tech',
    'Operations',
    'Finance',
  ];

  await Promise.all(
    departments.map((name) =>
      db.department.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  );

  console.warn(`✅ Departments: ${departments.length} created`);

  // Clinics
  await Promise.all([
    db.clinic.upsert({
      where: { name: 'Pleasant Grove' },
      update: {},
      create: {
        name: 'Pleasant Grove',
        address: '1234 State St, Pleasant Grove, UT 84062',
        phone: '+1-801-555-0100',
      },
    }),
    db.clinic.upsert({
      where: { name: 'Provo' },
      update: {},
      create: {
        name: 'Provo',
        address: '5678 University Ave, Provo, UT 84601',
        phone: '+1-801-555-0200',
      },
    }),
  ]);

  console.warn('✅ Clinics: Pleasant Grove, Provo');

  // Cash Boxes
  await Promise.all([
    db.cashBox.upsert({
      where: { name: 'Pleasant Grove Box' },
      update: {},
      create: {
        name: 'Pleasant Grove Box',
        currency: 'USD',
        balance: 500,
        lowBalanceThreshold: 100,
      },
    }),
    db.cashBox.upsert({
      where: { name: 'Provo Box' },
      update: {},
      create: {
        name: 'Provo Box',
        currency: 'USD',
        balance: 500,
        lowBalanceThreshold: 100,
      },
    }),
  ]);

  console.warn('✅ Cash Boxes: Pleasant Grove Box, Provo Box');

  console.warn('🎉 Seed complete!');
}

seed()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => {
    void db.$disconnect();
  });
