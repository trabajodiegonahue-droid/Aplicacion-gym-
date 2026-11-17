-- =====================================================================
-- Pruebas: registro, dos cuentas, vinculación, racha compartida, RLS,
-- propuestas con aprobación, descansos, cierre de días, recuperación.
-- =====================================================================
\set ON_ERROR_STOP 1
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''

create or replace function pg_temp.login(u uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, false);
$$;
create or replace function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin
  if not coalesce(cond, false) then raise exception 'FALLÓ: %', msg; end if;
  raise notice 'ok  %', msg;
end $$;
-- espera un error
create or replace function pg_temp.expect_error(q text, msg text) returns void language plpgsql as $$
begin
  begin
    execute q;
  exception when others then
    raise notice 'ok  % (error esperado: %)', msg, sqlerrm;
    return;
  end;
  raise exception 'FALLÓ: se esperaba error en: %', msg;
end $$;
grant execute on function pg_temp.check(boolean, text) to authenticated;
grant execute on function pg_temp.expect_error(text, text) to authenticated;
grant execute on function pg_temp.login(uuid) to authenticated;

-- 1) REGISTRO: tres cuentas independientes ----------------------------
insert into auth.users(id, email, raw_user_meta_data) values
  (:A, 'ana@example.com', '{"display_name":"Ana","timezone":"America/Argentina/Buenos_Aires"}'),
  (:B, 'beto@example.com', '{"display_name":"Beto","timezone":"Europe/Madrid"}'),
  (:C, 'intruso@example.com', '{"display_name":"Intruso","timezone":"Mars/Olympus"}');
select pg_temp.check((select count(*) from public.profiles) = 3, 'se crea un perfil por cada cuenta');
select pg_temp.check((select timezone from public.profiles where id = :C) = 'UTC', 'zona horaria inválida cae a UTC');
insert into auth.users(id, email, raw_user_meta_data) values ('ffffffff-0000-0000-0000-000000000006', 'legacy@example.com', '{"display_name":"Leg","timezone":"America/Buenos_Aires"}');
select pg_temp.check((select timezone from public.profiles where id = 'ffffffff-0000-0000-0000-000000000006') = 'America/Argentina/Buenos_Aires', 'nombre antiguo de zona horaria se traduce');
delete from auth.users where id = 'ffffffff-0000-0000-0000-000000000006';
select pg_temp.check((select count(*) from public.water_presets where user_id = :A) = 3, 'presets de agua iniciales');

-- 2) VINCULACIÓN ------------------------------------------------------
set role authenticated;
select pg_temp.login(:A);
create temp table if not exists t_code(code text);
grant all on t_code to authenticated;
insert into t_code select code from public.create_invitation();
select pg_temp.check((select length(code) from t_code) = 6, 'Ana genera código de 6 caracteres');
select pg_temp.expect_error(format('select public.accept_invitation(%L)', (select code from t_code)), 'Ana no puede usar su propio código');
select pg_temp.check((select count(*) from public.profiles) = 1, 'sin pareja, Ana solo ve su perfil');

select pg_temp.login(:B);
select pg_temp.expect_error($q$select public.accept_invitation('ZZZZZZ')$q$, 'código inexistente es rechazado');
select public.accept_invitation((select code from t_code));
select pg_temp.check((select count(*) from public.profiles) = 2, 'Beto ve su perfil y el de Ana');
select pg_temp.check((select count(*) from public.couples) = 1, 'Beto ve la pareja');
select pg_temp.check((select count(*) from public.couple_members) = 2, 'pareja con 2 miembros');
select pg_temp.check((select version from public.streak_rules) = 1, 'reglas v1 creadas');

select pg_temp.login(:C);
select pg_temp.expect_error(format('select public.accept_invitation(%L)', (select code from t_code)), 'código ya usado no sirve a un tercero');
select pg_temp.check((select count(*) from public.couples) = 0, 'intruso NO ve la pareja');
select pg_temp.check((select count(*) from public.profiles) = 1, 'intruso NO ve perfiles ajenos');
select pg_temp.check((select count(*) from public.streaks) = 0, 'intruso NO ve la racha');

select pg_temp.login(:A);
select pg_temp.check((select count(*) from public.notifications where kind = 'couple') = 1, 'Ana recibe aviso de vinculación');
select pg_temp.expect_error('select * from public.create_invitation()', 'Ana ya vinculada no puede invitar a otra persona');

-- 3) RACHA COMPARTIDA ------------------------------------------------
select public.refresh_today();
select pg_temp.check((select count(*) from public.member_day_status) >= 2, 'existen estados de hoy para ambos');

-- Ana entrena
insert into public.workouts(user_id, title, duration_min) values (:A, 'Piernas', 50);
select pg_temp.check((select status from public.member_day_status where user_id = :A and day = public.my_today()) = 'completed', 'Ana: completado');
select pg_temp.check((select status from public.member_day_status where user_id = :B and day = (select max(day) from public.member_day_status where user_id = :B)) in ('pending'), 'Beto: pendiente');
select pg_temp.check((select current_count from public.streaks) = 0, 'racha NO avanza si solo cumple una persona');

-- Seguridad: Ana no puede registrar por Beto ni tocar la racha
select pg_temp.expect_error(format($q$insert into public.workouts(user_id, title) values (%L, 'trampa')$q$, :B), 'Ana NO puede registrar entrenamiento de Beto');
select pg_temp.expect_error($q$update public.member_day_status set status = 'completed'$q$, 'Ana NO puede editar estados de racha');
select pg_temp.expect_error($q$update public.streaks set current_count = 999$q$, 'Ana NO puede editar el contador');
select pg_temp.expect_error($q$insert into public.streak_days(couple_id, day, status) values (private.my_couple(), current_date, 'completed')$q$, 'Ana NO puede inventar días cumplidos');
select pg_temp.expect_error($q$select private.finalize_all()$q$, 'Ana NO puede ejecutar funciones internas');
select pg_temp.expect_error($q$select private.refresh_couple_day(private.my_couple(), current_date, true)$q$, 'Ana NO puede cerrar días');
select pg_temp.expect_error($q$insert into public.workouts(user_id, title, performed_at) values (auth.uid(), 'futuro', now() + interval '2 days')$q$, 'no se registran actividades futuras');

