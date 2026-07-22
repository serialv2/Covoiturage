# Covoit'CP Maubeuge — V1

Première version fonctionnelle d’un site de covoiturage entre collègues.

## Fonctions incluses

- Création de compte et connexion par Supabase Auth.
- Création d’un groupe de covoiturage.
- Invitation par code.
- Groupe exemple : Valenciennes → CP Maubeuge.
- Point de rendez-vous : aire de covoiturage de Saultain.
- Enregistrement d’un aller-retour avec conducteur et passagers.
- Historique des trajets.
- Suppression d’un trajet par son créateur ou son conducteur.
- Comptes individuels entre collègues :
  - Baptiste a conduit Fred 3 fois.
  - Fred a conduit Baptiste 2 fois.
  - Baptiste a donc 1 trajet d’avance sur Fred.

## Installation

1. Créez un projet Supabase.
2. Ouvrez **SQL Editor** dans Supabase.
3. Exécutez entièrement le fichier `schema.sql`.
4. Dans **Authentication > Providers**, activez Email.
5. Le fichier `config.js` contient déjà l’URL du projet Supabase `keeraqtoiwvcybhavkfb`.
6. Remplacez seulement `COLLEZ_ICI_VOTRE_CLE_PUBLIQUE_SUPABASE` par la clé publique publishable/anon.
7. Servez le dossier avec un petit serveur HTTP local.

Exemple avec Python :

```bash
python -m http.server 8080
```

Puis ouvrez :

```text
http://localhost:8080
```

L’ouverture directe de `index.html` en `file://` peut bloquer les modules JavaScript. Utilisez donc bien un serveur local.

## Sécurité

- Ne mettez jamais la clé `service_role` dans le site.
- Utilisez uniquement la clé publique publishable/anon.
- La sécurité repose sur les politiques RLS du fichier SQL.
- Les utilisateurs ne voient que les groupes auxquels ils appartiennent.

## Structure

- `index.html` : interface.
- `style.css` : mise en page responsive.
- `app.js` : authentification, groupes, trajets et comptes.
- `schema.sql` : tables, fonctions et politiques RLS.
- `config.example.js` : modèle de configuration Supabase.
