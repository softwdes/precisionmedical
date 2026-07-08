import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const CLINICS = [
  {
    name:      'Murray - Surgery',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '275 E 6100 S Murray, UT 84107',
    city:      'Murray',
    state:     'UT',
    zipCode:   '84107',
    color:     '#1D4ED8',
  },
  {
    name:      'West Valley',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '4085 S 2200 W Suite C, West Valley City, UT 84119',
    city:      'West Valley City',
    state:     'UT',
    zipCode:   '84119',
    color:     '#DC2626',
  },
  {
    name:      'Provo',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '75 S 200 E Suite 202, Provo, UT 84606',
    city:      'Provo',
    state:     'UT',
    zipCode:   '84606',
    color:     '#94A3B8',
  },
  {
    name:      'Pleasant Grove',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '348 East State Road, Pleasant Grove, UT 84062',
    city:      'Pleasant Grove',
    state:     'UT',
    zipCode:   '84062',
    color:     '#16A34A',
  },
  {
    name:      'Spanish Fork',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '65 W 200 N, Suite 7, Spanish Fork, UT 84660',
    city:      'Spanish Fork',
    state:     'UT',
    zipCode:   '84660',
    color:     '#CA8A04',
  },
  {
    name:      'Murray',
    phone:     '(801) 375-2207',
    cellPhone: '(801) 375-2207',
    email:     'info@precisionmedicalcare.com',
    address:   '275 E 6100 S Murray, UT 84107',
    city:      'Murray',
    state:     'UT',
    zipCode:   '84107',
    color:     '#C2410C',
  },
];

async function main() {
  console.log('Seeding clinics...');
  for (const clinic of CLINICS) {
    const result = await db.clinic.upsert({
      where:  { name: clinic.name },
      update: clinic,
      create: clinic,
    });
    console.log(`  ✓ ${result.name}`);
  }
  console.log('Done.');
}

main().catch(console.error).finally(() => db.$disconnect());
