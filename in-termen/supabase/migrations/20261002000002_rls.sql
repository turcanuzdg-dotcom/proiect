-- În Termen — Row Level Security
-- Regula generală: un utilizator autentificat vede și modifică doar rândurile cu user_id = auth.uid().
-- Legăturile către alte rânduri (document, membru de familie) trebuie să aparțină aceluiași utilizator.

alter table public.profiles enable row level security;
alter table public.family_members enable row level security;
alter table public.documents enable row level security;
alter table public.reminder_preferences enable row level security;
alter table public.reminders enable row level security;
alter table public.renewals enable row level security;
alter table public.activity_logs enable row level security;

-- Anonimii nu au acces la nimic.
revoke all on all tables in schema public from anon;

-- Ajutoare (security definer ca să nu depindă de RLS-ul tabelului verificat; returnează doar boolean).
create or replace function public.owns_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.documents d
    where d.id = p_document_id and d.user_id = (select auth.uid())
  );
$$;

create or replace function public.owns_family_member(p_family_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.family_members f
    where f.id = p_family_member_id and f.user_id = (select auth.uid())
  );
$$;

revoke execute on function public.owns_document(uuid) from public, anon;
revoke execute on function public.owns_family_member(uuid) from public, anon;
grant execute on function public.owns_document(uuid) to authenticated;
grant execute on function public.owns_family_member(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------

create policy "family_members_select_own" on public.family_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "family_members_insert_own" on public.family_members
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "family_members_update_own" on public.family_members
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "family_members_delete_own" on public.family_members
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create policy "documents_select_own" on public.documents
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "documents_insert_own" on public.documents
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (family_member_id is null or public.owns_family_member(family_member_id))
  );

create policy "documents_update_own" on public.documents
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (family_member_id is null or public.owns_family_member(family_member_id))
  );

create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reminder_preferences
-- ---------------------------------------------------------------------------

create policy "reminder_preferences_select_own" on public.reminder_preferences
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reminder_preferences_insert_own" on public.reminder_preferences
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_document(document_id));

create policy "reminder_preferences_update_own" on public.reminder_preferences
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.owns_document(document_id));

create policy "reminder_preferences_delete_own" on public.reminder_preferences
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------

create policy "reminders_select_own" on public.reminders
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "reminders_insert_own" on public.reminders
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (document_id is null or public.owns_document(document_id))
  );

create policy "reminders_update_own" on public.reminders
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (document_id is null or public.owns_document(document_id))
  );

create policy "reminders_delete_own" on public.reminders
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- renewals (istoric: se pot citi, adăuga și șterge, nu modifica)
-- ---------------------------------------------------------------------------

create policy "renewals_select_own" on public.renewals
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "renewals_insert_own" on public.renewals
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_document(document_id));

create policy "renewals_delete_own" on public.renewals
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- activity_logs (jurnal: se poate citi, adăuga și șterge, nu modifica)
-- ---------------------------------------------------------------------------

create policy "activity_logs_select_own" on public.activity_logs
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy "activity_logs_insert_own" on public.activity_logs
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (document_id is null or public.owns_document(document_id))
  );

create policy "activity_logs_delete_own" on public.activity_logs
  for delete to authenticated
  using (user_id = (select auth.uid()));
