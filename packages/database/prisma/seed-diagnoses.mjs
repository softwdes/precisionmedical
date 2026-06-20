/**
 * seed-diagnoses.mjs
 *
 * Siembra el catálogo de diagnósticos ICD-10-CM + SNOMED CT para
 * una clínica PI/MVA (Phase 1A).
 *
 * Uso:
 *   node packages/database/prisma/seed-diagnoses.mjs
 *
 * Idempotente: usa upsert por icd10Code.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

// ─── Catálogo ─────────────────────────────────────────────────────────────────
// Formato: { icd10Code, icd10Description, snomedCode?, snomedDescription?, category, bodySystem?, piRelevant }

const DIAGNOSES = [
  // ── Cervical spine — S codes (injury, initial encounter) ──────────────────
  {
    icd10Code: 'S13.4XXA',
    icd10Description: 'Sprain of ligaments of cervical spine, initial encounter',
    snomedCode: '44014003',
    snomedDescription: 'Sprain of neck (disorder)',
    category: 'S', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'S14.2XXA',
    icd10Description: 'Injury of nerve root of cervical spine, initial encounter',
    snomedCode: '449180002',
    snomedDescription: 'Injury of nerve root of cervical spine (disorder)',
    category: 'S', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'S19.9XXA',
    icd10Description: 'Unspecified injury of neck, initial encounter',
    snomedCode: '262574004',
    snomedDescription: 'Injury of neck (disorder)',
    category: 'S', bodySystem: 'Cervical spine', piRelevant: true,
  },

  // ── Head / concussion ──────────────────────────────────────────────────────
  {
    icd10Code: 'S06.0X0A',
    icd10Description: 'Concussion without loss of consciousness, initial encounter',
    snomedCode: '110030002',
    snomedDescription: 'Concussion (disorder)',
    category: 'S', bodySystem: 'Head', piRelevant: true,
  },
  {
    icd10Code: 'S06.0X1A',
    icd10Description: 'Concussion with loss of consciousness of 30 minutes or less, initial encounter',
    snomedCode: '110030002',
    snomedDescription: 'Concussion (disorder)',
    category: 'S', bodySystem: 'Head', piRelevant: true,
  },
  {
    icd10Code: 'S09.90XA',
    icd10Description: 'Unspecified injury of head, initial encounter',
    snomedCode: '82271004',
    snomedDescription: 'Injury of head (disorder)',
    category: 'S', bodySystem: 'Head', piRelevant: true,
  },

  // ── Thoracic / lumbar spine ────────────────────────────────────────────────
  {
    icd10Code: 'S23.3XXA',
    icd10Description: 'Sprain of ligaments of thoracic spine, initial encounter',
    snomedCode: '444798002',
    snomedDescription: 'Sprain of thoracic spine (disorder)',
    category: 'S', bodySystem: 'Thoracic spine', piRelevant: true,
  },
  {
    icd10Code: 'S33.5XXA',
    icd10Description: 'Sprain of ligaments of lumbar spine, initial encounter',
    snomedCode: '30989003',
    snomedDescription: 'Sprain of lumbar spine (disorder)',
    category: 'S', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'S39.012A',
    icd10Description: 'Strain of muscle, fascia and tendon of lower back, initial encounter',
    snomedCode: '202794003',
    snomedDescription: 'Strain of muscle of back (disorder)',
    category: 'S', bodySystem: 'Lumbar spine', piRelevant: true,
  },

  // ── Shoulder ──────────────────────────────────────────────────────────────
  {
    icd10Code: 'S43.401A',
    icd10Description: 'Unspecified sprain of right shoulder joint, initial encounter',
    snomedCode: '444218000',
    snomedDescription: 'Sprain of shoulder joint (disorder)',
    category: 'S', bodySystem: 'Right shoulder', piRelevant: true,
  },
  {
    icd10Code: 'S43.402A',
    icd10Description: 'Unspecified sprain of left shoulder joint, initial encounter',
    snomedCode: '444218000',
    snomedDescription: 'Sprain of shoulder joint (disorder)',
    category: 'S', bodySystem: 'Left shoulder', piRelevant: true,
  },
  {
    icd10Code: 'S46.011A',
    icd10Description: 'Strain of muscle(s) and tendon(s) of rotator cuff of right shoulder, initial encounter',
    snomedCode: '73583000',
    snomedDescription: 'Strain of rotator cuff (disorder)',
    category: 'S', bodySystem: 'Right shoulder', piRelevant: true,
  },
  {
    icd10Code: 'S46.012A',
    icd10Description: 'Strain of muscle(s) and tendon(s) of rotator cuff of left shoulder, initial encounter',
    snomedCode: '73583000',
    snomedDescription: 'Strain of rotator cuff (disorder)',
    category: 'S', bodySystem: 'Left shoulder', piRelevant: true,
  },

  // ── Knee ──────────────────────────────────────────────────────────────────
  {
    icd10Code: 'S83.401A',
    icd10Description: 'Sprain of unspecified collateral ligament of right knee, initial encounter',
    snomedCode: '57773001',
    snomedDescription: 'Sprain of knee (disorder)',
    category: 'S', bodySystem: 'Right knee', piRelevant: true,
  },
  {
    icd10Code: 'S83.402A',
    icd10Description: 'Sprain of unspecified collateral ligament of left knee, initial encounter',
    snomedCode: '57773001',
    snomedDescription: 'Sprain of knee (disorder)',
    category: 'S', bodySystem: 'Left knee', piRelevant: true,
  },
  {
    icd10Code: 'S83.501A',
    icd10Description: 'Sprain of anterior cruciate ligament of right knee, initial encounter',
    snomedCode: '444000004',
    snomedDescription: 'Sprain of anterior cruciate ligament (disorder)',
    category: 'S', bodySystem: 'Right knee', piRelevant: true,
  },

  // ── Wrist / hand ──────────────────────────────────────────────────────────
  {
    icd10Code: 'S63.501A',
    icd10Description: 'Unspecified sprain of right wrist, initial encounter',
    snomedCode: '35039007',
    snomedDescription: 'Sprain of wrist (disorder)',
    category: 'S', bodySystem: 'Right wrist', piRelevant: true,
  },

  // ── Musculoskeletal / M codes — very common in MVA ────────────────────────
  {
    icd10Code: 'M54.2',
    icd10Description: 'Cervicalgia',
    snomedCode: '81680005',
    snomedDescription: 'Neck pain (finding)',
    category: 'M', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.12',
    icd10Description: 'Radiculopathy, cervical region',
    snomedCode: '128196005',
    snomedDescription: 'Cervical radiculopathy (disorder)',
    category: 'M', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.13',
    icd10Description: 'Radiculopathy, cervicothoracic region',
    snomedCode: '307374004',
    snomedDescription: 'Cervicothoracic radiculopathy (disorder)',
    category: 'M', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.50',
    icd10Description: 'Low back pain, unspecified',
    snomedCode: '279039007',
    snomedDescription: 'Low back pain (finding)',
    category: 'M', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.4',
    icd10Description: 'Lumbago with sciatica, unspecified side',
    snomedCode: '279040009',
    snomedDescription: 'Lumbago with sciatica (disorder)',
    category: 'M', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.16',
    icd10Description: 'Radiculopathy, lumbar region',
    snomedCode: '128200000',
    snomedDescription: 'Lumbar radiculopathy (disorder)',
    category: 'M', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'M54.17',
    icd10Description: 'Radiculopathy, lumbosacral region',
    snomedCode: '57310009',
    snomedDescription: 'Lumbosacral radiculopathy (disorder)',
    category: 'M', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'M79.3',
    icd10Description: 'Panniculitis, unspecified',
    snomedCode: '200956003',
    snomedDescription: 'Panniculitis (disorder)',
    category: 'M', bodySystem: 'Soft tissue', piRelevant: true,
  },
  {
    icd10Code: 'M62.838',
    icd10Description: 'Other muscle spasm',
    snomedCode: '45352006',
    snomedDescription: 'Spasm (finding)',
    category: 'M', bodySystem: 'Soft tissue', piRelevant: true,
  },
  {
    icd10Code: 'M47.812',
    icd10Description: 'Spondylosis without myelopathy or radiculopathy, cervical region',
    snomedCode: '415068001',
    snomedDescription: 'Cervical spondylosis (disorder)',
    category: 'M', bodySystem: 'Cervical spine', piRelevant: false,
  },
  {
    icd10Code: 'M51.16',
    icd10Description: 'Intervertebral disc degeneration, lumbar region',
    snomedCode: '57703009',
    snomedDescription: 'Degenerative disc disease of lumbar spine (disorder)',
    category: 'M', bodySystem: 'Lumbar spine', piRelevant: false,
  },
  {
    icd10Code: 'M50.12',
    icd10Description: 'Cervical disc disorder with radiculopathy, mid-cervical region',
    snomedCode: '202709009',
    snomedDescription: 'Cervical disc disorder with radiculopathy (disorder)',
    category: 'M', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'M75.10',
    icd10Description: 'Rotator cuff syndrome, unspecified shoulder',
    snomedCode: '57680009',
    snomedDescription: 'Rotator cuff syndrome (disorder)',
    category: 'M', bodySystem: 'Shoulder', piRelevant: true,
  },

  // ── Neurological / G codes ─────────────────────────────────────────────────
  {
    icd10Code: 'G54.2',
    icd10Description: 'Cervical root disorders, not elsewhere classified',
    snomedCode: '74964007',
    snomedDescription: 'Cervical root syndrome (disorder)',
    category: 'G', bodySystem: 'Cervical spine', piRelevant: true,
  },
  {
    icd10Code: 'G54.4',
    icd10Description: 'Lumbosacral root disorders, not elsewhere classified',
    snomedCode: '23056005',
    snomedDescription: 'Lumbosacral radiculitis (disorder)',
    category: 'G', bodySystem: 'Lumbar spine', piRelevant: true,
  },
  {
    icd10Code: 'G44.309',
    icd10Description: 'Post-traumatic headache, unspecified, not intractable',
    snomedCode: '230461009',
    snomedDescription: 'Post-traumatic headache (disorder)',
    category: 'G', bodySystem: 'Head', piRelevant: true,
  },
  {
    icd10Code: 'G43.909',
    icd10Description: 'Migraine, unspecified, not intractable, without status migrainosus',
    snomedCode: '37796009',
    snomedDescription: 'Migraine (disorder)',
    category: 'G', bodySystem: 'Head', piRelevant: false,
  },
  {
    icd10Code: 'G89.21',
    icd10Description: 'Chronic pain due to trauma',
    snomedCode: '702673001',
    snomedDescription: 'Chronic pain (finding)',
    category: 'G', bodySystem: 'Soft tissue', piRelevant: true,
  },
  {
    icd10Code: 'G89.29',
    icd10Description: 'Other chronic post-procedural pain',
    snomedCode: '82423001',
    snomedDescription: 'Chronic pain (finding)',
    category: 'G', bodySystem: 'Soft tissue', piRelevant: true,
  },

  // ── Symptoms / R codes ─────────────────────────────────────────────────────
  {
    icd10Code: 'R51.9',
    icd10Description: 'Headache, unspecified',
    snomedCode: '25064002',
    snomedDescription: 'Headache (finding)',
    category: 'R', bodySystem: 'Head', piRelevant: false,
  },
  {
    icd10Code: 'R42',
    icd10Description: 'Dizziness and giddiness',
    snomedCode: '404640003',
    snomedDescription: 'Dizziness (finding)',
    category: 'R', bodySystem: 'Head', piRelevant: true,
  },
  {
    icd10Code: 'R55',
    icd10Description: 'Syncope and collapse',
    snomedCode: '271594007',
    snomedDescription: 'Syncope (disorder)',
    category: 'R', bodySystem: 'Systemic', piRelevant: false,
  },
  {
    icd10Code: 'R52',
    icd10Description: 'Pain, unspecified',
    snomedCode: '22253000',
    snomedDescription: 'Pain (finding)',
    category: 'R', bodySystem: 'Soft tissue', piRelevant: false,
  },

  // ── Mental / behavioral / F codes ─────────────────────────────────────────
  {
    icd10Code: 'F43.10',
    icd10Description: 'Post-traumatic stress disorder, unspecified',
    snomedCode: '47505003',
    snomedDescription: 'Post-traumatic stress disorder (disorder)',
    category: 'F', bodySystem: 'Mental health', piRelevant: true,
  },
  {
    icd10Code: 'F41.1',
    icd10Description: 'Generalized anxiety disorder',
    snomedCode: '21897009',
    snomedDescription: 'Generalized anxiety disorder (disorder)',
    category: 'F', bodySystem: 'Mental health', piRelevant: true,
  },
  {
    icd10Code: 'F32.9',
    icd10Description: 'Major depressive disorder, single episode, unspecified',
    snomedCode: '370143000',
    snomedDescription: 'Major depressive disorder (disorder)',
    category: 'F', bodySystem: 'Mental health', piRelevant: false,
  },

  // ── External cause (V codes) — para documentación de causa del accidente ───
  {
    icd10Code: 'V43.52XA',
    icd10Description: 'Car driver injured in collision with other type car in traffic accident, initial encounter',
    snomedCode: '418399005',
    snomedDescription: 'Motor vehicle accident (event)',
    category: 'V_W', bodySystem: 'External cause', piRelevant: true,
  },
  {
    icd10Code: 'V43.12XA',
    icd10Description: 'Car passenger injured in collision with other type car in traffic accident, initial encounter',
    snomedCode: '418399005',
    snomedDescription: 'Motor vehicle accident (event)',
    category: 'V_W', bodySystem: 'External cause', piRelevant: true,
  },
  {
    icd10Code: 'V47.51XA',
    icd10Description: 'Car driver injured in collision with fixed or stationary object, initial encounter',
    snomedCode: '418399005',
    snomedDescription: 'Motor vehicle accident (event)',
    category: 'V_W', bodySystem: 'External cause', piRelevant: true,
  },
  {
    icd10Code: 'V47.12XA',
    icd10Description: 'Car passenger injured in collision with fixed or stationary object, traffic accident, initial encounter',
    snomedCode: '418399005',
    snomedDescription: 'Motor vehicle accident (event)',
    category: 'V_W', bodySystem: 'External cause', piRelevant: true,
  },

  // ── Health factors / Z codes ───────────────────────────────────────────────
  {
    icd10Code: 'Z87.39',
    icd10Description: 'Personal history of other musculoskeletal disorders',
    snomedCode: '160303001',
    snomedDescription: 'History of musculoskeletal disease (situation)',
    category: 'Z', bodySystem: 'History', piRelevant: false,
  },
  {
    icd10Code: 'Z96.641',
    icd10Description: 'Presence of right artificial knee joint',
    snomedCode: '413481009',
    snomedDescription: 'Presence of joint prosthesis (finding)',
    category: 'Z', bodySystem: 'History', piRelevant: false,
  },
];

// ─── Runner ───────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Sembrando ${DIAGNOSES.length} diagnósticos...`);

  let created = 0;
  let updated = 0;

  for (const d of DIAGNOSES) {
    const existing = await db.diagnosis.findUnique({ where: { icd10Code: d.icd10Code } });

    if (existing) {
      await db.diagnosis.update({
        where: { icd10Code: d.icd10Code },
        data: {
          icd10Description:  d.icd10Description,
          snomedCode:        d.snomedCode ?? null,
          snomedDescription: d.snomedDescription ?? null,
          category:          d.category,
          bodySystem:        d.bodySystem ?? null,
          piRelevant:        d.piRelevant,
          isActive:          true,
        },
      });
      updated++;
    } else {
      await db.diagnosis.create({
        data: {
          icd10Code:         d.icd10Code,
          icd10Description:  d.icd10Description,
          snomedCode:        d.snomedCode ?? null,
          snomedDescription: d.snomedDescription ?? null,
          category:          d.category,
          bodySystem:        d.bodySystem ?? null,
          piRelevant:        d.piRelevant,
        },
      });
      created++;
    }
  }

  console.log(`✓ Creados: ${created} | Actualizados: ${updated} | Total: ${DIAGNOSES.length}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
