'use server';

import { serverClient } from '@precision/db/client';
import { revalidatePath } from 'next/cache';

export async function getAllTrainers() {
  const supabase = serverClient();
  const { data, error } = await supabase
    .from('trainers')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getTrainerDetails(trainerId: string) {
  const supabase = serverClient();

  const { data: trainer, error: trainerError } = await supabase
    .from('trainers')
    .select('*')
    .eq('id', trainerId)
    .single();

  if (trainerError) throw new Error(trainerError.message);

  const { count: studentsCount } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .eq('trainer_id', trainerId)
    .is('archived_at', null);

  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('paid_on', { ascending: false })
    .limit(5);

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

export async function updateTrainerSubscription(trainerId: string, status: string, expiresAt: string) {
  const supabase = serverClient();
  const { error } = await supabase.from('trainers').update({
    subscription_status: status as any,
    subscription_expires_at: expiresAt,
  }).eq('id', trainerId);

  if (error) throw new Error(error.message);
  revalidatePath('/trainers');
}

export async function recordSubscriptionPayment(formData: FormData) {
  const supabase = serverClient();
  const trainer_id = formData.get('trainer_id') as string;
  const amount = parseFloat(formData.get('amount') as string);
  const period_months = parseInt(formData.get('period_months') as string) || 1;

  const today = new Date();
  const period_start = today.toISOString().split('T')[0];
  const endDate = new Date(today);
  endDate.setMonth(endDate.getMonth() + period_months);
  const period_end = endDate.toISOString().split('T')[0];

  const { error } = await supabase.from('subscription_payments').insert({
    trainer_id,
    amount,
    paid_on: period_start,
    period_start,
    period_end,
  });

  if (error) throw new Error(error.message);

  await supabase.from('trainers').update({
    subscription_status: 'active',
    subscription_expires_at: period_end,
  }).eq('id', trainer_id);

  revalidatePath('/suscripciones');
}

export async function getRecentPayments(limit = 10) {
  const supabase = serverClient();
  const { data, error } = await supabase
    .from('subscription_payments')
    .select('*, trainer:trainers(business_name)')
    .order('paid_on', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getActivityLog(limit = 100, offset = 0) {
  const supabase = serverClient();
  const { data, error } = await supabase
    .from('activity_log')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function getSupportTickets(status?: string) {
  const supabase = serverClient();
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

export async function updateSupportTicket(ticketId: string, status: string) {
  const supabase = serverClient();
  const { error } = await supabase.from('support_tickets').update({
    status: status as any,
    updated_at: new Date().toISOString(),
  }).eq('id', ticketId);

  if (error) throw new Error(error.message);
  revalidatePath('/soporte');
}

export async function getGlobalMetrics() {
  const supabase = serverClient();

  const { count: totalTrainers } = await supabase
    .from('trainers')
    .select('*', { count: 'exact', head: true });

  const { count: activeSubscriptions } = await supabase
    .from('trainers')
    .select('*', { count: 'exact', head: true })
    .eq('subscription_status', 'active');

  const { count: totalStudents } = await supabase
    .from('students')
    .select('*', { count: 'exact', head: true })
    .is('archived_at', null);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);

  const { data: payments } = await supabase
    .from('subscription_payments')
    .select('amount')
    .gte('paid_on', startOfMonth.toISOString().split('T')[0]);

  const monthlyRevenue = payments?.reduce((sum, p) => sum + p.amount, 0) || 0;

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

export async function updateTrainerModules(trainerId: string, modules: Record<string, boolean>) {
  const supabase = serverClient();
  const { error } = await supabase.from('trainers').update({
    enabled_modules: modules,
  }).eq('id', trainerId);

  if (error) throw new Error(error.message);
  revalidatePath(`/trainers/${trainerId}`);
}

export async function getPlatformSettings() {
  return {
    platform_name: 'Neural Trainer Gym',
    default_subscription_price: 299,
    currency: 'PEN',
    support_email: 'soporte@neuraltrainergym.app',
  };
}
