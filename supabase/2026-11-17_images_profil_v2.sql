-- 17/11/2026 (demande d'Alexis) : nouvelle planche de 40 images de profil (outils/src/planche_profil_v2.png,
-- traitée par outils/avatars_v2.py). Les images déjà présentes gardent leur niveau, sauf Couronne → 100 et Fusée → 90.
-- 17 nouvelles images ; les 9 anciennes absentes de la planche sont désactivées (fichiers et lignes gardés) :
-- cupcake, voiture, renard, chouette, ours, lion, medaille, licorne, dragon (personne ne les portait).

update public.customizations set is_active = false
where kind = 'avatar' and code in ('cupcake','voiture','renard','chouette','ours','lion','medaille','licorne','dragon');

update public.customizations set sort_order = sort_order + 1000 where kind = 'avatar' and requires_badge is null;

insert into public.customizations (kind, code, value, min_level, sort_order, is_active)
select 'avatar', v.code, 'icons/avatars/' || v.code || '.webp', v.lvl, v.ord, true
from (values
  ('burger',1,0),('frites',1,1),('pizza',1,2),('soda',1,3),('hotdog',1,4),('tacos',1,5),('glace',1,6),('cafe',1,7),
  ('sandwich',3,8),('milkshake',3,9),('popcorn',5,10),('donut',5,11),('pomme',8,12),('patte',8,13),
  ('coeur',10,14),('musique',10,15),('etoile',15,16),('foot',15,17),('basket',18,18),('photo',18,19),
  ('chat',20,20),('chien',20,21),('panda',25,22),('arbre',25,23),('gamer',30,24),('cadeau',30,25),
  ('trefle',35,26),('eclair',35,27),('flamme',40,28),('lunettes',40,29),('alien',45,30),('robot',45,31),
  ('trophee',50,32),('ninja',55,33),('pirate',55,34),('montagne',60,35),('vacances',70,36),
  ('diamant',80,37),('fusee',90,38),('couronne',100,39)
) as v(code, lvl, ord)
on conflict (kind, code) do update set value = excluded.value, min_level = excluded.min_level,
  sort_order = excluded.sort_order, is_active = true;

-- anciennes désactivées : rangées à la fin
update public.customizations set sort_order = sort_order - 500
where kind = 'avatar' and requires_badge is null and sort_order >= 1000;
