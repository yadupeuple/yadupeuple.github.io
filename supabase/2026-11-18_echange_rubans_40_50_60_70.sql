-- 18/11/2026 : flocon 40, étoile violette 50 (retour) ; étoile or 60, diamant 70 (échange)
update customizations set sort_order = sort_order + 1000 where kind='banner' and code in ('ruban_flocon','ruban_etoile_violet','ruban_diamant','ruban_etoile_or');
update customizations set min_level = 40, sort_order = 14 where kind='banner' and code = 'ruban_flocon';
update customizations set min_level = 50, sort_order = 15 where kind='banner' and code = 'ruban_etoile_violet';
update customizations set min_level = 70, sort_order = 17 where kind='banner' and code = 'ruban_diamant';
update customizations set min_level = 60, sort_order = 16 where kind='banner' and code = 'ruban_etoile_or';
