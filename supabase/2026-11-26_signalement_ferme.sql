-- 26/11/2026 (demande d'Alexis) : pas de signalement quand le resto est fermé. La base décide (is_open_now),
-- l'appli grise simplement le bouton.
do $$
declare d text;
begin
  select pg_get_functiondef('public.report_error(text,jsonb)'::regprocedure) into d;
  if position('''closed''' in d) = 0 then
    execute replace(d, 'when ''too_soon'' then', 'when ''closed'' then ''Ce restaurant est fermé en ce moment : signalement impossible.''' || chr(10) || '      when ''too_soon'' then');
  end if;
  select pg_get_functiondef('public.submit_report(uuid,text,text,text,double precision,double precision,double precision)'::regprocedure) into d;
  if position('''closed''' in d) = 0 then
    execute replace(d, 'return public.report_error(''service_unavailable'');
  end if;', 'return public.report_error(''service_unavailable'');
  end if;

  -- Resto fermé (horaires) : pas de signalement
  if public.is_open_now(est.id) is false then
    return public.report_error(''closed'');
  end if;');
  end if;
end $$;
