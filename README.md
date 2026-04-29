# Sûreté — Formulaire de vérification de concordance de chargement 2026

Formulaire standalone déployable sur **Vercel**, avec insertion automatique dans **Supabase**.  
Les credentials ne transitent jamais par le navigateur.

## Architecture

```
Navigateur
  └─ POST /api/submit (JSON, sans credential)
        └─ Vercel Serverless Function  ← lit .env côté serveur
              └─ POST Supabase REST API (service_role key)
                    └─ Table db_verifications_chargement
```

---

## Structure du projet

```
surete-form/
├── api/
│   └── submit.js          ← Fonction serverless Vercel (proxy sécurisé)
├── public/
│   └── index.html         ← Formulaire HTML (aucun credential dedans)
├── .env.example           ← Template des variables (à copier en .env.local)
├── .gitignore             ← Exclut .env.local et node_modules
├── package.json
└── vercel.json            ← Routing Vercel
```

---

## Déploiement pas à pas

### 1. Préparer le dépôt Git

```bash
git init
git add .
git commit -m "init: formulaire sûreté avec proxy Vercel"
```

Pousser sur GitHub / GitLab (compte public ou privé).

### 2. Importer sur Vercel

1. Aller sur [vercel.com](https://vercel.com) → **Add New Project**
2. Sélectionner ton dépôt
3. Framework Preset : **Other** (pas de framework)
4. **Ne pas modifier les Build Settings** — vercel.json s'en charge
5. Cliquer **Deploy** (le 1er déploiement échouera sans les variables — c'est normal)

### 3. Configurer les variables d'environnement sur Vercel

Dans ton projet Vercel → **Settings → Environment Variables**, ajouter :

| Nom | Valeur | Environnements |
|-----|--------|----------------|
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Production, Preview, Development |
| `SUPABASE_SERVICE_KEY` | `eyJ...` (service_role) | Production, Preview, Development |
| `TABLE_NAME` | `db_verifications_chargement` | Production, Preview, Development |
| `ALLOWED_ORIGINS` | `https://surete-form.vercel.app` | Production |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | Development |

> ⚠️ Utiliser la clé **service_role** (pas anon) — elle reste côté serveur uniquement.

Redéployer après avoir ajouté les variables : **Deployments → Redeploy**.

### 4. Développement local

```bash
# Installer Vercel CLI
npm i -g vercel

# Copier le template .env
cp .env.example .env.local
# Remplir .env.local avec tes vraies valeurs

# Lancer en local (simule l'environnement Vercel avec les fonctions)
vercel dev
# → Ouvre http://localhost:3000
```

### 5. Configurer Supabase (RLS)

Avec la `service_role` key, le RLS est bypassé côté serveur — c'est intentionnel et sécurisé car la clé n'est jamais exposée.  
Si tu veux quand même activer le RLS pour plus de contrôle :

```sql
-- Activer RLS sur la table
ALTER TABLE db_verifications_chargement ENABLE ROW LEVEL SECURITY;

-- La service_role key bypass le RLS automatiquement (comportement Supabase par défaut)
-- Aucune policy supplémentaire nécessaire pour le INSERT depuis le serveur
```

---

## Variables d'environnement — référence

| Variable | Description | Où trouver |
|----------|-------------|------------|
| `SUPABASE_URL` | URL du projet Supabase | Dashboard → Settings → API → Project URL |
| `SUPABASE_SERVICE_KEY` | Clé service_role | Dashboard → Settings → API → service_role |
| `TABLE_NAME` | Nom de la table cible | `db_verifications_chargement` par défaut |
| `ALLOWED_ORIGINS` | Domaines autorisés (CORS) | Ton URL Vercel |

---

## Sécurité

- ✅ Aucun credential dans le code HTML ou JS frontend
- ✅ Clé `service_role` exclusivement côté serveur (Vercel Function)
- ✅ Whitelist des colonnes dans `api/submit.js` (protection injection)
- ✅ Validation des champs obligatoires côté serveur
- ✅ CORS restreint aux origines configurées
- ✅ `.env.local` exclu du Git via `.gitignore`
