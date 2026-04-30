'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getAuthContext } from '@/lib/supabase-server';

export async function getTrainerAvailability(startDate?: string, endDate?: string) {
  const { supabase, trainerId } = await getAuthContext();
  let query = supabase
    .from('trainer_availability')
    .select('*')
    .eq('trainer_id', trainerId)
    .order('starts_at', { ascending: true });

  if (startDate) query = query.gte('starts_at', startDate);
  if (endDate) query = query.lte('starts_at', endDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function createAvailabilityBlock(formData: FormData) {
  const { supabase, trainerId } = await getAuthContext();
  const starts_at = formData.get('starts_at') as string;
  const ends_at = formData.get('ends_at') as string;
  const block_type = (formData.get('block_type') as string) || 'available';
  const capacity = parseInt(formData.get('capacity') as string) || 1;
  const session_duration_min = parseInt(formData.get('session_duration_min') as string) || 60;

  const { error } = await supabase.from('trainer_availability').insert({
    trainer_id: trainerId,
    starts_at: new Date(starts_at).toISOString(),
    ends_at: new Date(ends_at).toISOString(),
    block_type: block_type as any,
    capacity,
    session_duration_min,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/horarios');
}

export async function updateAvailabilityBlock(id: string, formData: FormData) {
  const { supabase } = await getAuthContext();
  const starts_at = formData.get('starts_at') as string;
  const ends_at = formData.get('ends_at') as string;
  const block_type = formData.get('block_type') as string;
  const capacity = parseInt(formData.get('capacity') as string) || 1;
  const session_duration_min = parseInt(formData.get('session_duration_min') as string) || 60;

  const { error } = await supabase.from('trainer_availability').update({
    starts_at: new Date(starts_at).toISOString(),
    ends_at: new Date(ends_at).toISOString(),
    block_type: block_type as any,
    capacity,
    session_duration_min,
  }).eq('id', id);

  if (error) throw new Error(error.message);
  revalidatePath('/horarios');
}

export async function deleteAvailabilityBlock(id: string) {
  const { supabase } = await getAuthContext();
  const { error } = await supabase.from('trainer_availability').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/horarios');
}

export async function getBookings(startDate?: string, endDate?: string) {
  const { supabase, trainerId } = await getAuthContext();

  const { data: availability } = await supabase
    .from('trainer_availability')
    .select('id')
    .eq('trainer_id', trainerId);

  if (!availability || availability.length === 0) return [];

  const availabilityIds = availability.map(a => a.id);
  let query = supabase
    .from('bookings')
    .select(`
      *,
      student:students(full_name),
      trainer_availability:trainer_availability(starts_at, ends_at, session_duration_min)
    `)
    .in('trainer_availability_id', availabilityIds)
    .order('reserved_at', { ascending: false });

  if (startDate) query = query.gte('reserved_at', startDate);
  if (endDate) query = query.lte('reserved_at', endDate);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getBookingsByStudent(studentId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('student_id', studentId)
    .order('reserved_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelBooking(bookingId: string) {
  const { supabase } = await getAuthContext();
  const { error } = await supabase.from('bookings').update({
    status: 'cancelled',
    cancelled_at: new Date().toISOString(),
  }).eq('id', bookingId);

  if (error) throw new Error(error.message);
  revalidatePath('/horarios');
}

export async function confirmBooking(bookingId: string) {
  const { supabase } = await getAuthContext();
  const { error } = await supabase.from('bookings').update({ status: 'confirmed' }).eq('id', bookingId);
  if (error) throw new Error(error.message);
  revalidatePath('/horarios');
}

export async function markAttendance(bookingId: string) {
  const { supabase } = await getAuthContext();

  const { data: booking } = await supabase
    .from('bookings')
    .select('student_id, trainer_availability(session_duration_min)')
    .eq('id', bookingId)
    .single();

  const { error } = await supabase.from('bookings').update({
    status: 'attended',
    attended_at: new Date().toISOString(),
  }).eq('id', bookingId);

  if (error) throw new Error(error.message);

  if (booking?.student_id) {
    const { data: activePackage } = await supabase
      .from('session_packages')
      .select('id, used_sessions, total_sessions')
      .eq('student_id', booking.student_id)
      .gt('total_sessions', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (activePackage) {
      await supabase.from('session_packages').update({
        used_sessions: activePackage.used_sessions + 1,
      }).eq('id', activePackage.id);
    }
  }

  revalidatePath('/horarios');
}

export async function joinWaitlist(availabilityId: string, studentId: string) {
  const supabase = await createClient();
  const { error } = await supabase.from('booking_waitlist').insert({
    trainer_availability_id: availabilityId,
    student_id: studentId,
  });

  if (error) throw new Error(error.message);
  revalidatePath('/alumnos');
}

export async function getWaitlistForBlock(availabilityId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('booking_waitlist')
    .select('*, student:students(full_name)')
    .eq('trainer_availability_id', availabilityId)
    .order('joined_at', { ascending: true });

  if (error) throw new Error(error.message);
  return data || [];
}
