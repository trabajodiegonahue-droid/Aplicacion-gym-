// Datos de ejemplo SOLO para la demo (nunca se usan en producción).
// Dos cuentas ya vinculadas con una semana de historia para poder probar todo.
export const DEMO_ACCOUNTS = [
  { name: 'Diego', email: 'diego@demo.app', password: 'demo1234' },
  { name: 'Maite', email: 'maite@demo.app', password: 'demo1234' },
]

export function seedSql(tzRaw: string) {
  const tz = tzRaw.replace(/[^A-Za-z0-9_/+-]/g, '') || 'UTC'
  return `
do $seed$
declare
  a uuid := 'a0000000-0000-4000-8000-00000000000a';
  b uuid := 'b0000000-0000-4000-8000-00000000000b';
  c uuid := 'c0000000-0000-4000-8000-00000000000c';
  tz text := coalesce(private.normalize_tz('${tz}'), 'UTC');
  t date;
  d date;
  k int;
  ex record;
  w uuid;
  r uuid;
  e1 uuid; e2 uuid; e3 uuid; e4 uuid; e5 uuid;
begin
  insert into auth.users(id, email, raw_user_meta_data) values
    (a, 'diego@demo.app', jsonb_build_object('display_name','Diego','timezone',tz)),
    (b, 'maite@demo.app', jsonb_build_object('display_name','Maite','timezone',tz));
  insert into auth.demo_passwords values ('diego@demo.app','demo1234',a), ('maite@demo.app','demo1234',b);
  t := (now() at time zone tz)::date;

  update public.profiles set bio = 'Piernas los lunes, siempre 💪', birthday = (t + 9) - interval '19 years',
    character = '{"kind":"person","skin":"#e3ab84","hair":"short","hairColor":"#141010","outfit":"tee","top":"#f5f5f4","pants":"#2f3b55","mole":true}' where id = a;
  update public.profiles set bio = 'Corriendo hacia vos 🏃‍♀️',
    character = '{"kind":"person","skin":"#f0c4a4","hair":"long","hairColor":"#2b1b13","outfit":"blazer","top":"#f5f5f4","pants":"#1f2937","lashes":true}' where id = b;

  insert into public.couples(id, name, together_since, anniversary_date, streak_start_date, created_at)
    values (c, 'Diego y Maite', t - 520, (t + 23) - interval '2 years', t - 6, now() - interval '6 days');
  insert into public.couple_members(couple_id, user_id, joined_at) values (c, a, now() - interval '6 days'), (c, b, now() - interval '6 days');
  insert into public.streak_rules(couple_id, version, effective_from, rules, proposed_by, approved_by)
    values (c, 1, t - 6, private.default_rules(), a, b);
  insert into public.streaks(couple_id) values (c);

  alter table public.workouts disable trigger tg_before; alter table public.workouts disable trigger tg_after;
  alter table public.activity_logs disable trigger tg_before; alter table public.activity_logs disable trigger tg_after;
  alter table public.water_logs disable trigger tg_before; alter table public.water_logs disable trigger tg_after;
  alter table public.habit_logs disable trigger tg_before; alter table public.habit_logs disable trigger tg_after;
  alter table public.rest_days disable trigger tg_before; alter table public.rest_days disable trigger tg_after;

  -- Ejercicios y rutina de Ana
  insert into public.exercises(id, user_id, name, muscle_group) values
    (gen_random_uuid(), a, 'Sentadilla con barra', 'piernas'), (gen_random_uuid(), a, 'Hip thrust', 'gluteos'),
    (gen_random_uuid(), a, 'Prensa', 'piernas'), (gen_random_uuid(), a, 'Remo con mancuerna', 'espalda'),
    (gen_random_uuid(), a, 'Plancha', 'abdomen');
  select id into e1 from public.exercises where user_id = a and name = 'Sentadilla con barra';
  select id into e2 from public.exercises where user_id = a and name = 'Hip thrust';
  select id into e3 from public.exercises where user_id = a and name = 'Prensa';
  select id into e4 from public.exercises where user_id = a and name = 'Remo con mancuerna';
  select id into e5 from public.exercises where user_id = a and name = 'Plancha';
  insert into public.routines(id, user_id, name, description, is_favorite, weekdays) values (gen_random_uuid(), a, 'Piernas y glúteos', 'Rutina base', true, '{1,4}') returning id into r;
  insert into public.routine_exercises(routine_id, exercise_id, position, target_sets, target_reps, target_weight_kg, rest_seconds) values
    (r, e1, 0, 4, 8, 45, 120), (r, e2, 1, 4, 10, 60, 90), (r, e3, 2, 3, 12, 90, 90);
  insert into public.routines(user_id, name, description, weekdays) values (a, 'Espalda y core', 'Tirones + abdomen', '{2,5}');
  insert into public.exercises(user_id, name, muscle_group) values (b, 'Press banca', 'pecho'), (b, 'Dominadas', 'espalda');

  -- Historia: días -6..-1 (Beto descansa el -3, Ana no entrenó el -6) y hoy solo Ana
  for k in reverse 6..0 loop
    d := t - k;
    if k <> 6 then
      insert into public.workouts(id, user_id, title, routine_id, performed_at, duration_min, local_day, created_at)
        values (gen_random_uuid(), a, case when k % 2 = 0 then 'Piernas y glúteos' else 'Espalda y core' end, case when k % 2 = 0 then r end,
                least((d + time '18:30') at time zone tz, now() - interval '5 minutes'), 50 + k * 2, d, least((d + time '19:30') at time zone tz, now() - interval '5 minutes')) returning id into w;
      insert into public.workout_sets(workout_id, exercise_id, set_number, reps, weight_kg, rest_sec)
      select w, e1, s, 8, 40 + (6 - k) * 2.5, 120 from generate_series(1, 3) s;
      insert into public.workout_sets(workout_id, exercise_id, set_number, reps, weight_kg, rest_sec)
      select w, e2, s, 10, 55 + (6 - k) * 2.5, 90 from generate_series(1, 3) s;
    end if;
    if k > 0 and k <> 3 then
      insert into public.activity_logs(user_id, kind, minutes, steps, distance_km, performed_at, local_day, created_at)
        values (b, case when k % 2 = 0 then 'correr' else 'caminata' end, 30 + k * 3, 4000 + k * 650, 4 + k * 0.4, least((d + time '07:15') at time zone tz, now() - interval '5 minutes'), d, least((d + time '08:00') at time zone tz, now() - interval '5 minutes'));
    end if;
    if k = 3 then insert into public.rest_days(user_id, day, created_at) values (b, d, least((d + time '09:00') at time zone tz, now() - interval '5 minutes')); end if;
    insert into public.water_logs(user_id, amount_ml, label, performed_at, local_day, created_at) values
      (a, 500, 'Botella', least((d + time '10:00') at time zone tz, now() - interval '5 minutes'), d, least((d + time '10:00') at time zone tz, now() - interval '5 minutes')),
      (a, 250 * (1 + k % 3), 'Vaso', least((d + time '15:00') at time zone tz, now() - interval '5 minutes'), d, least((d + time '15:00') at time zone tz, now() - interval '5 minutes')),
      (b, 750, 'Botella', least((d + time '11:00') at time zone tz, now() - interval '5 minutes'), d, least((d + time '11:00') at time zone tz, now() - interval '5 minutes'));
  end loop;

  -- Hábitos
  insert into public.habits(user_id, name, emoji, start_date) values (a, 'Estirar 10 minutos', '🧘', t - 10), (a, 'Dormir 8 horas', '😴', t - 10), (a, 'Comer fruta', '🍎', t - 10), (b, 'Meditar', '🌿', t - 10);
  insert into public.habit_logs(habit_id, user_id, local_day, performed_at, created_at)
  select h.id, h.user_id, t - g, now() - make_interval(days => g), now() - make_interval(days => g)
  from public.habits h cross join generate_series(1, 5) g where (g + length(h.name)) % 3 <> 0;

  insert into public.body_weights(user_id, day, weight_kg) values (a, t - 28, 76.2), (a, t - 21, 75.4), (a, t - 14, 74.8), (a, t - 7, 74.1), (a, t, 73.6),
    (b, t - 21, 58.4), (b, t - 14, 58.0), (b, t - 7, 57.5), (b, t, 57.2);
  update public.profiles set height_cm = 176, goal_weight_kg = 72, start_weight_kg = 76.2, fitness_goal = 'ganar_musculo' where id = a;
  update public.profiles set height_cm = 162, goal_weight_kg = 55, start_weight_kg = 58.4, fitness_goal = 'salud' where id = b;
  update public.body_weights set height_cm = 176 where user_id = a;
  update public.body_weights set height_cm = 162 where user_id = b;
  delete from public.body_weights where user_id = b and day = t;  -- a Maite le toca el pesaje semanal
  insert into public.measurements(user_id, day, waist_cm, hip_cm, arm_cm) values (a, t - 21, 86, 98, 34), (a, t - 7, 84.5, 97.5, 34.5), (a, t, 83, 97, 35);
  insert into public.checkins(user_id, day, energy, mood, sleep_hours, pain, created_at) values
    (a, t - 3, 4, 4, 7, 0, now()), (a, t - 2, 3, 4, 6.5, 1, now()), (a, t - 1, 4, 5, 7.5, 0, now()),
    (b, t - 3, 2, 3, 5, 0, now()), (b, t - 2, 2, 2, 5.5, 0, now()), (b, t - 1, 1, 3, 4.5, 0, now());
  insert into public.injuries(user_id, area, side, severity, note, started_on) values (a, 'hombro', 'der', 1, 'Molestia en press banca', t - 5);
  insert into public.injuries(user_id, area, side, severity, note, started_on, resolved_on) values (b, 'tobillo', 'izq', 2, 'Torcedura corriendo', t - 40, t - 25);
  -- Ciclo de Maite: hoy es el día 2 de su período (comparte fase y síntomas con Diego)
  insert into public.cycle_settings(user_id, enabled, share_phase, share_symptoms) values (b, true, true, true);
  alter table public.cycle_periods disable trigger tg_before; alter table public.cycle_periods disable trigger tg_after;
  insert into public.cycle_periods(user_id, start_date, end_date, created_at) values (b, t - 85, t - 81, now() - interval '85 days'), (b, t - 57, t - 53, now() - interval '57 days'), (b, t - 29, t - 25, now() - interval '29 days'), (b, t - 1, null, now() - interval '1 day');
  alter table public.cycle_periods enable trigger tg_before; alter table public.cycle_periods enable trigger tg_after;
  insert into public.cycle_logs(user_id, day, flow, pain, symptoms) values
    (b, t - 29, 3, 2, '{cansancio,espalda}'), (b, t - 28, 4, 3, '{cansancio,tristeza}'), (b, t - 27, 2, 1, '{}'),
    (b, t - 15, 0, 0, '{energia_alta,animo_alto}'), (b, t - 6, 0, 0, '{hinchazon,antojos}'), (b, t - 4, 0, 0, '{irritable,antojos,pechos}'),
    (b, t - 1, 3, 2, '{cansancio}'), (b, t, 4, 2, '{cansancio,espalda,sensible}');
  -- Historial de cómo se sintió y de sus entrenos (para ver energía, ánimo y fuerza por fase)
  alter table public.checkins disable trigger tg_before; alter table public.checkins disable trigger tg_after;
  insert into public.checkins(user_id, day, energy, mood, sleep_hours, created_at)
  select b, t - g,
    case when ((g - 1) % 28) >= 23 then 2 when ((g - 1) % 28) between 18 and 22 then 3 when ((g - 1) % 28) between 8 and 15 then 5 else 4 end,
    case when ((g - 1) % 28) >= 21 then 2 when ((g - 1) % 28) between 8 and 15 then 5 else 4 end,
    7, now() - make_interval(days => g)
  from generate_series(4, 84, 2) g
  on conflict (user_id, day) do nothing;
  alter table public.checkins enable trigger tg_before; alter table public.checkins enable trigger tg_after;
  insert into public.exercises(user_id, name, muscle_group) values (b, 'Sentadilla goblet', 'piernas') on conflict do nothing;
  alter table public.workouts disable trigger tg_before; alter table public.workouts disable trigger tg_after;
  for k in 4..80 by 4 loop
    d := t - k;
    insert into public.workouts(user_id, title, performed_at, duration_min, local_day, created_at)
      values (b, 'Piernas', (d + time '18:00') at time zone tz, 45, d, (d + time '19:00') at time zone tz) returning id into w;
    insert into public.workout_sets(workout_id, exercise_id, set_number, reps, weight_kg)
      select w, (select id from public.exercises where user_id = b and name = 'Sentadilla goblet'), sn, 10,
        case when ((k - 1) % 28) between 8 and 15 then 24 when ((k - 1) % 28) >= 21 then 18 when ((k - 1) % 28) <= 4 then 16 else 20 end
      from generate_series(1, 3) sn;
  end loop;
  alter table public.workouts enable trigger tg_before; alter table public.workouts enable trigger tg_after;

  alter table public.workouts enable trigger tg_before; alter table public.workouts enable trigger tg_after;
  alter table public.activity_logs enable trigger tg_before; alter table public.activity_logs enable trigger tg_after;
  alter table public.water_logs enable trigger tg_before; alter table public.water_logs enable trigger tg_after;
  alter table public.habit_logs enable trigger tg_before; alter table public.habit_logs enable trigger tg_after;
  alter table public.rest_days enable trigger tg_before; alter table public.rest_days enable trigger tg_after;

  perform private.finalize_couple(c, now());
  perform private.refresh_couple_day(c, t, false);

  -- Espacio de pareja
  insert into public.messages(couple_id, sender_id, kind, body, created_at) values
    (c, b, 'text', '¡Buenísimo el entreno de ayer, amor! 🔥', now() - interval '20 hours'),
    (c, a, 'heart', null, now() - interval '19 hours'),
    (c, a, 'motivation', '¡No apaguemos la racha! 🔥', now() - interval '2 hours');
  insert into public.notes(couple_id, created_by, body, pinned) values (c, b, 'Faltan pocos días para vernos ✈️ ¡A entrenar para esa caminata juntos!', true), (c, a, 'Orgulloso de vos por correr toda la semana 💪', false);
  insert into public.calendar_events(couple_id, created_by, title, kind, event_date, notes) values (c, b, 'Visita a Diego', 'visita', t + 12, 'Llego a las 10:00');
  insert into public.calendar_events(couple_id, created_by, title, kind, event_date, end_date, for_user, lighten, created_at) values
    (c, b, 'Exámenes finales', 'examen', t + 2, t + 4, b, true, now() - interval '2 days'),
    (c, a, 'Turno largo en el trabajo', 'trabajo', t + 1, null, a, true, now() - interval '1 day');
  insert into public.nutrition_logs(user_id, day, kind, amount, label) values (a, t, 'protein', 31, 'Pechuga (100 g)'), (a, t, 'protein', 12, '2 huevos'), (a, t, 'produce', 1, 'Fruta'), (a, t, 'produce', 1, 'Ensalada');
  insert into public.plans(user_id, day, kind, title) values (a, t + 1, 'gym', 'Espalda y core'), (b, t + 1, 'cardio', 'Correr 5 km'), (a, t + 3, 'gym', 'Piernas'), (b, t + 5, 'juntos', 'Videollamada + entreno');
  insert into public.workouts(user_id, title, performed_at, duration_min, joint_with) values (b, 'Entreno en pareja por videollamada', least(((t - 1) + time '20:00') at time zone tz, now() - interval '5 minutes'), 25, a);
  insert into public.goals(user_id, created_by, name, metric, target, frequency, category_label) values (a, a, 'Entrenar 4 veces por semana', 'workouts', 4, 'weekly', 'Gimnasio'), (b, b, 'Caminar 50.000 pasos', 'steps', 50000, 'weekly', 'Salud');
  insert into public.goals(couple_id, created_by, name, metric, target, frequency, category_label) values (c, a, 'Tomar 2 L de agua', 'water_goal_days', 5, 'weekly', 'Salud');
  insert into public.challenges(couple_id, created_by, name, metric, target, mode, start_date, end_date, badge, reward)
    values (c, b, '10 entrenamientos entre los dos', 'workouts', 10, 'together', t - 6, t + 7, '🏆', 'Cena juntos en la visita 🍝');
  insert into public.records(user_id, kind, label, value, unit, better, achieved_on) values
    (a, 'run_3k', '3 km', 958, 's', 'lower', t - 20), (a, 'run_3k', '3 km', 905, 's', 'lower', t - 6),
    (a, 'run_5k', '5 km', 1625, 's', 'lower', t - 9), (a, 'pushups', 'Flexiones seguidas', 35, 'reps', 'higher', t - 4),
    (a, 'bench_1rm', 'Press banca (máx.)', 70, 'kg', 'higher', t - 3), (a, 'pullups', 'Dominadas seguidas', 9, 'reps', 'higher', t - 8),
    (b, 'run_3k', '3 km', 1030, 's', 'lower', t - 5), (b, 'plank', 'Plancha', 95, 's', 'higher', t - 2),
    (b, 'squat_1rm', 'Sentadilla (máx.)', 55, 'kg', 'higher', t - 7), (b, 'pushups', 'Flexiones seguidas', 18, 'reps', 'higher', t - 3);
  delete from public.notifications;
  insert into public.notifications(user_id, kind, title, body) values
    (b, 'partner_activity', 'Diego completó su día 💪', '¡Ahora te toca a ti para sumar a la racha!'),
    (a, 'messages', '🔥 Ánimo de Maite', 'Bienvenida a la demo de Gymaiego');
end
$seed$;`
}
