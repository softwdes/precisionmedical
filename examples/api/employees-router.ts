/**
 * tRPC Router Example: Employees
 * 
 * Canonical pattern for all tRPC routers in this app.
 * 
 * Key patterns:
 * - Zod schema for input validation
 * - Permission-based middleware (publicProcedure < protectedProcedure < adminProcedure)
 * - Audit logging on mutations
 * - Pagination on list queries
 */

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, adminProcedure } from '../trpc';
import { db } from '@precision-medical/database';

// =====================================================
// Input schemas
// =====================================================

const createEmployeeSchema = z.object({
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  
  countryId: z.string().cuid(),
  city: z.string().optional(),
  
  type: z.enum(['FULL_TIME', 'EXTERNAL', 'CONTRACTOR']),
  startDate: z.coerce.date(),
  
  departmentId: z.string().cuid(),
  position: z.string().min(1).max(100),
  supervisorId: z.string().cuid().optional(),
  
  baseSalary: z.number().positive().optional(),
  baseCurrency: z.enum(['USD', 'BOB', 'PEN']),
  hourlyRate: z.number().positive().optional(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CASH', 'ZELLE', 'WIRE', 'OTHER']).optional(),
  bankAccount: z.string().optional(),  // Will be encrypted before save
});

const listEmployeesSchema = z.object({
  page: z.number().int().positive().default(1),
  pageSize: z.number().int().positive().max(100).default(25),
  search: z.string().optional(),
  countryId: z.string().cuid().optional(),
  departmentId: z.string().cuid().optional(),
  type: z.enum(['FULL_TIME', 'EXTERNAL', 'CONTRACTOR']).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'ON_LEAVE']).optional(),
  sortBy: z.enum(['name', 'createdAt', 'startDate']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// =====================================================
// Router
// =====================================================

export const employeesRouter = router({
  // ----------------------------------------
  // QUERIES
  // ----------------------------------------
  
  /**
   * List employees with pagination and filters.
   * Permission: any authenticated user can list (RLS limits visibility).
   */
  list: protectedProcedure
    .input(listEmployeesSchema)
    .query(async ({ input, ctx }) => {
      const { page, pageSize, search, countryId, departmentId, type, status, sortBy, sortOrder } = input;
      
      const where = {
        deletedAt: null,
        ...(countryId && { countryId }),
        ...(departmentId && { departmentId }),
        ...(type && { type }),
        ...(status && { status }),
        ...(search && {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' as const } },
            { lastName: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { employeeCode: { contains: search, mode: 'insensitive' as const } },
          ],
        }),
      };
      
      const orderBy = sortBy === 'name'
        ? [{ firstName: sortOrder }, { lastName: sortOrder }]
        : { [sortBy]: sortOrder };
      
      const [items, total] = await Promise.all([
        db.employee.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy,
          include: {
            country: { select: { code: true, name: true } },
            department: { select: { name: true } },
            metricSnapshots: {
              orderBy: { date: 'desc' },
              take: 1,
              select: { globalScore: true, grade: true },
            },
          },
        }),
        db.employee.count({ where }),
      ]);
      
      return {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      };
    }),
  
  /**
   * Get a single employee by ID.
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string().cuid() }))
    .query(async ({ input, ctx }) => {
      const employee = await db.employee.findUnique({
        where: { id: input.id, deletedAt: null },
        include: {
          country: true,
          department: true,
          supervisor: { select: { id: true, firstName: true, lastName: true } },
          documents: { orderBy: { createdAt: 'desc' } },
          metricSnapshots: {
            orderBy: { date: 'desc' },
            take: 30,
          },
        },
      });
      
      if (!employee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' });
      }
      
      // Permission check: employee can only see themselves; admins see all
      if (ctx.user.role === 'EMPLOYEE' && employee.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN' });
      }
      
      return employee;
    }),
  
  // ----------------------------------------
  // MUTATIONS
  // ----------------------------------------
  
  /**
   * Create a new employee. Admin only.
   */
  create: adminProcedure
    .input(createEmployeeSchema)
    .mutation(async ({ input, ctx }) => {
      // Generate unique employee code
      const year = new Date().getFullYear();
      const count = await db.employee.count({
        where: {
          createdAt: {
            gte: new Date(`${year}-01-01`),
            lt: new Date(`${year + 1}-01-01`),
          },
        },
      });
      const employeeCode = `EMP-${year}-${String(count + 1).padStart(4, '0')}`;
      
      // Encrypt bank account if provided
      const { encrypt } = await import('@precision-medical/auth/crypto');
      const encryptedBankAccount = input.bankAccount ? encrypt(input.bankAccount) : null;
      
      const employee = await db.employee.create({
        data: {
          ...input,
          employeeCode,
          bankAccount: encryptedBankAccount,
        },
      });
      
      // Audit log
      await db.auditLog.create({
        data: {
          actorUserId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'employee.created',
          entityType: 'Employee',
          entityId: employee.id,
          after: { ...employee, bankAccount: undefined },  // Don't log encrypted data
          metadata: { ip: ctx.ipAddress },
        },
      });
      
      return employee;
    }),
  
  /**
   * Update an employee. Admin only.
   * Sensitive fields (salary, status) require additional validation.
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.string().cuid(),
        data: createEmployeeSchema.partial(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const before = await db.employee.findUnique({ where: { id: input.id } });
      if (!before) throw new TRPCError({ code: 'NOT_FOUND' });
      
      const employee = await db.employee.update({
        where: { id: input.id },
        data: input.data,
      });
      
      await db.auditLog.create({
        data: {
          actorUserId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'employee.updated',
          entityType: 'Employee',
          entityId: employee.id,
          before: { ...before, bankAccount: undefined },
          after: { ...employee, bankAccount: undefined },
        },
      });
      
      return employee;
    }),
  
  /**
   * Soft-delete an employee (sets deletedAt). Admin only.
   */
  delete: adminProcedure
    .input(z.object({ id: z.string().cuid() }))
    .mutation(async ({ input, ctx }) => {
      const employee = await db.employee.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), status: 'INACTIVE' },
      });
      
      await db.auditLog.create({
        data: {
          actorUserId: ctx.user.id,
          actorRole: ctx.user.role,
          action: 'employee.deleted',
          entityType: 'Employee',
          entityId: employee.id,
        },
      });
      
      return employee;
    }),
  
  /**
   * Get summary stats for the employees module.
   * Used in dashboard KPIs.
   */
  getSummary: protectedProcedure
    .query(async () => {
      const [total, byType, byCountry] = await Promise.all([
        db.employee.count({ where: { status: 'ACTIVE', deletedAt: null } }),
        db.employee.groupBy({
          by: ['type'],
          where: { status: 'ACTIVE', deletedAt: null },
          _count: true,
        }),
        db.employee.groupBy({
          by: ['countryId'],
          where: { status: 'ACTIVE', deletedAt: null },
          _count: true,
        }),
      ]);
      
      return { total, byType, byCountry };
    }),
});
