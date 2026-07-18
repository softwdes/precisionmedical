import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

const BUCKET = 'cash-box-qr';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: cashBoxId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${cashBoxId}/deposit-qr.${ext}`;

  const admin = createAdminClient();

  // Remove existing QR files for this box before uploading
  const { data: existing } = await admin.storage.from(BUCKET).list(cashBoxId);
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${cashBoxId}/${f.name}`));
  }

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  // Add cache-buster to force image refresh when QR is replaced
  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);
  const qrDepositUrl = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await admin
    .from('cash_boxes')
    .update({ qr_deposit_url: qrDepositUrl, updatedAt: new Date().toISOString() })
    .eq('id', cashBoxId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ qrDepositUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: cashBoxId } = await params;
  const admin = createAdminClient();

  const { data: existing } = await admin.storage.from(BUCKET).list(cashBoxId);
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${cashBoxId}/${f.name}`));
  }

  await admin
    .from('cash_boxes')
    .update({ qr_deposit_url: null, updatedAt: new Date().toISOString() })
    .eq('id', cashBoxId);

  return NextResponse.json({ ok: true });
}
