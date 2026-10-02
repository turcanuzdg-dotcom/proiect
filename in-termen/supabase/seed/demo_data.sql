-- Date demonstrative FICTIVE pentru un utilizator existent (alternativă la butonul din aplicație).
--
-- Cel mai simplu: în aplicație, Setări → „Adaugă date demonstrative” (sau butonul de pe panoul gol).
-- Butonul calculează reminderele în aplicație (lib/reminders/schedule.ts), exact ca la documentele reale.
--
-- Acest script este pentru dezvoltare locală, rulat din SQL Editor sau psql:
--   psql "$DATABASE_URL" -v email="'tu@exemplu.md'" -f supabase/seed/demo_data.sql
-- Reminderele sunt generate aici în SQL, cu aceleași reguli simplificate (praguri 45/30/14/7/1 la 09:00 Chișinău,
-- fără praguri trecute, plus un reminder de recuperare astăzi).

begin;

-- Rulăm ca utilizatorul ales, ca RLS și valorile implicite (auth.uid()) să se aplice normal.
select set_config('request.jwt.claim.sub', (select id::text from auth.users where email = :email), true);
select set_config('request.jwt.claims', json_build_object('sub', (select id from auth.users where email = :email), 'role', 'authenticated')::text, true);
set local role authenticated;

do $$
declare
  v_today date := (now() at time zone 'Europe/Chisinau')::date;
  v_member uuid;
  v_doc uuid;
  v_item record;
  v_offset integer;
  v_skipped boolean;
  v_reminder_date date;
begin
  if auth.uid() is null then
    raise exception 'Utilizatorul nu există. Verifică adresa de e-mail din parametrul :email.';
  end if;

  perform public.remove_demo_data();

  insert into public.family_members (full_name, relationship, is_demo)
  values ('Ana Popescu', 'Copil', true)
  returning id into v_member;

  for v_item in
    select * from (values
      ('RCA automobil', 'insurance', 12, 1150::numeric, false),
      ('Pașaport', 'personal_documents', 95, null, true),
      ('Revizie tehnică automobil', 'vehicle', 6, null, false),
      ('Garanție frigider', 'home_warranty', 240, 8999::numeric, false),
      ('Abonament internet', 'bills_subscriptions', null, 250::numeric, false),
      ('Carte de identitate', 'personal_documents', 480, null, false),
      ('Verificare anuală detector fum', 'home_warranty', -5, null, false)
    ) as t(title, category, days, amount, for_member)
  loop
    insert into public.documents (title, category, expiry_date, amount, currency, notes, family_member_id, is_demo)
    values (
      v_item.title,
      v_item.category,
      case when v_item.days is null then null else v_today + v_item.days end,
      v_item.amount,
      case when v_item.amount is null then null else 'MDL' end,
      'Exemplu fictiv — date demonstrative.',
      case when v_item.for_member then v_member end,
      true
    )
    returning id into v_doc;

    insert into public.activity_logs (document_id, action, metadata)
    values (v_doc, 'created', jsonb_build_object('title', v_item.title));

    insert into public.reminder_preferences (document_id, days_before, enabled)
    select v_doc, d, true from unnest(array[45, 30, 14, 7, 1]) as d;

    if v_item.days is not null then
      v_skipped := false;
      foreach v_offset in array array[45, 30, 14, 7, 1] loop
        v_reminder_date := v_today + v_item.days - v_offset;
        if v_reminder_date < v_today then
          v_skipped := true;
        else
          insert into public.reminders (document_id, title, body, remind_at, days_before, is_demo)
          values (
            v_doc,
            v_item.title || case when v_offset = 1 then ' expiră mâine' else ' expiră în ' || v_offset || ' zile' end,
            'Verifică termenul și pregătește reînnoirea din timp.',
            (v_reminder_date + time '09:00') at time zone 'Europe/Chisinau',
            v_offset,
            true
          );
        end if;
      end loop;

      if v_skipped and not exists (
        select 1 from public.reminders
        where document_id = v_doc and (remind_at at time zone 'Europe/Chisinau')::date = v_today
      ) then
        insert into public.reminders (document_id, title, body, remind_at, is_demo)
        values (
          v_doc,
          case when v_item.days < 0 then 'Termen depășit: ' || v_item.title else v_item.title || ' — verifică termenul' end,
          'Verifică termenul cât mai curând.',
          (v_today + time '09:00') at time zone 'Europe/Chisinau',
          true
        );
      end if;
    end if;
  end loop;
end;
$$;

commit;
