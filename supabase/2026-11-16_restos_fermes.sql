-- 16/11/2026 : suppression approuvée par Alexis (« s'ils sont réellement fermés, on les supprime »).
-- 87 restos marqués « Définitivement fermé » pendant le relevé ; revérifiés un par un sur leur propre fiche Google Maps
-- (lieu à < 300 m, statut lu dans l'en-tête de la fiche) : 68 confirmés fermés → supprimés.
-- Les 19 autres (fiche ouverte ou statut illisible) sont gardés. Aucun n'avait de signalement ni de favori.
-- Courbes et horaires supprimés avec (cascade). Liste par début d'identifiant :
delete from public.establishments e
where left(e.id::text, 8) in ('5e0a64a2','013bc808','034d2329','0372724d','224ea25e','044ec35b','77acbcbb','1357e05d','14c65a8a','1698b2f6','1874d356','be715c89','198ea737','1ac3f157','1d438f73','1ef75cd8','25c20f81','21770d14','2672444d','296c97e1','3219437c','330e2819','360e4df2','36ab4da0','39dfdc9a','3fc45feb','40984386','4b49cece','4f2289cd','527c404c','53c9bd43','5406ef16','541ba48d','55103c3b','5d63a400','5b191e10','ca7f1d78','6a47566d','69cb91ca','6e92393c','6faeb79b','7492e25b','7c67df81','7b446959','b2355e73','7fe084ee','b4f164b1','8597671f','898a5549','8a99cefd','ac762605','8c1a02d2','8f8973ef','9051155b','ad7c608d','9b942c4b','b68691e4','b6a31e30','bc821a0f','bdfea817','be2f06e4','c333273f','d9de3aa8','e6b2fbae','ea538f30','ecbce869','f30a1a4d','fc257323')
  and e.id in (select id from import.gmaps_raw where ferme = 'Définitivement fermé')
  and not exists (select 1 from public.reports r where r.establishment_id = e.id)
  and not exists (select 1 from public.favorites f where f.establishment_id = e.id);
