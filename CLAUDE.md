# Y'a du peuple ? — règles du projet

Appli web (installable sur téléphone) qui montre l'affluence des fast-foods de Moselle en direct,
salle et Drive séparés, grâce aux signalements des utilisateurs.
Propriétaire : Alexis (ne code pas). Claude fait le code ; Alexis valide sur son téléphone.

## Façons de travailler
- Réponses courtes et en français. Enchaîner les étapes sans demander de confirmation à chaque fois ;
  un seul récapitulatif condensé à la fin.
- Ne jamais présenter quelque chose comme « testé » sans l'avoir réellement exécuté.

## Interdits
- Base Supabase : Alexis autorise les modifications sans lui demander à chaque fois (11/11/2026).
  Toujours garder une trace dans un fichier SQL de `supabase/`. **Exception : toute suppression de
  données, de tables ou de comptes reste soumise à son accord explicite.**
- **Jamais de clé `service_role` dans l'appli.** Seule la clé publique (publishable / anon) est autorisée.
- Ne pas réinventer côté appli une règle qui existe déjà dans la base : la base décide (points,
  distance, fiabilité, statuts). L'appli affiche et envoie, c'est tout.
- Les statuts d'affluence ne se paient jamais.

## Technique
- En ligne : https://yadupeuple.github.io (dépôt GitHub yadupeuple/yadupeuple.github.io, organisation « yadupeuple »).
- Site statique sans étape de compilation : `index.html`, `css/`, `js/` (modules ES), `vendor/`.
- Bibliothèques recopiées dans `vendor/` (pas de CDN) : MapLibre GL 5 (carte), supabase-js 2.
- Fond de carte : OpenFreeMap « liberty » (en couleurs) (gratuit, sans clé), pastilles arrondies façon Airbnb.
- Configuration (URL Supabase + clé publique) : `js/config.js`.
- Mode démo sans réseau : ajouter `?demo` à l'adresse (données fictives, `js/demo.js`). Sert aux tests.
- Tester en local : `python3 -m http.server 8080` puis ouvrir http://localhost:8080/?demo
- Le GPS du navigateur ne marche qu'en HTTPS (ou localhost).

## Base Supabase (projet « APP projet », ref ygekcpnsjbbdgtmlxdce, région eu-west-1)
Tables : establishments (54, lecture publique ; enseignes : McDonald's, Burger King, KFC, Quick, Subway, Buffalo Grill, O'Tacos, Starbucks, Flunch), reports, profiles, favorites, badges (18),
user_badges, levels (100), app_settings, customizations (avatars/bannières + niveau requis), partners, partner_offers, partner_stats,
popular_times, opening_hours. Sécurité (RLS) active partout.
Sécurité (12/11/2026, supabase/2026-11-12_securite_perf.sql) : aucune écriture directe dans les tables depuis l'appli
(tout passe par les fonctions RPC) ; pseudo modifiable seulement via change_pseudo ; fonctions de compte interdites sans connexion.

Fonctions appelées par l'appli (RPC) :
| Fonction | Sans compte | Rôle |
|---|---|---|
| get_nearby_establishments(p_lat, p_lng, p_radius_m ≤ 5000, p_limit ≤ 50) | oui | restos proches + statuts |
| search_establishments(p_query ≥ 2 car., p_lat, p_lng, p_limit) | oui | recherche + statuts |
| get_service_status(p_establishment, p_service) | oui | statut d'un service |
| get_history(p_establishment, p_service, p_limit ≤ 5) | oui | 5 derniers signalements anonymes de moins de 12 h (app_settings history_max_hours) |
| get_ranking(p_scope 'month'|'all', p_city) | oui | classement du mois (remis à zéro le 1er) ou depuis le début (top 10 + moi, avec avatar) |
| get_public_profile(p_pseudo) | oui | profil public d'un joueur : jamais d'e-mail, de contact ni de lieu |
| calmer_nearby(p_id) | oui | « Plus calme à côté : … » |
| submit_report(p_establishment, p_service, p_level, p_wait, p_lat, p_lng, p_accuracy_m) | non | envoyer un signalement |
| get_my_profile(), get_badges_progress(), change_pseudo(new_pseudo) | non | compte |
| toggle_favorite(est), my_favorites() | non | favoris |
| export_my_data(), delete_my_account() | non | RGPD |
| set_customization(p_kind 'avatar'|'banner', p_code) | non | choisir son avatar / sa bannière (niveau contrôlé) |
| set_referrer(p_code) | non | déclarer son parrain (compte < 7 j, avant 1er signalement) |
| get_monthly_prize() | oui | lot du mois (table monthly_prizes, saisi à la main) ; rien affiché s'il n'y en a pas |
| get_partners() | oui | partenaires actifs + offre visible en ce moment |
| partner_track(p_establishment, p_kind 'view'|'click') | oui | compteur anonyme (vues de fiche, clics lien / tél.) |
| get_my_restaurant() | non | espace du restaurateur : chiffres 30 j + son offre |
| set_partner_offer(p_title, p_details, p_hours ≤ 168, p_only_when_calm) | non | publier / retirer (titre vide) son offre du jour |

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
- Parrainage : code à 6 caractères créé pour chaque compte (profiles.ref_code, unique grâce au trigger ensure_ref_code), affiché dans Réglages (Copier / Partager) ; lien ?p=CODE ; au 1er signalement validé du filleul (trigger sur reports) parrain +20 (max 10/30 j),
  filleul +10 ; badges 1, 10, 30 filleuls. Réglages dans app_settings (referral_*).
