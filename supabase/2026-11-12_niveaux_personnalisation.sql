-- Y'a du peuple ? — Niveaux 1 à 100, avatars et bannières de profil débloquables
-- Barème : points nécessaires ≈ 10 × (niveau − 1)^1,8 (arrondi à 5). Niv. 10 = 520 pts, 50 = 11 025, 100 = 39 095.
-- Les 6 anciens niveaux sont mis à jour (aucune ligne supprimée), puis 7 à 100 ajoutés.

insert into public.levels(level, name, min_points) values
  (1, 'Nouveau', 0),
  (2, 'Nouveau', 10),
  (3, 'Nouveau', 35),
  (4, 'Nouveau', 70),
  (5, 'Curieux', 120),
  (6, 'Curieux', 180),
  (7, 'Curieux', 250),
  (8, 'Curieux', 330),
  (9, 'Curieux', 420),
  (10, 'Habitué', 520),
  (11, 'Habitué', 630),
  (12, 'Habitué', 750),
  (13, 'Habitué', 875),
  (14, 'Habitué', 1010),
  (15, 'Habitué', 1155),
  (16, 'Habitué', 1310),
  (17, 'Habitué', 1470),
  (18, 'Habitué', 1640),
  (19, 'Habitué', 1820),
  (20, 'Connaisseur', 2005),
  (21, 'Connaisseur', 2195),
  (22, 'Connaisseur', 2400),
  (23, 'Connaisseur', 2610),
  (24, 'Connaisseur', 2825),
  (25, 'Connaisseur', 3050),
  (26, 'Connaisseur', 3285),
  (27, 'Connaisseur', 3525),
  (28, 'Connaisseur', 3770),
  (29, 'Connaisseur', 4025),
  (30, 'Expert local', 4290),
  (31, 'Expert local', 4560),
  (32, 'Expert local', 4835),
  (33, 'Expert local', 5120),
  (34, 'Expert local', 5410),
  (35, 'Expert local', 5710),
  (36, 'Expert local', 6015),
  (37, 'Expert local', 6330),
  (38, 'Expert local', 6650),
  (39, 'Expert local', 6975),
  (40, 'Éclaireur', 7310),
  (41, 'Éclaireur', 7650),
  (42, 'Éclaireur', 8000),
  (43, 'Éclaireur', 8355),
  (44, 'Éclaireur', 8715),
  (45, 'Éclaireur', 9085),
  (46, 'Éclaireur', 9460),
  (47, 'Éclaireur', 9840),
  (48, 'Éclaireur', 10230),
  (49, 'Éclaireur', 10625),
  (50, 'As du signalement', 11025),
  (51, 'As du signalement', 11435),
  (52, 'As du signalement', 11845),
  (53, 'As du signalement', 12270),
  (54, 'As du signalement', 12695),
  (55, 'As du signalement', 13130),
  (56, 'As du signalement', 13570),
  (57, 'As du signalement', 14020),
  (58, 'As du signalement', 14475),
  (59, 'As du signalement', 14935),
  (60, 'Vétéran', 15400),
  (61, 'Vétéran', 15875),
  (62, 'Vétéran', 16355),
  (63, 'Vétéran', 16840),
  (64, 'Vétéran', 17330),
  (65, 'Vétéran', 17830),
  (66, 'Vétéran', 18335),
  (67, 'Vétéran', 18845),
  (68, 'Vétéran', 19360),
  (69, 'Vétéran', 19885),
  (70, 'Maître du Drive', 20415),
  (71, 'Maître du Drive', 20950),
  (72, 'Maître du Drive', 21490),
  (73, 'Maître du Drive', 22040),
  (74, 'Maître du Drive', 22595),
  (75, 'Maître du Drive', 23155),
  (76, 'Maître du Drive', 23720),
  (77, 'Maître du Drive', 24290),
  (78, 'Maître du Drive', 24870),
  (79, 'Maître du Drive', 25455),
  (80, 'Légende', 26045),
  (81, 'Légende', 26640),
  (82, 'Légende', 27245),
  (83, 'Légende', 27855),
  (84, 'Légende', 28465),
  (85, 'Légende', 29085),
  (86, 'Légende', 29715),
  (87, 'Légende', 30345),
  (88, 'Légende', 30985),
  (89, 'Légende', 31630),
  (90, 'Mythe vivant', 32280),
  (91, 'Mythe vivant', 32935),
  (92, 'Mythe vivant', 33595),
  (93, 'Mythe vivant', 34260),
  (94, 'Mythe vivant', 34935),
  (95, 'Mythe vivant', 35615),
  (96, 'Mythe vivant', 36300),
  (97, 'Mythe vivant', 36990),
  (98, 'Mythe vivant', 37685),
  (99, 'Mythe vivant', 38390),
  (100, 'Y''a du peuple !', 39095)
on conflict (level) do update set name = excluded.name, min_points = excluded.min_points;

