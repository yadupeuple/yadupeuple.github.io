-- 15/11/2026 (Alexis) : « Plus calme à côté » = le resto plus calme LE PLUS PROCHE (≤ 5 km), pas le plus calme de la ville.
-- Ex. : resto « Animé » → le plus proche qui est « Un peu de monde » ou « Calme ».
create or replace function public.calmer_nearby_info(p_id uuid)
returns jsonb language plpgsql stable set search_path = public, pg_temp as $fn$
declare me record; my_l int; c record; l int;
begin
  select e.lat, e.lng into me from establishments e where e.id = p_id;
  if not found then return '{}'::jsonb; end if;
  my_l := case public.get_service_status(p_id, 'salle') ->> 'level'
    when 'calme' then 0 when 'modere' then 1 when 'frequente' then 2 when 'tres_frequente' then 3 end;
  if my_l is null or my_l = 0 then return '{}'::jsonb; end if;
  for c in
    select e.id, e.name, public.distance_m(me.lat, me.lng, e.lat, e.lng) as d
    from establishments e
    where e.id <> p_id and e.has_dine_in
      and e.lat between me.lat - 0.046 and me.lat + 0.046
      and e.lng between me.lng - 0.07 and me.lng + 0.07
    order by 3 limit 25
  loop
    exit when c.d > 5000;
    l := case public.get_service_status(c.id, 'salle') ->> 'level'
      when 'calme' then 0 when 'modere' then 1 when 'frequente' then 2 when 'tres_frequente' then 3 end;
    if l is not null and l < my_l then
      return jsonb_build_object('id', c.id, 'name', c.name, 'distance_m', round(c.d)::int,
        'label', 'Plus calme à côté : ' || c.name);
    end if;
  end loop;
  return '{}'::jsonb;
end; $fn$;
grant execute on function public.calmer_nearby_info(uuid) to anon, authenticated;
