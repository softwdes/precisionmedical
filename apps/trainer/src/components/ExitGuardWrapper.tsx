import ExitGuard from './ExitGuard';
import { signOut } from '@/actions/profile';

export default function ExitGuardWrapper() {
  return <ExitGuard onExit={signOut} />;
}
