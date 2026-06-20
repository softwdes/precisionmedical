/**
 * Login lockout helpers.
 *
 * Policy: 5 failed attempts → 15-minute lockout.
 * Each subsequent block after unlock doubles (30 min, 1 h, 2 h, max 24 h).
 * Counter resets on successful login.
 */

import type { PrismaClient } from '@precision-medical/database';
import { writeAuditLog } from '@precision-medical/database';

const MAX_ATTEMPTS = 5;

function lockoutDuration(failedCount: number): number {
  // Returns milliseconds. Progressive: 15 min → 30 → 60 → 120 → 1440 max.
  const tier = Math.floor(failedCount / MAX_ATTEMPTS);
  const minutes = Math.min(15 * Math.pow(2, tier - 1), 1440);
  return minutes * 60 * 1000;
}

export interface LockoutStatus {
  locked: boolean;
  lockedUntil?: Date;
  remainingMs?: number;
}

export async function checkLockout(
  db: PrismaClient,
  email: string,
): Promise<LockoutStatus> {
  const user = await db.user.findUnique({
    where: { email },
    select: { lockedUntil: true },
  });

  if (!user?.lockedUntil) return { locked: false };

  const now = new Date();
  if (user.lockedUntil > now) {
    return {
      locked: true,
      lockedUntil: user.lockedUntil,
      remainingMs: user.lockedUntil.getTime() - now.getTime(),
    };
  }

  // Lock expired — clear it silently
  await db.user.update({
    where: { email },
    data: { lockedUntil: null },
  });
  return { locked: false };
}

export async function recordFailedAttempt(
  db: PrismaClient,
  email: string,
  ipAddress?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, failedLoginAttempts: true },
  });

  if (!user) return; // Unknown email — don't leak existence

  const newCount = user.failedLoginAttempts + 1;
  const shouldLock = newCount >= MAX_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + lockoutDuration(newCount))
    : null;

  await db.user.update({
    where: { email },
    data: {
      failedLoginAttempts: newCount,
      lastFailedAttemptAt: new Date(),
      ...(shouldLock && { lockedUntil }),
    },
  });

  await writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: user.id,
    action:      shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
    metadata: {
      failedAttempts: newCount,
      ...(shouldLock && { lockedUntil: lockedUntil?.toISOString() }),
    },
  });
}

export async function recordSuccessfulLogin(
  db: PrismaClient,
  email: string,
  ipAddress?: string,
): Promise<void> {
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (!user) return;

  await db.user.update({
    where: { email },
    data: {
      failedLoginAttempts: 0,
      lockedUntil:         null,
      lastFailedAttemptAt: null,
      lastLoginAt:         new Date(),
      lastLoginIp:         ipAddress ?? null,
    },
  });

  await writeAuditLog(db, {
    actorType:   'HUMAN_USER',
    actorUserId: user.id,
    action:      'LOGIN_SUCCESS',
    entityType:  'user',
    entityId:    user.id,
    ipAddress,
  });
}
