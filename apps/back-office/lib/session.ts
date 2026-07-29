import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createServerClient } from '@precision-medical/auth/server';

/**
 * Usuario de la sesión, UNA sola vez por request.
 *
 * `supabase.auth.getUser()` no decodifica el JWT localmente: hace una llamada
 * HTTP al servidor de Auth (~180 ms medidos). El layout, la página y cada
 * helper que la llamaba por su cuenta pagaban ese viaje de nuevo — un render de
 * /doctor hacía 5 llamadas para resolver el mismo usuario.
 *
 * `cache()` de React memoriza el resultado dentro del request (server components
 * y route handlers), así que la validación sigue siendo autoritativa pero se
 * paga una vez.
 */
export const getSessionUser = cache(async (): Promise<User | null> => {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user ?? null;
});
