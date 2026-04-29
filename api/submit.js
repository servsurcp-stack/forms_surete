// api/submit.js — Vercel Serverless Function
// Les variables d'environnement sont lues côté serveur uniquement.
// Le navigateur ne voit jamais SUPABASE_URL ni SUPABASE_SERVICE_KEY.

const SUPABASE_URL        = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY; // service_role key (pas anon)
const TABLE_NAME          = process.env.TABLE_NAME ?? 'db_verifications_chargement';

// Colonnes autorisées (whitelist) — évite toute injection de colonnes inattendues
const ALLOWED_FIELDS = new Set([
  'heure_de_debut',
  'heure_de_fin',
  'date',
  'nom_verificateur',
  'nom_de_la_personne_en_charge',
  'lieu_de_la_verification',
  'appartenance_du_conducteur',
  'tournee',
  'pda',
  'immatriculation',
  'type_de_verification',
  'region',
  'agences_antennes',
  'anomalie',
  'anomalie_de_chargement',
  'commentaires_chargement',
  'anomalie_de_vehicule',
  'commentaires_vehicule',
  'chauffeur_sorti_effectifs',
  'sanction_rh',
  'anomalie_suivi_de_tournee',
  'actions_commentaires_divers',
]);

export default async function handler(req, res) {
  // ── CORS : accepter uniquement ton domaine Vercel ──────────────
  const origin = req.headers.origin ?? '';
  const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim());

  if (allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origin non autorisée.' });
  }
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight OPTIONS
  if (req.method === 'OPTIONS') return res.status(204).end();

  // ── Méthode ────────────────────────────────────────────────────
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Méthode non autorisée.' });
  }

  // ── Vérification config ────────────────────────────────────────
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Variables SUPABASE_URL ou SUPABASE_SERVICE_KEY manquantes.');
    return res.status(500).json({ error: 'Configuration serveur incomplète.' });
  }

  // ── Lecture et validation du body ──────────────────────────────
  let body;
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: 'Body JSON invalide.' });
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body attendu : objet JSON.' });
  }

  // Filtrer uniquement les colonnes autorisées
  const payload = Object.fromEntries(
    Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key))
  );

  // Champs obligatoires minimaux
  const requiredFields = ['date', 'type_de_verification', 'region', 'anomalie'];
  const missing = requiredFields.filter(f => !payload[f]);
  if (missing.length > 0) {
    return res.status(422).json({
      error: 'Champs obligatoires manquants.',
      missing,
    });
  }

  // ── Envoi vers Supabase ────────────────────────────────────────
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
      return res.status(502).json({
        error : 'Erreur lors de l\'insertion en base.',
        detail,
      });
    }

    return res.status(201).json({ success: true });

  } catch (err) {
    console.error('Fetch Supabase failed:', err);
    return res.status(500).json({ error: 'Erreur réseau vers Supabase.' });
  }
}
