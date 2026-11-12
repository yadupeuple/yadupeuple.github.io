# Mettre à jour les courbes d'affluence et les horaires (tous les 3 à 6 mois)

Les courbes viennent de Google Maps (relevés figés). Elles vieillissent : à refaire 2 à 4 fois par an,
ou quand un resto change d'horaires.

1. **Voir les plus anciennes** (Supabase, éditeur SQL) :
   ```sql
   select e.name, e.city, p.updated_at, o.updated_at as horaires
   from establishments e
   left join popular_times p on p.establishment_id = e.id
   left join opening_hours o on o.establishment_id = e.id
   order by p.updated_at nulls first;
   ```
2. **Relever chaque fiche** : ouvrir `https://www.google.com/maps/search/?api=1&query=<Nom resto ville>&hl=fr`
   puis exécuter `outils/gmaps_extract.js` (Claude in Chrome, 4 onglets en parallèle).
   - `g` vide → pas de courbe Google : l'appli garde sa courbe type.
   - un jour vide dans `g` → Google n'a pas assez de données : reprendre la veille.
   - heures 0 h-5 h en fin de journée = nuit du lendemain (index jour+1).
   - `ferme` non vide → resto fermé : demander à Alexis avant toute suppression.
3. **Écrire le SQL** sur le modèle de `supabase/2026-11-12_zone_mulhouse.sql`
   (`profile` = 168 valeurs, index = jour × 24 + heure, jour 0 = dimanche, NULL la nuit ;
   `hours` = 7 listes de [ouverture, fermeture] en minutes, fermeture après minuit > 1440),
   l'appliquer et garder le fichier dans `supabase/`.
4. **Vérifier** : comparer une empreinte md5 des profils en base avec celle calculée localement.
