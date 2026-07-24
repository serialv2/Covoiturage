# Covoit'CP V7 — Groupes et réservation

## Nouveautés

- choix du groupe depuis une liste ;
- plus besoin de saisir un code d'invitation ;
- changement de groupe depuis « Mon groupe » ;
- nombre de conducteurs affiché dans chaque journée du calendrier ;
- clic sur une journée pour voir les conducteurs ;
- nombre de passagers par conducteur ;
- bouton Rejoindre ;
- bouton Quitter si l'utilisateur est déjà passager ;
- les comptes sont automatiquement recalculés depuis les passagers enregistrés.

## Mise à jour

1. Conserver le vrai `config.js`.
2. Remplacer `index.html`, `css` et `js`.
3. Exécuter dans Supabase le fichier :
   `sql/patch_v7_groupes_et_rejoindre.sql`

Il n'est pas nécessaire de recréer toute la base.
