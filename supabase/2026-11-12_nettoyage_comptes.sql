-- Nettoyage des comptes de test (12/11/2026), sur accord explicite d'Alexis :
-- « On garde Maylixela, Testeur1 et Enthyy, le reste on supprime les utilisateurs ».
-- Supprimés : Membre613DD7C1A7A64 et MembreAA6D29F96D2E4 (0 point, 0 signalement), comme le fait delete_my_account.
delete from auth.users
where id in (select id from public.profiles where pseudo in ('Membre613DD7C1A7A64', 'MembreAA6D29F96D2E4'));