-- Beto: notificación de que Ana cumplió
select pg_temp.login(:B);
select pg_temp.check((select count(*) from public.notifications where kind = 'partner_activity') = 1, 'Beto recibe aviso: Ana completó');
select pg_temp.check((select count(*) from public.workouts) = 0, 'Beto NO ve los entrenamientos en bruto de Ana');
select pg_temp.check((select count(*) from public.member_day_status where user_id = :A) >= 1, 'Beto SÍ ve el estado diario de Ana');

-- Beto hace 20 min de caminata (mínimo 30) → en progreso
insert into public.activity_logs(user_id, kind, minutes) values (:B, 'caminata', 20);
select pg_temp.check((select status from public.member_day_status where user_id = :B and day = public.my_today()) = 'in_progress', 'Beto: en progreso (20/30 min)');
select pg_temp.check((select current_count from public.streaks) = 0, 'racha aún en 0');
insert into public.activity_logs(user_id, kind, minutes) values (:B, 'correr', 15);
select pg_temp.check((select status from public.member_day_status where user_id = :B and day = public.my_today()) = 'completed', 'Beto: completado (35 min)');

-- ¿Coinciden los días? (zonas horarias distintas pueden dar fechas distintas)
reset role;
select pg_temp.check(
  (select current_count from public.streaks) = (case when private.user_today(:A) = private.user_today(:B) then 1 else 0 end),
  'racha +1 cuando AMBOS cumplen el mismo día');
select pg_temp.check((select count(*) from public.notifications where kind = 'streak' and title like '¡Racha +1!%') =
  (case when private.user_today(:A) = private.user_today(:B) then 2 else 0 end), 'ambos reciben confirmación de racha');

-- Borrar el registro de Beto le quita el cumplimiento (día aún abierto)
set role authenticated;
select pg_temp.login(:B);
delete from public.activity_logs where minutes = 15;
select pg_temp.check((select status from public.member_day_status where user_id = :B and day = public.my_today()) = 'in_progress', 'al borrar, Beto vuelve a en progreso');
insert into public.activity_logs(user_id, kind, minutes) values (:B, 'correr', 15);

-- Registro "retroactivo": se guarda en el historial pero NO cambia un día cerrado
insert into public.workouts(user_id, title, performed_at) values (:B, 'Ayer (olvidado)', now() - interval '1 day');
select pg_temp.check((select local_day from public.workouts where title like 'Ayer%') < public.my_today(), 'entrenamiento queda con fecha de ayer');

-- 4) PROPUESTAS DE CAMBIO ---------------------------------------------
select pg_temp.login(:A);
create temp table if not exists t_prop(id uuid);
grant all on t_prop to authenticated;
insert into t_prop select public.propose_change('streak_rules', 'Agregar agua a la racha',
  jsonb_build_object('rules', (select rules from public.streak_rules where version = 1) || '{"require":"all","conditions":{"workout":true,"activity":false,"water":true,"steps":false,"habits":false}}'));
select pg_temp.expect_error(format('select public.respond_proposal(%L, true)', (select id from t_prop)), 'Ana NO puede aprobar su propia propuesta');
select pg_temp.expect_error($q$select public.propose_change('streak_rules', 'otra', '{"rules":{}}')$q$, 'solo 1 propuesta de reglas pendiente');
select pg_temp.expect_error($q$select public.propose_change('streak_rules', 'mala', '{"rules":{"conditions":{"workout":false,"activity":false}}}')$q$, 'reglas sin actividades son rechazadas');
select pg_temp.check((select count(*) from public.streak_rules) = 1, 'las reglas NO cambian sin aprobación');

select pg_temp.login(:C);
select pg_temp.expect_error(format('select public.respond_proposal(%L, true)', (select id from t_prop)), 'intruso NO puede aprobar');

select pg_temp.login(:B);
select pg_temp.check((select count(*) from public.notifications where kind = 'proposals') = 1, 'Beto recibe aviso de propuesta');
select public.respond_proposal((select id from t_prop), true, 'De acuerdo');
select pg_temp.check((select count(*) from public.streak_rules) = 2, 'reglas v2 creadas tras aprobación');
select pg_temp.check((select effective_from from public.streak_rules where version = 2) > public.my_today(), 'v2 rige desde mañana (no retroactiva)');
select pg_temp.check((select approved_by from public.streak_rules where version = 2) = :B and (select proposed_by from public.streak_rules where version = 2) = :A, 'se registra quién propuso y aprobó');
select pg_temp.check((select status from public.member_day_status where user_id = :B and day = public.my_today()) = 'completed', 'el día de hoy conserva las reglas v1');
select pg_temp.check((select count(*) from public.audit_logs where action in ('proposal_created','proposal_approved')) = 2, 'auditoría registrada');
select pg_temp.expect_error(format('select public.respond_proposal(%L, false)', (select id from t_prop)), 'no se puede resolver dos veces');

-- Propuesta rechazada
select pg_temp.login(:A);
truncate t_prop;
insert into t_prop select public.propose_change('couple_settings', 'Nombre de pareja', '{"name":"Los Imparables","anniversary_date":"2024-02-14"}');
select pg_temp.login(:B);
select public.respond_proposal((select id from t_prop), false, 'Mejor otro');
select pg_temp.check((select name from public.couples) is null, 'propuesta rechazada no aplica cambios');
select pg_temp.login(:A);
select pg_temp.check((select count(*) from public.notifications where title like '❌%') = 1, 'Ana recibe aviso de rechazo');

-- 5) DÍAS DE DESCANSO --------------------------------------------------
insert into public.rest_days(user_id, day) values (:A, date_trunc('week', public.my_today())::date + 7);
select pg_temp.expect_error(format($q$insert into public.rest_days(user_id, day) values (%L, date_trunc('week', public.my_today())::date + 8)$q$, :A), 'límite de 1 descanso por semana');
select pg_temp.expect_error(format('insert into public.rest_days(user_id, day) values (%L, public.my_today() - 1)', :A), 'no hay descansos retroactivos');
select pg_temp.expect_error(format('insert into public.rest_days(user_id, day) values (%L, public.my_today() + 3)', :B), 'Ana no marca descansos por Beto');

