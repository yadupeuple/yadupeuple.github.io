-- Badges du podium mensuel (28/11/2026, v232, images d'Alexis : outils/src/badges_podium.png → outils/badges_podium.py)
-- Le 1er du mois, les 3 premiers du classement national du mois précédent reçoivent leur badge
-- (même calcul que get_last_month_podium : points des signalements du mois, heure de Paris).
-- Badge donné une seule fois (on le garde), +1 point par badge et +10 si les 3 (catégorie Classement complète).

alter table public.badges drop constraint badges_kind_check;
alter table public.badges add constraint badges_kind_check check (kind = any (array['reports','drive_reports','establishments','cities','referrals','beta','weeks','confirmed','podium']));

insert into public.badges(code, family, name, description, kind, threshold, is_active, sort_order) values
  ('podium1', 'Classement', 'Champion du mois',      'Finir 1er du classement d''un mois', 'podium', 1, true, 26),
  ('podium2', 'Classement', 'Vice-champion du mois', 'Finir 2e du classement d''un mois',  'podium', 2, true, 27),
  ('podium3', 'Classement', 'Podium du mois',        'Finir 3e du classement d''un mois',  'podium', 3, true, 28)
on conflict (code) do update set family = excluded.family, name = excluded.name, description = excluded.description,
  kind = excluded.kind, threshold = excluded.threshold, is_active = excluded.is_active, sort_order = excluded.sort_order;

create or replace function public.award_podium_badges(p_month date default null)
returns int language plpgsql security definer set search_path to '' as $$
declare
  m date := coalesce(date_trunc('month', p_month)::date,
                     (date_trunc('month', now() at time zone 'Europe/Paris') - interval '1 month')::date);
  d0 timestamptz := m::timestamp at time zone 'Europe/Paris';
  d1 timestamptz := (m + interval '1 month')::timestamp at time zone 'Europe/Paris';
  n int;
begin
  insert into public.user_badges(user_id, badge_code)
  select user_id, 'podium' || rk from (
    select s.user_id, row_number() over (order by s.pts desc, p.pseudo) rk
    from (select r.user_id, sum(r.points_awarded) pts from public.reports r
          where r.user_id is not null and r.created_at >= d0 and r.created_at < d1
          group by r.user_id having sum(r.points_awarded) > 0) s
    join public.profiles p on p.id = s.user_id
  ) x where rk <= 3
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.award_podium_badges(date) from public, anon, authenticated;

select cron.schedule('badges-podium', '20 0 1 * *', $$select public.award_podium_badges()$$);

-- Badges du podium utilisables en image de profil (comme les autres badges gagnés)
insert into public.customizations(kind, code, value, min_level, sort_order, is_active, requires_badge) values
  ('avatar', 'badge_podium1', 'icons/badges/podium1.webp', 1, 126, true, 'podium1'),
  ('avatar', 'badge_podium2', 'icons/badges/podium2.webp', 1, 127, true, 'podium2'),
  ('avatar', 'badge_podium3', 'icons/badges/podium3.webp', 1, 128, true, 'podium3')
on conflict do nothing;
