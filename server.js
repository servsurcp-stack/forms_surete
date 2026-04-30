// server.js — Point d'entrée Express
// Sert les fichiers statiques (public/) et la route API (/api/submit)
// Compatible Render (Web Service Node)

import express          from 'express';
import path             from 'path';
import { randomUUID }   from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────
app.use(express.json());

// ── CORS ───────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',').map(s => s.trim()).filter(Boolean);

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

// ── Fichiers statiques ─────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ══════════════════════════════════════════════════════
//  PREPROCESSING — reproduit la logique du script Python
// ══════════════════════════════════════════════════════

const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

// Arrondir à la demi-heure la plus proche (identique à arrondir_demi_heure Python)
function arrondirDemiHeure(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  let min = d.getMinutes();
  if (min < 15)       { min = 0; }
  else if (min < 45)  { min = 30; }
  else                { d.setHours(d.getHours() + 1); min = 0; }
  d.setMinutes(min, 0, 0);
  // Retourner uniquement l'heure HH:MM:SS comme le fait .dt.time en Python
  return d.toTimeString().slice(0, 8);
}

// Nom du jour en français depuis une date ISO
function jourFr(isoString) {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d)) return null;
  // Capitaliser comme pandas day_name(locale='fr_FR')
  const nom = JOURS_FR[d.getDay()];
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

// Mapping anomalies de chargement (identique au script Python)
const MAPPING_CHARGEMENT = {
  'Autre'                                                   : 'Autre',
  'Colis en cabine'                                         : 'Colis en cabine',
  'Colis non scanné (prévu pour ce chauffeur-livreur)'      : 'Colis non scanné',
  'Colis non prévu pour ce chauffeur-livreur'               : 'Colis non prévu',
  'Adhésif Colis Privé dans le véhicule'                    : 'Adhésif Colis Privé',
};

// Mapping anomalies de véhicule
const MAPPING_VEHICULE = {
  'Clef laissé sur le contact'        : 'Clef laissée sur le contact',
  'Clef laissée sur le contact'       : 'Clef laissée sur le contact',
  'Défaut de verrouillage'            : 'Défaut de verrouillage',
  'Etat général'                      : 'Etat général',
  'État général'                      : 'Etat général',
  'Manque séparation cabine/caisse'   : 'Manque séparation cabine/caisse',
  'Passager non autorisé'             : 'Passager non autorisé',
  'Véhicule vitré'                    : 'Véhicule vitré',
};

// Mapping anomalies suivi de tournée
const MAPPING_TOURNEE = {
  'Colis en cabine'                            : 'Colis en cabine',
  'Colis non autorisé'                         : 'Colis non autorisé',
  'Défaut de verrouillage'                     : 'Défaut de verrouillage',
  'Moteur tournant ou clef sur le contact'     : 'Moteur tournant ou clef sur le contact',
  'PDA laissé dans le véhicule'                : 'PDA laissé dans le véhicule',
};

/**
 * Transforme une chaîne d'anomalies séparées par des virgules (format form HTML)
 * en tableau uniformisé — identique au traitement split(";") + mapping du script Python.
 * Retourne ["Aucune anomalie"] si vide/null.
 */
function normaliserAnomalies(valeur, mapping) {
  if (!valeur || valeur.trim() === '') return ['Aucune anomalie'];
  // Le formulaire HTML sépare par ", " (join depuis les checkboxes)
  return valeur
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(item => mapping[item] ?? item); // fallback : garder la valeur brute
}

/**
 * Applique toutes les transformations de preprocessing sur le payload brut
 * reçu depuis le formulaire, avant insertion en base.
 */
function preprocessing(raw) {
  const p = { ...raw };

  // ── Champs calculés depuis heure_de_debut ─────────────
  if (p.heure_de_debut) {
    p.jour          = jourFr(p.heure_de_debut);
    p.heure_arrondie = arrondirDemiHeure(p.heure_de_debut);
  }

  // ── Uniformisation appartenance_du_conducteur ─────────
  if (p.appartenance_du_conducteur === 'COLIS PRIVE LIVRAISON') {
    p.appartenance_du_conducteur = 'COLIS PRIVE';
  }

  // ── Normalisation des anomalies → tableaux uniformisés ─
  p.anomalie_de_chargement  = normaliserAnomalies(p.anomalie_de_chargement,  MAPPING_CHARGEMENT);
  p.anomalie_de_vehicule    = normaliserAnomalies(p.anomalie_de_vehicule,    MAPPING_VEHICULE);
  p.anomalie_suivi_de_tournee = normaliserAnomalies(p.anomalie_suivi_de_tournee, MAPPING_TOURNEE);

  // ── Date au format YYYY-MM-DD ──────────────────────────
  if (p.date) {
    // Le champ date du form renvoie déjà "YYYY-MM-DD" — on s'assure du format
    const d = new Date(p.date);
    if (!isNaN(d)) p.date = d.toISOString().slice(0, 10);
  }

  return p;
}

// ── Route API : POST /api/submit ───────────────────────
const SUPABASE_URL         = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const TABLE_NAME           = process.env.TABLE_NAME ?? 'db_verifications_chargement';

// Whitelist des colonnes acceptées (= colonnes de la table SQL)
const ALLOWED_FIELDS = new Set([
  'id',
  'heure_de_debut', 'heure_de_fin', 'date',
  'lieu_de_la_verification', 'appartenance_du_conducteur',
  'type_de_verification', 'region', 'agences_antennes',
  'tournee', 'pda', 'immatriculation',
  'nom_verificateur', 'nom_de_la_personne_en_charge',
  'anomalie', 'anomalie_de_chargement', 'anomalie_de_vehicule', 'anomalie_suivi_de_tournee',
  'commentaires_chargement', 'commentaires_vehicule', 'actions_commentaires_divers',
  'chauffeur_sorti_effectifs', 'sanction_rh',
  'is_surete',
  // colonnes calculées côté serveur
  'jour', 'heure_arrondie',
]);

// Champs obligatoires
const REQUIRED_FIELDS = ['date', 'type_de_verification', 'region', 'anomalie'];

app.post('/api/submit', async (req, res) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Variables SUPABASE_URL ou SUPABASE_SERVICE_KEY manquantes.');
    return res.status(500).json({ error: 'Configuration serveur incomplète.' });
  }

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return res.status(400).json({ error: 'Body attendu : objet JSON.' });
  }

  // 1. Filtrer les colonnes autorisées
  const rawPayload = Object.fromEntries(
    Object.entries(body).filter(([key]) => ALLOWED_FIELDS.has(key))
  );

  // 2. Preprocessing (jour, heure_arrondie, anomalies, etc.)
  const payload = preprocessing(rawPayload);

  // 3. UUID unique généré côté serveur
  payload.id = randomUUID();

  // 4. Validation des champs obligatoires
  const missing = REQUIRED_FIELDS.filter(f => !payload[f]);
  if (missing.length > 0) {
    return res.status(422).json({ error: 'Champs obligatoires manquants.', missing });
  }

  // 5. Envoi vers Supabase
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

    return res.status(201).json({ success: true, id: payload.id });

  } catch (err) {
    console.error('Fetch Supabase failed:', err);
    return res.status(500).json({ error: 'Erreur réseau vers Supabase.' });
  }
});

// ── Fallback → index.html ──────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Démarrage ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
});