- Niveaux 1 à 100 : points ≈ 12 × (niveau − 1)^1,46 (niv. 2 = 10, 10 = 300, 50 = 3 575, 100 = 10 000) ; titres tous les 10 niveaux.
  Avatars (30) et bannières (17, dont 2 au niveau 1) : images choisies par Alexis (planches ChatGPT du 12/11/2026), découpées telles quelles
  et agrandies ×4 (outils/extract.py) → icons/avatars/*.webp, icons/banners/*.webp. Ne pas les redessiner.
  Table customizations (is_active) ; paliers 1, 5, 10 … 50, 60 … 100 ; bannière en bandeau entier en haut du profil (pas en fond : trop flou), thèmes alternés d'un palier à l'autre.
- Points des badges (ajoutés aux points normaux) : +1 par badge, +10 quand une catégorie (badges actifs) est complète
  (trigger sur user_badges, table badge_family_bonus, réglages badge_points / badge_family_bonus).
- Partenaires (12/11/2026) : tables partners (owner_id = compte du restaurateur, founder, tagline, lien https, téléphone),
  partner_offers (une offre à la fois, option « heures creuses » = salle calme ou un peu de monde, décidé par la base),
  partner_stats (compteurs anonymes par jour). Sur l'appli : ⭐ + 🎁 sur la liste et la pastille, encadré sur la fiche,
  « Mon restaurant » dans Réglages pour le propriétaire. Inscription d'un partenaire à la main (voir supabase/2026-11-12_partenaires.sql).
  Pas de paiement dans l'appli pour l'instant ; pas de classement sponsorisé. Démo de l'espace restaurateur : `?demo&resto`.
- Offre de lancement affichée : 3 mois offerts aux 10 premiers partenaires + badge « Partenaire fondateur » à vie.
- Lot du mois : bandeau 🏆 dans « Classement > Ce mois-ci » quand un lot existe pour le mois en cours.
- Affiche QR code : `affiche.html?r=ID` (A4, imprimable / PDF) ; QR → `?r=ID&src=affiche`. Bibliothèque vendor/qrcode.js (qrcode-generator, MIT).
  Lien dans « Mon restaurant » et dans le Mode test.
- Alerte « c'est calme + offre » aux favoris : à faire avec les notifications.
- Contact : contact.yadupeuple@gmail.com
- Slogans de l'écran d'accueil (dans cet ordre, en italique) :
  « Venu pour manger, pas pour poireauter. » → « Le parking, c'est pas un camping. » →
  « J'ai une pause déjeuner, pas un congé sabbatique. » → « Pas venu pour camper au Drive. » →
  « Pas besoin de poser un RTT pour un burger. »

## Charte graphique
Bleu nuit `#0B1F3A`, turquoise `#14B8A6`, blanc, touche jaune-orangé `#F5A524`.
Affluence : calme `#22C55E`, modéré `#EAB308`, animé `#F97316`, max `#EF4444`, aucune info `#9CA3AF`.

## Avant le lancement public (à ne pas oublier)
Nettoyer les données de test : décidé par Alexis le 12/11/2026 → remise à zéro des signalements (et des points/badges qui en découlent) au lancement, à faire seulement quand il dit « on lance » ; comptes gardés : Maylixela, Testeur1, Enthyy · réactiver la confirmation des e-mails dans
Supabase · vérification de la marque · tests terrain.
Fait le 12/11/2026 : mentions-legales.html (éditeur particulier anonyme, hébergeur GitHub), cgu.html, confidentialite.html mis à jour ;
liens sur l'accueil et en bas des Réglages. À refaire en version « professionnelle » (nom, adresse, SIRET) dès que les
partenaires paient ou qu'Alexis crée une micro-entreprise.

## Plus tard (idées validées, pas encore faites)
Alertes « C'est calme » sur les favoris (notifications) · statuts de fiabilité (Nouveau venu →
Pilier de la communauté) · défis et missions · page partenaire payante · stores Apple/Google.
Badges : images ChatGPT d'Alexis (icons/badges/*.webp), découpées telles quelles : planche 1 (outils/badges_sheet.py)
+ v10, drive10, explorer10, ref1, tour_zone refaits le 12/11/2026 (outils/badges_sheet2.py) ; ne pas redessiner ; gris tant que non gagnés ;
nouvelle disposition de la page Profil.

## Mises à jour
Après chaque modification du code, augmenter le numéro `?v=N` partout (imports des fichiers `js/`
et balise script de `index.html` / `demo.html`), sinon les téléphones gardent l'ancienne version en cache.

## Logo (choisi par Alexis, à utiliser tel quel, ne pas redessiner)
`icons/logo-complet.png` (logo avec texte) et `icons/icon-1024.png` (bulle seule, icône d'appli ;
déclinée en icon-512 / icon-192).
