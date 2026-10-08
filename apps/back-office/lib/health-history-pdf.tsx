/**
 * Health History — el cuestionario "Comprehensive Adult New Patient Health
 * History" de la clínica, como PDF de 4 páginas (carta), con los mismos textos,
 * el mismo orden y las mismas casillas del original.
 *
 * Lo que el paciente ya tiene sale en azul sobre su línea; lo que no, queda la
 * línea o la casilla en blanco para llenar a mano. Si una lista trae más filas
 * de las que caben en la hoja (medicamentos, cirugías, familia, proveedores),
 * el resto va en una hoja "continued" al final — nada se corta en silencio.
 *
 * Es un documento en INGLÉS a propósito (decisión de Erick, 2026-10-08): es el
 * formulario original. Las etiquetas del modal sí siguen el idioma de la
 * interfaz.
 */

import { Document, Page, Text, View, Image, StyleSheet } from '@react-pdf/renderer';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  CONDICIONES, SINTOMAS, VACUNAS, TIPOS_TABACO, TIPOS_ALCOHOL, ANTICONCEPTIVOS, HIJOS,
  type FormView, type Tamizaje,
} from '@/lib/health-history-form';

const LOGO_B64 = (() => {
  try {
    return `data:image/png;base64,${readFileSync(join(process.cwd(), 'public', 'logo-pm.png')).toString('base64')}`;
  } catch { return null; }
})();

const INK = '#111111';
const FILL = '#0b3d91';

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 34, paddingHorizontal: 40, fontFamily: 'Helvetica', fontSize: 8.6, color: INK, lineHeight: 1.3 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  topLine: { flexDirection: 'row', alignItems: 'flex-end', gap: 14 },
  logo: { width: 92, height: 28, objectFit: 'contain' },
  title: { fontFamily: 'Helvetica-Bold', fontSize: 13, marginTop: 4, marginBottom: 4 },
  bold: { fontFamily: 'Helvetica-Bold' },
  h: { fontFamily: 'Helvetica-Bold', fontSize: 9.2, marginTop: 7, marginBottom: 3 },
  small: { fontSize: 8 },
  row: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 3 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  fill: { borderBottomWidth: 0.7, borderBottomColor: INK, minHeight: 11, paddingHorizontal: 2, marginHorizontal: 2, justifyContent: 'flex-end' },
  fillTxt: { color: FILL, fontFamily: 'Helvetica-Bold', fontSize: 8.6 },
  box: { width: 8, height: 8, borderWidth: 0.8, borderColor: INK, marginRight: 3 },
  x: { position: 'absolute', top: -0.6, left: 1.1, fontSize: 7.5, lineHeight: 1, fontFamily: 'Helvetica-Bold', color: FILL },
  opt: { flexDirection: 'row', alignItems: 'center', marginLeft: 3, marginRight: 6 },
  tbl: { borderWidth: 0.7, borderColor: INK, marginTop: 2 },
  tr: { flexDirection: 'row', borderBottomWidth: 0.7, borderBottomColor: INK, minHeight: 15, alignItems: 'center' },
  th: { fontFamily: 'Helvetica-Bold', paddingHorizontal: 3, paddingVertical: 2 },
  td: { paddingHorizontal: 3, paddingVertical: 1.5, borderLeftWidth: 0.7, borderLeftColor: INK, minHeight: 15, justifyContent: 'center' },
  col3: { width: '33.3%' },
});

// ── Piezas ───────────────────────────────────────────────────────────────────

const Box = ({ on }: { on?: boolean }) => (
  <View style={s.box}>{on ? <Text style={s.x}>X</Text> : null}</View>
);
const Opt = ({ on, label }: { on?: boolean; label: string }) => (
  <View style={s.opt}><Box on={on} /><Text>{label}</Text></View>
);
const Fill = ({ w, children }: { w?: number | string; children?: string | null }) => (
  <View style={[s.fill, w !== undefined ? { width: w as number } : { flexGrow: 1 }]}>
    {children ? <Text style={s.fillTxt}>{children}</Text> : null}
  </View>
);
const YesNo = ({ v }: { v: boolean | null }) => (<View style={[s.wrap, { marginLeft: 5 }]}><Opt on={v === true} label="Yes" /><Opt on={v === false} label="No" /></View>);

