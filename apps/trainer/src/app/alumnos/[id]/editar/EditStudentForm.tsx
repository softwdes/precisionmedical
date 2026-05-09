'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateStudent } from '@/actions';
import { generateStudentAccess } from '@/actions/access';
import PhoneField from '@/components/PhoneField';
import SendAccessModal from './SendAccessModal';

interface Student {
  id: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  experience_level?: string | null;
  goals?: string[] | null;
  available_equipment?: string | null;
  user_id?: string | null;
}

interface Props {
  student: Student;
}

interface AccessData {
  studentName: string;
  phone: string | null;
  email: string;
  link: string;
  hasAccount: boolean;
}

export default function EditStudentForm({ student }: Props) {
  const [phone, setPhone] = useState(student.phone ?? '');
  const [accessData, setAccessData] = useState<AccessData | null>(null);
  const [accessError, setAccessError] = useState('');
  const [isPending, startTransition] = useTransition();

  function handleSendAccess() {
    setAccessError('');
    startTransition(async () => {
      const result = await generateStudentAccess(student.id);
      if (result.error) {
        setAccessError(result.error);
        return;
      }
      if (result.link && result.student) {
        setAccessData({
          studentName: result.student.name,
          phone: result.student.phone,
          email: result.student.email,
          link: result.link,
          hasAccount: result.student.hasAccount,
        });
      }
    });
  }

  return (
    <>
      <form action={updateStudent.bind(null, student.id)} className="form-stack">
        <div className="form-section">
          <h3 className="form-section-title">Información Personal</h3>

          <div className="form-group">
            <label className="label" htmlFor="full_name">Nombre Completo *</label>
            <input type="text" id="full_name" name="full_name" className="input" required defaultValue={student.full_name} />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="phone">Celular</label>
            <PhoneField id="phone" value={phone} onChange={setPhone} />
            <input type="hidden" name="phone" value={phone} />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="label" htmlFor="birth_date">Fecha de Nacimiento</label>
              <input type="date" id="birth_date" name="birth_date" className="input" defaultValue={student.birth_date ? student.birth_date.split('T')[0] : ''} />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="experience_level">Nivel de Experiencia</label>
              <select id="experience_level" name="experience_level" className="select" defaultValue={student.experience_level || ''}>
                <option value="">Seleccionar...</option>
                <option value="beginner">Principiante</option>
                <option value="intermediate">Intermedio</option>
                <option value="advanced">Avanzado</option>
              </select>
            </div>
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Objetivos de Entrenamiento</h3>
          <div className="checkbox-group">
            {['hypertrophia', 'strength', 'fat_loss', 'endurance'].map((goal) => (
              <label key={goal} className="checkbox-label">
                <input
                  type="checkbox"
                  name="goals"
                  value={goal}
                  defaultChecked={student.goals?.includes(goal)}
                />
                <span>
                  {goal === 'hypertrophia' ? 'Hipertrofia' :
                   goal === 'strength' ? 'Fuerza' :
                   goal === 'fat_loss' ? 'Pérdida de Grasa' : 'Resistencia'}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h3 className="form-section-title">Equipamiento Disponible</h3>
          <div className="radio-group">
            {[
              { value: 'full_gym', label: 'Gym Completo' },
              { value: 'home_basic', label: 'Gym Básico (Casa)' },
              { value: 'bodyweight', label: 'Solo Peso Corporal' },
            ].map((eq) => (
              <label key={eq.value} className="radio-label">
                <input
                  type="radio"
                  name="available_equipment"
                  value={eq.value}
                  defaultChecked={student.available_equipment === eq.value}
                />
                <span>{eq.label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Acceso al portal */}
        <div className="form-section">
          <h3 className="form-section-title">Acceso al Portal</h3>
          <p style={{ fontSize: '13px', color: 'var(--fg-muted)', marginBottom: '14px', marginTop: 0 }}>
            {student.user_id
              ? 'Este alumno ya tiene una cuenta activa. Podés enviarle un link de recuperación de contraseña.'
              : 'Enviale al alumno su link de acceso para que active su cuenta en el portal de entrenamiento.'}
          </p>

          {accessError && (
            <div style={{
              padding: '10px 14px', marginBottom: '12px',
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: '6px', fontSize: '13px', color: '#ef4444',
            }}>
              {accessError}
            </div>
          )}

          {!student.email && (
            <div style={{
              padding: '10px 14px', marginBottom: '12px',
              background: 'rgba(239,159,39,0.08)', border: '1px solid rgba(239,159,39,0.25)',
              borderRadius: '6px', fontSize: '13px', color: '#EF9F27',
              display: 'flex', alignItems: 'flex-start', gap: '8px',
            }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 15, height: 15, flexShrink: 0, marginTop: 1 }}>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              Para enviar acceso necesitás registrar el email del alumno en su perfil.
            </div>
          )}

          <button
            type="button"
            disabled={isPending || !student.email}
            onClick={handleSendAccess}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '8px',
              padding: '9px 18px', borderRadius: '7px', border: 'none',
              background: isPending || !student.email ? 'rgba(37,211,102,0.15)' : '#25D366',
              color: isPending || !student.email ? 'rgba(37,211,102,0.5)' : '#fff',
              fontWeight: 700, fontSize: '13px', cursor: isPending || !student.email ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            {isPending ? 'Generando link...' : student.user_id ? 'Enviar link de recuperación' : 'Enviar acceso por WhatsApp'}
          </button>
        </div>

        <div className="form-actions">
          <Link href={`/alumnos/${student.id}`} className="btn btn-outline">Cancelar</Link>
          <button type="submit" className="btn btn-primary">Guardar Cambios</button>
        </div>
      </form>

      {accessData && (
        <SendAccessModal
          studentName={accessData.studentName}
          phone={accessData.phone}
          email={accessData.email}
          link={accessData.link}
          hasAccount={accessData.hasAccount}
          onClose={() => setAccessData(null)}
        />
      )}
    </>
  );
}
