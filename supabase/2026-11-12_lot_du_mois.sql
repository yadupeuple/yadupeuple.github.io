-- Lot du mois (12/11/2026) : un partenaire offre un lot au n°1 du classement mensuel.
-- Rien ne s'affiche tant qu'aucun lot n'est enregistré pour le mois en cours.

create table if not exists public.monthly_prizes (
  month date primary key check (extract(day from month) = 1),     -- 1er jour du mois
  title text not null check (char_length(title) between 3 and 80), -- ex. « Un menu offert »
  sponsor_name text check (char_length(sponsor_name) <= 60),       -- ex. « Tacos King Yutz »
  establishment_id uuid references public.establishments(id) on delete set null,
  winners integer not null default 1 check (winners between 1 and 10),
  created_at timestamptz not null default now()
);
alter table public.monthly_prizes enable row level security;

create or replace function public.get_monthly_prize() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('title', title, 'sponsor_name', sponsor_name, 'establishment_id', establishment_id, 'winners', winners)
  from monthly_prizes
  where month = date_trunc('month', now() at time zone 'Europe/Paris')::date;
$$;
revoke all on function public.get_monthly_prize() from public;
grant execute on function public.get_monthly_prize() to anon, authenticated;

-- Pour ajouter un lot (fait à la main) :
-- insert into monthly_prizes (month, title, sponsor_name, establishment_id, winners)
-- values ('2026-12-01', 'Un menu offert', 'Nom du resto', '<id resto>', 1);
