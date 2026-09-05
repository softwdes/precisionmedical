import { redirect } from 'next/navigation';
import { getDoctorMenus } from '@/lib/get-session-provider';
import { firstVisibleSettingsHref } from '@/lib/doctor-menu-modules';

/**
 * `/doctor/settings` a secas no es una pantalla: manda al primer ítem que la
 * persona puede ver (Plantillas para casi todos). El layout ya rebotó a
 * `/doctor` a quien no ve ninguno; esto es solo por si alguien llega igual.
 */
export default async function DoctorSettingsPage(): Promise<never> {
  const mods = await getDoctorMenus();
  redirect(firstVisibleSettingsHref(mods) ?? '/doctor');
}
