-- Y'a du peuple ? — Textes des badges raccourcis (demande d'Alexis, 12/11/2026)
update public.badges set description = regexp_replace(regexp_replace(description, ' (en gagnant des points|ayant rapporté des points)', '', 'g'), ' \(après son premier signalement\)', '', 'g');
