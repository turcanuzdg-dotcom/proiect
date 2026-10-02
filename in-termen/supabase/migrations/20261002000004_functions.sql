-- În Termen — funcții tranzacționale (RPC)
-- Toate rulează cu drepturile apelantului (security invoker), deci RLS rămâne în vigoare.
-- Datele reminderelor sunt calculate în aplicație (lib/reminders) și trimise ca JSON,
-- astfel încât documentul, preferințele, reminderele și jurnalul se scriu împreună sau deloc.
--
-- Formatul unui reminder în p_reminders:
--   {"title": "...", "body": "...", "remind_at": "2026-10-03T06:00:00Z", "channel": "in_app", "days_before": 7}
-- Formatul p_reminder_days:
--   [{"days_before": 45, "enabled": true}, ...]

-- ---------------------------------------------------------------------------
-- Ajutor intern: înlocuiește reminderele active ale unui document
-- ---------------------------------------------------------------------------

create or replace function public._replace_document_reminders(
  p_document_id uuid,
  p_reminders jsonb,
  p_is_demo boolean
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- Reminderele finalizate rămân în istoric; cele active se recalculează.
  delete from reminders
  where document_id = p_document_id
    and status in ('pending', 'snoozed');

  insert into reminders (document_id, title, body, remind_at, channel, days_before, is_demo)
  select
    p_document_id,
    r ->> 'title',
    nullif(r ->> 'body', ''),
    (r ->> 'remind_at')::timestamptz,
    coalesce(nullif(r ->> 'channel', ''), 'in_app'),
    nullif(r ->> 'days_before', '')::integer,
    p_is_demo
  from jsonb_array_elements(coalesce(p_reminders, '[]'::jsonb)) as r;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_document: creează (p_document_id null) sau actualizează un document
-- ---------------------------------------------------------------------------

create or replace function public.save_document(
  p_document_id uuid,
  p_document jsonb,
  p_reminder_days jsonb,
  p_reminders jsonb,
  p_is_demo boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_previous documents%rowtype;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  if p_document_id is null then
    insert into documents (
      family_member_id, title, category, issuer, notes, issue_date, expiry_date,
      currency, amount, renewal_url, file_path, file_name, file_mime_type, is_demo
    )
    values (
      nullif(p_document ->> 'family_member_id', '')::uuid,
      trim(p_document ->> 'title'),
      p_document ->> 'category',
      nullif(trim(p_document ->> 'issuer'), ''),
      nullif(trim(p_document ->> 'notes'), ''),
      nullif(p_document ->> 'issue_date', '')::date,
      nullif(p_document ->> 'expiry_date', '')::date,
      nullif(p_document ->> 'currency', ''),
      nullif(p_document ->> 'amount', '')::numeric,
      nullif(trim(p_document ->> 'renewal_url'), ''),
      nullif(p_document ->> 'file_path', ''),
      nullif(p_document ->> 'file_name', ''),
      nullif(p_document ->> 'file_mime_type', ''),
      p_is_demo
    )
    returning id into v_id;

    insert into activity_logs (document_id, action, metadata)
    values (v_id, 'created', jsonb_build_object('title', trim(p_document ->> 'title')));

    if nullif(p_document ->> 'file_path', '') is not null then
      insert into activity_logs (document_id, action, metadata)
      values (v_id, 'file_uploaded', jsonb_build_object('file_name', p_document ->> 'file_name'));
    end if;
  else
    select * into v_previous
    from documents
    where id = p_document_id and user_id = v_user
    for update;

    if not found then
      raise exception 'document_not_found' using errcode = 'P0002';
    end if;

    update documents set
      family_member_id = nullif(p_document ->> 'family_member_id', '')::uuid,
      title = trim(p_document ->> 'title'),
      category = p_document ->> 'category',
      issuer = nullif(trim(p_document ->> 'issuer'), ''),
      notes = nullif(trim(p_document ->> 'notes'), ''),
      issue_date = nullif(p_document ->> 'issue_date', '')::date,
      expiry_date = nullif(p_document ->> 'expiry_date', '')::date,
      currency = nullif(p_document ->> 'currency', ''),
      amount = nullif(p_document ->> 'amount', '')::numeric,
      renewal_url = nullif(trim(p_document ->> 'renewal_url'), ''),
      file_path = nullif(p_document ->> 'file_path', ''),
      file_name = nullif(p_document ->> 'file_name', ''),
      file_mime_type = nullif(p_document ->> 'file_mime_type', '')
    where id = p_document_id
    returning id into v_id;

    insert into activity_logs (document_id, action, metadata)
    values (
      v_id,
      'updated',
      jsonb_build_object(
        'expiry_changed', v_previous.expiry_date is distinct from nullif(p_document ->> 'expiry_date', '')::date
      )
    );

    if v_previous.file_path is distinct from nullif(p_document ->> 'file_path', '') then
      insert into activity_logs (document_id, action, metadata)
      values (
        v_id,
        case when nullif(p_document ->> 'file_path', '') is null then 'file_removed' else 'file_uploaded' end,
        jsonb_build_object('file_name', coalesce(p_document ->> 'file_name', v_previous.file_name))
      );
    end if;

    delete from reminder_preferences where document_id = v_id;
  end if;

  insert into reminder_preferences (document_id, days_before, enabled)
  select v_id, (d ->> 'days_before')::integer, coalesce((d ->> 'enabled')::boolean, true)
  from jsonb_array_elements(coalesce(p_reminder_days, '[]'::jsonb)) as d;

  perform public._replace_document_reminders(v_id, p_reminders, p_is_demo);

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- renew_document: păstrează istoricul și mută documentul pe noul termen
-- ---------------------------------------------------------------------------

create or replace function public.renew_document(
  p_document_id uuid,
  p_new_expiry_date date,
  p_note text,
  p_file jsonb,
  p_reminders jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_doc documents%rowtype;
  v_renewal_id uuid;
  v_new_file_path text := nullif(p_file ->> 'path', '');
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_doc
  from documents
  where id = p_document_id and user_id = v_user
  for update;

  if not found then
    raise exception 'document_not_found' using errcode = 'P0002';
  end if;

  insert into renewals (
    document_id, previous_expiry_date, new_expiry_date, previous_file_path, previous_file_name, note
  )
  values (
    v_doc.id,
    v_doc.expiry_date,
    p_new_expiry_date,
    case when v_new_file_path is not null then v_doc.file_path end,
    case when v_new_file_path is not null then v_doc.file_name end,
    nullif(trim(p_note), '')
  )
  returning id into v_renewal_id;

  update documents set
    expiry_date = p_new_expiry_date,
    issue_date = case
      when issue_date is not null and p_new_expiry_date is not null and issue_date > p_new_expiry_date then null
      else issue_date
    end,
    file_path = coalesce(v_new_file_path, file_path),
    file_name = case when v_new_file_path is not null then p_file ->> 'name' else file_name end,
    file_mime_type = case when v_new_file_path is not null then p_file ->> 'mime_type' else file_mime_type end
  where id = v_doc.id;

  perform public._replace_document_reminders(v_doc.id, p_reminders, v_doc.is_demo);

  insert into activity_logs (document_id, action, metadata)
  values (
    v_doc.id,
    'renewed',
    jsonb_build_object(
      'previous_expiry_date', v_doc.expiry_date,
      'new_expiry_date', p_new_expiry_date,
      'new_file', v_new_file_path is not null
    )
  );

  return v_renewal_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Date demonstrative
-- p_documents: [{"document": {...}, "reminder_days": [...], "reminders": [...], "assign_to_family_member": true}]
-- ---------------------------------------------------------------------------

create or replace function public.remove_demo_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from reminders where user_id = v_user and is_demo;
  delete from documents where user_id = v_user and is_demo;
  delete from family_members where user_id = v_user and is_demo;
end;
$$;

create or replace function public.seed_demo_data(
  p_family_member jsonb,
  p_documents jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_member_id uuid;
  v_item jsonb;
  v_document jsonb;
  v_count integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- Idempotent: datele demonstrative anterioare se înlocuiesc.
  perform public.remove_demo_data();

  insert into family_members (full_name, relationship, birth_date, is_demo)
  values (
    p_family_member ->> 'full_name',
    nullif(p_family_member ->> 'relationship', ''),
    nullif(p_family_member ->> 'birth_date', '')::date,
    true
  )
  returning id into v_member_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_documents, '[]'::jsonb))
  loop
    v_document := v_item -> 'document';
    if coalesce((v_item ->> 'assign_to_family_member')::boolean, false) then
      v_document := v_document || jsonb_build_object('family_member_id', v_member_id);
    end if;

    perform public.save_document(null, v_document, v_item -> 'reminder_days', v_item -> 'reminders', true);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_my_data: șterge toate rândurile utilizatorului (fișierele se șterg din aplicație)
-- ---------------------------------------------------------------------------

create or replace function public.delete_my_data()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from activity_logs where user_id = v_user;
  delete from renewals where user_id = v_user;
  delete from reminders where user_id = v_user;
  delete from reminder_preferences where user_id = v_user;
  delete from documents where user_id = v_user;
  delete from family_members where user_id = v_user;

  update profiles set
    tracked_categories = '{}',
    default_reminder_days = array[45, 30, 14, 7, 1],
    email_notifications = false
  where id = v_user;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drepturi de execuție: doar utilizatorii autentificați
-- ---------------------------------------------------------------------------

revoke execute on function public._replace_document_reminders(uuid, jsonb, boolean) from public, anon;
revoke execute on function public.save_document(uuid, jsonb, jsonb, jsonb, boolean) from public, anon;
revoke execute on function public.renew_document(uuid, date, text, jsonb, jsonb) from public, anon;
revoke execute on function public.remove_demo_data() from public, anon;
revoke execute on function public.seed_demo_data(jsonb, jsonb) from public, anon;
revoke execute on function public.delete_my_data() from public, anon;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

grant execute on function public._replace_document_reminders(uuid, jsonb, boolean) to authenticated;
grant execute on function public.save_document(uuid, jsonb, jsonb, jsonb, boolean) to authenticated;
grant execute on function public.renew_document(uuid, date, text, jsonb, jsonb) to authenticated;
grant execute on function public.remove_demo_data() to authenticated;
grant execute on function public.seed_demo_data(jsonb, jsonb) to authenticated;
grant execute on function public.delete_my_data() to authenticated;
