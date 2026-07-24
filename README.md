# Covoit'CP V6 — Mobile First

Cette version conserve l'architecture modulaire de la V5 et refond entièrement
l'interface pour un usage prioritaire sur téléphone.

## Nouveautés

- page de connexion moderne ;
- navigation fixe en bas de l'écran sur téléphone ;
- bouton flottant pour créer un trajet ;
- calendrier mensuel compact sur mobile ;
- détails et formulaires affichés comme des panneaux mobiles ;
- gros champs et boutons tactiles ;
- interface ordinateur conservée ;
- création de trajet sans passager toujours autorisée.

## Structure

- `index.html`
- `config.js`
- `css/style.css`
- `js/*.js`
- `sql/schema.sql`

## Mise à jour GitHub

Pour éviter de perdre tes identifiants Supabase :

1. conserve ton `config.js` actuel ;
2. remplace `index.html` ;
3. remplace les dossiers `css` et `js` ;
4. le dossier `sql` n'a pas besoin d'être exécuté à nouveau si la base fonctionne déjà.

Le fichier `index.html` charge `style.css?v=6.0.0` et `main.js?v=6.0.0`
pour contourner le cache GitHub Pages et Chrome.
