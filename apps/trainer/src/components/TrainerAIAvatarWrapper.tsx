import { getAuthContext } from '@/lib/supabase-server';
import TrainerAIAvatar from './TrainerAIAvatar';

export default async function TrainerAIAvatarWrapper() {
  try {
    const { trainerId } = await getAuthContext();
    return <TrainerAIAvatar trainerId={trainerId} />;
  } catch {
    return null;
  }
}
