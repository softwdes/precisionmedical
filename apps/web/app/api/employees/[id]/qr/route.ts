import { type NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@precision-medical/auth/server';
import { createAdminClient } from '@precision-medical/auth/admin';

const BUCKET = 'employee-qr';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: employeeId } = await params;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'FormData inválido' }, { status: 400 });
  }

  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No se encontró el archivo' }, { status: 400 });

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'png';
  const path = `${employeeId}/bank-qr.${ext}`;

  const admin = createAdminClient();

  // Remove any existing QR files for this employee before uploading
  const { data: existing } = await admin.storage.from(BUCKET).list(employeeId);
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${employeeId}/${f.name}`));
  }

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = admin.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await admin
    .from('employees')
    .update({ bankQrUrl: publicUrl, updatedAt: new Date().toISOString() })
    .eq('id', employeeId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ bankQrUrl: publicUrl });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: employeeId } = await params;
  const admin = createAdminClient();

  const { data: existing } = await admin.storage.from(BUCKET).list(employeeId);
  if (existing?.length) {
    await admin.storage.from(BUCKET).remove(existing.map(f => `${employeeId}/${f.name}`));
  }

  const { error } = await admin
    .from('employees')
    .update({ bankQrUrl: null, updatedAt: new Date().toISOString() })
    .eq('id', employeeId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
