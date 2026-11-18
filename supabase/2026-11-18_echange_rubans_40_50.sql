-- 18/11/2026 : échange des niveaux des rubans flocon (40 → 50) et étoile violette (50 → 40)
update customizations set sort_order = sort_order + 1000 where kind='banner' and code in ('ruban_flocon','ruban_etoile_violet');
update customizations set min_level = 50, sort_order = 15 where kind='banner' and code = 'ruban_flocon';
update customizations set min_level = 40, sort_order = 14 where kind='banner' and code = 'ruban_etoile_violet';