/** Encabezado de cada hoja: Name / Date of Birth, y el logo en la primera. */
function Top({ v, logo }: { v: FormView; logo?: boolean }) {
  const [y, m, d] = v.patient.dob ? v.patient.dob.split('-') : ['', '', ''];
  return (
    <View style={s.top}>
      <View style={[s.topLine, { flexGrow: 1 }]}>
        <Text>Name:</Text><Fill w={250}>{v.patient.name}</Fill>
        <Text>Date of Birth:</Text><Fill w={26}>{m}</Fill><Text>/</Text><Fill w={26}>{d}</Fill><Text>/</Text><Fill w={36}>{y}</Fill>
      </View>
      {logo && LOGO_B64 ? <Image src={LOGO_B64} style={s.logo} /> : null}
    </View>
  );
}

function Tamiz({ label, t, indent }: { label: string; t: Tamizaje; indent?: boolean }) {
  const [y, m, d] = t.date ? t.date.split('-') : ['', '', ''];
  return (
    <View style={[s.row, indent ? { marginLeft: 0 } : {}]}>
      <Text style={{ width: 92 }}>{label}</Text><Text>Date</Text>
      <Fill w={20}>{m}</Fill><Text>/</Text><Fill w={20}>{d}</Fill><Text>/</Text><Fill w={30}>{y}</Fill>
      <Text style={{ marginLeft: 6 }}>Location</Text><Fill w={110}>{t.location}</Fill>
      <Text style={{ marginLeft: 6 }}>Abnormal?</Text><YesNo v={t.abnormal} />
    </View>
  );
}

const CAP = { meds: 8, surg: 6, fam: 5, prov: 4 };

