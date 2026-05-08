'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createStudent } from '@/actions';
import PhoneField from '@/components/PhoneField';

export default function NewStudentForm() {
  const [phone, setPhone] = useState('');

  return (
    <form action={createStudent} className="form-stack">
      <div className="form-section">
        <h3 className="form-section-title">Información Personal</h3>
        <div className="form-group">
          <label className="label" htmlFor="full_name">Nombre Completo *</label>
          <input type="text" id="full_name" name="full_name" className="input" required placeholder="Ej: Juan Pérez García" />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="phone">Celular</label>
          <PhoneField id="phone" value={phone} onChange={setPhone} />
          <input type="hidden" name="phone" value={phone} />
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
  );
}
