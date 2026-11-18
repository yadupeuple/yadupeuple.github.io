-- 18/11/2026 (accord explicite d'Alexis) : suppression des comptes Enthyy et Testeur1 (même méthode que delete_my_account)
delete from auth.users where id in ('4446fe84-5a90-4ee1-864f-45fed044d95b','30e86623-a3a3-41df-9d64-430385ca1e2f');
