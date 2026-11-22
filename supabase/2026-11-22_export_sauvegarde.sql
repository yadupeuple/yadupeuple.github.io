-- Export complet pour la copie hors Supabase (22/11/2026). Appelé uniquement par la fonction Edge export-backup
-- (clé service_role côté Supabase, jamais dans l'appli). Inaccessible à anon / authenticated.
-- Exclut push_config (secrets) et push_subscriptions ; ajoute id / e-mail / date des comptes (auth.users, sans mots de passe).
create or replace function public.backup_export() returns jsonb
language plpgsql security definer set search_path = public as $$
declare t record; j jsonb; res jsonb := '{}'::jsonb;
begin
  for t in select c.relname from pg_class c join pg_namespace s on s.oid = c.relnamespace
           where s.nspname = 'public' and c.relkind = 'r' and c.relname not in ('push_config', 'push_subscriptions') loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x)), ''[]''::jsonb) from public.%I x', t.relname) into j;
    res := res || jsonb_build_object(t.relname, j);
  end loop;
  res := res || jsonb_build_object('auth_users',
    (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'created_at', created_at)), '[]'::jsonb) from auth.users));
  return res;
end $$;
revoke all on function public.backup_export() from public, anon, authenticated;
grant execute on function public.backup_export() to service_role;

-- Secret partagé GitHub <-> fonction Edge (créé en base, jamais dans le dépôt)
insert into public.push_config(key, value) values ('backup_secret', encode(extensions.gen_random_bytes(24), 'hex'))
on conflict (key) do nothing;
