# Y'a du peuple ? — règles du projet

Appli web (installable sur téléphone) qui montre l'affluence des fast-foods de toute la France en direct,
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
Tables : establishments (4 156 en France métropolitaine depuis le 15/11/2026, dont les 95 relevés à la main en Moselle, Mulhouse, Carcassonne ; lecture publique ; enseignes : McDonald's, Burger King, KFC, Quick, Subway, Buffalo Grill, O'Tacos, Starbucks, Flunch), reports, profiles, favorites, badges (21),
user_badges, levels (100), app_settings, feedback (avis, lecture réservée à Supabase), customizations (avatars/bannières + niveau requis), partners, partner_offers, partner_stats,
popular_times, opening_hours. Sécurité (RLS) active partout.
Sécurité (12/11/2026, supabase/2026-11-12_securite_perf.sql) : aucune écriture directe dans les tables depuis l'appli
(tout passe par les fonctions RPC) ; pseudo modifiable seulement via change_pseudo ; fonctions de compte interdites sans connexion.

Fonctions appelées par l'appli (RPC) :
| Fonction | Sans compte | Rôle |
|---|---|---|
| get_nearby_establishments(p_lat, p_lng, p_radius_m ≤ 5000, p_limit ≤ 50) | oui | restos proches + statuts |
| get_statuses_in_box(p_south, p_west, p_north, p_east) | oui | statuts de tous les restos d'une zone (2° × 3° max, 1000 max ; v150) |
| search_establishments(p_query ≥ 2 car., p_lat, p_lng, p_limit) | oui | recherche + statuts |
| get_service_status(p_establishment, p_service) | oui | statut d'un service |
| get_history(p_establishment, p_service, p_limit ≤ 5) | oui | 5 derniers signalements anonymes de moins de 12 h (app_settings history_max_hours) |
| get_ranking(p_scope 'month'|'all', p_city) | oui | classement du mois (remis à zéro le 1er) ou depuis le début (top 100 = app_settings ranking_top + moi, avec avatar ; ligne « ma place » = carte bleu nuit alignée sur les autres, barre fixe hors de la feuille (#my-rank, myRankBar/alignMyRank, position fixed à 10 px du bas, alignée sur #lb-list, retirée par openSheet/closeSheet), v190 ; plus de bandeau « Version test » dans Classement) |
| get_last_month_podium() | oui | top 3 du mois précédent (podium dans Classement > Ce mois-ci, rien s'il est vide ; v152) |
| get_public_profile(p_pseudo) | oui | profil public d'un joueur : jamais d'e-mail, de contact ni de lieu |
| calmer_nearby_info(p_id) | oui | {id, name, distance_m, label} : resto plus calme **le plus proche** (≤ 5 km, v125), cliquable sur la fiche, avec « ‹ Retour à … » ; ancienne calmer_nearby (texte) gardée |
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
| submit_feedback(p_message 3-2000 car., p_context) | oui | avis / bug (Réglages > Donner mon avis) ; 10/jour par compte |
| get_push_public_key(), save_push_subscription(endpoint, p256dh, auth), delete_push_subscription(endpoint) | non | alertes favoris (notifications) : clé publique, abonner / désabonner ce téléphone |

Statut renvoyé : `{state, level, uncertain, wait, reliability, last_report_minutes, users_total, ...}`
- state : `ferme` (hors horaires d'ouverture, is_open_now = false, v131 : pas de niveau, ni suggestion « plus calme ») · `recent` (≤ 30 min) · `a_confirmer` (30-60 min) · `estimation` (habitudes, ≥ 3 jours et 3 personnes)
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
- Signalement à moins de 100 m ; points par compte, par resto et par jour (heure de Paris, salle + Drive ensemble) : 10 puis 5, puis 1 par mise à jour
  (points_update) pour 4 mises à jour max (max_update_points_per_day), puis 0 avec capped = true et message « Tu es là depuis un moment… »
  (16/11/2026, supabase/2026-11-16_points_par_jour.sql) ; un même service d'un même resto : 1 signalement toutes les 30 min par compte
  (app_settings min_gap_seconds = 1800, message « Tu pourras le refaire dans X min », 16/11/2026) ; tout est contrôlé par submit_report.
- Restos sans Drive (has_drive = false) : rien de ce qui touche au Drive ne s'affiche.
- Trajet estimé (13/11/2026, calé sur Google Maps) : route = vol d'oiseau × 1,3 en local → × 1,5 au-delà de 100 km ;
  15 premiers km à 46 km/h, le reste à 100 km/h (js/config.js ROUTE, estimateRoute dans levels.js). Durée en « 3 h 07 ».
  Depuis le 14/11/2026 : à l'ouverture d'une fiche, vrai trajet routier via OSRM (router.project-osrm.org, gratuit, sans clé) ; repli sur l'estimation si pas de réponse en 6 s.
- Parrainage : code à 6 caractères créé pour chaque compte (profiles.ref_code, unique grâce au trigger ensure_ref_code), affiché dans Réglages (Copier / Partager) ; lien ?p=CODE ; au 1er signalement validé du filleul (trigger sur reports) parrain +20 (max 10/30 j),
  filleul +10 ; badges 1, 10, 30 filleuls. Réglages dans app_settings (referral_*).
  Anti-triche (16/11/2026, v153, supabase/2026-11-16_parrainage_antitriche.sql) : plus de plafond (referral_max_30d = 0 = illimité) ;
  identifiant anonyme du téléphone (localStorage ydp_device → register_device → table user_devices) : filleul sur le même téléphone que son
  parrain ou qu'un autre filleul du même parrain → aucun point, profiles.referral_blocked = 'same_device' ; e-mails jetables refusés
  (table blocked_email_domains, email_allowed() vérifié par l'appli avant l'inscription ; trigger block_disposable_email sur auth.users,
  actif depuis le 16/11 au soir).
- Niveaux 1 à 100 : points ≈ 12 × (niveau − 1)^1,46 (niv. 2 = 10, 10 = 300, 50 = 3 575, 100 = 10 000) ; titres tous les 10 niveaux.
  Avatars (30) : images choisies par Alexis (planches ChatGPT du 12/11/2026), découpées telles quelles
  et agrandies ×4 (outils/extract.py) → icons/avatars/*.webp, icons/banners/*.webp. Ne pas les redessiner.
  Bannières = 19 rubans (16/11/2026, v141, planches ChatGPT d'Alexis outils/src/rubans_sheet2.png + rubans_sheet3.png, découpe
  outils/rubans_sheet2.py, sans ornement au milieu de la bande ; supabase/2026-11-16_nouveaux_rubans.sql) qui portent le pseudo sous l'avatar
  (hauteur + contour par ruban : custom.RIB dans app.js ; v210 : taille du pseudo réduite selon sa longueur, 20 caractères tiennent en entier, via --n + cqw). Niveaux (revus le 17/11, v169, supabase/2026-11-17_rubans_niveaux_glace_cafe.sql) : 1 (ciel, bonbon, turquoise, orange), 3 violet, 5 laurier, 8 nuit,
  10 vache, 12 damier, 14 flammes, 16 vert (feuilles, ancien ruban du 15/11 réactivé), 20 engrenage, 25 cœur, 30 fleurs, 40 flocon,
  50 étoile violette, 60 étoile or, 70 diamant (60 et 70 échangés le 18/11), 85 flamme violette, 100 couronne rouge. Images de profil Glace et Café ajoutées
  au niveau 1 (planche 1, outils/extract.py, bulle turquoise reprise des tacos par outils/avatar_centrer.py). Les 10 rubans du 15/11 et les anciennes bannières sont désactivés (fichiers gardés).
  Badges gagnés utilisables en image de profil
  (customizations.requires_badge, contrôlé par set_customization ; supabase/2026-11-15_rubans_avatars_badges.sql).
- Points des badges (ajoutés aux points normaux) : +1 par badge, +10 quand une catégorie (badges actifs) est complète
  (trigger sur user_badges, table badge_family_bonus, réglages badge_points / badge_family_bonus).
- Partenaires (12/11/2026) : tables partners (owner_id = compte du restaurateur, founder, tagline, lien https, téléphone),
  partner_offers (une offre à la fois, option « heures creuses » = salle calme ou un peu de monde, décidé par la base),
  partner_stats (compteurs anonymes par jour). Sur l'appli : ⭐ + 🎁 sur la liste et la pastille, encadré sur la fiche,
  « Mon restaurant » dans Réglages pour le propriétaire. Inscription d'un partenaire à la main (voir supabase/2026-11-12_partenaires.sql).
  Pas de paiement dans l'appli (décidé le 14/11/2026 : abonnement partenaire réglé en dehors ; idée de tarif dégressif à l'ancienneté) ; pas de classement sponsorisé. Démo de l'espace restaurateur : `?demo&resto`.
- Offre de lancement affichée : 3 mois offerts aux 10 premiers partenaires + badge « Partenaire fondateur » à vie.
- Lot du mois : bandeau 🏆 dans « Classement > Ce mois-ci » quand un lot existe pour le mois en cours ; sinon (et dans « Depuis le début ») encart 🎁 « Des récompenses arrivent bientôt » (v123).
- Affiche QR code : `affiche.html?r=ID` (A4, imprimable / PDF) ; QR → `?r=ID&src=affiche`. Bibliothèque vendor/qrcode.js (qrcode-generator, MIT).
  Lien dans « Mon restaurant » et dans le Mode test.
- Alertes « c'est calme » sur les favoris (18/11/2026, v195, supabase/2026-11-18_alertes_favoris.sql, fonction Edge supabase/functions/send-calm-alert) :
  Réglages > carte « Alertes sur tes favoris » (Activer / Désactiver, pushCardHtml / bindPushCard dans app.js ; sw.js = service worker, uniquement notifications, pas de cache).
  Tables push_subscriptions, push_log, push_config (RLS sans règle, aucun accès depuis l'appli). Déclencheur reports_push_calm : signalement « calme » sur un resto qui a des favoris,
  sauf s'il était déjà calme depuis < 60 min (push_quiet_minutes) → appelle la fonction Edge (secret partagé hook_secret en base) → push_targets décide : abonné, favori, pas l'auteur,
  8 h-22 h Paris (push_hour_from / push_hour_to), 1 alerte par resto et par jour, 3 par compte et par jour (push_max_per_day). Clés VAPID créées par la fonction Edge et gardées dans push_config (jamais dans l'appli).
  Sur iPhone : seulement si l'appli est installée sur l'écran d'accueil. Pas encore : offre partenaire dans la notif. **Pas testé de bout en bout sur un vrai téléphone** (testé : base, fonction Edge init, écran Réglages en démo).
- Filtres (bouton entre la loupe et le profil) : affluence (4 niveaux ; « aucune info » retiré le 13/11/2026), enseignes, « Avec Drive » ;
  s'appliquent à la carte et à la liste du bas, gardés sur le téléphone (localStorage ydp_filters).
- Base gratuite gardée éveillée (21/11/2026) : Supabase met en pause un projet gratuit après 7 jours sans activité. `.github/workflows/garder-supabase-eveille.yml` appelle get_partners (clé publique) 2 fois par jour ; échec visible dans l'onglet Actions du dépôt GitHub.
- Contact : contact.yadupeuple@gmail.com
- Écran de lancement et accueil turquoise (21/11/2026, v203, essai demandé par Alexis) : accueil = ancien bleu nuit inversé (fond dégradé turquoise #18C8B4 → #0D9488 comme la carte de fin des vidéos, boutons bleu nuit, textes bleu nuit) ;
  écran de démarrage (html.booting, css `body::before`) = logo complet sur turquoise (icons/logo-boot.png) ; v207 (21/11, couleurs relevées sur la capture de la slide vue sur le téléphone d'Alexis) : fond = dégradé CSS #46B8B9 → #2F9193 (v208, un peu plus vif ; v209 : logo plus gros sur les icônes, theme-color aussi en clair/sombre) + halo blanc léger ; logo complet d'origine avec l'écriture décalée vers la droite comme sur la slide (bulle + écriture, même proportions que la slide, ≈ 55 % de la largeur) identique sur accueil, démarrage et icônes ; manifest background_color #46B8B9 (= haut du dégradé), icônes « any » transparentes (icon-192, splash-512), « maskable » = splash-mask-512.png ; apple-touch-icon = icon-512 ; theme_color bleu nuit. **Pas testé sur un vrai téléphone** : désinstaller puis réinstaller le raccourci. Retour arrière : remettre #0B1F3A et les icônes d'avant (git).
- Slogans de l'écran d'accueil (dans cet ordre, en italique) :
  « Venu pour manger, pas pour poireauter. » → « Le parking, c'est pas un camping. » →
  « J'ai une pause déjeuner, pas un congé sabbatique. » → « Pas venu pour camper au Drive. » →
  « Pas besoin de poser un RTT pour un burger. »

- Zone de Mulhouse (12/11/2026, supabase/2026-11-12_zone_mulhouse.sql) : 21 restos (Mulhouse, Kingersheim, Illzach, Wittenheim,
  Sausheim, Rixheim, Lutterbach, Morschwiller-le-Bas), horaires + courbes + Drive relevés sur Google Maps.
- Ajouts du 13/11/2026 (supabase/2026-11-13_jarny_woippy.sql) : McDonald's Conflans-en-Jarnisy, Woippy et aire A4 Saint-Privat,
  KFC Semécourt, Subway Metz Muse, Burger King Clouange.
- Zone de Carcassonne / Limoux (14/11/2026, supabase/2026-11-14_carcassonne_limoux.sql) : 14 restos (11 restent au 21/11 après nettoyage des fermés) ; Drive et horaires des sites
  officiels (BK, KFC) et d'OpenStreetMap ; courbes Google relevées lors du relevé en masse du 16/11 pour 10 restos sur 11 ; BK Carcassonne Rocadest : Google n'a aucune donnée (vérifié le 21/11, resto récent) → courbe type, à revérifier dans 3-6 mois.
- France entière (15/11/2026, v117, supabase/2026-11-15_import_france_1.sql et _2.sql) : source AllThePlaces (localisateurs officiels,
  run 2026-10-31) téléchargée par la base elle-même (extensions http / pg_net, schéma privé `import`) ; colonnes establishments.source /
  source_ref ('atp:<spider>', réf. officielle) ; horaires convertis par import.oh_parse ; Drive = drive_through officiel ; restos déjà
  présents (même enseigne < 200 m) gardés et seulement reliés. 9 doublons manuel/import à 200-400 m supprimés le 15/11 (supabase/2026-11-15_doublons_import.sql, accord d'Alexis). Relancer : re-télécharger import.atp_raw puis `select * from import.apply_atp();`.
  KFC et Subway ajoutés le 15/11 depuis OpenStreetMap (supabase/2026-11-15_kfc_subway.sql : +368 KFC, +307 Subway, source 'osm',
  villes/rues via geo.api.gouv.fr et api-adresse.data.gouv.fr ; KFC sans info = Drive sauf centre-ville).
- Carte (v117) : pastilles créées seulement pour les restos à l'écran, regroupement par grille + fusion des groupes voisins ;
  statuts : v150, un seul appel get_statuses_in_box pour la zone affichée élargie (zoom ≥ 7) + préchargement ±0,6° lat / ±0,9° lng autour de la position (ou du dernier endroit regardé) dès l'ouverture, cache 60 s (supabase/2026-11-16_statuts_zone.sql) ; chargement par pages de 1000 (limite Supabase).
  Plus de zones : à l'ouverture, toujours sur la position si la localisation est autorisée (v154 : position récente du téléphone + attente jusqu'à 6 s) ;
  sans GPS, la carte s'ouvre sur le dernier endroit regardé (localStorage ydp_view), sinon France entière
  + bulle « Tous les fast-foods de France sont là. 🔍 Ma ville » (ouvre la recherche, qui cherche aussi par ville).
  Bandeau « Pas de connexion » + Réessayer.
  v133 : au chargement, fond bleu (html.booting) tant qu'on ne sait pas s'il faut l'accueil ou la carte ; pastilles masquées
  jusqu'à la plongée d'entrée (apparaissent pendant le zoom, dès 7,5). (Limite de 100 km essayée puis retirée en v134 à la demande d'Alexis.)
- Mise à jour des courbes Google tous les 3-6 mois : outils/maj_courbes.md + outils/gmaps_extract.js.
  Relevé en masse (15/11/2026, tous les restos) : outils/gmaps_batch.js dans le Chrome d'Alexis → import.gmaps_raw (trigger → popular_times),
  supabase/2026-11-15_courbes_google_france.sql. Terminé le 16/11 : 3 621 restos sur 4 248 ont une vraie courbe ; 87 marqués « fermé » par Google,
  revérifiés : 68 supprimés le 16/11 (supabase/2026-11-16_restos_fermes.sql, accord d'Alexis), 19 gardés ; 24 sans horaires ou fermés supprimés + 24 horaires ajoutés (supabase/2026-11-16_horaires_manquants.sql) ; tous les restos ont des horaires ; fonction import_gmaps_batch supprimée le 21/11 (accord d'Alexis).

- Réglages (17/11/2026, v184) : cartes au style de l'appli : v185 : carte bleu nuit « Ton pseudo » (avatar + Modifier → openPseudo), carte turquoise installation (si possible), carte turquoise « Ton avis compte », carte restaurateur, puis Se déconnecter / Supprimer mon compte (sans titre « Compte ») ; plus de parrainage ici (il est sur le profil) ; le Mode test (position fictive + affiches QR)
  est sorti des Réglages → bulle 🧪 à côté de 🎨 dans l'en-tête du compte, visible seulement pour le compte testeur (TEST_ACCOUNTS).

- Badges (17/11/2026, v159) : images v50 (10 signalements) et v100 (25) inversées à la demande d'Alexis (fichiers échangés).
  Animation « Nouveau badge débloqué ! » (checkNewBadges dans refreshProfile : compare profile.badges à localStorage ydp_seen_badges_<id> ;
  1re fois sur un téléphone = rien ; plusieurs badges → l'un après l'autre, bouton « Suivant (encore N) »).
- Vitesse de la carte (17/11/2026, v163) : restos + horaires chargés par 5 pages en parallèle (pagesInParallel dans api.js) et gardés 24 h sur le téléphone (localStorage ydp_est_cache_v1, mis à jour en arrière-plan) ; fadeDuration 0, cache de tuiles 400 ; plongée d'entrée raccourcie (1,9 s) ; groupes de pastilles réutilisés pendant le zoom ; preconnect vers OpenFreeMap et Supabase.
- Images (17/11/2026, v166) : badges ronds détourés en cercle parfait et lisse, v167 (outils/badge_sans_ombre.py ; regulier8, regulier12, testeur, tour_zone10 non ronds = images d'origine ; originaux outils/src/badges_avant_ombre/) ; dessins des 30 avatars recentrés dans leur bulle (outils/avatar_centrer.py, dessin seulement déplacé, bulle reconstituée ; originaux outils/src/avatars_avant_centrage/).
- Badges Fiabilité (17/11/2026, v168, supabase/2026-11-17_badges_fiabilite.sql) ; **verrouillés le 18/11 (is_active = false, supabase/2026-11-18_badges_fiabilite_verrouilles.sql, « Bientôt disponibles » 🔒) tant qu'il y a peu d'utilisateurs ; rouvrir : update badges set is_active = true where kind = 'confirmed'** : (kind 'confirmed') :
  Fiable (10 signalements confirmés, image éclair), Sentinelle (code coup_de_feu, 20 confirmés, image bouclier ; remplace « pic d'affluence »),
  Œil de lynx (50 confirmés, diamant). Confirmé = un autre compte signale le même resto + même service à 30 min près, niveau égal ou voisin
  (confirmed_reports_count) ; trigger reports_award_confirmed : le badge tombe aussi quand c'est l'autre qui confirme.
- Images de profil v2 (17/11/2026, v170, supabase/2026-11-17_images_profil_v2.sql) : planche de 40 images d'Alexis
  (outils/src/planche_profil_v2.png) agrandie ×4 et recentrée (outils/avatars_v2.py ; v171-172 : fond turquoise d'avant (repris des tacos) pour toutes, montagne comprise (ciel retiré) ; ombres bleues sous les dessins retirées ; tache au-dessus du palmier retirée) ; niveaux : 1 burger frites pizza soda
  hotdog tacos glace café · 3 sandwich milkshake · 5 pop-corn donut · 8 pomme patte · 10 cœur musique · 15 étoile foot · 18 basket photo ·
  20 chat chien · 25 panda arbre · 30 gamer cadeau · 35 trèfle éclair · 40 feu lunettes · 45 alien robot · 50 trophée · 55 ninja pirate ·
  60 montagne · 70 vacances · 80 diamant · 90 fusée · 100 couronne. Désactivées (fichiers gardés, outils/src/avatars_v1/) : cupcake, voiture,
  renard, chouette, ours, lion, médaille, licorne, dragon.
- Badges villes (17/11/2026, v173, supabase/2026-11-17_badges_villes.sql) : nouvelles images (planche d'Alexis outils/src/badges_voyage.png,
  outils/badges_voyage.py) : tour_zone « Tour de la zone » (5 villes, carte et repères), tour_zone6 « Baroudeur » (10 villes, monuments),
  tour_zone10 « Globe-trotteur » (20 villes, avion) (version finale validée par Alexis le 17/11 au soir) ; paliers 5/10/20 depuis le 17/11 (avant 3/6/10) ; anciennes images dans outils/src/badges_villes_v1/.
- Badges restaurants (17/11/2026, v175, supabase/2026-11-17_badges_restos.sql, planche d'Alexis outils/src/badges_restos.png,
  outils/badges_restos.py : cadenas retiré, anneau refait par dégradé entre les deux bords (sans démarcation), bord suivi angle par angle pour ôter le trait blanc) : Explorateur 5 (montagne), Gastronome 10 (toque, ex « Fin gourmet »),
  Cartographe 15 (carte + boussole), Habitué du Drive (route ; code explorer20 mais kind drive_reports : 20 signalements au Drive, rangé après « Éclaireur du Drive »), Voyageur international 30 (avion) ;
  anciennes images explorer/explorer10 dans outils/src/badges_restos_v1/.
- Vitesse du compte (17/11/2026, v179) : la base répond en < 15 ms, l'attente venait des allers-retours réseau à chaque onglet.
  Profil affiché tout de suite s'il est déjà connu (mise à jour en arrière-plan) ; badges, classement, podium et favoris gardés en mémoire
  (acctCache) et préchargés 2,5 s après la connexion et à l'ouverture du compte (prefetchAccount) ; vidés à la déconnexion. v191 : images des badges, avatars et rubans téléchargées à l'avance une fois (preloadAccountImages).
- Fluidité du déplacement (v199, 18/11/2026) essayée puis annulée en v200 (plus saccadé chez Alexis) : pixelRatio ≤ 2, renderWorldCopies false, marge pastilles 0,6, contain sur .pill → ne pas refaire tel quel.
- Saccades au zoom (18/11/2026, v201) : les groupes de pastilles ne sont plus recalculés pendant le zoom (seulement pendant la plongée d'entrée, introZoom) ; pastilles réduites par une classe `map-compact` sur la carte, changée au seul passage du seuil 11,5 (avant : chaque pastille retouchée à chaque image) ; sw.js ne trie plus le cache qu'une fois par minute (avant : à chaque tuile). Non mesuré sur un vrai téléphone.
- Saccades (suite, v202, d'après la vidéo d'Alexis : arrêts de 0,2-0,4 s environ chaque seconde) : tout le travail lourd après un déplacement (pastilles, liste du bas, statuts) attend 250 ms de carte immobile (mapMoving / settleTimer) et est annulé si on rebouge ; statuts reçus pendant un déplacement repeints à l'arrêt (pendingPaint) ; maybeNudge au plus toutes les 10 s avec tri rapide par zone. Non mesuré sur un vrai téléphone.
- Chrono de démarrage (18/11/2026, v198) : js/app.js `mark()` / `perf` (compte, carte, restos, GPS, plongée, liste, tuiles, statuts) ; les 12 dernières ouvertures sont gardées dans localStorage `ydp_perf` et listées dans 🧪 Mode test > « Ouvertures récentes » (compte testeur). Sert à voir ce qui est lent sur le téléphone d'Alexis ; à retirer ou garder discret au lancement.
- Mémoire de la carte (18/11/2026, v197, sw.js) : le service worker garde le fond OpenFreeMap sur le téléphone (cache ydp-map-v1, 700 entrées max, les plus anciennes retirées) : tuiles / polices / icônes = copie gardée d'abord ; style + liste des versions = copie gardée puis mise à jour en arrière-plan. Le code de l'appli n'est pas mis en cache (?v=N). Testé : logique du cache avec de faux serveurs ; **pas testé avec la vraie carte sur un téléphone**. Gain attendu surtout dès la 2e ouverture.
- Ouverture plus rapide (18/11/2026, v196) : start() n'attend plus le profil/favoris avant de lancer la carte ; plongée d'entrée partant de 10 de zoom au-dessus du dernier endroit regardé (ydp_view) au lieu de la France entière (vue lointaine gardée à la 1re ouverture), 1,3 s au lieu de 1,9 s dans ce cas ; attente du GPS 3,5 s max (avant 6 s). Non mesuré sur un vrai téléphone.
- Rappel « Tu es chez … » (18/11/2026, v194, maybeNudge dans app.js) : app ouverte + à moins de 100 m d'un resto ouvert → bandeau « Y'a du peuple ? » + bouton Signaler, 1 seule fois par jour (localStorage ydp_nudge_day, jour de Paris), disparaît après 20 s. Pas de notification à heure fixe (choix d'Alexis, peur de lasser).
- Signalement (v160-162) : petit lexique « 💡 Comment choisir ? » repliable (fermé par défaut) sous les 4 choix (LEXIQUE dans app.js, textes salle / Drive) ; le choix fait ressort, les autres s'estompent.

## Objectif et croissance (dit par Alexis le 15/11/2026)
But : aller au national (voire plus), pas seulement local ; pas forcément en vivre. Leviers : TikTok (compte « reportages » 13k, public français),
partenariats, affiches QR code, bouche-à-oreille. Fait en v116 : aperçu des liens partagés (balises Open Graph + icons/og.png,
outils/og_image.py), bouton « Inviter un ami » sur l'écran « Merci » après un signalement, installation sur l'écran d'accueil
(Réglages + écran « Merci » ; Android : fenêtre du navigateur, iPhone : explications), robots.txt + sitemap.xml.
Au changement de nom de domaine : mettre à jour APP_URL (js/app.js), les balises og:/canonical (index.html), robots.txt, sitemap.xml.
Idées proposées, pas encore décidées : pages Google par ville / resto,
bilan automatique du lundi.

## Testeurs (15/11/2026, supabase/2026-11-15_testeurs_avis.sql)
Phase de test ouverte : badge « Testeur fondateur » (code testeur, famille Spécial, kind 'beta') donné au 1er signalement validé
tant que app_settings.beta_open = 1 ; bouton « Donner mon avis / signaler un bug » dans Réglages (table feedback).
Bandeau 🧪 « Version test : points et badges remis à zéro au lancement… » dans Profil (plus dans Classement depuis v188) tant que beta_open = 1
(RPC get_app_flags, v140, supabase/2026-11-16_bandeau_version_test.sql) + ligne dans cgu.html (à retirer au lancement).
**Badge caché jusqu'au lancement** (15/11, v124, supabase/2026-11-15_badge_testeur_cache.sql) : enregistré dans user_badges mais invisible
(progression, profils), sans points, image de profil désactivée, tant que app_settings.beta_badge_visible = 0 (fonction badge_hidden).
Badge « Régulier » actif depuis le 16/11 (kind 'weeks' : 4 semaines d'affilée avec ≥ 1 signalement validé, report_week_streak ;
supabase/2026-11-16_badge_regulier.sql). Badges « Fidèle » (8 semaines) et « Inarrêtable » (12 semaines) ajoutés le 17/11 (v155,
supabase/2026-11-17_badges_regulier_8_12.sql, images outils/src/badges_semaines/semaines_7 (Fidèle, choix d'Alexis) et _6 ; les 5 autres de la planche en réserve ;
règle d'Alexis : plus le badge est difficile, plus il est beau et détaillé). Recrutement de 50 testeurs, priorité Thionville-Metz puis Mulhouse via TikTok et l'entourage, durée ~3 semaines.

## Charte graphique
Bleu nuit `#0B1F3A`, turquoise `#14B8A6`, blanc, touche jaune-orangé `#F5A524`.
Affluence : calme `#22C55E`, modéré `#EAB308`, animé `#F97316`, max `#EF4444`, aucune info `#9CA3AF`.

## Avant le lancement public (à ne pas oublier)
Nettoyer les données de test : décidé par Alexis le 12/11/2026 → remise à zéro des signalements (et des points/badges qui en découlent, **sauf le badge testeur, gardé à vie**) au lancement, mettre beta_open à 0, révéler le badge testeur (beta_badge_visible = 1, customization badge_testeur active, +1 pt : voir bas de supabase/2026-11-15_badge_testeur_cache.sql), à faire seulement quand il dit « on lance » ; comptes gardés : Maylixela (Testeur1 et Enthyy supprimés le 18/11 à la demande d'Alexis ; badge « Tour de la zone » de Maylixela retiré le 21/11, ancienne règle) · réactiver la confirmation des e-mails dans
Supabase · vérification de la marque · tests terrain.
Fait le 12/11/2026 : mentions-legales.html (éditeur particulier anonyme, hébergeur GitHub), cgu.html, confidentialite.html mis à jour ;
liens sur l'accueil et en bas des Réglages. À refaire en version « professionnelle » (nom, adresse, SIRET) dès que les
partenaires paient ou qu'Alexis crée une micro-entreprise.

## Plus tard (idées validées, pas encore faites)
statuts de fiabilité (Nouveau venu →
Pilier de la communauté) · mode nuit/jour dans Réglages (Auto / Clair / Sombre ; carte à assombrir par filtre, couleurs en dur à repasser ; mis de côté le 18/11) · défis et missions · page partenaire payante · stores Apple/Google.
Idée d'un ami (18/11/2026) : mesurer l'affluence sans signalement, par la position partagée en arrière-plan (comme les AirTags / Google). Pas faisable en appli web (pas de GPS appli fermée) ; demande une vraie appli sur les stores, beaucoup d'utilisateurs et un accord RGPD clair. Version légère possible plus tard : présence anonyme comptée appli ouverte près d'un resto, avec accord, en complément des signalements.
Badges : images ChatGPT d'Alexis (icons/badges/*.webp), découpées telles quelles : planche 1 (outils/badges_sheet.py)
+ v10, drive10, explorer10, ref1, tour_zone refaits le 12/11/2026, tour_zone6 (Globe-trotteur) le 14/11 (outils/badges_sheet2.py) ; tour_zone10 « Routard du burger » (10 villes, 14/11, outils/badge_detoure.py) ; testeur (loupe + insecte, 15/11, badge_detoure.py) ; en réserve : outils/src/badge_fusee_reserve.png (fusée, pour un futur badge « lancement ») ; ne pas redessiner ; gris tant que non gagnés ;
nouvelle disposition de la page Profil.

## Mises à jour
Après chaque modification du code, augmenter le numéro `?v=N` partout (imports des fichiers `js/`
et balise script de `index.html` / `demo.html`), sinon les téléphones gardent l'ancienne version en cache.

## Logo (choisi par Alexis, à utiliser tel quel, ne pas redessiner)
`icons/logo-complet.png` (logo avec texte) et `icons/icon-1024.png` (bulle seule, icône d'appli ;
déclinée en icon-512 / icon-192).
