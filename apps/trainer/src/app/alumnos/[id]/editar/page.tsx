import Link from 'next/link';
import { getStudent, updateStudent } from '@/actions';
import { notFound } from 'next/navigation';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditStudentPage({ params }: Props) {
  const { id } = await params;
  const student = await getStudent(id);
  
  if (!student) {
    notFound();
  }

  return (
    <div className="app">
      <AppSidebar active="alumnos" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span> 
            <Link href="/alumnos" className="crumb">Alumnos</Link> <span className="sep">//</span> 
            <Link href={`/alumnos/${id}`} className="crumb">{student.full_name}</Link> <span className="sep">//</span> 
            <span className="crumb-active">Editar</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 02</span>
            <h1>Editar Alumno</h1>
          </section>

          <div className="card" style={{ maxWidth: '800px' }}>
            <div className="card-body card-body--padded">
              <form action={updateStudent.bind(null, id)} className="form-stack">
                <div className="form-section">
                  <h3 className="form-section-title">Información Personal</h3>
                  
                  <div className="form-group">
                    <label className="label" htmlFor="full_name">Nombre Completo *</label>
                    <input type="text" id="full_name" name="full_name" className="input" required defaultValue={student.full_name} />
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

                <div className="form-actions">
                  <Link href={`/alumnos/${id}`} className="btn btn-outline">Cancelar</Link>
                  <button type="submit" className="btn btn-primary">Guardar Cambios</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}