-- 6) HÁBITOS ---------------------------------------------------------
insert into public.habits(user_id, name) values (:A, 'Estirar');
insert into public.habit_logs(habit_id, user_id, local_day) select id, :A, '2000-01-01' from public.habits where name = 'Estirar';
select pg_temp.check((select local_day from public.habit_logs) = public.my_today(), 'el servidor fuerza la fecha del hábito a hoy');
select pg_temp.expect_error($q$insert into public.habit_logs(habit_id, user_id) select id, auth.uid() from public.habits where name = 'Estirar'$q$, 'no se duplica un hábito el mismo día');

-- 7) MENSAJES ----------------------------------------------------------
insert into public.messages(couple_id, kind, body) values (private.my_couple(), 'heart', '¡Vamos!');
select pg_temp.expect_error(format($q$insert into public.messages(couple_id, sender_id, body) values ('%s', '%s', 'x')$q$, gen_random_uuid(), :A), 'no se escribe en parejas ajenas');
select pg_temp.login(:B);
select pg_temp.check((select count(*) from public.notifications where kind = 'messages') = 1, 'Beto recibe aviso de corazón');
select pg_temp.check((select sender_id from public.messages) = :A, 'el remitente es Ana');
select pg_temp.login(:C);
select pg_temp.check((select count(*) from public.messages) = 0, 'intruso no ve mensajes');

-- 8) CIERRE DE DÍAS Y RACHA ROTA (simulando 3 días después) ------------
reset role;
select private.finalize_all(now() + interval '3 days');
select pg_temp.check((select bool_and(finalized) from public.streak_days where day < private.user_today(:A) + 2), 'días vencidos quedan cerrados');
select pg_temp.check((select count(*) from public.streak_days where status = 'missed') >= 1, 'días sin actividad = no cumplidos');
select pg_temp.check((select current_count from public.streaks) = 0, 'racha se rompe al no cumplir');
select pg_temp.check((select best_count from public.streaks) >= 1 and (select best_count from public.streaks) = (select count(*) from public.streak_days where status = 'completed'), 'récord histórico se conserva');
select pg_temp.check((select count(*) from public.member_day_status where status in ('pending','in_progress') and day < private.user_today(:A) + 2) = 0, 'estados individuales cerrados como no cumplidos');

-- Un día cerrado ya no cambia aunque se agreguen registros
set role authenticated;
select pg_temp.login(:A);
create temp table if not exists t_snap as select * from public.streak_days;
insert into public.water_logs(user_id, amount_ml, performed_at) values (:A, 500, now() - interval '1 day');
select pg_temp.check((select count(*) from public.streak_days s join t_snap t using (couple_id, day) where s.status <> t.status) = 0, 'el historial cerrado nunca se reescribe');

-- 9) RECUPERACIÓN DE RACHA (requiere aprobación) -----------------------
reset role;
create temp table if not exists t_missed as select day from public.streak_days where status = 'missed' order by day limit 1;
grant all on t_missed to authenticated;
set role authenticated;
select pg_temp.login(:B);
truncate t_prop;
insert into t_prop select public.propose_change('streak_recovery', 'Recuperar día', jsonb_build_object('day', (select day from t_missed)));
select pg_temp.login(:A);
select public.respond_proposal((select id from t_prop), true);
select pg_temp.check((select status from public.streak_days where day = (select day from t_missed)) = 'recovered', 'día recuperado con aprobación de ambos');

-- 10) DESVINCULAR: no borra datos personales ---------------------------
select public.unlink_couple();
select pg_temp.check((select count(*) from public.couples) = 0, 'tras desvincular ya no se ve la pareja');
select pg_temp.check((select count(*) from public.workouts) >= 1, 'los entrenamientos de Ana se conservan');
select pg_temp.check((select count(*) from public.profiles) = 1, 'Ana ya no ve el perfil de Beto');
select pg_temp.check((select count(*) from public.create_invitation()) = 1, 'Ana puede invitar de nuevo');
reset role;
select pg_temp.check((select count(*) from public.streak_days) > 0, 'el historial compartido no se borra');

-- 11) RACHA DE VARIOS DÍAS (pareja nueva, ambos en UTC) ----------------
\set D '''dddddddd-0000-0000-0000-000000000004'''
\set E '''eeeeeeee-0000-0000-0000-000000000005'''
insert into auth.users(id, email, raw_user_meta_data) values
  (:D, 'd@example.com', '{"display_name":"Dani","timezone":"UTC"}'),
  (:E, 'e@example.com', '{"display_name":"Eli","timezone":"UTC"}');
