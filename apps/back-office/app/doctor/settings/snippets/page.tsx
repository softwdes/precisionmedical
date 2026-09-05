import { redirect } from 'next/navigation';
import { SNIPPET_SECTIONS } from '@/lib/snippet-sections';

/** `/doctor/settings/snippets` sin sección → la primera (Motivo de consulta). */
export default function SnippetsIndexPage(): never {
  redirect(`/doctor/settings/snippets/${SNIPPET_SECTIONS[0]}`);
}
