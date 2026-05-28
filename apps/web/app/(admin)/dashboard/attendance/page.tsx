import { redirect } from 'next/navigation';

// Legacy route — the previous implementation read from attendance_sync
// (a different table not tied to the PM Time Clock). All attendance
// data with GPS/clinic context now lives in attendance_records and is
// surfaced under Empleados → Asistencia.
//
// This redirect preserves any bookmark/external link pointing to
// /dashboard/attendance.
export default function AttendanceLegacyRedirect(): never {
  redirect('/dashboard/employees?tab=asistencia');
}