set role authenticated;
select pg_temp.login(:D);
truncate t_code;
insert into t_code select code from public.create_invitation();
select pg_temp.login(:E);
select public.accept_invitation((select code from t_code));
reset role;
-- simular historia: la pareja empezó hace 6 días
update public.couples set streak_start_date = current_date - 6 where id = private.active_couple(:D);
delete from public.streak_days where couple_id = private.active_couple(:D);
delete from public.member_day_status where couple_id = private.active_couple(:D);
update public.streak_rules set effective_from = current_date - 6 where couple_id = private.active_couple(:D);
alter table public.workouts disable trigger tg_before;
alter table public.workouts disable trigger tg_after;
alter table public.rest_days disable trigger tg_before;
alter table public.rest_days disable trigger tg_after;
-- día -6: nadie; -5: solo Dani; -4..-1: ambos (Eli descansa el -2); hoy: ambos
insert into public.workouts(user_id, title, performed_at, local_day, created_at)
select u, 'hist', (current_date - k) + time '12:00', current_date - k, (current_date - k) + time '12:00'
from (values (:D::uuid, 5), (:D::uuid, 4), (:E::uuid, 4), (:D::uuid, 3), (:E::uuid, 3), (:D::uuid, 2), (:D::uuid, 1), (:E::uuid, 1)) v(u, k);
insert into public.rest_days(user_id, day, created_at) values (:E, current_date - 2, now() - interval '3 days');
alter table public.workouts enable trigger tg_before;
alter table public.workouts enable trigger tg_after;
alter table public.rest_days enable trigger tg_before;
alter table public.rest_days enable trigger tg_after;
select private.finalize_all(now());
select pg_temp.check((select status from public.streak_days where couple_id = private.active_couple(:D) and day = current_date - 6) = 'missed', 'día -6 sin actividad: no cumplido');
select pg_temp.check((select status from public.streak_days where couple_id = private.active_couple(:D) and day = current_date - 5) = 'missed', 'día -5 solo uno cumplió: no cumplido');
select pg_temp.check((select status from public.streak_days where couple_id = private.active_couple(:D) and day = current_date - 2) = 'completed', 'día -2: uno entrena y otro descansa = cumplido');
select pg_temp.check((select current_count from public.streaks where couple_id = private.active_couple(:D)) = 4, 'racha actual = 4 días');
-- hoy ambos entrenan (por la vía normal)
set role authenticated;
select pg_temp.login(:D);
insert into public.workouts(user_id, title) values (:D, 'hoy');
select pg_temp.check((select current_count from public.streaks) = 4, 'solo Dani hoy: racha sigue en 4 (pendiente, no rota)');
select pg_temp.login(:E);
insert into public.workouts(user_id, title) values (:E, 'hoy');
select pg_temp.check((select current_count from public.streaks) = 5, 'ambos hoy: racha = 5 🔥');
select pg_temp.check((select best_count from public.streaks) = 5, 'récord = 5');
select pg_temp.check((select count(*) from public.streak_runs()) = 1 and (select length from public.streak_runs() limit 1) = 5, 'historial de rachas correcto');

-- 12) METAS, RETOS, ESTADÍSTICAS, RECORDATORIOS ------------------------
select pg_temp.login(:D);
insert into public.goals(user_id, created_by, name, metric, target, frequency) values (:D, :D, 'Entrenar 1 vez', 'workouts', 1, 'daily');
select pg_temp.check((select value from public.goal_progress((select id from public.goals where name = 'Entrenar 1 vez'))) = 1, 'progreso de meta personal');
select pg_temp.expect_error(format($q$insert into public.goals(couple_id, created_by, name, metric, target) values (private.my_couple(), %L, 'x', 'workouts', 1)$q$, :D), 'metas compartidas solo por propuesta');
truncate t_prop;
insert into t_prop select public.propose_change('shared_challenge', 'Reto: 2 entrenos', jsonb_build_object('name','2 entrenos','metric','workouts','target',2,'mode','together','end_date', current_date + 7, 'badge','🏆','reward','Cena'));
select pg_temp.login(:E);
select public.respond_proposal((select id from t_prop), true);
select pg_temp.check((select count(*) from public.challenges where couple_id is not null) = 1, 'reto compartido creado tras aprobación');
select pg_temp.check((select sum(value) from public.challenge_progress((select id from public.challenges where name = '2 entrenos'))) = 2, 'progreso del reto (juntos)');
insert into public.water_logs(user_id, amount_ml) values (:E, 250);
select pg_temp.check((select status from public.challenges where name = '2 entrenos') = 'completed', 'reto se completa automáticamente');
select pg_temp.check((select count(*) from public.user_badges) = 2, 'insignia otorgada a ambos');
select pg_temp.check((select count(*) from public.couple_stats(current_date - 7, current_date)) = 2, 'estadísticas de ambos');
select pg_temp.check((select count(*) from public.daily_series(current_date - 6, current_date)) = 14, 'serie diaria 7 días x 2');
reset role;
select private.enqueue_reminders(now());
select private.cron_tick();
select pg_temp.check(true, 'recordatorios y tarea programada se ejecutan sin errores');

-- 13) NIVELES / XP ------------------------------------------------------
set role authenticated;
select pg_temp.login(:D);
select pg_temp.check((select count(*) from public.member_levels()) = 2, 'niveles: se ven los dos miembros');
select pg_temp.check((select xp from public.member_levels() where user_id = :D) > 0, 'Dani tiene XP');
select pg_temp.check((select xp_today from public.member_levels() where user_id = :E) >= 40, 'Eli tiene XP de hoy (entrenó)');
select pg_temp.login(:C);
select pg_temp.check((select count(*) from public.member_levels()) = 1, 'sin pareja solo se ve a sí mismo');
reset role;

-- 14) MEDIDAS Y RÉCORDS ------------------------------------------------
set role authenticated;
select pg_temp.login(:D);
update public.profiles set height_cm = 175, goal_weight_kg = 70 where id = :D;
insert into public.records(user_id, kind, label, value, unit, better) values (:D, 'run_3k', 'Correr 3 km', 960, 's', 'lower');
insert into public.records(user_id, kind, label, value, unit, better) values (:D, 'run_3k', 'Correr 3 km', 900, 's', 'lower');
select pg_temp.expect_error(format($q$insert into public.records(user_id, kind, label, value, unit) values (%L, 'x', 'x', 1, 'kg')$q$, :E), 'nadie crea récords por su pareja');
select pg_temp.login(:E);
select pg_temp.check((select count(*) from public.records where user_id = :D) = 2, 'la pareja ve los récords');
select pg_temp.check((select count(*) from public.notifications where title like '%batió su récord%') = 2, 'aviso de récord a la pareja');
delete from public.records where user_id = :D;
select pg_temp.check((select count(*) from public.records where user_id = :D) = 2, 'la pareja no puede borrar récords ajenos');
reset role;

