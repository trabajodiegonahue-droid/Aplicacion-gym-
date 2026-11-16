-- =====================================================================
-- FUEGO JUNTOS · 0003 · Seguridad a nivel de fila (RLS) y Realtime
-- =====================================================================

-- Activar RLS en TODAS las tablas públicas
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Permisos base: anon no ve nada; authenticated pasa por RLS
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Tablas que SOLO escribe el servidor (defensa extra además de RLS)
revoke insert, update, delete on public.couples, public.couple_members, public.invitations,
  public.streak_rules, public.member_day_status, public.streak_days, public.streaks,
  public.notifications, public.shared_change_proposals, public.shared_change_approvals,
  public.audit_logs, public.user_badges from authenticated;
grant delete on public.notifications to authenticated;

-- ---------------------------------------------------------------------
-- Helpers para borrar políticas antiguas al re-ejecutar
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Perfiles: me veo a mí y a mi pareja; solo edito el mío
-- ---------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.is_partner(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Pareja y racha: solo miembros activos (lectura). Escritura: servidor.
-- ---------------------------------------------------------------------
create policy couples_select on public.couples for select to authenticated using (private.is_member(id));
create policy couple_members_select on public.couple_members for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy invitations_select on public.invitations for select to authenticated using (inviter_id = (select auth.uid()));
create policy streak_rules_select on public.streak_rules for select to authenticated using (private.is_member(couple_id));
create policy mds_select on public.member_day_status for select to authenticated using (private.is_member(couple_id));
create policy streak_days_select on public.streak_days for select to authenticated using (private.is_member(couple_id));
create policy streaks_select on public.streaks for select to authenticated using (private.is_member(couple_id));
create policy proposals_select on public.shared_change_proposals for select to authenticated using (private.is_member(couple_id));
create policy approvals_select on public.shared_change_approvals for select to authenticated
  using (exists (select 1 from public.shared_change_proposals p where p.id = proposal_id and private.is_member(p.couple_id)));
create policy audit_select on public.audit_logs for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));

-- ---------------------------------------------------------------------
-- Datos personales: cada quien lo suyo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['exercises','routines','workouts','water_logs','water_presets','activity_logs','categories','habits','push_subscriptions'] loop
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t || '_delete', t);
  end loop;
end $$;

-- Hijos de rutinas / entrenamientos
create policy routine_ex_all on public.routine_exercises for all to authenticated
  using (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())))
  with check (exists (select 1 from public.routines r where r.id = routine_id and r.user_id = (select auth.uid())));
create policy workout_sets_all on public.workout_sets for all to authenticated
  using (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.workouts w where w.id = workout_id and w.user_id = (select auth.uid())));

-- Hábitos: registro propio (sin edición, solo marcar/desmarcar)
create policy habit_logs_select on public.habit_logs for select to authenticated using (user_id = (select auth.uid()));
create policy habit_logs_insert on public.habit_logs for insert to authenticated with check (user_id = (select auth.uid()));
create policy habit_logs_delete on public.habit_logs for delete to authenticated using (user_id = (select auth.uid()));

-- Descansos: los veo yo y mi pareja; solo los creo/borro yo
create policy rest_days_select on public.rest_days for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));
create policy rest_days_insert on public.rest_days for insert to authenticated with check (user_id = (select auth.uid()));
create policy rest_days_delete on public.rest_days for delete to authenticated using (user_id = (select auth.uid()));

-- Metas y retos: personales editables; compartidos solo por propuesta
create policy goals_select on public.goals for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy goals_insert on public.goals for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id is null and created_by = (select auth.uid()));
create policy goals_update on public.goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id is null);
create policy goals_delete on public.goals for delete to authenticated using (user_id = (select auth.uid()));

create policy challenges_select on public.challenges for select to authenticated
  using (user_id = (select auth.uid()) or private.is_member(couple_id));
create policy challenges_insert on public.challenges for insert to authenticated
  with check (user_id = (select auth.uid()) and couple_id is null and created_by = (select auth.uid()));
create policy challenges_update on public.challenges for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()) and couple_id is null);
create policy challenges_delete on public.challenges for delete to authenticated using (user_id = (select auth.uid()));

create policy badges_select on public.user_badges for select to authenticated
  using (user_id = (select auth.uid()) or private.is_partner(user_id));

-- ---------------------------------------------------------------------
-- Espacio de pareja: ambos ven; cada quien edita/borra lo suyo
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['calendar_events','memories','notes'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.is_member(couple_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.is_member(couple_id) and created_by = (select auth.uid()))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (created_by = (select auth.uid()) and private.is_member(couple_id)) with check (created_by = (select auth.uid()) and private.is_member(couple_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (created_by = (select auth.uid()) and private.is_member(couple_id))', t || '_delete', t);
  end loop;
end $$;

create policy messages_select on public.messages for select to authenticated using (private.is_member(couple_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (private.is_member(couple_id) and sender_id = (select auth.uid()));
create policy messages_delete on public.messages for delete to authenticated
  using (sender_id = (select auth.uid()) and private.is_member(couple_id));
revoke update on public.messages from authenticated;

-- Notificaciones: solo las mías
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));
create policy notifications_delete on public.notifications for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- Realtime: tablas que se sincronizan al instante entre los dos
-- (Realtime respeta las políticas RLS de arriba)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['member_day_status','streak_days','streaks','messages','notifications','shared_change_proposals',
                           'couples','couple_members','calendar_events','memories','notes','streak_rules','rest_days','goals','challenges','profiles'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
