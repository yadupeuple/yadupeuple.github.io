-- 15/11/2026 : « Plus calme à côté » cliquable → renvoie aussi l'id du resto.
-- Même règle que calmer_nearby (même ville, salle plus calme), qui reste en place.
create or replace function public.calmer_nearby_info(p_id uuid)
returns jsonb language sql stable set search_path = public, pg_temp as $fn$
  with lv as (
    select e.id, e.name,
      case public.get_service_status(e.id, 'salle') ->> 'level'
        when 'calme' then 0 when 'modere' then 1 when 'frequente' then 2 when 'tres_frequente' then 3 end as l
    from establishments e
    where e.id <> p_id and e.has_dine_in
      and e.city = (select m.city from establishments m where m.id = p_id)
  ), me as (
    select case public.get_service_status(p_id, 'salle') ->> 'level'
      when 'calme' then 0 when 'modere' then 1 when 'frequente' then 2 when 'tres_frequente' then 3 end as l
  )
  select coalesce((
    select jsonb_build_object('id', lv.id, 'name', lv.name, 'label', 'Plus calme à côté : ' || lv.name)
    from lv, me where lv.l < me.l order by lv.l, lv.name limit 1), '{}'::jsonb)
$fn$;
grant execute on function public.calmer_nearby_info(uuid) to anon, authenticated;
