// Supabase Edge Function — Audit Scheduled Scan
// Trigger: cron at 02:00 AM daily (configure in Supabase dashboard)
// Deploy: supabase functions deploy audit-scheduled-scan
//
// Required secrets (set via Supabase dashboard → Edge Functions → Secrets):
//   NEXT_PUBLIC_APP_URL       e.g. https://app.precisionmedicalcare.com
//   SUPABASE_SERVICE_ROLE_KEY  (already available in Edge Functions runtime)

Deno.serve(async (_req: Request): Promise<Response> => {
  const appUrl = Deno.env.get('NEXT_PUBLIC_APP_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!appUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ error: 'Missing NEXT_PUBLIC_APP_URL or SUPABASE_SERVICE_ROLE_KEY' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const response = await fetch(`${appUrl}/api/audit/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-service-key': serviceKey,
    },
    body: JSON.stringify({ triggered_by: 'scheduled' }),
  });

  const data = await response.json();

  return new Response(JSON.stringify(data), {
    status: response.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
