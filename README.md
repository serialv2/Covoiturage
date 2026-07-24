# Covoit'CP V5 — Architecture modulaire

Cette version reprend le projet dans une structure plus claire et plus facile à maintenir.

## Structure

- `index.html`
- `config.js`
- `css/style.css`
- `js/main.js`
- `js/state.js`
- `js/supabase.js`
- `js/utils.js`
- `js/data.js`
- `js/auth.js`
- `js/groups.js`
- `js/trips.js`
- `js/calendar.js`
- `js/accounts.js`
- `js/admin.js`
- `js/ui.js`
- `sql/schema.sql`

## Corrections incluses

- calendrier mensuel ;
- chargement forcé des fichiers avec `?v=5.0.0` ;
- création d'un trajet sans passager ;
- séparation du code par fonctionnalité ;
- conservation de l'authentification, des groupes, des comptes et de l'administration.

## Mise en ligne sur GitHub Pages

Remplace le contenu du dépôt GitHub par les fichiers et dossiers de cette archive.

La racine du dépôt doit contenir :

- `index.html`
- `config.js`
- `README.md`
- dossier `css`
- dossier `js`
- dossier `sql`

Il ne faut plus conserver l'ancien `app.js` ni l'ancien `style.css` à la racine.

Le fichier `config.js` doit conserver les véritables informations de ton projet Supabase.

## Important pour Supabase

Si la fonction Supabase autorisant un trajet sans passager n'est pas encore installée,
exécute le correctif SQL déjà fourni précédemment ou utilise la version à jour de `sql/schema.sql`
pour une nouvelle installation.
