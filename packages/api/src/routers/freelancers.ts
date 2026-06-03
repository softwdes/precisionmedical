import { z } from 'zod';
import { randomUUID } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { supabaseAdmin } from '../supabase-admin';

const createFreelancerSchema = z.object({
  nombre:     z.string().min(2).max(150),
  email:      z.string().email().optional().or(z.literal('')),
  phone:      z.string().optional(),
  pais:       z.string().min(1),
  modalidad:  z.enum(['POR_HORA', 'POR_SERVICIO', 'CONTRATISTA']),
  tarifaBase: z.number().positive().optional(),
  moneda:     z.enum(['USD', 'BOB', 'PEN']).default('USD'),
  notas:      z.string().optional(),
  bankQrUrl:  z.string().url().optional().or(z.literal('')),
});

const createPaymentSchema = z.object({
  freelancerId:  z.string(),
  descripcion:   z.string().min(3),
  horas:         z.number().positive().optional(),
  tarifaHora:    z.number().positive().optional(),
  monto:         z.number().positive(),
  moneda:        z.enum(['USD', 'BOB', 'PEN']),
  fechaServicio: z.coerce.date(),
  fechaPago:     z.coerce.date().optional(),   // optional para PENDING
  scheduledDate: z.coerce.date().optional(),   // requerido si status=PENDING
  status:        z.enum(['PENDING', 'PAID']).default('PAID'), // default mantiene compat con flujo actual
  bonusAmount:   z.number().positive().optional(),
  bonusReason:   z.string().min(3).optional(),
  notas:         z.string().optional(),
});

const updatePaymentSchema = z.object({
  id:            z.string(),
  descripcion:   z.string().min(3).optional(),
  horas:         z.number().positive().optional(),
  tarifaHora:    z.number().positive().optional(),
  monto:         z.number().positive().optional(),
  moneda:        z.enum(['USD', 'BOB', 'PEN']).optional(),
  fechaServicio: z.coerce.date().optional(),
  scheduledDate: z.coerce.date().optional(),
  bonusAmount:   z.number().positive().optional(),
  bonusReason:   z.string().min(3).optional(),
  notas:         z.string().optional(),
});

