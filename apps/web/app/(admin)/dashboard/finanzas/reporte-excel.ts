/**
 * Armado del Excel del Reporte Financiero de Caja Chica.
 *
 * Vive fuera del componente a propósito: es una función pura sobre los datos
 * que ya están en pantalla, así se puede ejecutar y validar el XML sin montar
 * React ni tRPC. (Probar una copia del template no es probar el template.)
 *
 * Formato: SpreadsheetML 2003, el mismo que employees/reporte-horas-client.
 * No es CSV a propósito: el separador de lista de Windows en es-PE/es-BO es
 * ';', así que un CSV separado por comas se abre TODO en la columna A y los
 * montos llegan como texto — nadie puede sumarlos. Reproducido y medido el
 * 2026-09-09 abriendo ambos archivos con Excel 16.
 */

export interface FiltrosAplicados {
  dateFrom: string;
  dateTo: string;
  country: 'all' | 'EEUU' | 'Bolivia';
  clinicName: string;
  tipo: 'all' | 'DEPOSIT' | 'EXPENSE';
  category: string;
}

export interface DatosReporte {
  kpis: {
    totalDeposits: number;
    totalExpenses: number;
    txCount: number;
    avgAmount: number;
    medianAmount: number;
  };
  dailySeries: Array<{ date: string; bolivia: number; eeuu: number }>;
  byCategory: Array<{ category: string; amount: number; count: number; pct: number }>;
  byClinic: Array<{ clinicName: string; country: string; amount: number; count: number }>;
}

const TIPO_KEYS: Record<FiltrosAplicados['tipo'], string> = {
  all: 'typeAll',
  DEPOSIT: 'typeDeposits',
  EXPENSE: 'typeExpenses',
};

const esc = (s: string | number | null | undefined) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

function cell(
  val: string | number | null | undefined,
  type: 'String' | 'Number' = 'String',
  style?: string,
) {
  const t = typeof val === 'number' && type === 'Number' ? 'Number' : 'String';
  const styleAttr = style ? ` ss:StyleID="${style}"` : '';
  return `<Cell${styleAttr}><Data ss:Type="${t}">${esc(val)}</Data></Cell>`;
}

const hd  = (v: string) => cell(v, 'String', 'header');
const lbl = (v: string) => cell(v, 'String', 'bold');

// Redondeo antes de escribir: sin esto Excel guarda 3417.7199999 y la suma de
// la columna no cuadra con el total que muestra la pantalla.
const money   = (n: number) => cell(Math.round(n * 100) / 100, 'Number', 'money');
const pctCell = (n: number) => cell(Math.round(n * 10000) / 10000, 'Number', 'pct');

/** El tipo de `t`: este módulo no es un componente y lo recibe por parámetro. */
type Traducir = (k: string, p?: Record<string, string | number>) => string;

