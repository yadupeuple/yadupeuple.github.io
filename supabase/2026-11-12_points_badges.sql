-- Y'a du peuple ? — Points des badges (décision d'Alexis, 12/11/2026), ajoutés aux points normaux :
-- +1 point par badge obtenu, +10 points quand toutes les badges actifs d'une catégorie sont obtenus (une seule fois).
create table if not exists public.badge_family_bonus (
  user_id uuid not null references public.profiles(id) on delete cascade,
  family text not null,
  awarded_at timestamptz not null default now(),
  primary key (user_id, family)
);
alter table public.badge_family_bonus enable row level security;

insert into public.app_settings(key, value, description) values
  ('badge_points', 1, 'Points gagnés par badge obtenu'),
  ('badge_family_bonus', 10, 'Points gagnés quand une catégorie de badges est complète')
on conflict (key) do nothing;

create or replace function public.badge_points()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  fam text;
  n_active integer;
  n_earned integer;
begin
  update public.profiles set points = points + public.setting('badge_points')::int where id = new.user_id;
  select b.family into fam from public.badges b where b.code = new.badge_code;
  select count(*) into n_active from public.badges b where b.family = fam and b.is_active;
  select count(*) into n_earned from public.user_badges ub join public.badges b on b.code = ub.badge_code
   where ub.user_id = new.user_id and b.family = fam and b.is_active;
  if n_active > 0 and n_earned >= n_active then
    insert into public.badge_family_bonus(user_id, family) values (new.user_id, fam) on conflict do nothing;
    if found then
      update public.profiles set points = points + public.setting('badge_family_bonus')::int where id = new.user_id;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists user_badges_points on public.user_badges;
create trigger user_badges_points after insert on public.user_badges
for each row execute function public.badge_points();

-- Rattrapage : badges déjà obtenus avant cette règle
update public.profiles p set points = points + x.n * public.setting('badge_points')::int
from (select user_id, count(*) n from public.user_badges group by user_id) x
where x.user_id = p.id;
with done as (
  select ub.user_id, b.family
  from public.user_badges ub join public.badges b on b.code = ub.badge_code and b.is_active
  group by ub.user_id, b.family
  having count(*) = (select count(*) from public.badges b2 where b2.family = b.family and b2.is_active)
), ins as (
  insert into public.badge_family_bonus(user_id, family) select user_id, family from done
  on conflict do nothing returning user_id
)
update public.profiles p set points = points + public.setting('badge_family_bonus')::int * c.n
from (select user_id, count(*) n from ins group by user_id) c where c.user_id = p.id;
