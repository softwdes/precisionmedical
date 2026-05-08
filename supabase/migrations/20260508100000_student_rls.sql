-- Student read policies for tables that only have trainer-side policies

-- rutinas_alumno
DROP POLICY IF EXISTS "student_read_rutinas_alumno" ON rutinas_alumno;
CREATE POLICY "student_read_rutinas_alumno" ON rutinas_alumno FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- rutina_dias
DROP POLICY IF EXISTS "student_read_rutina_dias" ON rutina_dias;
CREATE POLICY "student_read_rutina_dias" ON rutina_dias FOR SELECT
  USING (rutina_id IN (
    SELECT id FROM rutinas_alumno
    WHERE alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  ));

-- rutina_ejercicios
DROP POLICY IF EXISTS "student_read_rutina_ejercicios" ON rutina_ejercicios;
CREATE POLICY "student_read_rutina_ejercicios" ON rutina_ejercicios FOR SELECT
  USING (dia_id IN (
    SELECT id FROM rutina_dias WHERE rutina_id IN (
      SELECT id FROM rutinas_alumno
      WHERE alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid())
    )
  ));

-- planes_nutricionales
DROP POLICY IF EXISTS "student_read_planes_nutricionales" ON planes_nutricionales;
CREATE POLICY "student_read_planes_nutricionales" ON planes_nutricionales FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- alumnos_datos_fisicos
DROP POLICY IF EXISTS "student_read_datos_fisicos" ON alumnos_datos_fisicos;
CREATE POLICY "student_read_datos_fisicos" ON alumnos_datos_fisicos FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- medidas_corporales
DROP POLICY IF EXISTS "student_read_medidas" ON medidas_corporales;
CREATE POLICY "student_read_medidas" ON medidas_corporales FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- historial_peso
DROP POLICY IF EXISTS "student_read_historial_peso" ON historial_peso;
CREATE POLICY "student_read_historial_peso" ON historial_peso FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));

-- clases (via clase_alumnos enrollment)
DROP POLICY IF EXISTS "student_read_clases" ON clases;
CREATE POLICY "student_read_clases" ON clases FOR SELECT
  USING (id IN (
    SELECT clase_id FROM clase_alumnos
    WHERE alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid())
  ));

-- clase_alumnos (own enrollment)
DROP POLICY IF EXISTS "student_read_clase_alumnos" ON clase_alumnos;
CREATE POLICY "student_read_clase_alumnos" ON clase_alumnos FOR SELECT
  USING (alumno_id IN (SELECT id FROM students WHERE user_id = auth.uid()));
