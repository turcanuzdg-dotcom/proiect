-- În Termen — schema de bază
-- Toate tabelele aparțin unui utilizator (user_id = auth.uid()); RLS este activat în migrarea următoare.

-- gen_random_uuid() este nativ în PostgreSQL 13+, nu e nevoie de extensii.

-- ---------------------------------------------------------------------------
-- Utilitare
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  timezone text not null default 'Europe/Chisinau',
  locale text not null default 'ro-RO',
  default_currency text not null default 'MDL',
  default_reminder_days integer[] not null default array[45, 30, 14, 7, 1],
  in_app_notifications boolean not null default true,
  email_notifications boolean not null default false,
  tracked_categories text[] not null default '{}',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_length check (char_length(full_name) <= 120),
  constraint profiles_currency_check check (default_currency in ('MDL', 'RON', 'EUR')),
  constraint profiles_locale_check check (locale in ('ro-RO')),
  constraint profiles_reminder_days_check check (
    default_reminder_days <@ array[45, 30, 14, 7, 1]
  )
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Creează automat profilul la înregistrare.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- family_members
-- ---------------------------------------------------------------------------

create table public.family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  full_name text not null,
  relationship text,
  birth_date date,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint family_members_name_check check (char_length(trim(full_name)) between 1 and 120),
  constraint family_members_relationship_check check (relationship is null or char_length(relationship) <= 60)
);

create index family_members_user_id_idx on public.family_members (user_id);

create trigger family_members_set_updated_at
  before update on public.family_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  family_member_id uuid references public.family_members (id) on delete set null,
  title text not null,
  category text not null,
  issuer text,
  notes text,
  issue_date date,
  expiry_date date,
  currency text,
  amount numeric(12, 2),
  renewal_url text,
  file_path text,
  file_name text,
  file_mime_type text,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint documents_title_check check (char_length(trim(title)) between 1 and 120),
  constraint documents_category_check check (
    category in (
      'personal_documents', 'vehicle', 'insurance', 'home_warranty',
      'bills_subscriptions', 'health', 'family', 'other'
    )
  ),
  constraint documents_currency_check check (currency is null or currency in ('MDL', 'RON', 'EUR')),
  constraint documents_amount_check check (amount is null or amount >= 0),
  constraint documents_dates_check check (
    issue_date is null or expiry_date is null or issue_date <= expiry_date
  ),
  constraint documents_renewal_url_check check (renewal_url is null or renewal_url ~* '^https?://'),
  constraint documents_file_mime_check check (
    file_mime_type is null or file_mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  -- Fișierele stau mereu în dosarul propriului utilizator.
  constraint documents_file_path_check check (file_path is null or file_path like (user_id::text || '/%')),
  constraint documents_notes_check check (notes is null or char_length(notes) <= 2000),
  constraint documents_issuer_check check (issuer is null or char_length(issuer) <= 120)
);

create index documents_user_expiry_idx on public.documents (user_id, expiry_date) where archived_at is null;
create index documents_family_member_idx on public.documents (family_member_id);

create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- reminder_preferences
-- ---------------------------------------------------------------------------

create table public.reminder_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  days_before integer not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint reminder_preferences_days_check check (days_before in (45, 30, 14, 7, 1)),
  constraint reminder_preferences_unique unique (document_id, days_before)
);

create index reminder_preferences_user_idx on public.reminder_preferences (user_id);

-- ---------------------------------------------------------------------------
-- reminders
-- ---------------------------------------------------------------------------

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  title text not null,
  body text,
  remind_at timestamptz not null,
  status text not null default 'pending',
  channel text not null default 'in_app',
  days_before integer,
  snoozed_until timestamptz,
  completed_at timestamptz,
  read_at timestamptz,
  emailed_at timestamptz,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_title_check check (char_length(trim(title)) between 1 and 160),
  constraint reminders_body_check check (body is null or char_length(body) <= 1000),
  constraint reminders_status_check check (status in ('pending', 'snoozed', 'completed', 'dismissed')),
  constraint reminders_channel_check check (channel in ('in_app', 'email')),
  constraint reminders_completed_check check (
    (status = 'completed') = (completed_at is not null)
  ),
  constraint reminders_snoozed_check check (status <> 'snoozed' or snoozed_until is not null)
);

create index reminders_user_due_idx on public.reminders (user_id, status, remind_at);
create index reminders_document_idx on public.reminders (document_id);
create index reminders_email_due_idx on public.reminders (remind_at)
  where channel = 'email' and emailed_at is null and status in ('pending', 'snoozed');

create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- renewals
-- ---------------------------------------------------------------------------

create table public.renewals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  previous_expiry_date date,
  new_expiry_date date,
  previous_file_path text,
  previous_file_name text,
  note text,
  created_at timestamptz not null default now(),
  constraint renewals_note_check check (note is null or char_length(note) <= 500)
);

create index renewals_document_idx on public.renewals (document_id, created_at desc);
create index renewals_user_idx on public.renewals (user_id);

-- ---------------------------------------------------------------------------
-- activity_logs
-- ---------------------------------------------------------------------------

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete cascade,
  action text not null,
  metadata jsonb,
  created_at timestamptz not null default now(),
  constraint activity_logs_action_check check (
    action in (
      'created', 'updated', 'renewed', 'file_uploaded', 'file_removed',
      'reminder_completed', 'reminder_snoozed', 'reminder_created'
    )
  )
);

create index activity_logs_document_idx on public.activity_logs (document_id, created_at desc);
create index activity_logs_user_idx on public.activity_logs (user_id, created_at desc);