export function construirWorkbookCajaChica(
  report: DatosReporte,
  applied: FiltrosAplicados,
  totalBalance: number,
  catLabels: Record<string, string>,
  t: Traducir,
  locale: string,
): string {
  // Hoja 1 — con qué filtros salieron estos números, y los KPIs de arriba.
  // Sin el bloque de filtros, dos exports del mismo mes son indistinguibles.
  const resumenRows = [
    `<Row>${lbl(t('reportTitle'))}</Row>`,
    '<Row/>',
    `<Row>${lbl(t('period'))}${cell(`${applied.dateFrom} a ${applied.dateTo}`)}</Row>`,
    `<Row>${lbl(t('site'))}${cell(applied.country === 'all' ? t('excelAll') : applied.country)}</Row>`,
    `<Row>${lbl(t('clinic'))}${cell(applied.clinicName || t('excelAll'))}</Row>`,
    `<Row>${lbl(t('type'))}${cell(t(TIPO_KEYS[applied.tipo]))}</Row>`,
    `<Row>${lbl(t('category'))}${cell(applied.category ? (catLabels[applied.category] ?? applied.category) : t('excelAll'))}</Row>`,
    `<Row>${lbl(t('excelGenerated'))}${cell(new Date().toLocaleString(locale))}</Row>`,
    '<Row/>',
    `<Row>${lbl(t('kpiTotalBalance'))}${money(totalBalance)}</Row>`,
    `<Row>${lbl(t('kpiTotalDeposits'))}${money(report.kpis.totalDeposits)}</Row>`,
    `<Row>${lbl(t('kpiTotalExpenses'))}${money(report.kpis.totalExpenses)}</Row>`,
    `<Row>${lbl(t('transactions'))}${cell(report.kpis.txCount, 'Number')}</Row>`,
    `<Row>${lbl(t('excelAvgPerTx'))}${money(report.kpis.avgAmount)}</Row>`,
    `<Row>${lbl(t('excelMedian'))}${money(report.kpis.medianAmount)}</Row>`,
  ].join('');

  const catRows = report.byCategory.map(r => `<Row>
      ${cell(catLabels[r.category] ?? r.category)}
      ${cell(r.count, 'Number')}
      ${money(r.amount)}
      ${pctCell(r.pct)}
    </Row>`).join('');

  const clinicRows = report.byClinic.map(c => `<Row>
      ${cell(c.clinicName)}
      ${cell(c.country)}
      ${cell(c.count, 'Number')}
      ${money(c.amount)}
    </Row>`).join('');

  // Igual que el gráfico de la pantalla: el acumulado, no el movimiento suelto.
  let cumBo = 0;
  let cumEe = 0;
  const dailyRows = report.dailySeries.map(d => {
    cumBo += d.bolivia;
    cumEe += d.eeuu;
    return `<Row>
      ${cell(d.date)}
      ${money(d.bolivia)}
      ${money(d.eeuu)}
      ${money(d.bolivia + d.eeuu)}
      ${money(cumBo + cumEe)}
    </Row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
          xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="header">
      <Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="9"/>
      <Interior ss:Color="#6366F1" ss:Pattern="Solid"/>
      <Alignment ss:Horizontal="Center"/>
    </Style>
    <Style ss:ID="bold"><Font ss:Bold="1"/></Style>
    <Style ss:ID="money"><NumberFormat ss:Format="#,##0.00"/></Style>
    <Style ss:ID="pct"><NumberFormat ss:Format="0.0%"/></Style>
  </Styles>
  <Worksheet ss:Name="${t('sheetSummary')}">
    <Table>
      <Column ss:Width="160"/><Column ss:Width="130"/>
      ${resumenRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="${t('sheetByCategory')}">
    <Table>
      <Column ss:Width="150"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="80"/>
      <Row>${hd(t('category'))}${hd(t('transactions'))}${hd(t('amount'))}${hd(t('excelPctOfTotal'))}</Row>
      ${catRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="${t('sheetBySite')}">
    <Table>
      <Column ss:Width="150"/><Column ss:Width="80"/><Column ss:Width="90"/><Column ss:Width="90"/>
      <Row>${hd(t('clinic'))}${hd(t('site'))}${hd(t('transactions'))}${hd(t('amount'))}</Row>
      ${clinicRows}
    </Table>
  </Worksheet>
  <Worksheet ss:Name="${t('sheetDaily')}">
    <Table>
      <Column ss:Width="80"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="90"/><Column ss:Width="100"/>
      <Row>${hd(t('colDate'))}${hd('Bolivia')}${hd('EEUU')}${hd(t('excelNetOfDay'))}${hd(t('excelCumulative'))}</Row>
      ${dailyRows}
    </Table>
  </Worksheet>
</Workbook>`;
}

export function nombreArchivoCajaChica(applied: FiltrosAplicados): string {
  return `reporte-caja-chica-${applied.dateFrom}_${applied.dateTo}.xls`;
}