-- 15) RESUMEN SEMANAL --------------------------------------------------
set role authenticated;
select pg_temp.login(:D);
select pg_temp.check((select count(*) from public.week_summary(current_date - 6, current_date)) = 2, 'resumen semanal: los dos miembros');
select pg_temp.check((select records from public.week_summary(current_date - 6, current_date) where user_id = :D) = 2, 'resumen semanal cuenta récords de la semana');
select pg_temp.expect_error($q$select * from public.week_summary(current_date - 90, current_date)$q$, 'resumen semanal: rango limitado');
select pg_temp.login(:C);
select pg_temp.check((select count(*) from public.week_summary(current_date - 6, current_date)) = 1, 'resumen semanal sin pareja: solo yo');
reset role;
-- Domingo 19:05 en la zona de Dani → se encola un aviso por persona, sin duplicar
delete from public.notifications where kind = 'weekly';
select private.enqueue_weekly(((date_trunc('week', now() at time zone 'UTC')::date + 6) + time '19:05') at time zone 'UTC');
select private.enqueue_weekly(((date_trunc('week', now() at time zone 'UTC')::date + 6) + time '19:05') at time zone 'UTC');
select pg_temp.check((select count(*) from public.notifications where kind = 'weekly' and user_id = :D) <= 1, 'aviso semanal sin duplicados');
select pg_temp.check((select count(*) from public.notifications where kind = 'weekly') = (select count(*) from public.profiles p where private.user_tz(p.id) = 'UTC'), 'aviso semanal a quien es domingo 19:00');
select private.enqueue_weekly(((date_trunc('week', now() at time zone 'UTC')::date + 2) + time '19:05') at time zone 'UTC');
select pg_temp.check((select count(*) from public.notifications where kind = 'weekly') = (select count(*) from public.profiles p where private.user_tz(p.id) = 'UTC'), 'no se manda otro día');

-- 16) VIDA REAL: pausas, mínimos, eventos suaves, cómo me siento, lesiones,
--     privacidad, ciclo, entreno juntos y calendario (pareja nueva en UTC)
\set F '''ffffffff-0000-0000-0000-000000000007'''
\set G '''99999999-0000-0000-0000-000000000008'''
reset role;
insert into auth.users(id, email, raw_user_meta_data) values
  (:F, 'f@example.com', '{"display_name":"Fran","timezone":"UTC"}'),
  (:G, 'g@example.com', '{"display_name":"Gabi","timezone":"UTC"}');
set role authenticated;
select pg_temp.login(:F);
truncate t_code;
insert into t_code select code from public.create_invitation();
select pg_temp.login(:G);
select public.accept_invitation((select code from t_code));

-- Pausa por enfermedad (Fran) y día de mínimos con 10 min (Gabi)
select pg_temp.login(:F);
select pg_temp.expect_error($q$insert into public.pauses(kind, start_date) values ('enfermedad', current_date - 1)$q$, 'una pausa no empieza en el pasado');
insert into public.pauses(kind, start_date, note) values ('enfermedad', current_date, 'gripe');
select pg_temp.expect_error($q$insert into public.pauses(kind, start_date) values ('viaje', current_date + 1)$q$, 'no se solapan pausas');
select pg_temp.check((select status from public.member_day_status where user_id = :F and day = current_date) = 'paused', 'Fran queda en pausa hoy');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.pauses where user_id = :F) = 1, 'la pareja ve la pausa');
select pg_temp.expect_error(format($q$insert into public.pauses(user_id, kind, start_date) values (%L, 'otro', current_date + 5)$q$, :F), 'nadie activa una pausa por el otro');
insert into public.activity_logs(user_id, kind, minutes) values (:G, 'caminata', 10);
select pg_temp.check((select status from public.member_day_status where user_id = :G and day = current_date) = 'in_progress', 'Gabi con 10 min: aún no cumple (pide 30)');
insert into public.easy_days(day, reason) values (current_date, 'exámenes');
select pg_temp.check((select status from public.member_day_status where user_id = :G and day = current_date) = 'completed', 'día de mínimos: 10 min cuentan');
select pg_temp.check((select status from public.streak_days where couple_id = private.my_couple() and day = current_date) = 'paused', 'uno en pausa + otro cumple = día congelado');
reset role;
update public.streak_rules set rules = rules || '{"easy_days_per_month": 0}'::jsonb where couple_id = private.active_couple(:G);
set role authenticated;
select pg_temp.login(:G);
select pg_temp.expect_error($q$insert into public.easy_days(day) values (current_date + 1)$q$, 'cupo mensual de días de mínimos');
reset role;
-- Al cerrar el día, la pausa NO rompe la racha
select private.finalize_all(now() + interval '1 day 2 hours');
select pg_temp.check((select status from public.streak_days where couple_id = private.active_couple(:F) and day = current_date) = 'paused', 'al cerrar, el día en pausa no queda perdido');
select pg_temp.check((select status from public.member_day_status where user_id = :F and day = current_date) = 'paused', 'Fran sigue en pausa tras el cierre');

-- Evento "día suave" planificado con anticipación
set role authenticated;
select pg_temp.login(:F);
insert into public.calendar_events(couple_id, title, kind, event_date, end_date, lighten, for_user) values (private.my_couple(), 'Exámenes', 'examen', current_date + 1, current_date + 3, true, :F);
insert into public.calendar_events(couple_id, title, kind, event_date, lighten) values (private.my_couple(), 'Turno largo', 'trabajo', current_date, true);
reset role;
select pg_temp.check(((private.compute_member(private.active_couple(:F), :F, current_date + 2, now())).details->>'is_easy')::boolean, 'evento suave planificado = día de mínimos');
select pg_temp.check(not ((private.compute_member(private.active_couple(:F), :F, current_date, now())).details->>'is_easy')::boolean, 'un evento suave creado el mismo día NO aligera ese día');
select pg_temp.check(not ((private.compute_member(private.active_couple(:F), :G, current_date + 2, now())).details->>'is_easy')::boolean, 'el evento suave solo aligera a quien lo creó');
set role authenticated;
select pg_temp.login(:F);

-- Terminar la pausa: solo hoy o más adelante
select pg_temp.expect_error($q$update public.pauses set end_date = current_date - 1$q$, 'la pausa no termina en el pasado');
update public.pauses set end_date = current_date;
select pg_temp.check((select end_date from public.pauses where user_id = :F) = current_date, 'pausa terminada hoy');

