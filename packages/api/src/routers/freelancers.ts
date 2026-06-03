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
});

const createPaymentSchema = z.object({
  freelancerId:  z.string(),
  descripcion:   z.string().min(3),
  horas:         z.number().positive().optional(),
  tarifaHora:    z.number().positive().optional(),
  monto:         z.number().positive(),
  moneda:        z.enum(['USD', 'BOB', 'PEN']),
  fechaServicio: z.coerce.date(),
  fechaPago:     z.coerce.date(),
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
          email:     input.email || null,
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
        .update({ ...input.data, email: input.data.email || null, updatedAt: new Date().toISOString() })
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
          fechaServicio: input.fechaServicio.toISOString().split('T')[0],
          fechaPago:     input.fechaPago.toISOString().split('T')[0],
          notas:         input.notas ?? null,
          createdAt:     new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message });

      await supabaseAdmin.from('audit_logs').insert({
        actorUserId: ctx.user.id,
        actorRole:   ctx.user.role,
        action:      'freelancer.payment.created',
        entityType:  'FreelancerPayment',
        entityId:    data.id,
        after:       data,
        createdAt:   new Date().toISOString(),
      });

      return data;
    }),
});
