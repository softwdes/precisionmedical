'use client';

import { useState, useTransition, useEffect } from 'react';
import Link from 'next/link';
import { updateStudent } from '@/actions';
import { resendStudentAccess } from '@/actions/auth';
import PhoneField from '@/components/PhoneField';

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

export default function EditStudentForm({ student }: Props) {
  const [phone, setPhone] = useState(student.phone ?? '');
  const [accessError, setAccessError] = useState('');
  const [accessSent, setAccessSent] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [toastMsg, setToastMsg] = useState('');
  const [toastVisible, setToastVisible] = useState(false);

  useEffect(() => {
    if (!toastMsg) return;
    const show = setTimeout(() => setToastVisible(true), 10);
    const hide = setTimeout(() => setToastVisible(false), 3400);
    const clear = setTimeout(() => setToastMsg(''), 3750);
    return () => { clearTimeout(show); clearTimeout(hide); clearTimeout(clear); };
  }, [toastMsg]);

  function showToast(msg: string) {
    setToastVisible(false);
    setToastMsg('');
    setTimeout(() => setToastMsg(msg), 20);
  }

  function handleSendAccess() {
    setAccessError('');
    startTransition(async () => {
      const result = await resendStudentAccess(student.id);
      if (result.error) {
        setAccessError(result.error);
        return;
      }
      setAccessSent(true);
      showToast('Invitación enviada correctamente');
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
            <label className="label" htmlFor="email">Email</label>
            <input type="email" id="email" name="email" className="input" defaultValue={student.email ?? ''} placeholder="correo@ejemplo.com" />
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
              background: isPending || !student.email ? 'rgba(63,248,200,0.1)' : 'var(--accent)',
              color: isPending || !student.email ? 'rgba(63,248,200,0.4)' : '#000',
              fontWeight: 700, fontSize: '13px', cursor: isPending || !student.email ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'all 0.15s',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="15" height="15">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
              <polyline points="22,6 12,13 2,6"/>
            </svg>
            {isPending ? 'Enviando...' : accessSent ? 'Invitación enviada' : student.user_id ? 'Reenviar acceso por email' : 'Enviar acceso por email'}
          </button>
        </div>

        <div className="form-actions">
          <Link href={`/alumnos/${student.id}`} className="btn btn-outline">Cancelar</Link>
          <button type="submit" className="btn btn-primary">Guardar Cambios</button>
        </div>
      </form>

      {toastMsg && (
        <div style={{
          position: 'fixed',
          bottom: '28px', right: '28px',
          zIndex: 3000,
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '13px 18px',
          background: 'var(--bg-elevated)',
          border: '1px solid rgba(63,248,200,0.35)',
          borderRadius: '10px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
          fontSize: '14px', fontWeight: 500,
          color: 'var(--fg-base)',
          pointerEvents: 'none',
          transform: toastVisible ? 'translateY(0) scale(1)' : 'translateY(12px) scale(0.97)',
          opacity: toastVisible ? 1 : 0,
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1), opacity 0.3s ease',
        }}>
          <span style={{
            width: '22px', height: '22px',
            background: 'var(--accent)',
            borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--fg-on-accent)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          {toastMsg}
        </div>
      )}
    </>
  );
}
