-- Tirage au sort du mois avec la roue (28/11/2026, v233, idée d'Alexis)
-- 1 signalement validé (points > 0) dans le mois = 1 ticket, sans minimum (réglage draw_min_reports = 1, modifiable).
-- Les 3 premiers du classement du mois (podium) ne participent pas au tirage du même mois.
-- La roue tourne au hasard dans l'appli (compte admin) ; le résultat officiel est enregistré dans draws (1 par mois).

insert into public.app_settings(key, value, description)
values ('draw_min_reports', 1, 'Tirage au sort : signalements validés minimum dans le mois pour être sur la roue')
on conflict (key) do nothing;

create table if not exists public.draws (
  month         date primary key,              -- 1er jour du mois tiré
  user_id       uuid not null references public.profiles(id) on delete cascade,
  pseudo        text not null,                 -- pseudo au moment du tirage
  tickets       int  not null,
  total_tickets int  not null,
  participants  int  not null,
  created_at    timestamptz not null default now(),
  created_by    uuid
);
alter table public.draws enable row level security;   -- aucune règle : lecture seulement via les fonctions

-- Mois par défaut : le mois précédent (heure de Paris)
create or replace function public.draw_month(p_month date)
returns date language sql stable set search_path to '' as $$
  select coalesce(date_trunc('month', p_month)::date,
                  (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month')::date)
$$;

-- Participants et tickets (sans les 3 du podium)
create or replace function public.draw_entries(p_month date)
returns table(user_id uuid, pseudo text, tickets int)
language sql stable security definer set search_path to '' as $$
  with b as (select m, m::timestamp at time zone 'Europe/Paris' d0,
                    (m + interval '1 month')::timestamp at time zone 'Europe/Paris' d1
             from (select public.draw_month(p_month) m) x),
  s as (select r.user_id, count(*) filter (where r.points_awarded > 0) nb, sum(r.points_awarded) pts
        from public.reports r, b where r.user_id is not null and r.created_at >= b.d0 and r.created_at < b.d1
        group by r.user_id),
  podium as (select s.user_id from s join public.profiles p on p.id = s.user_id
             where s.pts > 0 order by s.pts desc, p.pseudo limit 3)
  select s.user_id, p.pseudo, s.nb::int
  from s join public.profiles p on p.id = s.user_id
  where s.nb >= public.setting('draw_min_reports')::int
    and s.user_id not in (select podium.user_id from podium)
  order by s.nb desc, p.pseudo
$$;
revoke all on function public.draw_entries(date) from public, anon, authenticated;

-- Pour la roue (admin seulement) : participants (pseudo + tickets, jamais d'identifiant) + tirage déjà fait ?
create or replace function public.get_draw_wheel(p_month date default null)
returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare m date := public.draw_month(p_month);
begin
  if not public.is_app_admin() then return jsonb_build_object('ok', false, 'message', 'Réservé à l''organisateur.'); end if;
  return jsonb_build_object('ok', true, 'month', m,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('pseudo', e.pseudo, 'tickets', e.tickets)) from public.draw_entries(m) e), '[]'::jsonb),
    'done', (select jsonb_build_object('pseudo', d.pseudo, 'tickets', d.tickets, 'total_tickets', d.total_tickets,
                                       'participants', d.participants, 'created_at', d.created_at)
             from public.draws d where d.month = m));
end $$;
revoke all on function public.get_draw_wheel(date) from public, anon;
grant execute on function public.get_draw_wheel(date) to authenticated;

-- Enregistrer le gagnant officiel (admin seulement, une seule fois par mois, mois terminé)
create or replace function public.save_draw_result(p_month date, p_pseudo text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare m date := public.draw_month(p_month); e record; tot int; nb int;
begin
  if not public.is_app_admin() then return jsonb_build_object('ok', false, 'message', 'Réservé à l''organisateur.'); end if;
  if m >= date_trunc('month', now() at time zone 'Europe/Paris')::date then
    return jsonb_build_object('ok', false, 'message', 'Le mois n''est pas terminé : tirage d''essai seulement.');
  end if;
  if exists (select 1 from public.draws d where d.month = m) then
    return jsonb_build_object('ok', false, 'message', 'Le tirage de ce mois est déjà enregistré.');
  end if;
  select sum(x.tickets), count(*) into tot, nb from public.draw_entries(m) x;
  select * into e from public.draw_entries(m) x where x.pseudo = p_pseudo;
  if e.user_id is null then return jsonb_build_object('ok', false, 'message', 'Ce pseudo ne fait pas partie du tirage.'); end if;
  insert into public.draws(month, user_id, pseudo, tickets, total_tickets, participants, created_by)
  values (m, e.user_id, e.pseudo, e.tickets, tot, nb, auth.uid());
  return jsonb_build_object('ok', true, 'pseudo', e.pseudo, 'tickets', e.tickets, 'total_tickets', tot, 'participants', nb);
end $$;
revoke all on function public.save_draw_result(date, text) from public, anon;
grant execute on function public.save_draw_result(date, text) to authenticated;
