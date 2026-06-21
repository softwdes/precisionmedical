/**
 * seed-catalogs.mjs
 * Puebla drugs, drug_interactions y lab_catalog.
 * Idempotente: upsert por nombre/código único.
 *
 * Uso: pnpm --filter=@precision-medical/database seed:catalogs
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const DRUGS = [
  // NSAIDs
  { name: 'Ibuprofen 600mg Tab',              generic: 'Ibuprofen',           schedule: null, category: 'NSAID' },
  { name: 'Ibuprofen 800mg Tab',              generic: 'Ibuprofen',           schedule: null, category: 'NSAID' },
  { name: 'Naproxen 500mg Tab',               generic: 'Naproxen Sodium',     schedule: null, category: 'NSAID' },
  { name: 'Meloxicam 15mg Tab',               generic: 'Meloxicam',           schedule: null, category: 'NSAID' },
  { name: 'Diclofenac 75mg EC Tab',           generic: 'Diclofenac Na',       schedule: null, category: 'NSAID' },
  { name: 'Ketorolac 10mg Tab',               generic: 'Ketorolac',           schedule: null, category: 'NSAID' },
  { name: 'Celecoxib 200mg Cap',              generic: 'Celecoxib',           schedule: null, category: 'NSAID' },
  // Muscle Relaxants
  { name: 'Cyclobenzaprine 5mg Tab',          generic: 'Cyclobenzaprine',     schedule: null, category: 'RELAXANT' },
  { name: 'Cyclobenzaprine 10mg Tab',         generic: 'Cyclobenzaprine',     schedule: null, category: 'RELAXANT' },
  { name: 'Methocarbamol 750mg Tab',          generic: 'Methocarbamol',       schedule: null, category: 'RELAXANT' },
  { name: 'Tizanidine 4mg Tab',               generic: 'Tizanidine',          schedule: null, category: 'RELAXANT' },
  { name: 'Baclofen 10mg Tab',                generic: 'Baclofen',            schedule: null, category: 'RELAXANT' },
  // Opioids
  { name: 'Oxycodone 5mg Tab',                generic: 'Oxycodone HCl',       schedule: 'II',  category: 'OPIOID' },
  { name: 'Oxycodone 10mg Tab',               generic: 'Oxycodone HCl',       schedule: 'II',  category: 'OPIOID' },
  { name: 'Oxycodone/APAP 5/325 Tab',         generic: 'Oxycodone HCl',       schedule: 'II',  category: 'OPIOID' },
  { name: 'Hydrocodone/APAP 5/325 Tab',       generic: 'Hydrocodone',         schedule: 'II',  category: 'OPIOID' },
  { name: 'Hydrocodone/APAP 10/325 Tab',      generic: 'Hydrocodone',         schedule: 'II',  category: 'OPIOID' },
  { name: 'Tramadol 50mg Tab',                generic: 'Tramadol HCl',        schedule: 'IV',  category: 'OPIOID' },
  { name: 'Tramadol 100mg ER Tab',            generic: 'Tramadol HCl ER',     schedule: 'IV',  category: 'OPIOID' },
  // Neuropathic
  { name: 'Gabapentin 300mg Cap',             generic: 'Gabapentin',          schedule: null,  category: 'NEURO' },
  { name: 'Gabapentin 600mg Tab',             generic: 'Gabapentin',          schedule: null,  category: 'NEURO' },
  { name: 'Pregabalin 75mg Cap',              generic: 'Pregabalin',          schedule: 'V',   category: 'NEURO' },
  { name: 'Pregabalin 150mg Cap',             generic: 'Pregabalin',          schedule: 'V',   category: 'NEURO' },
  { name: 'Duloxetine 30mg Cap',              generic: 'Duloxetine HCl',      schedule: null,  category: 'NEURO' },
  { name: 'Amitriptyline 25mg Tab',           generic: 'Amitriptyline',       schedule: null,  category: 'NEURO' },
  // Topical
  { name: 'Diclofenac Gel 1% (100g)',         generic: 'Diclofenac Na',       schedule: null,  category: 'TOPICAL' },
  { name: 'Lidocaine Patch 5% (30ct)',        generic: 'Lidocaine',           schedule: null,  category: 'TOPICAL' },
  { name: 'Capsaicin Cream 0.025% (60g)',     generic: 'Capsaicin',           schedule: null,  category: 'TOPICAL' },
  // Steroids
  { name: 'Methylprednisolone 4mg Dose Pack', generic: 'Methylprednisolone',  schedule: null,  category: 'STEROID' },
  { name: 'Prednisone 10mg Tab',              generic: 'Prednisone',          schedule: null,  category: 'STEROID' },
  { name: 'Prednisone 20mg Tab',              generic: 'Prednisone',          schedule: null,  category: 'STEROID' },
  // Other
  { name: 'Pantoprazole 40mg Tab',            generic: 'Pantoprazole',        schedule: null,  category: 'OTHER' },
  { name: 'Omeprazole 20mg Cap',              generic: 'Omeprazole',          schedule: null,  category: 'OTHER' },
  { name: 'Ondansetron 4mg ODT',              generic: 'Ondansetron',         schedule: null,  category: 'OTHER' },
];

const INTERACTIONS = [
  { drug: 'Cyclobenzaprine', interactsWith: 'Tramadol',    warning: 'Tramadol + Cyclobenzaprine = riesgo serotonín syndrome. Evitar combinación.' },
  { drug: 'Cyclobenzaprine', interactsWith: 'Oxycodone',   warning: 'Opioide + relajante muscular = depresión SNC potenciada. CDC advierte.' },
  { drug: 'Cyclobenzaprine', interactsWith: 'Hydrocodone', warning: 'Opioide + relajante muscular = depresión SNC potenciada. CDC advierte.' },
  { drug: 'Tramadol',        interactsWith: 'Cyclobenzaprine', warning: 'Tramadol + Cyclobenzaprine = riesgo serotonín syndrome.' },
  { drug: 'Tramadol',        interactsWith: 'Gabapentin',      warning: 'Tramadol + Gabapentin = CNS depression aumentada.' },
  { drug: 'Tramadol',        interactsWith: 'Pregabalin',      warning: 'Tramadol + Pregabalin = CNS depression + seizure risk.' },
  { drug: 'Oxycodone',       interactsWith: 'Cyclobenzaprine', warning: 'Opioide + relajante muscular = depresión SNC potenciada.' },
  { drug: 'Oxycodone',       interactsWith: 'Gabapentin',      warning: 'Oxycodone + Gabapentin = CNS depression + respiratory depression.' },
];

const LAB_CATALOG = [
  // IMAGING
  { code: 'MRI-CX', name: 'MRI Cervical Spine without contrast',    loinc: '36812-3', category: 'IMAGING' },
  { code: 'MRI-LS', name: 'MRI Lumbar Spine without contrast',      loinc: '36814-9', category: 'IMAGING' },
  { code: 'MRI-BR', name: 'MRI Brain without contrast',             loinc: '24725-8', category: 'IMAGING' },
  { code: 'CT-CX',  name: 'CT Cervical Spine without contrast',     loinc: '36807-3', category: 'IMAGING' },
  { code: 'CT-LS',  name: 'CT Lumbar Spine without contrast',       loinc: '36811-5', category: 'IMAGING' },
  { code: 'XR-CX',  name: 'X-Ray Cervical Spine 4 views',          loinc: '36643-2', category: 'IMAGING' },
  { code: 'XR-LS',  name: 'X-Ray Lumbar Spine AP/Lateral',         loinc: '36641-6', category: 'IMAGING' },
  { code: 'XR-SH',  name: 'X-Ray Shoulder AP + Y-view',            loinc: '36616-8', category: 'IMAGING' },
  { code: 'XR-KN',  name: 'X-Ray Knee AP/Lateral/Oblique',         loinc: '36620-0', category: 'IMAGING' },
  // LABORATORY
  { code: 'BMP',    name: 'Basic Metabolic Panel',                  loinc: '24320-8', category: 'LABORATORY' },
  { code: 'CMP',    name: 'Comprehensive Metabolic Panel',          loinc: '24323-2', category: 'LABORATORY' },
  { code: 'CBC',    name: 'Complete Blood Count with Differential', loinc: '58410-2', category: 'LABORATORY' },
  { code: 'UA',     name: 'Urinalysis with Reflex Culture',         loinc: '5767-9',  category: 'LABORATORY' },
  { code: 'ESR',    name: 'Erythrocyte Sedimentation Rate',         loinc: '4537-7',  category: 'LABORATORY' },
  { code: 'CRP',    name: 'C-Reactive Protein',                     loinc: '1988-5',  category: 'LABORATORY' },
  { code: 'PT',     name: 'Prothrombin Time / INR',                 loinc: '5902-2',  category: 'LABORATORY' },
  { code: 'UDS',    name: 'Urine Drug Screen (10-panel)',           loinc: '19300-0', category: 'LABORATORY' },
  // CARDIOLOGY
  { code: 'EKG',    name: 'ECG 12-lead with interpretation',        loinc: '11524-6', category: 'CARDIOLOGY' },
  { code: 'ECHO',   name: 'Echocardiogram transthoracic',           loinc: '42148-7', category: 'CARDIOLOGY' },
  { code: 'HOLTER', name: 'Holter Monitor 24-hour',                 loinc: '18843-0', category: 'CARDIOLOGY' },
];

async function main() {
  console.log('Seeding catalogs...');

  // Drugs — upsert por nombre
  let drugsCreated = 0, drugsUpdated = 0;
  for (const drug of DRUGS) {
    const existing = await db.drug.findFirst({ where: { name: drug.name } });
    if (existing) {
      await db.drug.update({ where: { id: existing.id }, data: drug });
      drugsUpdated++;
    } else {
      await db.drug.create({ data: drug });
      drugsCreated++;
    }
  }
  console.log(`Drugs: +${drugsCreated} creados | ~${drugsUpdated} actualizados`);

  // Interactions — recrear (son pocos y fijos)
  await db.drugInteraction.deleteMany();
  await db.drugInteraction.createMany({ data: INTERACTIONS });
  console.log(`Drug interactions: ${INTERACTIONS.length} cargadas`);

  // Lab catalog — upsert por code
  let labsCreated = 0, labsUpdated = 0;
  for (const lab of LAB_CATALOG) {
    await db.labCatalog.upsert({
      where:  { code: lab.code },
      update: lab,
      create: lab,
    });
    labsCreated++;
  }
  console.log(`Lab catalog: ${labsCreated} upserted`);

  console.log('✓ Catalogs seed complete');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
