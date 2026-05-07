'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import TrainerAIAvatar from './TrainerAIAvatar';

export default function TrainerAIAvatarWrapper() {
  const [trainerId, setTrainerId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    async function loadTrainer() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: trainer } = await supabase
        .from('trainers')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (trainer) setTrainerId(trainer.id as string);
    }

    loadTrainer();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') loadTrainer();
      if (event === 'SIGNED_OUT') setTrainerId(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!trainerId) return null;
  return <TrainerAIAvatar trainerId={trainerId} />;
}