export const freelancersRouter = router({
  list: protectedProcedure
    .input(z.object({
      page:      z.number().int().positive().default(1),
      pageSize:  z.number().int().positive().max(100).default(25),
      search:    z.string().optional(),
      modalidad: z.enum(['POR_HORA', 'POR_SERVICIO', 'CONTRATISTA']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, search, modalidad } = input;
      const from = (page - 1) * pageSize;
      const to   = from + pageSize - 1;

      let query = supabaseAdmin
        .from('freelancers')
        .select('*, freelancer_payments(id, monto, moneda, fechaPago)', { count: 'exact' })
        .is('deletedAt', null)
        .range(from, to)
        .order('createdAt', { ascending: false });

      if (search)    query = query.ilike('nombre', `%${search}%`);
      if (modalidad) query = query.eq('modalidad', modalidad);

      const { data, error, count } = await query;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      return {
        items:      data ?? [],
        total:      count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getSummary: protectedProcedure.query(async () => {
    const now        = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]!;

    const [{ count: totalActivos }, { data: monthPayments }, { count: totalPagos }] = await Promise.all([
      supabaseAdmin.from('freelancers').select('id', { count: 'exact', head: true }).is('deletedAt', null).eq('status', 'ACTIVE'),
      supabaseAdmin.from('freelancer_payments').select('monto').gte('fechaPago', monthStart).lte('fechaPago', monthEnd),
      supabaseAdmin.from('freelancer_payments').select('id', { count: 'exact', head: true }),
    ]);

    const totalPagadoMes = (monthPayments ?? []).reduce((s, p) => s + Number(p.monto), 0);

    return { totalActivos: totalActivos ?? 0, totalPagadoMes, totalPagos: totalPagos ?? 0 };
  }),

  create: adminProcedure
    .input(createFreelancerSchema)
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .insert({
          id:        randomUUID(),
          ...input,
          email:     input.email     || null,
          bankQrUrl: input.bankQrUrl || null,
          updatedAt: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.created',
        entityType:  'Freelancer',
        entityId:    data.id,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  update: adminProcedure
    .input(z.object({ id: z.string(), data: createFreelancerSchema.partial() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .update({
          ...input.data,
          email:     input.data.email     === '' ? null : input.data.email,
          bankQrUrl: input.data.bankQrUrl === '' ? null : input.data.bankQrUrl,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.updated',
        entityType:  'Freelancer',
        entityId:    input.id,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  deactivate: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancers')
        .update({ status: 'INACTIVE', deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.deactivated',
        entityType:  'Freelancer',
        entityId:    input.id,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  listPayments: protectedProcedure
    .input(z.object({ freelancerId: z.string() }))
    .query(async ({ input }) => {
      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .select('*')
        .eq('freelancerId', input.freelancerId)
        .order('fechaPago', { ascending: false });

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });
      return data ?? [];
    }),

  // ─── REPORTE CONSOLIDADO ──────────────────────────────────────────────────
  // Agrega pagos en un rango con filtros, devuelve KPIs por moneda + series
  // para gráficas + agrupado por freelancer + pagos detallados.
  // Nunca suma monedas distintas: cada bloque está separado por currency.
  getReport: protectedProcedure
    .input(z.object({
      from:         z.string(), // YYYY-MM-DD
      to:           z.string(), // YYYY-MM-DD
      modalidad:    z.enum(['POR_HORA', 'POR_SERVICIO', 'CONTRATISTA']).optional(),
      moneda:       z.enum(['USD', 'BOB', 'PEN']).optional(),
      pais:         z.string().optional(),
      freelancerId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const { from, to, modalidad, moneda, pais, freelancerId } = input;

      // 1) Pagos en rango con datos del freelancer
      let q = supabaseAdmin
        .from('freelancer_payments')
        .select('id, descripcion, modalidad, horas, tarifaHora, monto, moneda, fechaServicio, fechaPago, notas, freelancer:freelancers!inner(id, nombre, pais, modalidad, moneda, status)')
        .gte('fechaPago', from)
        .lte('fechaPago', to)
        .order('fechaPago', { ascending: false });

      if (modalidad)    q = q.eq('modalidad', modalidad);
      if (moneda)       q = q.eq('moneda', moneda);
      if (freelancerId) q = q.eq('freelancerId', freelancerId);

      const { data: paymentsRaw, error } = await q;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      type PaymentRow = {
        id: string;
        descripcion: string;
        modalidad: 'POR_HORA' | 'POR_SERVICIO' | 'CONTRATISTA';
        horas:      number | null;
        tarifaHora: number | null;
        monto:      number | string;
        moneda:     'USD' | 'BOB' | 'PEN';
        fechaServicio: string;
        fechaPago:     string;
        notas: string | null;
        freelancer: {
          id: string;
          nombre: string;
          pais: string;
          modalidad: 'POR_HORA' | 'POR_SERVICIO' | 'CONTRATISTA';
          moneda: 'USD' | 'BOB' | 'PEN';
          status: string;
        };
      };

      let payments = (paymentsRaw ?? []) as unknown as PaymentRow[];

      // Filtro pais (no se puede filtrar tabla embebida en supabase con .eq directo)
      if (pais) payments = payments.filter(p => p.freelancer?.pais === pais);

      // 2) KPIs por moneda
      type CurrencyBucket = { total: number; count: number; freelancerIds: Set<string> };
      const byCurrencyMap: Record<string, CurrencyBucket> = {};
      for (const p of payments) {
        const c = p.moneda;
        if (!byCurrencyMap[c]) byCurrencyMap[c] = { total: 0, count: 0, freelancerIds: new Set() };
        byCurrencyMap[c]!.total += Number(p.monto);
        byCurrencyMap[c]!.count += 1;
        if (p.freelancer?.id) byCurrencyMap[c]!.freelancerIds.add(p.freelancer.id);
      }
      const kpisByCurrency = Object.entries(byCurrencyMap).map(([currency, b]) => ({
        currency,
        total:           b.total,
        count:           b.count,
        freelancerCount: b.freelancerIds.size,
        average:         b.count > 0 ? b.total / b.count : 0,
      }));

      // 3) Tendencia mensual últimos 12 meses (independiente del rango) por moneda
      const trendStart = new Date();
      trendStart.setUTCDate(1);
      trendStart.setUTCMonth(trendStart.getUTCMonth() - 11);
      const trendStartIso = trendStart.toISOString().split('T')[0]!;

      const { data: trendRaw } = await supabaseAdmin
        .from('freelancer_payments')
        .select('monto, moneda, fechaPago')
        .gte('fechaPago', trendStartIso);

      const monthlyTrendMap: Record<string, Record<string, number>> = {}; // key = YYYY-MM, val = { USD: x, BOB: y, PEN: z }
      for (const p of (trendRaw ?? []) as Array<{ monto: number | string; moneda: string; fechaPago: string }>) {
        const ym = (p.fechaPago ?? '').slice(0, 7);
        if (!ym) continue;
        if (!monthlyTrendMap[ym]) monthlyTrendMap[ym] = {};
        monthlyTrendMap[ym]![p.moneda] = (monthlyTrendMap[ym]![p.moneda] ?? 0) + Number(p.monto);
      }
      // Completa los 12 meses incluso si no hubo pagos
      const monthlyTrend: Array<{ month: string; USD: number; BOB: number; PEN: number }> = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(trendStart);
        d.setUTCMonth(d.getUTCMonth() + i);
        const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const bucket = monthlyTrendMap[ym] ?? {};
        monthlyTrend.push({
          month: ym,
          USD: Number(bucket.USD ?? 0),
          BOB: Number(bucket.BOB ?? 0),
          PEN: Number(bucket.PEN ?? 0),
        });
      }

      // 4) Por modalidad (dentro del rango filtrado)
      const byModalidadMap: Record<string, Record<string, number>> = {};
      for (const p of payments) {
        if (!byModalidadMap[p.modalidad]) byModalidadMap[p.modalidad] = {};
        byModalidadMap[p.modalidad]![p.moneda] = (byModalidadMap[p.modalidad]![p.moneda] ?? 0) + Number(p.monto);
      }
      const byModalidad = Object.entries(byModalidadMap).map(([mod, byCur]) => ({
        modalidad: mod,
        totals: byCur,
        count: payments.filter(p => p.modalidad === mod).length,
      }));

      // 5) Por país
      const byPaisMap: Record<string, Record<string, number>> = {};
      for (const p of payments) {
        const paisKey = p.freelancer?.pais ?? '—';
        if (!byPaisMap[paisKey]) byPaisMap[paisKey] = {};
        byPaisMap[paisKey]![p.moneda] = (byPaisMap[paisKey]![p.moneda] ?? 0) + Number(p.monto);
      }
      const byPais = Object.entries(byPaisMap).map(([paisName, totals]) => ({ pais: paisName, totals }));

      // 6) Agrupado por freelancer (para tabla resumen)
      const byFreelancerMap: Record<string, {
        id: string;
        nombre: string;
        pais: string;
        modalidad: string;
        moneda: string;
        total: number;
        count: number;
        lastPago: string | null;
      }> = {};
      for (const p of payments) {
        const fid = p.freelancer?.id;
        if (!fid) continue;
        if (!byFreelancerMap[fid]) {
          byFreelancerMap[fid] = {
            id:         fid,
            nombre:     p.freelancer.nombre,
            pais:       p.freelancer.pais,
            modalidad:  p.freelancer.modalidad,
            moneda:     p.moneda, // moneda principal (la del pago — puede haber mezcla)
            total:      0,
            count:      0,
            lastPago:   null,
          };
        }
        byFreelancerMap[fid]!.total += Number(p.monto);
        byFreelancerMap[fid]!.count += 1;
        if (!byFreelancerMap[fid]!.lastPago || p.fechaPago > byFreelancerMap[fid]!.lastPago!) {
          byFreelancerMap[fid]!.lastPago = p.fechaPago;
        }
      }
      const byFreelancer = Object.values(byFreelancerMap).sort((a, b) => b.total - a.total);

      // 7) Top 5 freelancers
      const topFreelancers = byFreelancer.slice(0, 5);

      // 8) Pagos detallados (limit 500 para no explotar payload)
      const rawPayments = payments.slice(0, 500).map(p => ({
        id:            p.id,
        freelancerId:  p.freelancer?.id ?? '',
        freelancerNombre: p.freelancer?.nombre ?? '—',
        pais:          p.freelancer?.pais ?? '—',
        descripcion:   p.descripcion,
        modalidad:     p.modalidad,
        horas:         p.horas != null ? Number(p.horas) : null,
        tarifaHora:    p.tarifaHora != null ? Number(p.tarifaHora) : null,
        monto:         Number(p.monto),
        moneda:        p.moneda,
        fechaServicio: p.fechaServicio,
        fechaPago:     p.fechaPago,
        notas:         p.notas,
      }));

      return {
        range: { from, to },
        kpisByCurrency,
        monthlyTrend,
        byModalidad,
        byPais,
        byFreelancer,
        topFreelancers,
        rawPayments,
        totalPayments: payments.length,
      };
    }),

  createPayment: adminProcedure
    .input(createPaymentSchema)
    .mutation(async ({ input, ctx }) => {
      const { data: freelancer } = await supabaseAdmin
        .from('freelancers')
        .select('modalidad')
        .eq('id', input.freelancerId)
        .single();

      if (!freelancer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Freelancer not found' });

      // Validación según status:
      // - PAID  → fechaPago obligatoria (registro post-hoc)
      // - PENDING → scheduledDate obligatoria, fechaPago no aplica
      if (input.status === 'PAID' && !input.fechaPago) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'fechaPago is required for PAID status' });
      }
      if (input.status === 'PENDING' && !input.scheduledDate) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'scheduledDate is required for PENDING status' });
      }

      const fechaPagoStr     = input.status === 'PAID' && input.fechaPago     ? input.fechaPago.toISOString().split('T')[0] : null;
      const scheduledDateStr = input.scheduledDate                            ? input.scheduledDate.toISOString().split('T')[0] : null;
      const paidDateStr      = input.status === 'PAID' && input.fechaPago     ? input.fechaPago.toISOString().split('T')[0] : null;

      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .insert({
          id:            randomUUID(),
          freelancerId:  input.freelancerId,
          descripcion:   input.descripcion,
          modalidad:     freelancer?.modalidad ?? 'POR_SERVICIO',
          horas:         input.horas ?? null,
          tarifaHora:    input.tarifaHora ?? null,
          monto:         input.monto,
          moneda:        input.moneda,
          status:        input.status,
          fechaServicio: input.fechaServicio.toISOString().split('T')[0],
          scheduledDate: scheduledDateStr,
          fechaPago:     fechaPagoStr,
          paidDate:      paidDateStr,
          bonusAmount:   input.bonusAmount ?? null,
          bonusReason:   input.bonusReason ?? null,
          notas:         input.notas ?? null,
          createdAt:     new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      input.status === 'PENDING' ? 'freelancer.payment.scheduled' : 'freelancer.payment.created',
        entityType:  'FreelancerPayment',
        entityId:    data.id,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  // ─── PAGOS PENDIENTES — listado con filtros y orden PENDING-first ──────────
  listPagos: protectedProcedure
    .input(z.object({
      page:     z.number().int().positive().default(1),
      pageSize: z.number().int().positive().max(100).default(25),
      status:   z.enum(['PENDING','PAID','CANCELLED','REVERSED']).optional(),
    }))
    .query(async ({ input }) => {
      const { page, pageSize, status } = input;

      let q = supabaseAdmin
        .from('freelancer_payments')
        .select(
          'id, descripcion, modalidad, horas, tarifaHora, monto, moneda, status, ' +
          'fechaServicio, scheduledDate, fechaPago, paidDate, bonusAmount, bonusReason, ' +
          'reversedById, notas, createdAt, freelancerId, ' +
          'freelancer:freelancers!inner(id, nombre, pais, modalidad, moneda, bankQrUrl, status)',
          { count: 'exact' },
        );

      if (status) q = q.eq('status', status);

      const { data, error, count } = await q;
      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      // Orden manual: PENDING primero (por scheduledDate ASC), luego el resto por createdAt DESC
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const sorted = [...rows].sort((a, b) => {
        const sw = (s: unknown): number => s === 'PENDING' ? 0 : s === 'PAID' ? 1 : 2;
        const wa = sw(a.status), wb = sw(b.status);
        if (wa !== wb) return wa - wb;
        if (a.status === 'PENDING') {
          const ts = (d: unknown): number => typeof d === 'string' ? new Date(d).getTime() : Number.MAX_SAFE_INTEGER;
          return ts(a.scheduledDate) - ts(b.scheduledDate);
        }
        const ta = typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0;
        const tb = typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });

      const from = (page - 1) * pageSize;
      const paged = sorted.slice(from, from + pageSize);

      return {
        items:      paged,
        total:      count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    }),

  getPagosSummary: protectedProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const now        = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]!;
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]!;

      const [{ data: paid }, { data: pending }, { count: total }] = await Promise.all([
        supabaseAdmin.from('freelancer_payments').select('monto, moneda').eq('status', 'PAID')
          .gte('paidDate', monthStart).lte('paidDate', monthEnd),
        supabaseAdmin.from('freelancer_payments').select('monto, moneda').eq('status', 'PENDING'),
        supabaseAdmin.from('freelancer_payments').select('id', { count: 'exact', head: true }),
      ]);

      const sumByCurrency = (rows: Array<{ monto: number | string; moneda: string }> | null) => {
        const out: Record<string, number> = {};
        for (const r of rows ?? []) out[r.moneda] = (out[r.moneda] ?? 0) + Number(r.monto);
        return out;
      };

      return {
        period:        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
        paidThisMonth: sumByCurrency(paid as Array<{ monto: number; moneda: string }> | null),
        pending:       sumByCurrency(pending as Array<{ monto: number; moneda: string }> | null),
        count:         total ?? 0,
        countPending:  (pending ?? []).length,
      };
    }),

  markPagoAsPaid: adminProcedure
    .input(z.object({ id: z.string(), paidDate: z.coerce.date().optional() }))
    .mutation(async ({ input, ctx }) => {
      const { data: existing } = await supabaseAdmin
        .from('freelancer_payments').select('*').eq('id', input.id).single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
      if (existing.status !== 'PENDING')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo pagos PENDING pueden marcarse como pagados' });

      const paidStr = (input.paidDate ?? new Date()).toISOString().split('T')[0]!;

      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .update({ status: 'PAID', paidDate: paidStr, fechaPago: paidStr })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.marked_paid',
        entityType:  'FreelancerPayment',
        entityId:    input.id,
        before:      existing,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  cancelPago: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { data: existing } = await supabaseAdmin
        .from('freelancer_payments').select('*').eq('id', input.id).single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
      if (existing.status !== 'PENDING')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo pagos PENDING pueden cancelarse' });

      const { data, error } = await supabaseAdmin
        .from('freelancer_payments')
        .update({ status: 'CANCELLED' })
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.cancelled',
        entityType:  'FreelancerPayment',
        entityId:    input.id,
        before:      existing,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),

  reversePago: adminProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(3) }))
    .mutation(async ({ input, ctx }) => {
      const { data: existing } = await supabaseAdmin
        .from('freelancer_payments').select('*').eq('id', input.id).single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
      if (existing.status !== 'PAID')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo pagos PAID pueden reversarse' });
      if (existing.reversedById)
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Este pago ya fue reversado' });

      // Crea el pago "espejo" con monto negativo (append-only)
      const reverseId = randomUUID();
      const today     = new Date().toISOString().split('T')[0]!;

      const { error: revErr } = await supabaseAdmin
        .from('freelancer_payments')
        .insert({
          id:            reverseId,
          freelancerId:  existing.freelancerId,
          descripcion:   `REVERSAL: ${existing.descripcion} — ${input.reason}`,
          modalidad:     existing.modalidad,
          horas:         existing.horas,
          tarifaHora:    existing.tarifaHora,
          monto:         -Math.abs(Number(existing.monto)),
          moneda:        existing.moneda,
          status:        'REVERSED',
          fechaServicio: existing.fechaServicio,
          fechaPago:     today,
          paidDate:      today,
          reversedById:  existing.id,
          notas:         `Reversal of payment ${existing.id}`,
          createdAt:     new Date().toISOString(),
        });

      if (revErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: revErr.message });

      // Marca el original como REVERSED y apunta al espejo
      const { data: updated, error: updErr } = await supabaseAdmin
        .from('freelancer_payments')
        .update({ status: 'REVERSED', reversedById: reverseId })
        .eq('id', input.id)
        .select()
        .single();

      if (updErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updErr.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.reversed',
        entityType:  'FreelancerPayment',
        entityId:    input.id,
        before:      existing,
        after:       updated,
        metadata:    { reason: input.reason, reverseId },
        createdAt:   new Date().toISOString(),
      });

      return updated;
    }),

  updatePago: adminProcedure
    .input(updatePaymentSchema)
    .mutation(async ({ input, ctx }) => {
      const { data: existing } = await supabaseAdmin
        .from('freelancer_payments').select('*').eq('id', input.id).single();

      if (!existing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Pago no encontrado' });
      if (existing.status !== 'PENDING')
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Solo pagos PENDING pueden editarse' });

      const patch: Record<string, unknown> = {};
      if (input.descripcion   !== undefined) patch.descripcion   = input.descripcion;
      if (input.horas         !== undefined) patch.horas         = input.horas;
      if (input.tarifaHora    !== undefined) patch.tarifaHora    = input.tarifaHora;
      if (input.monto         !== undefined) patch.monto         = input.monto;
      if (input.moneda        !== undefined) patch.moneda        = input.moneda;
      if (input.fechaServicio !== undefined) patch.fechaServicio = input.fechaServicio.toISOString().split('T')[0];
      if (input.scheduledDate !== undefined) patch.scheduledDate = input.scheduledDate.toISOString().split('T')[0];
      if (input.bonusAmount   !== undefined) patch.bonusAmount   = input.bonusAmount;
      if (input.bonusReason   !== undefined) patch.bonusReason   = input.bonusReason;
      if (input.notas         !== undefined) patch.notas         = input.notas;

      const { data, error } = await supabaseAdmin
        .from('freelancer_payments').update(patch).eq('id', input.id).select().single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.updated',
        entityType:  'FreelancerPayment',
        entityId:    input.id,
        before:      existing,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),
});
