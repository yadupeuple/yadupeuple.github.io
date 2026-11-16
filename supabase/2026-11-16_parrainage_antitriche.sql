-- 16/11/2026 (accord d'Alexis) : anti-triche du parrainage.
-- 1) Plus de plafond de parrainages (vrais amis = pas pénalisés) : referral_max_30d = 0 (illimité).
-- 2) Même téléphone : l'appli enregistre un identifiant anonyme du téléphone (register_device). Si le filleul
--    partage un téléphone avec son parrain ou un autre filleul du même parrain : parrainage enregistré mais
--    AUCUN point (ni parrain ni filleul), profiles.referral_blocked = 'same_device', non compté pour les badges.
-- 3) Adresses e-mail jetables refusées à l'inscription (table blocked_email_domains, trigger sur auth.users,
--    + email_allowed() pour un message clair dans l'appli).

update public.app_settings set value = '0', description = 'Parrainages payés par parrain sur 30 jours (0 = illimité)' where key = 'referral_max_30d';

alter table public.profiles add column if not exists referral_blocked text;

create table if not exists public.user_devices (
  user_id uuid not null references public.profiles(id) on delete cascade,
  device text not null,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (user_id, device)
);
alter table public.user_devices enable row level security;
create index if not exists user_devices_device_idx on public.user_devices(device);

create or replace function public.register_device(p_device text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_device is null or p_device !~ '^[A-Za-z0-9_-]{16,64}$' then return; end if;
  insert into public.user_devices(user_id, device) values (auth.uid(), p_device)
  on conflict (user_id, device) do update set last_seen = now();
end $$;
revoke all on function public.register_device(text) from public;
grant execute on function public.register_device(text) to authenticated;

create or replace function public.reward_referral()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  me public.profiles%rowtype;
  n_recent integer;
  cap integer;
begin
  select * into me from public.profiles where id = new.user_id;
  if me.referred_by is null or me.referral_rewarded_at is not null or me.referral_blocked is not null then
    return new;
  end if;
  -- même téléphone que le parrain ou qu'un autre filleul du même parrain : pas de points
  if exists (
    select 1 from public.user_devices d1
    join public.user_devices d2 on d2.device = d1.device and d2.user_id <> d1.user_id
    where d1.user_id = me.id
      and (d2.user_id = me.referred_by
           or d2.user_id in (select f.id from public.profiles f where f.referred_by = me.referred_by and f.id <> me.id))
  ) then
    update public.profiles set referral_blocked = 'same_device' where id = me.id;
    return new;
  end if;
  update public.profiles
     set referral_rewarded_at = now(),
         points = points + public.setting('referral_points_filleul')::int
   where id = me.id;
  cap := public.setting('referral_max_30d')::int;
  select count(*) into n_recent from public.profiles
   where referred_by = me.referred_by and id <> me.id
     and referral_rewarded_at > now() - interval '30 days';
  if cap <= 0 or n_recent < cap then
    update public.profiles
       set points = points + public.setting('referral_points_parrain')::int
     where id = me.referred_by;
  end if;
  perform public.award_badges(me.referred_by);
  return new;
end $$;

-- « en attente » ne compte plus les parrainages bloqués
do $$
declare d text;
begin
  d := replace(pg_get_functiondef('public.get_my_profile'::regproc), E'\r\n', E'\n');
  d := replace(d, 'f.referred_by = p.id and f.referral_rewarded_at is null)', 'f.referred_by = p.id and f.referral_rewarded_at is null and f.referral_blocked is null)');
  if position('referral_blocked' in d) = 0 then raise exception 'get_my_profile non modifié'; end if;
  execute d;
end $$;

-- Adresses jetables
create table if not exists public.blocked_email_domains (domain text primary key);
alter table public.blocked_email_domains enable row level security;
insert into public.blocked_email_domains(domain) values
  ('10minutemail.co.uk'),
  ('10minutemail.com'),
  ('10minutemail.net'),
  ('1secmail.com'),
  ('1secmail.net'),
  ('1secmail.org'),
  ('20minutemail.com'),
  ('33mail.com'),
  ('anonbox.net'),
  ('burnermail.io'),
  ('byom.de'),
  ('cool.fr.nf'),
  ('courriel.fr.nf'),
  ('crazymailing.com'),
  ('discard.email'),
  ('discardmail.com'),
  ('dispostable.com'),
  ('dropmail.me'),
  ('einrot.com'),
  ('email-temporaire.fr'),
  ('emailondeck.com'),
  ('emailtemporaire.fr'),
  ('emlpro.com'),
  ('emltmp.com'),
  ('ephemail.net'),
  ('fakeinbox.com'),
  ('fakemail.net'),
  ('getairmail.com'),
  ('getnada.com'),
  ('grr.la'),
  ('guerrillamail.biz'),
  ('guerrillamail.com'),
  ('guerrillamail.de'),
  ('guerrillamail.net'),
  ('guerrillamail.org'),
  ('guerrillamailblock.com'),
  ('harakirimail.com'),
  ('inboxkitten.com'),
  ('jetable.com'),
  ('jetable.fr.nf'),
  ('jetable.org'),
  ('linshiyouxiang.net'),
  ('mail-temporaire.com'),
  ('mail-temporaire.fr'),
  ('mailcatch.com'),
  ('maildrop.cc'),
  ('mailforspam.com'),
  ('mailinator.com'),
  ('mailinator.net'),
  ('mailinator.org'),
  ('mailnesia.com'),
  ('mailpoof.com'),
  ('mintemail.com'),
  ('minuteinbox.com'),
  ('mohmal.com'),
  ('moncourrier.fr.nf'),
  ('monemail.fr.nf'),
  ('monmail.fr.nf'),
  ('mvrht.net'),
  ('mytrashmail.com'),
  ('nada.email'),
  ('pokemail.net'),
  ('sharklasers.com'),
  ('spam4.me'),
  ('spambox.us'),
  ('spamex.com'),
  ('spamgourmet.com'),
  ('temp-mail.io'),
  ('temp-mail.org'),
  ('tempail.com'),
  ('tempmail.com'),
  ('tempmail.net'),
  ('tempmailo.com'),
  ('temporary-mail.net'),
  ('tempr.email'),
  ('throwawaymail.com'),
  ('tmail.ws'),
  ('tmpmail.net'),
  ('tmpmail.org'),
  ('trash-mail.com'),
  ('trashmail.com'),
  ('trashmail.de'),
  ('trashmail.net'),
  ('wegwerfmail.de'),
  ('yomail.info'),
  ('yopmail.com'),
  ('yopmail.fr'),
  ('yopmail.net')
on conflict do nothing;

create or replace function public.email_allowed(p_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.blocked_email_domains b
                     where b.domain = lower(split_part(coalesce(p_email, ''), '@', 2)))
$$;
revoke all on function public.email_allowed(text) from public;
grant execute on function public.email_allowed(text) to anon, authenticated;

create or replace function public.block_disposable_email()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and not public.email_allowed(new.email) then
    raise exception 'Adresse e-mail jetable refusée' using errcode = 'P0001';
  end if;
  return new;
end $$;
revoke all on function public.block_disposable_email() from public, anon, authenticated;
drop trigger if exists block_disposable_email on auth.users;
create trigger block_disposable_email before insert on auth.users
  for each row execute function public.block_disposable_email();
