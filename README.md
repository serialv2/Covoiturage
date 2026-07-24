# Covoit'CP V2

Version entièrement reprise pour un nouveau projet Supabase dédié.

## Fonctionnement

- Inscription par e-mail et mot de passe.
- Pas de message de confirmation.
- Les nouveaux comptes passent en `pending`.
- L'administrateur valide ou refuse les comptes depuis le site.
- Groupes de covoiturage avec code d'invitation.
- Trajets aller-retour.
- Conducteur et passagers.
- Comptes séparés entre chaque paire de collègues.
- RLS activé.

## Installation Supabase

1. Créer le nouveau projet Supabase.
2. Dans `Authentication > Providers > Email`, désactiver **Confirm email**.
3. Ouvrir `SQL Editor`.
4. Exécuter tout le fichier `schema.sql`.
5. Aller dans `Project Settings > API`.
6. Copier :
   - Project URL
   - Publishable key
7. Les coller dans `config.js`.

## Premier administrateur

1. Inscris-toi normalement depuis le site.
2. Dans Supabase > SQL Editor, exécute :

```sql
update public.profiles
set status = 'approved',
    is_admin = true
where email = 'TON_ADRESSE_EMAIL';
```

3. Déconnecte-toi puis reconnecte-toi.
4. Le menu **Administration** apparaîtra.

## GitHub Pages

Place tous les fichiers à la racine du dépôt GitHub :

- `index.html`
- `style.css`
- `app.js`
- `config.js`
- `schema.sql`
- `README.md`

Puis active :

`Settings > Pages > Deploy from a branch > main > /(root)`

L'adresse sera normalement :

`https://serialv2.github.io/Covoiturage/`
