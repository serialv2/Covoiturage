# Covoit'CP V3 — Option A

Architecture complète :

- Supabase Auth ;
- validation manuelle des comptes ;
- droits SQL explicites ;
- Row Level Security ;
- fonctions RPC sécurisées ;
- groupes de covoiturage ;
- trajets aller-retour ;
- comptes entre collègues ;
- administration des inscriptions.

## Étape 1 — Configuration de Supabase

Dans le nouveau projet :

1. Ouvre `Authentication`.
2. Ouvre les réglages du fournisseur `Email`.
3. Désactive la confirmation obligatoire de l'adresse e-mail.
4. Conserve l'inscription par e-mail et mot de passe activée.

## Étape 2 — Recréer la base Covoit'CP

Dans `SQL Editor` :

1. Ouvre le fichier `schema.sql`.
2. Copie tout son contenu.
3. Exécute-le en une seule fois.

Le script supprime uniquement les anciennes tables et fonctions Covoit'CP du schéma `public`.
Il ne supprime pas les utilisateurs de `Authentication > Users`.

Il recrée aussi les profils des utilisateurs déjà inscrits.

## Étape 3 — Configuration du site

Dans `config.js`, renseigne :

```javascript
export const SUPABASE_URL = "https://xxxxxxxx.supabase.co";
export const SUPABASE_PUBLIC_KEY = "sb_publishable_xxxxxxxxx";
```

Utilise uniquement la clé publique `publishable`.
Ne mets jamais une clé `secret` ou `service_role` dans GitHub.

## Étape 4 — Créer le premier administrateur

Inscris-toi depuis le site.

Puis exécute dans le SQL Editor :

```sql
update public.profiles
set status = 'approved',
    is_admin = true,
    updated_at = now()
where lower(email) = lower('TON_ADRESSE_EMAIL');
```

Vérifie ensuite :

```sql
select id, full_name, email, status, is_admin
from public.profiles
order by created_at desc;
```

Déconnecte-toi puis reconnecte-toi sur le site.

## Étape 5 — GitHub Pages

Dépose à la racine du dépôt :

- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `schema.sql`
- `README.md`

Puis :

`Settings > Pages > Deploy from a branch > main > /(root)`

Recharge ensuite le site avec `Ctrl + F5`.
