'use server';

import { serverClient } from '@precision/db/client';
import { revalidatePath } from 'next/cache';

const supabase = serverClient();

// MASTER ONLY - Get all trainers
export async function getAllTrainers() {
  const { data, error } = await supabase
    .from('trainers')
    .select(`
      *,
      subscription_payments(amount, paid_on, period_start, period_end)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// MASTER - Get single trainer with details
export async function getTrainerDetails(trainerId: string) {
  const { data: trainer, error: trainerError } = await supabase
    .from('trainers')
    .select('*')
    .eq('id', trainerId)
    .single();

  if (trainerError) throw new Error(trainerError.message);

  // Get students count
  const { count: studentsCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .is('archived_at', null);

  // Get active subscriptions
  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('paid_on', { ascending: false })
    .limit(5);

  // Get storage usage (approximate)
  const { data: photos } = await supabase.storage
    .from('progress-photos')
    .list(trainerId, { limit: 100 });

  return {
    ...trainer,
    students_count: studentsCount || 0,
    recent_payments: payments || [],
    storage_files: photos?.length || 0,
  };
}

// MASTER - Update trainer subscription
export async function updateTrainerSubscription(trainerId: string, status: string, expiresAt: string) {
  const { error } = await supabase.from('trainers').update({
    subscription_status: status as any,
    subscription_expires_at: expiresAt,
  }).eq('id', trainerId);

  if (error) throw new Error(error.message);
  revalidatePath('/master/trainers');
}

// MASTER - Record subscription payment
export async function recordSubscriptionPayment(formData: FormData) {
  const trainer_id = formData.get('trainer_id') as string;
  const amount = parseFloat(formData.get('amount') as string);
  const period_start = formData.get('period_start') as string;
  const period_end = formData.get('period_end') as string;

  const { error } = await supabase.from('subscription_payments').insert({
    trainer_id,
    amount,
    paid_on: new Date().toISOString().split('T')[0],
    period_start,
    period_end,
  });

  if (error) throw new Error(error.message);

  // Update trainer status to active
  await supabase.from('trainers').update({
    subscription_status: 'active',
    subscription_expires_at: period_end,
  }).eq('id', trainer_id);

  revalidatePath('/master/suscripciones');
}

// MASTER - Get activity log
export async function getActivityLog(limit = 100, offset = 0) {
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data || [];
}

// MASTER - Get support tickets
export async function getSupportTickets(status?: string) {
  let query = supabase
    .from('support_tickets')
    .select(`
      *,
      trainer:trainers(business_name, slug)
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// MASTER - Update support ticket
export async function updateSupportTicket(ticketId: string, status: string) {
  const { error } = await supabase.from('support_tickets').update({
    status: status as any,
    updated_at: new Date().toISOString(),
  }).eq('id', ticketId);

  if (error) throw new Error(error.message);
  revalidatePath('/master/soporte');
}

// MASTER - Get global metrics
export async function getGlobalMetrics() {
  // Total trainers
  const { count: totalTrainers } = await supabase
    .from('trainers')
    .select('*', { count: 'exact', head: true });

  // Active subscriptions
  const { count: activeSubscriptions } = await supabase
    .from('trainers')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'active');

  // Total students
  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .is('archived_at', null);

  // Total revenue this month (approximation)
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  
  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('amount')
    .gte('paid_on', startOfMonth.toISOString().split('T')[0]);

  const monthlyRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

  // Expired subscriptions count
  const now = new Date().toISOString();
  const { count: expiringSoon } = await supabase
    .from('trainers')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'active')
    .lte('subscription_expires_at', now);

  return {
    total_trainers: totalTrainers || 0,
    active_subscriptions: activeSubscriptions || 0,
    total_students: totalStudents || 0,
    monthly_revenue: monthlyRevenue,
    expiring_soon: expiringSoon || 0,
  };
}

// MASTER - Update trainer modules
export async function updateTrainerModules(trainerId: string, modules: Record<string, boolean>) {
  const { error } = await supabase.from('trainers').update({
    enabled_modules: modules,
  }).eq('id', trainerId);

  if (error) throw new Error(error.message);
  revalidatePath(`/master/trainers/${trainerId}`);
}

// MASTER - Get platform settings
export async function getPlatformSettings() {
  // In a real app, this would come from a platform_settings table
  return {
    platform_name: 'Precision Trainer',
    default_subscription_price: 299,
    currency: 'PEN',
    support_email: 'soporte@precisiontrainer.com',
  };
}