-- Cómo me siento
select pg_temp.login(:G);
insert into public.checkins(day, energy, mood, sleep_hours, pain) values (current_date, 2, 3, 5.5, 0);
select pg_temp.expect_error($q$insert into public.checkins(day, energy) values (current_date - 10, 3)$q$, 'check-in solo de los últimos días');
select pg_temp.login(:F);
select pg_temp.check((select energy from public.checkins where user_id = :G) = 2, 'la pareja ve cómo se siente');
select pg_temp.check((select count(*) from public.notifications where user_id = :F and title like '%poca energía%') = 1, 'aviso cariñoso de poca energía');
update public.checkins set energy = 5 where user_id = :G;
select pg_temp.login(:G);
select pg_temp.check((select energy from public.checkins where user_id = :G) = 2, 'nadie edita el check-in del otro');

-- Lesiones
select pg_temp.login(:F);
insert into public.injuries(area, side, severity, note) values ('hombro', 'der', 2, 'press banca');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.injuries where user_id = :F and resolved_on is null) = 1, 'la pareja ve la lesión');
select pg_temp.expect_error(format($q$insert into public.injuries(user_id, area) values (%L, 'rodilla')$q$, :F), 'nadie registra lesiones por el otro');

-- Privado: medidas, fotos y ciclo
select pg_temp.login(:F);
insert into public.measurements(day, waist_cm, arm_cm) values (current_date, 82, 35);
select pg_temp.expect_error(format($q$insert into public.progress_photos(path) values ('private/%s/x.jpg')$q$, :G), 'fotos solo en tu carpeta privada');
insert into public.progress_photos(path) values ('private/' || :F || '/frente.jpg');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.measurements) = 0 and (select count(*) from public.progress_photos) = 0, 'medidas y fotos son privadas (ni la pareja)');
insert into public.cycle_settings(enabled, share_phase) values (true, false);
insert into public.cycle_periods(start_date) values (current_date - 3);
select pg_temp.check(public.my_cycle()->>'phase' = 'menstrual' and (public.my_cycle()->>'day')::int = 4, 'fase del ciclo calculada');
select pg_temp.login(:F);
select pg_temp.check(public.partner_cycle() is null and (select count(*) from public.cycle_periods) = 0, 'el ciclo es privado si no se comparte');
select pg_temp.login(:G);
update public.cycle_settings set share_phase = true;
select pg_temp.login(:F);
select pg_temp.check(public.partner_cycle()->>'phase' = 'menstrual' and (select count(*) from public.cycle_periods) = 0, 'compartida: la pareja ve SOLO la fase');

-- Entreno juntos: uno registra, el otro confirma
select pg_temp.expect_error(format($q$insert into public.workouts(user_id, title, joint_with) values (%L, 'x', %L)$q$, :F, :C), 'entreno juntos solo con tu pareja');
insert into public.workouts(user_id, title, duration_min, joint_with) values (:F, 'Piernas juntos', 45, :G);
select pg_temp.expect_error(format($q$insert into public.workouts(user_id, title, joint_of) values (%L, 'x', (select id from public.workouts where title = 'Piernas juntos'))$q$, :F), 'joint_of solo desde la confirmación');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.pending_joint_workouts()) = 1, 'Gabi tiene una invitación de entreno juntos');
select pg_temp.check(public.confirm_joint_workout((select id from public.pending_joint_workouts() limit 1)) is not null, 'Gabi confirma el entreno juntos');
select pg_temp.check((select count(*) from public.workouts where user_id = :G and joint_of is not null) = 1, 'se crea el entreno de Gabi (hecho por ella)');
select pg_temp.check((select count(*) from public.pending_joint_workouts()) = 0, 'sin invitaciones pendientes');
reset role;
select pg_temp.check((select xp from private.xp_parts(:G, current_date, current_date)) >= 60, 'entreno juntos da XP extra');

-- Planes y calendario de la pareja
set role authenticated;
select pg_temp.login(:F);
insert into public.plans(day, kind, title) values (current_date + 1, 'gym', 'Espalda');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'plan' and user_id = :F) = 1, 'calendario: plan de la pareja');
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'pause') >= 1, 'calendario: pausa');
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'event' and title = 'Exámenes') = 3, 'calendario: evento de varios días');
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'workout') = 2, 'calendario: entrenos de los dos');
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'cycle') >= 1, 'calendario: mi ciclo (propio)');
select pg_temp.login(:F);
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where kind = 'cycle') = 0, 'calendario: nunca muestra el ciclo de la pareja');
select pg_temp.expect_error($q$select * from public.couple_calendar(current_date - 100, current_date)$q$, 'calendario: rango limitado');
select pg_temp.login(:C);
select pg_temp.check((select count(*) from public.couple_calendar(current_date - 1, current_date + 3) where user_id in (:F, :G)) = 0, 'un tercero no ve nada de la pareja');
reset role;

-- 17) PESAJE SEMANAL (peso + estatura) ---------------------------------
set role authenticated;
select pg_temp.login(:G);
insert into public.body_weights(day, weight_kg, height_cm) values (current_date - 7, 60.5, 165);
insert into public.body_weights(day, weight_kg, height_cm) values (current_date, 60.1, 165.5);
update public.profiles set fitness_goal = 'ganar_musculo' where id = :G;
select pg_temp.check((select height_cm from public.profiles where id = :G) = 165.5, 'la estatura más reciente queda en el perfil');
select pg_temp.check((select start_weight_kg from public.profiles where id = :G) = 60.5, 'peso inicial se fija con el primer pesaje');
select pg_temp.login(:F);
select pg_temp.check((select count(*) from public.body_weights where user_id = :G) = 0, 'el peso sigue siendo privado');
reset role;

