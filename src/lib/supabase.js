// Client Supabase pour la synchronisation multi-appareils.
//
// Configuration via variables d'environnement Vite (fichier .env.local en
// développement — ignoré par Git — et variables du projet Vercel en prod) :
//   VITE_SUPABASE_URL=
//   VITE_SUPABASE_PUBLISHABLE_KEY=
//
// Seule la clé publiable (anon) est utilisée côté navigateur. Elle est conçue
// pour être publique et reste sûre car la sécurité au niveau des lignes (RLS)
// est active sur toutes les tables. Jamais de clé service_role ni de mot de
// passe de base ici.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '';

export const isSyncConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

export const supabase = isSyncConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'nt_supabase_auth',
      },
    })
  : null;
