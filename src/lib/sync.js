// Couche de synchronisation multi-appareils (Supabase).
//
// Modèle « code de foyer » : un appareil crée un foyer et reçoit un code court
// (ex. NBM7-K4PX-W9QF) ; les autres appareils le rejoignent avec ce code. La
// base ne stocke que le hash du code. L'authentification est anonyme et
// invisible (signInAnonymously) ; elle sert uniquement à sécuriser l'accès via
// RLS — une session anonyme Supabase utilise le rôle `authenticated`.
//
// Stratégie locale d'abord : le stockage local reste la copie de travail
// instantanée et hors-ligne ; cette couche tire/pousse en arrière-plan.
// Conflits : « dernier écrit gagne » par updatedAt, avec règle déterministe en
// cas d'égalité (le tombstone gagne) — même règle côté serveur (upsert gardé).
import { supabase, isSyncConfigured } from './supabase.js';

export { isSyncConfigured };

// ── Codes d'invitation ──
// Normalisation : majuscules, sans espaces/tirets/ponctuation.
export function normalizeCode(code) {
  return (code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Affichage : groupes de 4 séparés par des tirets.
export function formatCode(code) {
  return normalizeCode(code).replace(/(.{4})(?=.)/g, '$1-');
}

// ── Conversion événement <-> ligne ──
function eventToRow(ev, householdId) {
  return {
    id: ev.id,
    household_id: householdId,
    type: ev.type,
    data: ev,
    occurred_at: ev.type === 'feed' ? ev.start : ev.time,
    updated_at: ev.updatedAt,
    deleted: !!ev.deleted,
    device_id: ev.deviceId || null,
  };
}

function rowToEvent(row) {
  return {
    ...row.data,
    id: row.id,
    type: row.type,
    updatedAt: row.updated_at,
    deleted: !!row.deleted,
  };
}

// `incoming` gagne-t-il sur `current` ? LWW par updatedAt ; en cas d'égalité
// stricte, le tombstone gagne (règle déterministe, identique au serveur).
function incomingWins(incoming, current) {
  const ti = new Date(incoming.updatedAt).getTime();
  const tc = new Date(current.updatedAt).getTime();
  if (ti !== tc) return ti > tc;
  return !!incoming.deleted && !current.deleted;
}

// Fusion d'une liste locale et d'une liste entrante (tombstones inclus).
export function mergeEvents(localList, incomingList) {
  const map = new Map();
  for (const e of localList) map.set(e.id, e);
  for (const e of incomingList) {
    const cur = map.get(e.id);
    if (!cur || incomingWins(e, cur)) map.set(e.id, e);
  }
  return [...map.values()];
}

// ── Authentification anonyme (invisible) ──
export async function ensureAuth() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) throw error;
  return data.user;
}

// ── Foyer / invitations ──
export async function createHousehold() {
  await ensureAuth();
  const { data, error } = await supabase.rpc('create_household');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { householdId: row.household_id, code: formatCode(row.invite_code) };
}

// Renvoie l'id du foyer rejoint, ou null si le code est invalide/révoqué.
export async function joinHousehold(code) {
  await ensureAuth();
  const { data, error } = await supabase.rpc('join_household', {
    code: normalizeCode(code),
  });
  if (error) throw error;
  return data || null;
}

// Révoque les codes existants et en génère un nouveau.
export async function regenerateInvite(householdId) {
  await ensureAuth();
  const { data, error } = await supabase.rpc('regenerate_invite', {
    h: householdId,
  });
  if (error) throw error;
  return formatCode(data);
}

// Révoque tous les codes actifs (personne ne peut plus rejoindre).
export async function revokeInvites(householdId) {
  await ensureAuth();
  const { error } = await supabase.rpc('revoke_invites', { h: householdId });
  if (error) throw error;
}

// ── Poussée (upsert gardé côté serveur : jamais d'écrasement d'une version
//    distante plus récente ; rejouable sans doublon car indexé par id) ──
export async function pushEvents(householdId, events) {
  if (!events.length) return;
  const rows = events.map((e) => eventToRow(e, householdId));
  const { error } = await supabase.rpc('upsert_events', { rows });
  if (error) throw error;
}

export async function pushBaby(householdId, baby) {
  const { error } = await supabase.rpc('upsert_baby', {
    h: householdId,
    d: baby,
    u: baby?.updatedAt || new Date().toISOString(),
  });
  if (error) throw error;
}

// ── Tirage ──
export async function pullEvents(householdId) {
  const { data, error } = await supabase
    .from('events')
    .select('*')
    .eq('household_id', householdId);
  if (error) throw error;
  return data.map(rowToEvent);
}

export async function pullBaby(householdId) {
  const { data, error } = await supabase
    .from('babies')
    .select('data, updated_at')
    .eq('household_id', householdId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { ...data.data, updatedAt: data.updated_at };
}

// ── Temps réel (complété par des pulls de rattrapage côté store) ──
export function subscribeHousehold(householdId, { onEvents, onBaby }) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`hh-${householdId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'events',
        filter: `household_id=eq.${householdId}`,
      },
      (payload) => {
        if (payload.new && payload.new.id) onEvents([rowToEvent(payload.new)]);
      },
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'babies',
        filter: `household_id=eq.${householdId}`,
      },
      (payload) => {
        if (payload.new && payload.new.data) {
          onBaby({ ...payload.new.data, updatedAt: payload.new.updated_at });
        }
      },
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}
