-- Testeurs (15/11/2026) : badge « Testeur fondateur » donné au 1er signalement validé tant que beta_open = 1,
-- et avis des utilisateurs (table feedback, envoi par la fonction submit_feedback, lecture réservée à Claude/Supabase).

insert into public.app_settings(key, value, description)
values ('beta_open', 1, '1 = phase de test : badge Testeur fondateur au 1er signalement validé ; mettre 0 au lancement')
on conflict (key) do nothing;

alter table public.badges drop constraint if exists badges_kind_check;
alter table public.badges add constraint badges_kind_check check (kind = any (array['reports','drive_reports','establishments','cities','referrals','beta']));

insert into public.badges (code, family, name, description, kind, threshold, is_active, sort_order)
values ('testeur', 'Spécial', 'Testeur fondateur', 'A testé l''appli avant son lancement', 'beta', 1, true, 20)
on conflict (code) do update set name = excluded.name, description = excluded.description, kind = excluded.kind,
  threshold = excluded.threshold, family = excluded.family, is_active = true;

create or replace function public.award_badges(p_user uuid)
returns text[] language plpgsql security definer set search_path = '' as $function$
declare
  c_all integer; c_drive integer; c_est integer; c_city integer; c_ref integer; beta boolean; codes text[];
begin
  select count(*) filter (where r.points_awarded > 0),
         count(*) filter (where r.points_awarded > 0 and r.service = 'drive'),
         count(distinct r.establishment_id) filter (where r.points_awarded > 0)
  into c_all, c_drive, c_est from public.reports r where r.user_id = p_user;
  select count(distinct e.city) into c_city from public.reports r
  join public.establishments e on e.id = r.establishment_id where r.user_id = p_user and r.points_awarded > 0;
  select count(*) into c_ref from public.profiles f where f.referred_by = p_user and f.referral_rewarded_at is not null;
  select coalesce((select s.value = 1 from public.app_settings s where s.key = 'beta_open'), false) into beta;
  with inserted as (
    insert into public.user_badges(user_id, badge_code)
    select p_user, b.code from public.badges b
    where b.is_active and b.kind is not null
      and ((b.kind = 'reports' and c_all >= b.threshold)
        or (b.kind = 'drive_reports' and c_drive >= b.threshold)
        or (b.kind = 'establishments' and c_est >= b.threshold)
        or (b.kind = 'cities' and c_city >= b.threshold)
        or (b.kind = 'referrals' and c_ref >= b.threshold)
        or (b.kind = 'beta' and beta and c_all >= b.threshold))
    on conflict do nothing
    returning badge_code)
  select coalesce(array_agg(badge_code), '{}'::text[]) into codes from inserted;
  return codes;
end; $function$;

-- Avis
create table if not exists public.feedback (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  message text not null check (char_length(message) between 3 and 2000),
  context text check (char_length(context) <= 500),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
revoke all on public.feedback from anon, authenticated;

create or replace function public.submit_feedback(p_message text, p_context text default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare uid uuid := auth.uid(); n int; msg text := btrim(coalesce(p_message, ''));
begin
  if char_length(msg) < 3 then return jsonb_build_object('ok', false, 'message', 'Écris quelques mots 🙂'); end if;
  if char_length(msg) > 2000 then return jsonb_build_object('ok', false, 'message', 'Message trop long (2 000 caractères maximum).'); end if;
  select count(*) into n from public.feedback f
   where f.created_at > now() - interval '1 day' and (f.user_id = uid or (uid is null and f.user_id is null));
  if (uid is null and n >= 50) or (uid is not null and n >= 10) then
    return jsonb_build_object('ok', false, 'message', 'Merci ! Tu as déjà envoyé beaucoup d''avis aujourd''hui, réessaie demain.');
  end if;
  insert into public.feedback(user_id, message, context) values (uid, msg, left(p_context, 500));
  return jsonb_build_object('ok', true, 'message', 'Merci, ton avis est bien arrivé !');
end $fn$;
revoke all on function public.submit_feedback(text, text) from public;
grant execute on function public.submit_feedback(text, text) to anon, authenticated;

-- Testeurs déjà actifs : badge tout de suite
select u.id, public.award_badges(u.id) from public.profiles u where exists (select 1 from public.reports r where r.user_id = u.id and r.points_awarded > 0);
