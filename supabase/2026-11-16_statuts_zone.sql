-- 16/11/2026 (demande d'Alexis) : statuts de tous les restos d'une zone en un seul appel,
-- pour que l'appli les précharge autour de l'utilisateur (plus de pastilles grises en dézoomant).
-- Zone limitée à 2° de latitude × 3° de longitude (recentrée si plus grande), 1000 restos max (Paris : ~1,9 s).
insert into public.app_settings(key, value, description)
values ('box_max_results', '1000', 'Restos max renvoyés par get_statuses_in_box')
on conflict (key) do update set value = excluded.value;

create or replace function public.get_statuses_in_box(p_south double precision, p_west double precision,
                                                      p_north double precision, p_east double precision)
returns table(id uuid, status_salle jsonb, status_drive jsonb)
language plpgsql stable security definer set search_path = '' as $$
declare
  clat double precision; clng double precision; hlat double precision; hlng double precision;
begin
  if p_south is null or p_west is null or p_north is null or p_east is null then return; end if;
  clat := (p_south + p_north) / 2; clng := (p_west + p_east) / 2;
  hlat := least(abs(p_north - p_south) / 2, 1.0); hlng := least(abs(p_east - p_west) / 2, 1.5);
  return query
  select e.id,
         case when e.has_dine_in then public.get_service_status(e.id, 'salle') end,
         case when e.has_drive then public.get_service_status(e.id, 'drive') end
  from public.establishments e
  where e.lat between clat - hlat and clat + hlat
    and e.lng between clng - hlng and clng + hlng
  order by (e.lat - clat) ^ 2 + ((e.lng - clng) * cos(radians(clat))) ^ 2
  limit public.setting('box_max_results')::int;
end $$;
revoke all on function public.get_statuses_in_box(double precision, double precision, double precision, double precision) from public;
grant execute on function public.get_statuses_in_box(double precision, double precision, double precision, double precision) to anon, authenticated;
