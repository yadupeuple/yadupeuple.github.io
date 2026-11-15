-- 15/11/2026 : nouvelles bannières = 10 rubans (planche ChatGPT d'Alexis) qui portent le pseudo ; anciennes bannières désactivées
-- (pas supprimées). Les badges gagnés deviennent des images de profil possibles (colonne requires_badge, contrôlée par la base).
alter table public.customizations add column if not exists requires_badge text references public.badges(code);

update public.customizations set is_active = false where kind = 'banner' and code not like 'ruban_%';
insert into public.customizations (kind, code, value, min_level, sort_order, is_active) values
  ('banner', 'ruban_bleu', 'icons/banners/ruban_bleu.webp', 1, 0, true),
  ('banner', 'ruban_vert', 'icons/banners/ruban_vert.webp', 1, 1, true),
  ('banner', 'ruban_rose', 'icons/banners/ruban_rose.webp', 5, 2, true),
  ('banner', 'ruban_outils', 'icons/banners/ruban_outils.webp', 10, 3, true),
  ('banner', 'ruban_argent', 'icons/banners/ruban_argent.webp', 20, 4, true),
  ('banner', 'ruban_or', 'icons/banners/ruban_or.webp', 30, 5, true),
  ('banner', 'ruban_rouge', 'icons/banners/ruban_rouge.webp', 40, 6, true),
  ('banner', 'ruban_trophee', 'icons/banners/ruban_trophee.webp', 50, 7, true),
  ('banner', 'ruban_obsidienne', 'icons/banners/ruban_obsidienne.webp', 70, 8, true),
  ('banner', 'ruban_royal', 'icons/banners/ruban_royal.webp', 100, 9, true)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level, sort_order = excluded.sort_order, is_active = true;
update public.profiles set banner = 'ruban_bleu' where banner is not null and banner not like 'ruban_%';

insert into public.customizations (kind, code, value, min_level, sort_order, is_active, requires_badge)
select 'avatar', 'badge_' || b.code, 'icons/badges/' || b.code || '.webp', 1, 100 + b.sort_order, true, b.code from public.badges b
on conflict (kind, code) do update set value = excluded.value, requires_badge = excluded.requires_badge, sort_order = excluded.sort_order, is_active = true;

create or replace function public.set_customization(p_kind text, p_code text)
returns jsonb language plpgsql security definer set search_path = '' as $function$
declare uid uuid := auth.uid(); need integer; badge text; my_level integer;
begin
  if uid is null then return jsonb_build_object('ok', false, 'message', 'Connecte-toi d''abord.'); end if;
  select c.min_level, c.requires_badge into need, badge from public.customizations c
   where c.kind = p_kind and c.code = p_code and c.is_active;
  if need is null then return jsonb_build_object('ok', false, 'message', 'Choix inconnu.'); end if;
  if badge is not null and not exists (select 1 from public.user_badges ub where ub.user_id = uid and ub.badge_code = badge) then
    return jsonb_build_object('ok', false, 'message', 'Gagne d''abord ce badge pour l''utiliser.');
  end if;
  select max(l.level) into my_level from public.levels l
   where l.min_points <= (select p.points from public.profiles p where p.id = uid);
  if coalesce(my_level, 1) < need then return jsonb_build_object('ok', false, 'message', format('Débloqué au niveau %s.', need)); end if;
  if p_kind = 'avatar' then update public.profiles set avatar = p_code where id = uid;
  else update public.profiles set banner = p_code where id = uid; end if;
  return jsonb_build_object('ok', true);
end; $function$;