-- 18) CICLO COMPLETO -----------------------------------------------------
set role authenticated;
select pg_temp.login(:G);
select pg_temp.expect_error($q$insert into public.cycle_periods(start_date) values (current_date + 2)$q$, 'el período no empieza en el futuro');
select pg_temp.expect_error($q$insert into public.cycle_periods(start_date) values (current_date - 6)$q$, 'no se duplican períodos cercanos');
insert into public.cycle_periods(start_date, end_date) values (current_date - 63, current_date - 59), (current_date - 33, current_date - 29);
select pg_temp.check((public.my_cycle()->>'length')::int = 30, 'duración del ciclo = promedio real (30 días)');
select pg_temp.check((public.my_cycle()->>'next_start')::date = current_date + 27, 'próximo período estimado');
select pg_temp.check((public.my_cycle()->>'period_length')::int = 5, 'duración del período = promedio real');
insert into public.cycle_logs(day, flow, pain, symptoms) values (current_date, 3, 3, '{hinchazon,cansancio}');
select pg_temp.expect_error($q$insert into public.cycle_logs(day, symptoms) values (current_date - 1, '{inventado}')$q$, 'solo síntomas válidos');
select pg_temp.check((public.my_cycle()->'today_log'->>'pain')::int = 3, 'mi registro de hoy');
select pg_temp.login(:F);
select pg_temp.check((select count(*) from public.cycle_logs) = 0, 'la pareja nunca ve el registro del ciclo');
select pg_temp.check(public.partner_cycle()->>'pain' is null and public.partner_cycle()->>'phase' = 'menstrual', 'sin compartir síntomas: solo la fase');
select pg_temp.login(:G);
update public.cycle_settings set share_symptoms = true;
select pg_temp.login(:F);
select pg_temp.check((public.partner_cycle()->>'pain')::int = 3 and public.partner_cycle()->>'next_start' is null, 'compartiendo síntomas: resumen de hoy, sin fechas');
reset role;
select private.enqueue_cycle(((current_date + 25) + time '09:05') at time zone 'UTC');
select pg_temp.check((select count(*) from public.notifications where user_id = :G and kind = 'cycle') = 1, 'aviso privado 2 días antes del período');
select pg_temp.check((select count(*) from public.notifications where user_id = :F and kind = 'cycle') = 0, 'el aviso del ciclo no le llega a la pareja');
-- Regla opcional: primeros días del período = día de mínimos
update public.streak_rules set rules = rules || '{"period_easy_days": 2}'::jsonb where couple_id = private.active_couple(:E);
insert into public.cycle_settings(user_id, enabled) values (:E, true);
set role authenticated;
select pg_temp.login(:E);
insert into public.cycle_periods(start_date) values (current_date);
reset role;
select pg_temp.check(((private.compute_member(private.active_couple(:E), :E, current_date, now())).details->>'is_easy')::boolean, 'regla de la pareja: período = día de mínimos');
select pg_temp.check(not ((private.compute_member(private.active_couple(:E), :D, current_date, now())).details->>'is_easy')::boolean, 'no afecta a la otra persona');
select pg_temp.check(private.normalize_rules('{"period_easy_days": 3}'::jsonb)->>'period_easy_days' = '3', 'la regla se valida');

-- 19) SALUD AUTOMÁTICA, COMIDA Y BORRAR CUENTA -------------------------
set role authenticated;
select pg_temp.login(:F);
create temp table if not exists t_tok(t text);
grant all on t_tok to authenticated, anon;
insert into t_tok select public.create_health_token();
select pg_temp.check((select count(*) from public.health_tokens) = 1 and (select token_hash from public.health_tokens) <> (select t from t_tok), 'la llave se guarda solo como huella');
set role anon;
select pg_temp.expect_error($q$select public.ingest_health('fj_llave_inventada_123456789', 5000, null)$q$, 'llave inventada rechazada');
select public.ingest_health((select t from t_tok), 6400, 7.5);
reset role;
select pg_temp.check((select steps from public.activity_logs where user_id = :F and kind = 'pasos' and notes = 'Salud (automático)') = 6400, 'pasos automáticos guardados');
select pg_temp.check((select sleep_hours from public.checkins where user_id = :F and day = current_date) = 7.5, 'sueño automático guardado');
set role anon;
select pg_temp.expect_error(format($q$select public.ingest_health(%L, 7000, null)$q$, (select t from t_tok)), 'límite de frecuencia');
reset role;
update public.health_tokens set last_used_at = now() - interval '1 minute' where user_id = :F;
set role anon;
select public.ingest_health((select t from t_tok), 9100, null);
reset role;
select pg_temp.check((select count(*) from public.activity_logs where user_id = :F and notes = 'Salud (automático)') = 1 and (select steps from public.activity_logs where user_id = :F and notes = 'Salud (automático)') = 9100, 'un solo registro de pasos por día (se actualiza)');
set role authenticated;
select pg_temp.login(:F);
insert into public.nutrition_logs(day, kind, amount, label) values (current_date, 'protein', 30, 'Pechuga'), (current_date, 'produce', 1, 'Manzana');
select pg_temp.expect_error($q$insert into public.nutrition_logs(day, kind, amount) values (current_date - 30, 'protein', 10)$q$, 'comida solo de la última semana');
select pg_temp.login(:G);
select pg_temp.check((select count(*) from public.nutrition_logs) = 0, 'la comida es privada');
-- Borrar cuenta (Fran), con cosas en el espacio compartido
select pg_temp.login(:F);
insert into public.messages(couple_id, kind, body) values (private.my_couple(), 'text', 'chau');
insert into public.notes(couple_id, body) values (private.my_couple(), 'nota');
reset role;
alter table public.rest_days disable trigger tg_before;
insert into public.rest_days(user_id, day, created_at) values (:F, current_date - 3, now() - interval '3 days');
alter table public.rest_days enable trigger tg_before;
alter table public.habit_logs disable trigger tg_before;
with h as (insert into public.habits(user_id, name, start_date) values (:F, 'Leer', current_date - 5) returning id)
insert into public.habit_logs(habit_id, user_id, local_day, performed_at, created_at) select h.id, :F, current_date - 2, now(), now() from h;
alter table public.habit_logs enable trigger tg_before;
set role authenticated;
select pg_temp.login(:F);
select pg_temp.expect_error($q$delete from public.rest_days where day < current_date$q$, 'fuera del borrado de cuenta, sigue sin poder borrar días pasados');
select pg_temp.expect_error($q$select public.delete_my_account('borrar')$q$, 'pide confirmación escrita');
select public.delete_my_account('BORRAR');
reset role;
select pg_temp.check(not exists (select 1 from auth.users where id = :F), 'cuenta eliminada');
select pg_temp.check(not exists (select 1 from public.profiles where id = :F) and not exists (select 1 from public.workouts where user_id = :F), 'datos personales eliminados');
select pg_temp.check(private.active_couple(:G) is null and exists (select 1 from public.profiles where id = :G) and exists (select 1 from public.cycle_settings where user_id = :G), 'la pareja queda desvinculada y conserva sus datos');
select pg_temp.check((select count(*) from public.notifications where user_id = :G and title = 'Tu pareja eliminó su cuenta') = 1, 'aviso a la pareja');

