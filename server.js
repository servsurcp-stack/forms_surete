// server.js — Point d'entrée Express
// Sert les fichiers statiques (public/) et la route API (/api/submit)
// Compatible Render (Web Service Node)

import express from 'express';
import path    from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000; // Render injecte PORT automatiquement

// ── Middleware ─────────────────────────────────────────
app.use(express.json());

// ── CORS ───────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin ?? '';
  if (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Fichiers statiques (formulaire HTML) ───────────────
app.use(express.static(path.join(__dirname, 'public')));

// ── Route API : POST /api/submit ───────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME           = process.env.TABLE_NAME ?? 'db_verifications_chargement';

// Colonnes autorisées (whitelist)
const ALLOWED_FIELDS = new Set([
  'heure_de_debut', 'heure_de_fin', 'date',
  'nom_verificateur', 'nom_de_la_personne_en_charge',
  'lieu_de_la_verification', 'appartenance_du_conducteur',
  'tournee', 'pda', 'immatriculation',
  'type_de_verification', 'region', 'agences_antennes',
  'anomalie', 'anomalie_de_chargement', 'commentaires_chargement',
  'anomalie_de_vehicule', 'commentaires_vehicule',
  'chauffeur_sorti_effectifs', 'sanction_rh',
  'anomalie_suivi_de_tournee', 'actions_commentaires_divers',
]);

app.post('/api/submit', async (req, res) => {
  // Vérification config serveur
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Variables SUPABASE_URL ou SUPABASE_SERVICE_KEY manquantes.');
    return res.status(500).json({ error: 'Configuration serveur incomplète.' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body attendu : objet JSON.' });
  }

  // Filtrer les colonnes autorisées
  const payload = Object.fromEntries(
    Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key))
  );

  // Champs obligatoires
  const required = ['date', 'type_de_verification', 'region', 'anomalie'];
  const missing  = required.filter(f => !payload[f]);
  if (missing.length > 0) {
    return res.status(422).json({ error: 'Champs obligatoires manquants.', missing });
  }

  // Envoi vers Supabase
  try {
    const supaRes = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE_NAME}`, {
      method : 'POST',
      headers: {
        'Content-Type' : 'application/json',
        'apikey'       : SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer'       : 'return=minimal',
      },
      body: JSON.stringify(payload),
    });

    if (!supaRes.ok) {
      const detail = await supaRes.text();
      console.error('Supabase error:', supaRes.status, detail);
      return res.status(502).json({ error: 'Erreur insertion en base.', detail });
    }

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error('Fetch Supabase failed:', err);
    return res.status(500).json({ error: 'Erreur réseau vers Supabase.' });
  }
});

// ── Fallback SPA (toutes les autres routes → index.html) ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Démarrage ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});