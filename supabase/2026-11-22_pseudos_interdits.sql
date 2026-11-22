-- Filtre des pseudos injurieux / haineux (22/11/2026). Les noms de marques restent autorisés.
-- Liste modifiable sans toucher à l'appli : insert / delete sur banned_words.
create table if not exists public.banned_words (
  word text primary key,
  mode text not null default 'contains' check (mode in ('contains','exact'))
);
alter table public.banned_words enable row level security;  -- aucune règle : inaccessible depuis l'appli

insert into public.banned_words(word, mode) values
 -- contient (mots sans ambiguïté)
 ('putain','contains'),('salope','contains'),('salopard','contains'),('encule','contains'),('enfoire','contains'),
 ('connard','contains'),('connasse','contains'),('niquer','contains'),('fdp','contains'),
 ('tamere','contains'),('tagueule','contains'),('negre','contains'),('bougnoul','contains'),
 ('bicot','contains'),('youpin','contains'),('sidaique','contains'),('trisomique','contains'),
 ('attarde','contains'),('pedophile','contains'),('violeur','contains'),('hitler','contains'),('siegheil','contains'),
 ('heilhitler','contains'),('kukluxklan','contains'),('daesh','contains'),('fuck','contains'),
 ('bitch','contains'),('nigger','contains'),('nigga','contains'),('faggot','contains'),
 ('whore','contains'),('retard','contains'),('gouine','contains'),('tapette','contains'),
 ('batard','contains'),('merde','contains'),('chiasse','contains'),('couille','contains'),
 -- seulement si le pseudo est exactement ce mot (évite de bloquer des prénoms et mots normaux)
 ('nique','exact'),('bite','exact'),('shit','exact'),('negro','exact'),('cunt','exact'),('mongol','exact'),('pute','exact'),('putes','exact'),('nazi','exact'),('nazis','exact'),('pd','exact'),('tg','exact'),('ntm','exact'),
 ('con','exact'),('cons','exact'),('cul','exact'),('pede','exact'),('pedo','exact'),('raton','exact'),('kkk','exact'),
 ('viol','exact'),('debile','exact'),('ordure','exact'),('chienne','exact'),('sale','exact'),('zob','exact'),('teub','exact'),('nazillon','exact')
on conflict do nothing;

create or replace function public.pseudo_allowed(p text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  s text;
  flat text;
  w record;
begin
  s := lower(coalesce(p, ''));
  s := translate(s, 'àâäáãåçéèêëíìîïñóòôöõúùûüýÿœæ', 'aaaaaaceeeeiiiinooooouuuuyyoa');
  s := translate(s, '0134578@$!|', 'oieastbasii');  -- "0"->o "1"->i "3"->e "4"->a "5"->s "7"->t "8"->b "@"->a "$"->s "!"->i "|"->i
  s := regexp_replace(s, '[^a-z]', '', 'g');         -- retire chiffres restants, points, tirets, espaces
  s := regexp_replace(s, '(.)\1+', '\1', 'g');       -- lettres répétées : "putaaain" -> "putain"
  flat := s;
  for w in select word, mode from public.banned_words loop
    if w.mode = 'exact' and flat = regexp_replace(w.word, '(.)\1+', '\1', 'g') then return false; end if;
    if w.mode = 'contains' and position(regexp_replace(w.word, '(.)\1+', '\1', 'g') in flat) > 0 then return false; end if;
  end loop;
  return true;
end $$;
revoke all on function public.pseudo_allowed(text) from public, anon, authenticated;

-- Changement de pseudo
create or replace function public.change_pseudo(new_pseudo text)
returns text language plpgsql security definer set search_path to 'public' as $$
declare p text := trim(new_pseudo);
begin
  if auth.uid() is null then return 'Connexion requise'; end if;
  if length(p) < 3 or length(p) > 20 then return 'Le pseudo doit faire 3 a 20 caracteres'; end if;
  if not public.pseudo_allowed(p) then return 'Ce pseudo n''est pas autorisé'; end if;
  if exists (select 1 from profiles where lower(pseudo) = lower(p) and id <> auth.uid()) then
    return 'Pseudo deja pris';
  end if;
  update profiles set pseudo = p where id = auth.uid();
  return 'ok';
end $$;

-- Inscription : un pseudo refusé est remplacé par un pseudo neutre (handle_new_user attrape déjà check_violation)
create or replace function public.profiles_check_pseudo()
returns trigger language plpgsql set search_path = '' as $$
begin
  if not public.pseudo_allowed(new.pseudo) then
    raise exception 'pseudo non autorisé' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists profiles_check_pseudo on public.profiles;
create trigger profiles_check_pseudo before insert on public.profiles
  for each row when (new.pseudo !~ '^Membre[0-9A-F]{13}$')
  execute function public.profiles_check_pseudo();