/** Tabla con encabezado fijo y N filas (las que sobran van en blanco). */
function Tabla({ cols, rows, n, bold }: { cols: { h: string; w: string }[]; rows: string[][]; n: number; bold?: boolean }) {
  const filas = Array.from({ length: n }, (_, i) => rows[i] ?? cols.map(() => ''));
  return (
    <View style={s.tbl}>
      <View style={[s.tr, { backgroundColor: '#eeeeee' }]}>
        {cols.map((c, i) => <View key={c.h} style={[i ? s.td : { paddingHorizontal: 0 }, { width: c.w }]}><Text style={s.th}>{c.h}</Text></View>)}
      </View>
      {filas.map((f, ri) => (
        <View key={ri} style={[s.tr, ri === filas.length - 1 ? { borderBottomWidth: 0 } : {}]}>
          {cols.map((c, ci) => (
            <View key={c.h} style={[ci ? s.td : { paddingHorizontal: 3, minHeight: 15, justifyContent: 'center' }, { width: c.w }]}>
              <Text style={[s.fillTxt, bold ? {} : { fontFamily: 'Helvetica' }]}>{f[ci]}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ── Documento ────────────────────────────────────────────────────────────────

export function HealthHistoryPdf({ view: v }: { view: FormView }) {
  const meds = v.meds.rows.map(r => [r.name, r.dose, r.timesDaily, r.refills]);
  const cirugias = v.surgeries.map(x => [x.procedure, x.year, x.notes]);
  const familia = v.family.map(f => [f.relation, f.condition]);
  const provs = v.providers.map(p => [p.name, p.specialty, p.lastVisit]);
  const sobran = meds.length > CAP.meds || cirugias.length > CAP.surg || familia.length > CAP.fam || provs.length > CAP.prov;

  const otras = v.otherConditions.map(o => (o.resolved ? `${o.text} (resolved)` : o.text)).join('; ');
  const so = v.social; const w = v.women;
  const hijos = so.children;
  const hijoConocido = (HIJOS as readonly string[]).includes(hijos);

  const filaCondicion = (d: (typeof CONDICIONES)[number]) => {
    const st = v.conditions[d.key];
    const largo = d.en.length > 36;
    return (
      <View key={d.key} style={[s.tr, { minHeight: largo ? 22 : 16.2 }]} wrap={false}>
        <View style={{ width: '34%', paddingHorizontal: 3 }}><Text>{d.en}</Text></View>
        <View style={[s.td, { width: '10.5%', alignItems: 'center' }]}><Box on={st.state === 'CURRENT'} /></View>
        <View style={[s.td, { width: '10.5%', alignItems: 'center' }]}><Box on={st.state === 'RESOLVED'} /></View>
        <View style={[s.td, { width: '45%' }]}><Text style={s.fillTxt}>{st.comment}</Text></View>
      </View>
    );
  };
  const cabeceraCond = (
    <View style={[s.tr, { backgroundColor: '#eeeeee' }]}>
      <View style={{ width: '34%' }}><Text style={s.th}>Condition</Text></View>
      <View style={[s.td, { width: '10.5%' }]}><Text style={s.th}>Current</Text></View>
      <View style={[s.td, { width: '10.5%' }]}><Text style={s.th}>Resolved</Text></View>
      <View style={[s.td, { width: '45%' }]}><Text style={s.th}>Comments</Text></View>
    </View>
  );

  return (
    <Document title="Health History" author="Precision Medical Care">
      {/* ─── Página 1 ─── */}
      <Page size="LETTER" style={s.page}>
        <Top v={v} logo />
        <Text style={s.title}>Comprehensive Adult New Patient Health History Questionnaire</Text>
        <Text style={s.small}>
          Your answers on this form will help your health care provider get an accurate history of your medical concerns and conditions.
          If you are a current patient there is a shorter update form you can use. Please fill in all four pages. It is long because it is
          comprehensive. We really want to know you well so we can properly care for you. If you cannot remember specific details, please
          provide your best guess. If you&apos;re uncomfortable with any question, do not answer it.
        </Text>

        <View style={[s.row, { marginTop: 8 }]}><Text>Who referred you to our practice?</Text><Fill>{v.visit.referredBy}</Fill></View>
        <View style={s.row}><Text>Main reason for today&apos;s visit</Text><Fill>{v.visit.mainReason}</Fill></View>
        <View style={s.row}><Text>Other concerns</Text><Fill>{v.visit.otherConcerns}</Fill></View>
        <View style={s.row}><Text>What are your health goals?</Text><Fill>{v.visit.goals}</Fill></View>
        <View style={s.row}>
          <Text>How would you rate your health? (circle one):</Text>
          <View style={[s.wrap, { marginLeft: 6 }]}>
            <Opt on={v.visit.rating === 'EXCELLENT'} label="Excellent" /><Opt on={v.visit.rating === 'GOOD'} label="Good" />
            <Opt on={v.visit.rating === 'FAIR'} label="Fair" /><Opt on={v.visit.rating === 'POOR'} label="Poor" />
          </View>
        </View>

        <Text style={s.h}>MEDICATIONS <Text style={[s.small, { fontFamily: 'Helvetica' }]}>Please list (or show us your own printed/written record) all prescriptions and non-prescription medications. This includes vitamins, herbs, supplements, home remedies, birth control pills, inhalers, over the counter pain pills (Advil, Aleve, Tylenol, etc).</Text></Text>
        <View style={s.row}><Box on={v.meds.none} /><Text>Check box if you do not take any prescription or over the counter medications.</Text></View>
        <View style={s.row}><Box on={v.meds.brought} /><Text>Check box if you brought a list of your medications (give it to my assistant and don&apos;t write in medications below).</Text></View>
        <Tabla
          n={CAP.meds}
          cols={[{ h: 'Medication', w: '40%' }, { h: 'Dose (e.g. mg)', w: '20%' }, { h: 'How many times daily?', w: '22%' }, { h: 'Need refills?', w: '18%' }]}
          rows={v.meds.none ? [] : meds.slice(0, CAP.meds)}
        />

        <View style={[s.row, { marginTop: 8 }]}>
          <Text style={s.bold}>ALLERGIES</Text><Text style={{ marginLeft: 3 }}>or intolerance to medications? If yes, what medication &amp; what reaction?</Text>
        </View>
        <View style={s.row}><Fill>{v.allergies.text}</Fill><Opt on={v.allergies.none} label="NONE" /></View>

        <Text style={s.h}>IMMUNIZATIONS</Text>
        <View style={s.wrap}>{VACUNAS.map(d => <Opt key={d.key} on={v.vaccines[d.key]} label={d.label} />)}</View>

        <Text style={s.h}>HEALTH SCREENING TESTS</Text>
        <View style={s.row}>
          <Text style={{ width: 92 }}>Blood work:</Text><Text>Date</Text>
          {(() => { const [y, m, d] = v.exams.bloodDate ? v.exams.bloodDate.split('-') : ['', '', '']; return <><Fill w={20}>{m}</Fill><Text>/</Text><Fill w={20}>{d}</Fill><Text>/</Text><Fill w={30}>{y}</Fill></>; })()}
          <Text style={{ marginLeft: 6 }}>Results available?</Text><YesNo v={v.exams.bloodResults} />
        </View>
        <View style={s.row}>
          <Text style={{ width: 92 }}>Colonoscopy:</Text><Text>Year</Text><Fill w={40}>{v.exams.colonYear}</Fill>
          <Text style={{ marginLeft: 6 }}>Location</Text><Fill w={110}>{v.exams.colonLocation}</Fill>
          <Text style={{ marginLeft: 6 }}>Abnormal?</Text><YesNo v={v.exams.colonAbnormal} />
        </View>
        <Text style={[s.bold, { marginTop: 4, marginBottom: 2 }]}>Women only:</Text>
        <Tamiz label="Mammogram" t={v.screenings.mammogram} />
        <Tamiz label="Pap Smear" t={v.screenings.pap} />
        <Tamiz label="Bone Density Test" t={v.screenings.boneDensity} />
      </Page>

      {/* ─── Página 2 — condiciones (1/2) ─── */}
      <Page size="LETTER" style={s.page}>
        <Top v={v} />
        <Text style={s.h}>PERSONAL MEDICAL HISTORY -- Do you have or had (past) any of the following conditions?</Text>
        <View style={s.tbl}>
          {cabeceraCond}
          {CONDICIONES.slice(0, 33).map(filaCondicion)}
        </View>
      </Page>

      {/* ─── Página 3 — condiciones (2/2), cirugías, familia, proveedores ─── */}
      <Page size="LETTER" style={s.page}>
        <Top v={v} />
        <View style={s.tbl}>
          {CONDICIONES.slice(33).map(filaCondicion)}
          <View style={[s.tr, { borderBottomWidth: 0, minHeight: 20 }]}>
            <View style={{ width: '34%', paddingHorizontal: 3 }}><Text>Other</Text></View>
            <View style={[s.td, { width: '10.5%' }]} /><View style={[s.td, { width: '10.5%' }]} />
            <View style={[s.td, { width: '45%' }]}><Text style={s.fillTxt}>{otras}</Text></View>
          </View>
        </View>
        <View style={[s.row, { marginTop: 5 }]}><Box on={v.noSignificant} /><Text>Check box if you have no history of significant medical illnesses</Text></View>

        <Text style={s.h}>SURGICAL &amp; PROCEDURE HISTORY -- List any details or complications under comments.</Text>
        <Tabla n={CAP.surg} cols={[{ h: 'Surgical Procedure', w: '40%' }, { h: 'Year', w: '14%' }, { h: 'Comments', w: '46%' }]} rows={cirugias.slice(0, CAP.surg)} />

        <Text style={s.h}>FAMILY HISTORY -- List any diseases, conditions, cancers, etc. for first-degree relatives.</Text>
        <Tabla n={CAP.fam} cols={[{ h: 'Family Member', w: '40%' }, { h: 'Condition', w: '60%' }]} rows={familia.slice(0, CAP.fam)} />

        <Text style={s.h}>Please list other healthcare providers and their specialty:</Text>
        <Tabla n={CAP.prov} cols={[{ h: 'Provider Name', w: '40%' }, { h: 'Specialty', w: '34%' }, { h: 'Date of Last Visit', w: '26%' }]} rows={provs.slice(0, CAP.prov)} />
      </Page>

      {/* ─── Página 4 — revisión de sistemas, social, mujer ─── */}
      <Page size="LETTER" style={s.page}>
        <Top v={v} />
        <Text style={s.h}>REVIEW OF SYSTEMS -- Have you had any of the following in the past 2 weeks? Check the box.</Text>
        <View style={{ flexDirection: 'row' }}>
          {SINTOMAS.map((col, ci) => (
            <View key={ci} style={s.col3}>
              {col.map((sy, i) => (
                <View key={sy.en} style={[s.row, { marginBottom: 2 }]}>
                  <Box on={v.symptoms.includes(sy.en)} />
                  <Text>{sy.en}</Text>
                  {ci === 0 && i === 0 ? <><Text> -- lbs?</Text><Fill w={26}>{v.weightLbs}</Fill></> : null}
                </View>
              ))}
            </View>
          ))}
        </View>

        <Text style={s.h}>SOCIAL HISTORY</Text>
        <View style={s.row}>
          <Text>Do you work?</Text>
          <Opt on={so.workStatus === 'NO'} label="No" /><Opt on={so.workStatus === 'FULL'} label="Full-time" /><Opt on={so.workStatus === 'PART'} label="Part-time" />
          <Text>-- Type of work?</Text><Fill>{so.workType}</Fill>
        </View>
        <View style={s.row}>
          <Text>How many children do you have?</Text>
          {HIJOS.map(h => <Opt key={h} on={hijos === h} label={h} />)}
          {hijos && !hijoConocido ? <Fill w={40}>{hijos}</Fill> : null}
        </View>
        <View style={s.row}>
          <Text>Marital status?</Text>
          {['Single', 'Married', 'Engaged', 'Separated', 'Divorced', 'Widowed'].map(m => <Opt key={m} on={v.patient.marital === m} label={m} />)}
        </View>
        <View style={s.row}>
          <Text>Tobacco Use?</Text>
          <Opt on={so.tobacco === 'CURRENT'} label="Current" /><Opt on={so.tobacco === 'FORMER'} label="Former" /><Opt on={so.tobacco === 'NEVER'} label="Never" />
          <Text>-- Type?</Text>{TIPOS_TABACO.map(t => <Opt key={t} on={so.tobaccoTypes.includes(t)} label={t} />)}
        </View>
        <View style={s.row}>
          <Text>Packs/day</Text><Fill w={60}>{so.packsPerDay}</Fill><Text># of years</Text><Fill w={60}>{so.tobaccoYears}</Fill>
          <Text>Quit Date?</Text>
          {(() => { const [y, m, d] = so.quitDate ? so.quitDate.split('-') : ['', '', '']; return <><Fill w={20}>{m}</Fill><Text>/</Text><Fill w={20}>{d}</Fill><Text>/</Text><Fill w={30}>{y}</Fill></>; })()}
        </View>
        <View style={s.row}>
          <Text>Exposure to second-hand smoke?</Text><YesNo v={so.secondhand} />
          <Text style={{ marginLeft: 20 }}>Are you ready to quit?</Text><YesNo v={so.readyToQuit} />
        </View>
        <View style={s.row}>
          <Text>Alcohol use?</Text><Opt on={so.alcohol === 'CURRENT'} label="Yes" /><Opt on={so.alcohol === 'NEVER' || so.alcohol === 'FORMER'} label="No" />
          <Text>-- # of drinks/week:</Text><Fill w={36}>{so.drinksPerWeek}</Fill>
          {TIPOS_ALCOHOL.map(t => <Opt key={t} on={so.alcoholTypes.includes(t)} label={t} />)}
        </View>
        <View style={s.row}>
          <Text>Drug use?</Text><Opt on={so.drugs === 'CURRENT'} label="Currently" /><Opt on={so.drugs === 'FORMER'} label="Former" /><Opt on={so.drugs === 'NEVER'} label="Never" />
          <Text>-- Type?</Text><Fill>{so.drugType}</Fill>
        </View>
        <View style={s.row}>
          <Text>Are you sexually involved?</Text>
          <Opt on={so.sexual === 'CURRENT'} label="Currently" /><Opt on={so.sexual === 'NOT_CURRENT'} label="Not currently" /><Opt on={so.sexual === 'NEVER'} label="Never" />
          <Text>-- With?</Text><Opt on={so.sexualWith === 'MALE'} label="Male" /><Opt on={so.sexualWith === 'FEMALE'} label="Female" /><Opt on={so.sexualWith === 'BOTH'} label="Both" />
        </View>
        <View style={s.row}>
          <Text>Birth control?</Text>{ANTICONCEPTIVOS.map(b => <Opt key={b} on={so.birthControl.includes(b)} label={b} />)}
          <Fill w={90}>{so.birthControlOther}</Fill>
        </View>
        <View style={s.row}>
          <Text>Military service?</Text><YesNo v={so.military} />
          <Text style={{ marginLeft: 30 }}>Going to school?</Text><YesNo v={so.school} />
        </View>

        <Text style={s.h}>WOMEN&apos;S HEALTH HISTORY</Text>
        <View style={s.row}>
          <Text>Total number of pregnancies</Text><Fill w={36}>{w.pregnancies}</Fill>
          <Text>Number of births</Text><Fill w={36}>{w.births}</Fill>
          <Text>Number of miscarriages</Text><Fill w={36}>{w.miscarriages}</Fill>
        </View>
        <View style={s.row}><Text>Age at beginning of period (menstruation)</Text><Fill w={50}>{w.menarcheAge}</Fill></View>
        <View style={s.row}>
          <Text>Age at end of periods (menopause/hysterectomy)</Text><Fill w={50}>{w.menopauseAge}</Fill><Opt on={w.notApplicable} label="Not applicable" />
        </View>
        <View style={s.row}><Text>Do you have concerns about your periods or menopause you&apos;d like to discuss?</Text><YesNo v={w.periodConcerns} /></View>
        <View style={s.row}>
          <Text>If you are having periods, how often do they occur? Every</Text><Fill w={36}>{w.periodEveryDays}</Fill>
          <Text>days. How long do they last?</Text><Fill w={26}>{w.periodLastDays}</Fill><Text>days.</Text>
        </View>
        <View style={s.row}>
          <Text>Are they light / normal / heavy?</Text>
          <Opt on={w.periodFlow === 'LIGHT'} label="Light" /><Opt on={w.periodFlow === 'NORMAL'} label="Normal" /><Opt on={w.periodFlow === 'HEAVY'} label="Heavy" />
        </View>
        <View style={s.row}>
          <Text>Are your periods irregular?</Text><YesNo v={w.periodIrregular} />
          <Text>-- If yes, what is the pattern?</Text><Fill>{w.periodPattern}</Fill>
        </View>
      </Page>

      {/* ─── Hoja extra: lo que no cupo ─── */}
      {sobran ? (
        <Page size="LETTER" style={s.page}>
          <Top v={v} />
          <Text style={s.title}>Health History — continued</Text>
          {meds.length > CAP.meds ? (<><Text style={s.h}>MEDICATIONS (continued)</Text>
            <Tabla n={meds.length - CAP.meds} cols={[{ h: 'Medication', w: '40%' }, { h: 'Dose (e.g. mg)', w: '20%' }, { h: 'How many times daily?', w: '22%' }, { h: 'Need refills?', w: '18%' }]} rows={meds.slice(CAP.meds)} /></>) : null}
          {cirugias.length > CAP.surg ? (<><Text style={s.h}>SURGICAL &amp; PROCEDURE HISTORY (continued)</Text>
            <Tabla n={cirugias.length - CAP.surg} cols={[{ h: 'Surgical Procedure', w: '40%' }, { h: 'Year', w: '14%' }, { h: 'Comments', w: '46%' }]} rows={cirugias.slice(CAP.surg)} /></>) : null}
          {familia.length > CAP.fam ? (<><Text style={s.h}>FAMILY HISTORY (continued)</Text>
            <Tabla n={familia.length - CAP.fam} cols={[{ h: 'Family Member', w: '40%' }, { h: 'Condition', w: '60%' }]} rows={familia.slice(CAP.fam)} /></>) : null}
          {provs.length > CAP.prov ? (<><Text style={s.h}>OTHER HEALTHCARE PROVIDERS (continued)</Text>
            <Tabla n={provs.length - CAP.prov} cols={[{ h: 'Provider Name', w: '40%' }, { h: 'Specialty', w: '34%' }, { h: 'Date of Last Visit', w: '26%' }]} rows={provs.slice(CAP.prov)} /></>) : null}
        </Page>
      ) : null}
    </Document>
  );
}
