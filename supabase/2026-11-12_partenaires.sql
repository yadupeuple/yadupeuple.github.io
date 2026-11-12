-- Partenaires (12/11/2026) : fiche Pro, offre du jour, statistiques pour le restaurateur.
-- Règle : un partenariat ne modifie JAMAIS les statuts d'affluence.
-- Tout passe par des fonctions ; les tables n'ont aucune lecture directe (RLS sans règle).

create table if not exists public.partners (
  establishment_id uuid primary key references public.establishments(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,   -- compte du restaurateur
  active boolean not null default true,
  founder boolean not null default false,                        -- « Partenaire fondateur »
  tagline text check (char_length(tagline) <= 80),
  link_url text check (link_url ~ '^https://'),
  link_label text check (char_length(link_label) <= 24),
  phone text check (phone ~ '^[0-9+ ]{6,20}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.partner_offers (
  id uuid primary key default gen_random_uuid(),
  establishment_id uuid not null references public.partners(establishment_id) on delete cascade,
  title text not null check (char_length(title) between 3 and 60),
  details text check (char_length(details) <= 140),
  only_when_calm boolean not null default false,                 -- visible seulement aux heures creuses
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists partner_offers_est_idx on public.partner_offers (establishment_id, ends_at);

-- Compteurs anonymes par jour (aucune donnée personnelle).
create table if not exists public.partner_stats (
  establishment_id uuid not null references public.partners(establishment_id) on delete cascade,
  day date not null,
  views integer not null default 0,
  clicks integer not null default 0,
  primary key (establishment_id, day)
);

alter table public.partners enable row level security;
alter table public.partner_offers enable row level security;
alter table public.partner_stats enable row level security;

-- Offre visible en ce moment (null sinon). « Heures creuses » = salle calme ou un peu de monde.
create or replace function public.partner_current_offer(p_est uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare o partner_offers; e establishments; st jsonb;
begin
  select * into o from partner_offers
   where establishment_id = p_est and starts_at <= now() and ends_at > now()
   order by created_at desc limit 1;
  if not found then return null; end if;
  if o.only_when_calm then
    select * into e from establishments where id = p_est;
    st := get_service_status(p_est, case when e.has_dine_in then 'salle' else 'drive' end);
    if coalesce(st->>'state', 'aucune_info') = 'aucune_info'
       or coalesce(st->>'level', '') not in ('calme', 'modere') then
      return null;
    end if;
  end if;
  return jsonb_build_object('title', o.title, 'details', o.details, 'ends_at', o.ends_at, 'only_when_calm', o.only_when_calm);
end $$;

-- Liste publique des partenaires actifs (sans compte).
create or replace function public.get_partners() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.establishment_id, 'tagline', p.tagline, 'link_url', p.link_url, 'link_label', p.link_label,
    'phone', p.phone, 'founder', p.founder, 'offer', partner_current_offer(p.establishment_id))), '[]'::jsonb)
  from partners p where p.active;
$$;

-- Compte une vue de fiche ou un clic sur le lien / téléphone (sans compte, anonyme).
create or replace function public.partner_track(p_establishment uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('view', 'click') then return; end if;
  if not exists (select 1 from partners where establishment_id = p_establishment and active) then return; end if;
  insert into partner_stats (establishment_id, day, views, clicks)
  values (p_establishment, (now() at time zone 'Europe/Paris')::date, (p_kind = 'view')::int, (p_kind = 'click')::int)
  on conflict (establishment_id, day) do update
    set views = partner_stats.views + excluded.views, clicks = partner_stats.clicks + excluded.clicks;
end $$;

-- Tableau de bord du restaurateur connecté (null s'il n'a pas de restaurant partenaire).
create or replace function public.get_my_restaurant() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p partners; e establishments; o partner_offers;
begin
  if auth.uid() is null then return null; end if;
  select * into p from partners where owner_id = auth.uid() and active order by created_at limit 1;
  if not found then return null; end if;
  select * into e from establishments where id = p.establishment_id;
  select * into o from partner_offers
   where establishment_id = e.id and ends_at > now() order by created_at desc limit 1;
  return jsonb_build_object(
    'id', e.id, 'name', e.name, 'founder', p.founder,
    'tagline', p.tagline, 'link_url', p.link_url, 'link_label', p.link_label, 'phone', p.phone,
    'offer', case when o.id is null then null else jsonb_build_object(
      'title', o.title, 'details', o.details, 'ends_at', o.ends_at, 'only_when_calm', o.only_when_calm,
      'visible', partner_current_offer(e.id) is not null) end,
    'views_30d', (select coalesce(sum(views), 0) from partner_stats where establishment_id = e.id and day > current_date - 30),
    'clicks_30d', (select coalesce(sum(clicks), 0) from partner_stats where establishment_id = e.id and day > current_date - 30),
    'reports_30d', (select count(*) from reports where establishment_id = e.id and created_at > now() - interval '30 days'),
    'contributors_30d', (select count(distinct contributor_key) from reports where establishment_id = e.id and created_at > now() - interval '30 days'),
    'favorites', (select count(*) from favorites where establishment_id = e.id),
    'busiest', (select coalesce(jsonb_agg(h), '[]'::jsonb) from (
        select extract(hour from created_at at time zone 'Europe/Paris')::int as h
          from reports
         where establishment_id = e.id and level in ('frequente', 'tres_frequente')
           and created_at > now() - interval '60 days'
         group by 1 order by count(*) desc, 1 limit 3) x)
  );
end $$;

-- Le restaurateur publie (ou retire, titre vide) son offre du jour. Une seule offre à la fois.
create or replace function public.set_partner_offer(p_title text, p_details text default null, p_hours integer default 24, p_only_when_calm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_est uuid; v_title text := btrim(coalesce(p_title, '')); v_details text := nullif(btrim(coalesce(p_details, '')), '');
begin
  if auth.uid() is null then return jsonb_build_object('ok', false, 'message', 'Connecte-toi.'); end if;
  select establishment_id into v_est from partners where owner_id = auth.uid() and active order by created_at limit 1;
  if v_est is null then return jsonb_build_object('ok', false, 'message', 'Aucun restaurant partenaire sur ce compte.'); end if;
  if v_title <> '' then
    if char_length(v_title) < 3 or char_length(v_title) > 60 then
      return jsonb_build_object('ok', false, 'message', 'Le titre doit faire de 3 à 60 caractères.');
    end if;
    if char_length(coalesce(v_details, '')) > 140 then
      return jsonb_build_object('ok', false, 'message', 'Le détail est limité à 140 caractères.');
    end if;
    if p_hours is null or p_hours < 1 or p_hours > 168 then
      return jsonb_build_object('ok', false, 'message', 'Durée entre 1 heure et 7 jours.');
    end if;
  end if;
  update partner_offers set ends_at = now() where establishment_id = v_est and ends_at > now();
  if v_title = '' then return jsonb_build_object('ok', true, 'message', 'Offre retirée.'); end if;
  insert into partner_offers (establishment_id, title, details, only_when_calm, ends_at)
  values (v_est, v_title, v_details, coalesce(p_only_when_calm, false), now() + make_interval(hours => p_hours));
  return jsonb_build_object('ok', true, 'message', 'Offre publiée.');
end $$;

revoke all on function public.partner_current_offer(uuid) from public, anon, authenticated;
revoke all on function public.get_partners() from public;
revoke all on function public.partner_track(uuid, text) from public;
revoke all on function public.get_my_restaurant() from public, anon;
revoke all on function public.set_partner_offer(text, text, integer, boolean) from public, anon;
grant execute on function public.get_partners() to anon, authenticated;
grant execute on function public.partner_track(uuid, text) to anon, authenticated;
grant execute on function public.get_my_restaurant() to authenticated;
grant execute on function public.set_partner_offer(text, text, integer, boolean) to authenticated;

-- Pour inscrire un partenaire (fait par Alexis / Claude, à la main) :
-- insert into partners (establishment_id, owner_id, founder, tagline, link_url, link_label, phone)
-- values ('<id resto>', (select id from profiles where pseudo = '<pseudo du restaurateur>'), true,
--         'Tacos maison depuis 2015', 'https://…', 'Voir le menu', '03 82 00 00 00');
