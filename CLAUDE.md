# Y'a du peuple ? — règles du projet

Appli web (installable sur téléphone) qui montre l'affluence des fast-foods de Moselle en direct,
salle et Drive séparés, grâce aux signalements des utilisateurs.
Propriétaire : Alexis (ne code pas). Claude fait le code ; Alexis valide sur son téléphone.

## Façons de travailler
- Réponses courtes et en français. Enchaîner les étapes sans demander de confirmation à chaque fois ;
  un seul récapitulatif condensé à la fin.
- Ne jamais présenter quelque chose comme « testé » sans l'avoir réellement exécuté.

## Interdits
- **Ne jamais modifier la base Supabase (tables, fonctions, données) sans l'accord explicite d'Alexis.**
  Toute modification passe par un fichier SQL dans `supabase/` qu'Alexis valide avant exécution.
- **Jamais de clé `service_role` dans l'appli.** Seule la clé publique (publishable / anon) est autorisée.
- Ne pas réinventer côté appli une règle qui existe déjà dans la base : la base décide (points,
  distance, fiabilité, statuts). L'appli affiche et envoie, c'est tout.
- Les statuts d'affluence ne se paient jamais.

## Technique
- Site statique sans étape de compilation : `index.html`, `css/`, `js/` (modules ES), `vendor/`.
- Bibliothèques recopiées dans `vendor/` (pas de CDN) : MapLibre GL 5 (carte), supabase-js 2.
- Fond de carte : OpenFreeMap « liberty » (en couleurs) (gratuit, sans clé), pastilles arrondies façon Airbnb.
- Configuration (URL Supabase + clé publique) : `js/config.js`.
- Mode démo sans réseau : ajouter `?demo` à l'adresse (données fictives, `js/demo.js`). Sert aux tests.
- Tester en local : `python3 -m http.server 8080` puis ouvrir http://localhost:8080/?demo
- Le GPS du navigateur ne marche qu'en HTTPS (ou localhost).

## Base Supabase (projet « APP projet », ref ygekcpnsjbbdgtmlxdce, région eu-west-1)
Tables : establishments (42, lecture publique), reports, profiles, favorites, badges (13),
user_badges, levels (6), app_settings. Sécurité (RLS) active partout.

Fonctions appelées par l'appli (RPC) :
| Fonction | Sans compte | Rôle |
|---|---|---|
| get_nearby_establishments(p_lat, p_lng, p_radius_m ≤ 5000, p_limit ≤ 50) | oui | restos proches + statuts |
| search_establishments(p_query ≥ 2 car., p_lat, p_lng, p_limit) | oui | recherche + statuts |
| get_service_status(p_establishment, p_service) | oui | statut d'un service |
| get_history(p_establishment, p_service, p_limit ≤ 5) | oui | 5 derniers signalements anonymes |
| get_leaderboard(p_city, p_days ≤ 30) | oui | classement (top 10 + moi) |
| calmer_nearby(p_id) | oui | « Plus calme à côté : … » |
| submit_report(p_establishment, p_service, p_level, p_wait, p_lat, p_lng, p_accuracy_m) | non | envoyer un signalement |
| get_my_profile(), get_badges_progress(), change_pseudo(new_pseudo) | non | compte |
| toggle_favorite(est), my_favorites() | non | favoris |
| export_my_data(), delete_my_account() | non | RGPD |

Statut renvoyé : `{state, level, uncertain, wait, reliability, last_report_minutes, users_total, ...}`
- state : `recent` (≤ 30 min) · `a_confirmer` (30-60 min) · `estimation` (habitudes, ≥ 3 jours et 3 personnes)
  · `theorique` (courbe horaire type, fonction theory_level) · `aucune_info`
- level : `calme` · `modere` · `frequente` · `tres_frequente`
- uncertain = true → afficher « Fréquentation incertaine »
- reliability : `faible` · `moyenne` · `bonne` · `tres_bonne` (distincte des points)
- wait (Drive) : `c0_2` · `c3_5` · `c6_8` · `c9plus` = nombre de voitures dans la file

Erreurs de submit_report : `{ok:false, error, message}` — afficher `message` tel quel.

## Règles métier (décidées par Alexis)
- 4 niveaux : Calme (vert) / Un peu de monde (jaune) / Animé (orange) / Y'a du peuple ! (rouge).
  Gris = aucune info.
- Drive : nombre de voitures (0-2, 3-5, 6-8, 9+), pas de minutes.
- Carte consultable sans compte ; compte + pseudonyme pour signaler (donner envie, ne pas obliger).
- Signalement à moins de 100 m ; points 10 puis 5 puis 0 dans la même heure et le même resto
  (salle + Drive ensemble) ; tout est contrôlé par submit_report.
- Restos sans Drive (has_drive = false) : rien de ce qui touche au Drive ne s'affiche.
- Trajet estimé : distance à vol d'oiseau × 1,3 à 46 km/h (calé sur Google Maps).
- Contact : contact.yadupeuple@gmail.com
- Slogans de l'écran d'accueil (dans cet ordre, en italique) :
  « Venu pour manger, pas pour poireauter. » → « Le parking, c'est pas un camping. » →
  « J'ai une pause déjeuner, pas un congé sabbatique. » → « Pas venu pour camper au Drive. » →
  « Pas besoin de poser un RTT pour un burger. »

## Charte graphique
Bleu nuit `#0B1F3A`, turquoise `#14B8A6`, blanc, touche jaune-orangé `#F5A524`.
Affluence : calme `#22C55E`, modéré `#EAB308`, animé `#F97316`, max `#EF4444`, aucune info `#9CA3AF`.

## Avant le lancement public (à ne pas oublier)
Nettoyer les données de test (avec l'accord d'Alexis) · réactiver la confirmation des e-mails dans
Supabase · mentions légales, RGPD, CGU · vérification de la marque · tests terrain.

## Plus tard (idées validées, pas encore faites)
Alertes « C'est calme » sur les favoris (notifications) · statuts de fiabilité (Nouveau venu →
Pilier de la communauté) · défis et missions · page partenaire payante · stores Apple/Google.

## Mises à jour
Après chaque modification du code, augmenter le numéro `?v=N` partout (imports des fichiers `js/`
et balise script de `index.html` / `demo.html`), sinon les téléphones gardent l'ancienne version en cache.

## Logo (choisi par Alexis, à utiliser tel quel, ne pas redessiner)
`icons/logo-complet.png` (logo avec texte) et `icons/icon-1024.png` (bulle seule, icône d'appli ;
déclinée en icon-512 / icon-192).
