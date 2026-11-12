-- Code de parrainage (12/11/2026) : chaque nouveau compte reçoit un code à 6 caractères (valeur par défaut de profiles.ref_code).
-- Ce trigger garantit qu'il est unique : si le code tiré existe déjà, on en tire un autre (sinon l'inscription échouerait).
create or replace function public.ensure_ref_code() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  while new.ref_code is null or exists (select 1 from profiles where ref_code = new.ref_code and id <> new.id) loop
    new.ref_code := upper(substr(md5(gen_random_uuid()::text), 1, 6));
  end loop;
  return new;
end $$;
revoke all on function public.ensure_ref_code() from public, anon, authenticated;

drop trigger if exists ensure_ref_code on public.profiles;
create trigger ensure_ref_code before insert or update of ref_code on public.profiles
for each row execute function public.ensure_ref_code();
