-- 28/11/2026 : restauration des sauvegardes rendue sûre (check-up avant les testeurs)
--
-- Problème trouvé en testant (l'ancienne backup.restore_table n'avait jamais servi) :
--   * elle commençait par « truncate … cascade » : remettre une seule table vidait aussi toutes celles
--     qui en dépendent. Exemple : restore_table('establishments') effaçait aussi signalements, favoris,
--     horaires, courbes et partenaires, sans les remettre ;
--   * elle échouait sur les tables à numéro automatique (feedback, app_errors, push_log) ;
--   * elle relançait les déclencheurs (points, badges, notifications « c'est calme » pour de vieux signalements).
--
-- Nouvelle règle : on remet les lignes de la sauvegarde (celles qui manquent sont recréées, celles qui
-- existent reprennent les valeurs de la sauvegarde) SANS RIEN EFFACER d'autre ; déclencheurs métier
-- coupés pendant l'opération ; compteurs automatiques recalés. Les lignes ajoutées après la sauvegarde restent.
-- Tout se fait d'un bloc : en cas d'erreur, rien n'est changé.
--
-- Toujours : seulement avec l'accord d'Alexis (CLAUDE.md).
--   select backup.restore_table('reports', '2026-11-27');   -- une table
--   select * from backup.restore_day('2026-11-27');         -- toutes les tables du jour, parents d'abord

-- Version de travail : p_schema permet de tester sur une copie (schéma de test) au lieu des vraies tables.
create or replace function backup.restore_table_into(p_tbl text, p_day date, p_schema text)
returns integer
language plpgsql
security definer
set search_path to 'public', 'backup'
as $function$
declare
  j jsonb; rel regclass; keys text[]; cols text; pkcols text; upd text; cnt int := 0; s record;
begin
  select data into j from backup.snapshots where tbl = p_tbl and day = p_day;
  if j is null then raise exception 'pas de sauvegarde pour % le %', p_tbl, p_day; end if;
  rel := to_regclass(format('%I.%I', p_schema, p_tbl));
  if rel is null then raise exception 'table %.% introuvable', p_schema, p_tbl; end if;
  if jsonb_array_length(j) = 0 then return 0; end if;

  -- colonnes présentes dans la sauvegarde (une colonne ajoutée depuis garde sa valeur par défaut)
  select array_agg(k) into keys from (select distinct jsonb_object_keys(e) k from jsonb_array_elements(j) e) z;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into cols
  from pg_attribute a
  where a.attrelid = rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname = any(keys);

  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into pkcols
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indrelid = rel and i.indisprimary;
  if pkcols is null then raise exception 'table % sans clé primaire : restauration automatique impossible', p_tbl; end if;

  select string_agg(format('%1$I = excluded.%1$I', a.attname), ', ' order by a.attnum) into upd
  from pg_attribute a
  where a.attrelid = rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = '' and a.attname = any(keys)
    and not exists (select 1 from pg_index i where i.indrelid = rel and i.indisprimary and a.attnum = any(i.indkey));

  -- pas de points, badges ni notifications rejoués pendant la restauration (contrôles de liens gardés)
  execute format('alter table %s disable trigger user', rel);
  execute format(
    'insert into %1$s (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::%1$s, $1) on conflict (%3$s) do %4$s',
    rel, cols, pkcols, coalesce('update set ' || upd, 'nothing')) using j;
  get diagnostics cnt = row_count;
  execute format('alter table %s enable trigger user', rel);

  -- numéros automatiques : le prochain part après le plus grand numéro présent
  for s in
    select a.attname, pg_get_serial_sequence(rel::text, a.attname) seq
    from pg_attribute a
    where a.attrelid = rel and a.attnum > 0 and not a.attisdropped
      and pg_get_serial_sequence(rel::text, a.attname) is not null
  loop
    execute format('select setval(%L, coalesce((select max(%I) from %s), 0) + 1, false)', s.seq, s.attname, rel);
  end loop;
  return cnt;
end $function$;

-- Toutes les tables sauvegardées d'un jour, dans l'ordre des liens (parents avant enfants).
create or replace function backup.restore_day(p_day date, p_schema text default 'public')
returns table(tbl text, lignes integer)
language plpgsql
security definer
set search_path to 'public', 'backup'
as $function$
declare t record;
begin
  if not exists (select 1 from backup.snapshots s where s.day = p_day) then
    raise exception 'pas de sauvegarde le %', p_day;
  end if;
  for t in
    with recursive deps as (
      select c.conrelid child, c.confrelid parent
      from pg_constraint c
      join pg_class pc on pc.oid = c.confrelid
      where c.contype = 'f' and c.conrelid <> c.confrelid
        and c.connamespace = to_regnamespace(p_schema) and pc.relnamespace = to_regnamespace(p_schema)
    ), lvl(rel, depth) as (
      select c.oid, 0 from pg_class c where c.relnamespace = to_regnamespace(p_schema) and c.relkind = 'r'
      union all
      select d.child, l.depth + 1 from deps d join lvl l on d.parent = l.rel where l.depth < 30
    )
    select c.relname::text nom, max(l.depth) prof
    from lvl l join pg_class c on c.oid = l.rel
    where exists (select 1 from backup.snapshots s where s.day = p_day and s.tbl = c.relname)
    group by c.relname
    order by max(l.depth), c.relname
  loop
    tbl := t.nom;
    lignes := backup.restore_table_into(t.nom, p_day, p_schema);
    return next;
  end loop;
end $function$;

-- Même nom et mêmes paramètres qu'avant : remplace l'ancienne fonction (sur les vraies tables).
create or replace function backup.restore_table(p_tbl text, p_day date)
returns integer
language sql
security definer
set search_path to 'public', 'backup'
as $function$ select backup.restore_table_into(p_tbl, p_day, 'public') $function$;

revoke all on function backup.restore_table_into(text, date, text) from public;
revoke all on function backup.restore_table(text, date) from public;
revoke all on function backup.restore_day(date, text) from public;
