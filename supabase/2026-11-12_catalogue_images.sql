-- Y'a du peuple ? — Catalogue final : 30 images de profil et 16 bannières (images fournies par Alexis, 12/11/2026)
-- Paliers : 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100.
-- Aucune ligne supprimée : les anciens choix sont seulement désactivés (is_active = false).
alter table public.customizations add column if not exists is_active boolean not null default true;
update public.customizations set is_active = false;
insert into public.customizations(kind, code, value, min_level, sort_order, is_active) values
  ('avatar', 'burger', 'icons/avatars/burger.webp', 1, 0, true),
  ('avatar', 'frites', 'icons/avatars/frites.webp', 1, 1, true),
  ('avatar', 'pizza', 'icons/avatars/pizza.webp', 1, 2, true),
  ('avatar', 'soda', 'icons/avatars/soda.webp', 1, 3, true),
  ('avatar', 'hotdog', 'icons/avatars/hotdog.webp', 1, 4, true),
  ('avatar', 'tacos', 'icons/avatars/tacos.webp', 1, 5, true),
  ('avatar', 'popcorn', 'icons/avatars/popcorn.webp', 5, 6, true),
  ('avatar', 'donut', 'icons/avatars/donut.webp', 5, 7, true),
  ('avatar', 'cupcake', 'icons/avatars/cupcake.webp', 10, 8, true),
  ('avatar', 'coeur', 'icons/avatars/coeur.webp', 10, 9, true),
  ('avatar', 'etoile', 'icons/avatars/etoile.webp', 15, 10, true),
  ('avatar', 'voiture', 'icons/avatars/voiture.webp', 15, 11, true),
  ('avatar', 'chat', 'icons/avatars/chat.webp', 20, 12, true),
  ('avatar', 'chien', 'icons/avatars/chien.webp', 20, 13, true),
  ('avatar', 'panda', 'icons/avatars/panda.webp', 25, 14, true),
  ('avatar', 'renard', 'icons/avatars/renard.webp', 25, 15, true),
  ('avatar', 'chouette', 'icons/avatars/chouette.webp', 30, 16, true),
  ('avatar', 'ours', 'icons/avatars/ours.webp', 30, 17, true),
  ('avatar', 'trefle', 'icons/avatars/trefle.webp', 35, 18, true),
  ('avatar', 'eclair', 'icons/avatars/eclair.webp', 35, 19, true),
  ('avatar', 'flamme', 'icons/avatars/flamme.webp', 40, 20, true),
  ('avatar', 'lunettes', 'icons/avatars/lunettes.webp', 40, 21, true),
  ('avatar', 'lion', 'icons/avatars/lion.webp', 45, 22, true),
  ('avatar', 'medaille', 'icons/avatars/medaille.webp', 45, 23, true),
  ('avatar', 'trophee', 'icons/avatars/trophee.webp', 50, 24, true),
  ('avatar', 'licorne', 'icons/avatars/licorne.webp', 60, 25, true),
  ('avatar', 'dragon', 'icons/avatars/dragon.webp', 70, 26, true),
  ('avatar', 'diamant', 'icons/avatars/diamant.webp', 80, 27, true),
  ('avatar', 'couronne', 'icons/avatars/couronne.webp', 90, 28, true),
  ('avatar', 'fusee', 'icons/avatars/fusee.webp', 100, 29, true),
  ('banner', 'nuit', 'icons/banners/nuit.webp', 1, 0, true),
  ('banner', 'sunset', 'icons/banners/sunset.webp', 5, 1, true),
  ('banner', 'plage', 'icons/banners/plage.webp', 10, 2, true),
  ('banner', 'foret', 'icons/banners/foret.webp', 15, 3, true),
  ('banner', 'montagne', 'icons/banners/montagne.webp', 20, 4, true),
  ('banner', 'hiver', 'icons/banners/hiver.webp', 25, 5, true),
  ('banner', 'printemps', 'icons/banners/printemps.webp', 30, 6, true),
  ('banner', 'automne', 'icons/banners/automne.webp', 35, 7, true),
  ('banner', 'ville', 'icons/banners/ville.webp', 40, 8, true),
  ('banner', 'vagues', 'icons/banners/vagues.webp', 45, 9, true),
  ('banner', 'tropical', 'icons/banners/tropical.webp', 50, 10, true),
  ('banner', 'phare', 'icons/banners/phare.webp', 60, 11, true),
  ('banner', 'geometrique', 'icons/banners/geometrique.webp', 70, 12, true),
  ('banner', 'confettis', 'icons/banners/confettis.webp', 80, 13, true),
  ('banner', 'retro', 'icons/banners/retro.webp', 90, 14, true),
  ('banner', 'espace', 'icons/banners/espace.webp', 100, 15, true)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level,
  sort_order = excluded.sort_order, is_active = true;

-- Profils qui avaient un ancien choix désactivé ou trop élevé pour leur niveau : retour au choix de départ
update public.profiles p set avatar = 'burger'
where not exists (select 1 from public.customizations c where c.kind = 'avatar' and c.code = p.avatar and c.is_active
  and c.min_level <= (select max(l.level) from public.levels l where l.min_points <= p.points));
update public.profiles p set banner = 'nuit'
where not exists (select 1 from public.customizations c where c.kind = 'banner' and c.code = p.banner and c.is_active
  and c.min_level <= (select max(l.level) from public.levels l where l.min_points <= p.points));

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
  select c.min_level into need from public.customizations c
   where c.kind = p_kind and c.code = p_code and c.is_active;
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
