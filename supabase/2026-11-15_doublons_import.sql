-- 15/11/2026 : suppression approuvée par Alexis (« Oui, supprime les 9 »).
-- 9 restos en double : relevé à la main + copie de l'import France à 200-400 m (la fusion de l'import s'arrêtait à 200 m).
-- On garde la fiche relevée à la main (courbes Google, horaires) ; elle reprend la référence officielle de la copie
-- (source / source_ref) pour qu'un futur import la reconnaisse. Aucune copie n'avait de signalement.
create temp table dup as
select a.id keep_id, b.id del_id, b.source, b.source_ref
from establishments a join establishments b
  on a.source is null and b.source like 'atp:%' and a.brand = b.brand
 and abs(a.lat - b.lat) < 0.01 and abs(a.lng - b.lng) < 0.014
where distance_m(a.lat, a.lng, b.lat, b.lng) between 1 and 400
  and not exists (select 1 from reports r where r.establishment_id = b.id);
delete from establishments e using dup where e.id = dup.del_id;
update establishments e set source = dup.source, source_ref = dup.source_ref from dup where e.id = dup.keep_id;
