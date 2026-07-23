import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://kiqlhwncfqfftaqqvadj.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtpcWxod25jZnFmZnRhcXF2YWRqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MDczMDY3OSwiZXhwIjoyMDk2MzA2Njc5fQ.uVe3b0Nh7N1WjWSMZqS_caN_sFGwTFqz4vNoxDQit2E'
);

for (const bucket of ['case-documents', 'intake-signatures']) {
  const { data, error } = await supabase.storage.createBucket(bucket, {
    public: false,
    fileSizeLimit: 52428800,
  });
  if (error?.message?.includes('already exists')) {
    console.log(`✅ ${bucket} ya existe`);
  } else if (error) {
    console.error(`❌ ${bucket}:`, error.message);
  } else {
    console.log(`✅ ${bucket} creado`);
  }
}
