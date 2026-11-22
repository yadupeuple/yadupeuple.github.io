-- Sauvegarde quotidienne interne (22/11/2026) : copie JSON de chaque table de public dans backup.snapshots,
-- chaque nuit à 3 h (Paris ~ 2 h UTC), 14 jours gardés (les copies plus anciennes de CE journal sont effacées, jamais les vraies données).
-- Schéma backup non exposé par l'API, RLS active sans règle. Restaurer : voir backup.restore_table plus bas.
create extension if not exists pg_cron;
create schema if not exists backup;
create table if not exists backup.snapshots (
  day date not null,
  tbl text not null,
  n_rows int not null,
  data jsonb not null,
  taken_at timestamptz not null default now(),
  primary key (day, tbl)
);
alter table backup.snapshots enable row level security;
revoke all on schema backup from public, anon, authenticated;
revoke all on backup.snapshots from public, anon, authenticated;

create or replace function backup.run() returns int
language plpgsql security definer set search_path = public, backup as $$
declare t record; n int := 0; cnt int; j jsonb;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb), count(*) from public.%I x', t.relname) into j, cnt;
    insert into backup.snapshots(day, tbl, n_rows, data) values ((now() at time zone 'Europe/Paris')::date, t.relname, cnt, j)
      on conflict (day, tbl) do update set n_rows = excluded.n_rows, data = excluded.data, taken_at = now();
    n := n + 1;
  end loop;
  delete from backup.snapshots where day < (now() at time zone 'Europe/Paris')::date - 14;
  return n;
end $$;
revoke all on function backup.run() from public, anon, authenticated;

-- Remettre une table telle qu'un jour donné (à lancer à la main, avec accord d'Alexis : remplace le contenu) :
-- select backup.restore_table('profiles', date '2026-11-22');
create or replace function backup.restore_table(p_tbl text, p_day date) returns int
language plpgsql security definer set search_path = public, backup as $$
declare j jsonb; cnt int;
begin
  select data into j from backup.snapshots where tbl = p_tbl and day = p_day;
  if j is null then raise exception 'pas de sauvegarde pour % le %', p_tbl, p_day; end if;
  execute format('truncate public.%I cascade', p_tbl);
  execute format('insert into public.%I select * from jsonb_populate_recordset(null::public.%I, $1)', p_tbl, p_tbl) using j;
  get diagnostics cnt = row_count;
  return cnt;
end $$;
revoke all on function backup.restore_table(text, date) from public, anon, authenticated;

select cron.unschedule('sauvegarde-quotidienne') where exists (select 1 from cron.job where jobname = 'sauvegarde-quotidienne');
select cron.schedule('sauvegarde-quotidienne', '0 2 * * *', $$select backup.run()$$);
