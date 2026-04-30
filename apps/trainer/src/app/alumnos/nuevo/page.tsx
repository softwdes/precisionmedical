import Link from 'next/link';
import { createStudent } from '@/actions';
import UserMenu from '@/components/UserMenu';
import AppSidebar from '@/components/AppSidebar';

export default function NewStudentPage() {
  return (
    <div className="app">
      <AppSidebar active="alumnos" />

      <main className="main">
        <header className="topbar">
          <div className="topbar-title">
            Panel del Entrenador <span className="sep">//</span>
            <Link href="/alumnos" className="crumb">Alumnos</Link> <span className="sep">//</span>
            <span className="crumb-active">Nuevo</span>
          </div>
          <div className="topbar-right">
            <div className="live-indicator">En Vivo</div>
            <UserMenu />
          </div>
        </header>

        <div className="main-content">
          <section className="section-head">
            <span className="eyebrow">Protocolo // 01</span>
            <h1>Nuevo Alumno</h1>
          </section>

          <div className="card" style={{ maxWidth: '800px' }}>
            <div className="card-body card-body--padded">
              <form action={createStudent} className="form-stack">
                <div className="form-section">
                  <h3 className="form-section-title">Información Personal</h3>
                  <div className="form-group">
                    <label className="label" htmlFor="full_name">Nombre Completo *</label>
                    <input type="text" id="full_name" name="full_name" className="input" required placeholder="Ej: Juan Pérez García" />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="label" htmlFor="birth_date">Fecha de Nacimiento</label>
                      <input type="date" id="birth_date" name="birth_date" className="input" />
                    </div>
                    <div className="form-group">
                      <label className="label" htmlFor="experience_level">Nivel de Experiencia</label>
                      <select id="experience_level" name="experience_level" className="select">
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
                    <label className="checkbox-label"><input type="checkbox" name="goals" value="hypertrophia" /><span>Hipertrofia</span></label>
                    <label className="checkbox-label"><input type="checkbox" name="goals" value="strength" /><span>Fuerza</span></label>
                    <label className="checkbox-label"><input type="checkbox" name="goals" value="fat_loss" /><span>Pérdida de Grasa</span></label>
                    <label className="checkbox-label"><input type="checkbox" name="goals" value="endurance" /><span>Resistencia</span></label>
                  </div>
                </div>

                <div className="form-section">
                  <h3 className="form-section-title">Equipamiento Disponible</h3>
                  <div className="radio-group">
                    <label className="radio-label"><input type="radio" name="available_equipment" value="full_gym" /><span>Gym Completo</span></label>
                    <label className="radio-label"><input type="radio" name="available_equipment" value="home_basic" /><span>Gym Básico (Casa)</span></label>
                    <label className="radio-label"><input type="radio" name="available_equipment" value="bodyweight" /><span>Solo Peso Corporal</span></label>
                  </div>
                </div>

                <div className="form-actions">
                  <Link href="/alumnos" className="btn btn-outline">Cancelar</Link>
                  <button type="submit" className="btn btn-primary">Crear Alumno</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
