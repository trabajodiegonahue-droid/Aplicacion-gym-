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
