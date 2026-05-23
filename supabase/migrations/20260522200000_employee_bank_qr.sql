-- Add bank QR URL column to employees
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS "bankQrUrl" TEXT;

-- Create employee-qr storage bucket (public so images render in the app)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'employee-qr',
  'employee-qr',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
) ON CONFLICT (id) DO NOTHING;

-- Public read — anyone with the URL can view the QR image
CREATE POLICY "public_read_employee_qr" ON storage.objects
  FOR SELECT USING (bucket_id = 'employee-qr');
