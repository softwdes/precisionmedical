/**
 * Seed ServiceCode catalog — B.33 CPT/HCPCS/Custom PI workflow
 * Fee schedule FY 2026
 * Run: node packages/database/prisma/seed-service-codes.mjs
 */
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const servicesSeed = [
  // E&M
  { code: '99202', type: 'CPT', shortDescription: 'New patient · 20 min · straightforward', longDescription: 'Office or other outpatient visit for the evaluation and management of a new patient', category: 'EM', currentFee: 220.00 },
  { code: '99203', type: 'CPT', shortDescription: 'New patient · 30 min · low complexity', longDescription: 'Office outpatient new · low complexity', category: 'EM', currentFee: 350.00 },
  { code: '99204', type: 'CPT', shortDescription: 'New patient · 45 min · moderate', longDescription: 'Office outpatient new · moderate complexity', category: 'EM', currentFee: 425.00 },
  { code: '99213', type: 'CPT', shortDescription: 'Established · 15 min · low complexity', longDescription: 'Office outpatient visit · established patient · low complexity', category: 'EM', currentFee: 250.00 },
  { code: '99214', type: 'CPT', shortDescription: 'Established · 25 min · moderate', longDescription: 'Office outpatient visit · established patient · moderate complexity', category: 'EM', currentFee: 300.00 },
  { code: '99215', type: 'CPT', shortDescription: 'Established · 40 min · high complexity', longDescription: 'Office outpatient visit · established · high complexity', category: 'EM', currentFee: 380.00 },

  // Chiropractic
  { code: '98940', type: 'CPT', shortDescription: 'CMT spine · 1-2 regions', longDescription: 'Chiropractic manipulative treatment · spinal · 1-2 regions', category: 'CHIROPRACTIC', currentFee: 250.00 },
  { code: '98941', type: 'CPT', shortDescription: 'CMT spine · 3-4 regions', longDescription: 'Chiropractic manipulative treatment · spinal · 3-4 regions', category: 'CHIROPRACTIC', currentFee: 300.00, modifiersAllowed: ['-25', '-59'] },
  { code: '98942', type: 'CPT', shortDescription: 'CMT spine · 5 regions', longDescription: 'Chiropractic manipulative treatment · spinal · 5 regions', category: 'CHIROPRACTIC', currentFee: 350.00 },

  // Physical Therapy
  { code: '97110', type: 'CPT', shortDescription: 'Therapeutic exercises · 15 min', longDescription: 'Therapeutic procedure · 1 or more areas · therapeutic exercises', category: 'PHYSICAL_THERAPY', currentFee: 75.00 },
  { code: '97140', type: 'CPT', shortDescription: 'Manual therapy · 15 min', longDescription: 'Manual therapy techniques · 1 or more regions', category: 'PHYSICAL_THERAPY', currentFee: 85.00 },
  { code: '97014', type: 'CPT', shortDescription: 'Electric stimulation', longDescription: 'Application of unattended electrical stimulation modality', category: 'PHYSICAL_THERAPY', currentFee: 45.00 },
  { code: '97012', type: 'CPT', shortDescription: 'Mechanical traction', longDescription: 'Application of mechanical traction', category: 'PHYSICAL_THERAPY', currentFee: 50.00 },

  // Injections
  { code: '20552', type: 'CPT', shortDescription: 'Trigger point injection · 1-2 muscles', longDescription: 'Injection · single or multiple trigger points · 1 or 2 muscles', category: 'INJECTIONS', currentFee: 300.00 },
  { code: '20553', type: 'CPT', shortDescription: 'Trigger point injection · 3+ muscles', longDescription: 'Injection · single or multiple trigger points · 3 or more muscles', category: 'INJECTIONS', currentFee: 350.00 },
  { code: '64483', type: 'CPT', shortDescription: 'Epidural · lumbar/sacral', longDescription: 'Injection · transforaminal epidural · lumbar or sacral', category: 'INJECTIONS', currentFee: 2500.00 },
  { code: '64633', type: 'CPT', shortDescription: 'Radio frequency ablation', longDescription: 'Destruction by neurolytic agent · paravertebral facet joint nerve(s)', category: 'INJECTIONS', currentFee: 3500.00 },

  // HCPCS Level II
  { code: 'J3301', type: 'HCPCS', shortDescription: 'Kenalog (triamcinolone) 10mg', longDescription: 'Injection · triamcinolone acetonide · not otherwise specified · 10 mg', category: 'DRUGS', currentFee: 25.00 },
  { code: 'J0735', type: 'HCPCS', shortDescription: 'Lidocaine 10mg', longDescription: 'Injection · clonidine hydrochloride · 1 mg', category: 'DRUGS', currentFee: 8.00 },

  // Imaging
  { code: '72148', type: 'CPT', shortDescription: 'MRI lumbar spine · sin contraste', longDescription: 'Magnetic resonance imaging · spinal canal and contents · lumbar · without contrast', category: 'IMAGING', currentFee: 1200.00 },
  { code: '72141', type: 'CPT', shortDescription: 'MRI cervical spine · sin contraste', longDescription: 'Magnetic resonance imaging · spinal canal and contents · cervical · without contrast', category: 'IMAGING', currentFee: 1200.00 },

  // Reports / Legal narratives
  { code: 'PM-NARRATIVE', type: 'CUSTOM_PM', shortDescription: 'Narrativa legal para abogado', longDescription: 'Reporte legal detallado del caso para uso del bufete', category: 'REPORTS', currentFee: 430.00, isInternalOnly: true, notes: 'NO facturable a seguro. Solo internal/abogado.' },
  { code: 'PM-DEPOPREP',  type: 'CUSTOM_PM', shortDescription: 'Preparación de depo del doctor', longDescription: 'Preparación + tiempo del doctor para deposición', category: 'REPORTS', currentFee: 600.00, isInternalOnly: true },
  { code: 'PM-DIRECT',    type: 'CUSTOM_PM', shortDescription: 'Pago directo del paciente (self-pay)', longDescription: 'Visita pagada directamente por el paciente sin facturar a seguro', category: 'CUSTOM', currentFee: 150.00, isInternalOnly: true },
  { code: 'PM-MEMBERSHIP',type: 'CUSTOM_PM', shortDescription: 'Cuota de membresía mensual', longDescription: 'Membresía mensual self-pay del paciente', category: 'CUSTOM', currentFee: 99.00, isInternalOnly: true },
];

async function main() {
  let created = 0, updated = 0;
  let order = 0;
  for (const svc of servicesSeed) {
    order++;
    const existing = await db.serviceCode.findUnique({
      where: { code_fiscalYear: { code: svc.code, fiscalYear: 2026 } },
    });
    if (existing) {
      await db.serviceCode.update({
        where: { code_fiscalYear: { code: svc.code, fiscalYear: 2026 } },
        data: { shortDescription: svc.shortDescription, currentFee: svc.currentFee },
      });
      updated++;
    } else {
      await db.serviceCode.create({
        data: {
          code: svc.code,
          type: svc.type,
          shortDescription: svc.shortDescription,
          longDescription: svc.longDescription,
          category: svc.category,
          currentFee: svc.currentFee,
          fiscalYear: 2026,
          modifiersAllowed: svc.modifiersAllowed ?? [],
          isInternalOnly: svc.isInternalOnly ?? false,
          notes: svc.notes ?? null,
          sortOrder: order,
        },
      });
      created++;
    }
  }
  console.log(`✅ ServiceCode seed: ${created} created, ${updated} updated`);
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
