import { Skeleton } from '@/components/ui-phoenix';

/**
 * Estado de carga de TODO el portal legal (Regla #1).
 *
 * No existía, y era la mitad del "se pone lento el navegador" que reportaron:
 * al entrar a Citas no pasaba nada visible hasta que llegaba la respuesta
 * completa. Sin este archivo, una espera de 300 ms se siente igual que una
 * pantalla colgada.
 */
export default function AttorneyLoading(): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    </div>
  );
}