-- Catalogue de personnalisation (seulement les images proposées par l'appli)
create table if not exists public.customizations (
  kind text not null check (kind in ('avatar', 'banner')),
  code text not null,
  value text not null,          -- emoji (avatar) ou dégradé CSS (bannière)
  min_level integer not null default 1,
  sort_order integer not null default 0,
  primary key (kind, code)
);
alter table public.customizations enable row level security;
drop policy if exists customizations_read on public.customizations;
create policy customizations_read on public.customizations for select using (true);
grant select on public.customizations to anon, authenticated;

insert into public.customizations(kind, code, value, min_level, sort_order) values
  ('avatar', 'burger', '🍔', 1, 0),
  ('avatar', 'frites', '🍟', 1, 1),
  ('avatar', 'tacos', '🌮', 1, 2),
  ('avatar', 'pizza', '🍕', 1, 3),
  ('avatar', 'soda', '🥤', 5, 4),
  ('avatar', 'hotdog', '🌭', 10, 5),
  ('avatar', 'poulet', '🍗', 15, 6),
  ('avatar', 'donut', '🍩', 20, 7),
  ('avatar', 'voiture', '🚗', 25, 8),
  ('avatar', 'renard', '🦊', 30, 9),
  ('avatar', 'chouette', '🦉', 40, 10),
  ('avatar', 'ours', '🐻', 50, 11),
  ('avatar', 'lion', '🦁', 60, 12),
  ('avatar', 'licorne', '🦄', 70, 13),
  ('avatar', 'dragon', '🐉', 80, 14),
  ('avatar', 'couronne', '👑', 90, 15),
  ('avatar', 'fusee', '🚀', 100, 16),
  ('banner', 'nuit', 'linear-gradient(135deg,#0B1F3A,#16325C)', 1, 0),
  ('banner', 'lagon', 'linear-gradient(135deg,#0F766E,#14B8A6)', 1, 1),
  ('banner', 'sunset', 'linear-gradient(135deg,#F97316,#DB2777)', 10, 2),
  ('banner', 'foret', 'linear-gradient(135deg,#166534,#65A30D)', 20, 3),
  ('banner', 'ocean', 'linear-gradient(135deg,#1D4ED8,#06B6D4)', 30, 4),
  ('banner', 'neon', 'linear-gradient(135deg,#7C3AED,#EC4899)', 40, 5),
  ('banner', 'or', 'linear-gradient(135deg,#B45309,#F5A524,#FDE68A)', 50, 6),
  ('banner', 'braise', 'linear-gradient(135deg,#7F1D1D,#EF4444,#F59E0B)', 70, 7),
  ('banner', 'aurore', 'linear-gradient(135deg,#0B1F3A,#7C3AED,#14B8A6,#22C55E)', 90, 8),
  ('banner', 'legende', 'linear-gradient(135deg,#111827,#F5A524,#EF4444,#7C3AED)', 100, 9)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level, sort_order = excluded.sort_order;

alter table public.profiles add column if not exists avatar text not null default 'burger';
alter table public.profiles add column if not exists banner text not null default 'nuit';

-- Choisir son avatar / sa bannière (contrôle du niveau requis côté base)
create or replace function public.set_customization(p_kind text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  uid uuid := auth.uid();
  need integer;
  my_level integer;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'message', 'Connecte-toi d''abord.');
  end if;
  select c.min_level into need from public.customizations c where c.kind = p_kind and c.code = p_code;
  if need is null then
    return jsonb_build_object('ok', false, 'message', 'Choix inconnu.');
  end if;
  select max(l.level) into my_level from public.levels l
   where l.min_points <= (select p.points from public.profiles p where p.id = uid);
  if coalesce(my_level, 1) < need then
    return jsonb_build_object('ok', false, 'message', format('Débloqué au niveau %s.', need));
  end if;
  if p_kind = 'avatar' then
    update public.profiles set avatar = p_code where id = uid;
  else
    update public.profiles set banner = p_code where id = uid;
  end if;
  return jsonb_build_object('ok', true);
end;
$function$;
grant execute on function public.set_customization(text, text) to authenticated;

-- Profil : avatar et bannière
create or replace function public.get_my_profile()
returns jsonb
language sql
stable security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'pseudo', p.pseudo,
    'points', p.points,
    'level', l.level,
    'level_name', l.name,
    'next_level_at', (
      select min(x.min_points) from public.levels x where x.min_points > p.points
    ),
    'badges', coalesce((
      select jsonb_agg(ub.badge_code order by ub.earned_at)
      from public.user_badges ub where ub.user_id = p.id
    ), '[]'::jsonb),
    'member_since', p.created_at,
    'reports_total', (select count(*) from public.reports r where r.user_id = p.id),
    'reports_30d', (select count(*) from public.reports r where r.user_id = p.id
                    and r.created_at > now() - interval '30 days'),
    'restos_total', (select count(distinct r.establishment_id) from public.reports r where r.user_id = p.id),
    'top_resto', (
      select e.name from public.reports r
      join public.establishments e on e.id = r.establishment_id
      where r.user_id = p.id
      group by e.id, e.name
      order by count(*) desc, max(r.created_at) desc
      limit 1
    ),
    'avatar', p.avatar,
    'banner', p.banner,
    'ref_code', p.ref_code,
    'referrals', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is not null),
    'referrals_pending', (select count(*) from public.profiles f where f.referred_by = p.id and f.referral_rewarded_at is null),
    'parrain', (select x.pseudo from public.profiles x where x.id = p.referred_by),
    'can_set_referrer', (p.referred_by is null
      and p.created_at > now() - make_interval(days => public.setting('referral_window_days')::int)
      and not exists (select 1 from public.reports r where r.user_id = p.id and r.points_awarded > 0))
  )
  from public.profiles p
  join lateral (
    select lv.level, lv.name
    from public.levels lv
    where lv.min_points <= p.points
    order by lv.min_points desc
    limit 1
  ) l on true
  where p.id = auth.uid()
$function$;
