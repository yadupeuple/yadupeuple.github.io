-- 24/11/2026 : cacher des restos sans les supprimer (demande d'Alexis : Buffalo Grill n'est pas du fast-food).
-- Réafficher : update establishments set is_hidden = false where brand = 'Buffalo Grill';

alter table public.establishments add column if not exists is_hidden boolean not null default false;
create index if not exists establishments_visible_idx on public.establishments (lat, lng) where not is_hidden;

update public.establishments set is_hidden = true where brand = 'Buffalo Grill';

-- Lecture directe depuis l'appli : seulement les restos visibles
drop policy if exists "lecture publique etablissements" on public.establishments;
create policy "lecture publique etablissements" on public.establishments
  for select using (not is_hidden);

-- Fonctions (SECURITY DEFINER, donc hors RLS) : on ajoute le filtre dans leur texte
do $$
declare d text; f text;
begin
  foreach f in array array['get_nearby_establishments','get_statuses_in_box','search_establishments'] loop
    select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = f;
    if position('is_hidden' in d) = 0 then
      d := replace(d, 'from public.establishments e',
                      'from (select * from public.establishments x where not x.is_hidden) e');
      execute d;
    end if;
  end loop;

  select pg_get_functiondef('public.calmer_nearby_info(uuid)'::regprocedure) into d;
  if position('is_hidden' in d) = 0 then
    execute replace(d, 'where e.id <> p_id and e.has_dine_in', 'where not e.is_hidden and e.id <> p_id and e.has_dine_in');
  end if;

  select pg_get_functiondef('public.calmer_nearby(uuid)'::regprocedure) into d;
  if position('is_hidden' in d) = 0 then
    execute replace(d, 'where e.id <> p_id and e.has_dine_in', 'where not e.is_hidden and e.id <> p_id and e.has_dine_in');
  end if;
end $$;

-- 24/11/2026 (suite) : Flunch caché aussi (cafétéria, pas du fast-food), accord d'Alexis.
update public.establishments set is_hidden = true where brand = 'Flunch';