-- 20) ENTRENAR EN VIVO, RÉCORDS Y RECORDATORIOS INTELIGENTES ---------------
set role authenticated;
select pg_temp.login(:D);
insert into public.live_sessions(couple_id, title, exercise, sets_done, sets_total) values (private.active_couple(:D), 'Piernas', 'Sentadilla', 2, 12);
select pg_temp.expect_error(format($q$insert into public.live_sessions(user_id, couple_id) values (%L, %L)$q$, :E, private.active_couple(:D)), 'no se puede crear la sesión en vivo de la pareja');
select pg_temp.login(:E);
select pg_temp.check((select exercise from public.live_sessions where user_id = :D) = 'Sentadilla', 'la pareja ve lo que entrenas en vivo');
update public.live_sessions set sets_done = 99 where user_id = :D;
select pg_temp.check((select sets_done from public.live_sessions where user_id = :D) = 2, 'la pareja no puede cambiar tu sesión en vivo');
select pg_temp.check((select count(*) from public.notifications where user_id = :E and kind = 'live') = 1, 'aviso "está entrenando ahora"');
insert into public.live_reactions(couple_id, to_user, emoji) values (private.active_couple(:E), :D, '🔥');
select pg_temp.expect_error(format($q$insert into public.live_reactions(couple_id, to_user, emoji) values (%L, %L, '🔥')$q$, private.active_couple(:E), :A), 'no se reacciona a alguien que no es tu pareja');
select pg_temp.expect_error(format($q$insert into public.live_reactions(couple_id, to_user, emoji) values (%L, %L, 'x')$q$, private.active_couple(:E), :D), 'solo emojis permitidos');
select pg_temp.login(:D);
select pg_temp.check((select count(*) from public.live_reactions where to_user = :D) = 1, 'te llegan las reacciones');
select pg_temp.login(:A);
select pg_temp.check((select count(*) from public.live_sessions) = 0 and (select count(*) from public.live_reactions) = 0, 'otra persona no ve nada en vivo');
-- Récords
select pg_temp.login(:D);
create temp table if not exists t_w(id uuid);
grant all on t_w to authenticated;
insert into public.exercises(name, muscle_group) values ('Sentadilla PR', 'piernas'), ('Plancha PR', 'abdomen');
insert into public.workouts(title, performed_at) values ('Antes PR', now() - interval '2 hours');
insert into public.workout_sets(workout_id, exercise_id, set_number, reps, weight_kg, duration_sec)
select w.id, e.id, 1, case when e.name = 'Sentadilla PR' then 8 else null end, case when e.name = 'Sentadilla PR' then 50 else null end, case when e.name = 'Plancha PR' then 40 else null end
  from public.workouts w, public.exercises e where w.title = 'Antes PR' and e.name in ('Sentadilla PR', 'Plancha PR');
with w as (insert into public.workouts(title) values ('Ahora') returning id) insert into t_w select id from w;
insert into public.workout_sets(workout_id, exercise_id, set_number, reps, weight_kg, duration_sec)
select (select id from t_w), e.id, 1, case when e.name = 'Sentadilla PR' then 6 else null end, case when e.name = 'Sentadilla PR' then 55 else null end, case when e.name = 'Plancha PR' then 60 else null end
  from public.exercises e where e.name in ('Sentadilla PR', 'Plancha PR');
select pg_temp.check((select count(*) from public.workout_records((select id from t_w))) = 2, 'detecta 2 récords (peso y tiempo)');
select pg_temp.check((select best from public.workout_records((select id from t_w)) where exercise = 'Sentadilla PR') = 55 and (select previous from public.workout_records((select id from t_w)) where exercise = 'Sentadilla PR') = 50, 'récord de peso 50 → 55 kg');
select pg_temp.check((select kind from public.workout_records((select id from t_w)) where exercise = 'Plancha PR') = 'tiempo', 'récord de tiempo en plancha');
select * from public.workout_records((select id from t_w), true);
select pg_temp.login(:E);
select pg_temp.check((select count(*) from public.workout_records((select id from t_w))) = 0, 'no se pueden pedir récords de entrenos ajenos');
select pg_temp.check((select count(*) from public.notifications where user_id = :E and kind = 'records' and title like '%2 récords%' and body not like '%55%') = 1, 'la pareja recibe el aviso del récord, sin ver el peso');
reset role;
-- Recordatorios inteligentes
select pg_temp.check(private.missing_text('{"required":["workout","activity"],"met":[],"require":"any"}'::jsonb) = 'un entreno o actividad', 'texto de lo que falta');
create temp table t_smart as select (private.compute_member(private.active_couple(:D), :D, private.local_day_for(:D, now()), now())).* ;
select private.enqueue_smart(((select details->>'day_end' from t_smart)::timestamptz) - interval '115 minutes');
select pg_temp.check(((select status from t_smart) in ('pending','in_progress')) = exists (select 1 from public.notifications where user_id = :D and kind = 'smart'), 'aviso 2 h antes solo si te falta algo');
select private.enqueue_smart(now());
select pg_temp.check((select count(*) from public.notifications where kind = 'smart' and user_id = :D) <= 1, 'no repite el aviso');
