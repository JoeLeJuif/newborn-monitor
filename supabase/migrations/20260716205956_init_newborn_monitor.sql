-- Newborn Monitor — schéma initial multi-appareils.
-- Foyers, membres, invitations (code hashé), événements, profil bébé.
--
-- Sécurité :
--  * RLS activée sur toutes les tables ; lecture/écriture réservées aux
--    membres du foyer (auth.uid()).
--  * Les sessions anonymes Supabase utilisent le rôle `authenticated`.
--  * Les RPC SECURITY DEFINER n'acceptent jamais de user_id fourni par le
--    client, fixent search_path, et n'exposent pas de détails SQL.
--  * EXECUTE révoqué de PUBLIC et anon ; accordé à authenticated seulement.
--  * Le code d'invitation n'est jamais stocké en clair (hash SHA-256).

create extension if not exists pgcrypto with schema extensions;

-- ── Tables ─────────────────────────────────────────────────────────────────

create table public.households (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  -- unique(household_id, user_id) garanti par la clé primaire composée.
  primary key (household_id, user_id)
);

create table public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index household_invites_household_idx
  on public.household_invites (household_id);

create table public.events (
  id text primary key, -- UUID généré côté client (anciens ids texte acceptés)
  household_id uuid not null references public.households(id) on delete cascade,
  type text not null check (type in ('feed', 'diaper')),
  data jsonb not null,
  occurred_at timestamptz not null,
  updated_at timestamptz not null default now(),
  deleted boolean not null default false, -- soft delete (tombstone)
  device_id text
);
create index events_household_time_idx
  on public.events (household_id, occurred_at);

create table public.babies (
  household_id uuid primary key references public.households(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Nécessaire pour que les filtres Realtime fonctionnent sur les UPDATE.
alter table public.events replica identity full;
alter table public.babies replica identity full;

-- ── Aides internes ─────────────────────────────────────────────────────────

-- Appartenance au foyer (DEFINER pour éviter la récursion RLS).
create or replace function public.is_member(h uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = (select auth.uid())
  );
$$;

-- Normalisation d'un code : majuscules, alphanumérique seulement.
create or replace function public.normalize_code(c text)
returns text
language sql
immutable
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(c, ''), '[^a-zA-Z0-9]', '', 'g'));
$$;

-- Hash SHA-256 (hex) d'un code normalisé.
create or replace function public.hash_code(c text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(public.normalize_code(c)::bytea, 'sha256'), 'hex');
$$;

-- Génération d'un code d'invitation : 12 caractères d'un alphabet sans
-- ambiguïté (pas de I, L, O, 0, 1), au format XXXX-XXXX-XXXX.
create or replace function public.gen_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw bytea;
  code text := '';
  i int;
begin
  raw := extensions.gen_random_bytes(12);
  for i in 0..11 loop
    code := code || substr(alphabet, (get_byte(raw, i) % 31) + 1, 1);
  end loop;
  return substr(code, 1, 4) || '-' || substr(code, 5, 4) || '-' || substr(code, 9, 4);
end;
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_invites enable row level security;
alter table public.events enable row level security;
alter table public.babies enable row level security;

-- Aucune politique pour anon : une session est requise pour tout accès.
create policy households_select on public.households
  for select to authenticated
  using (public.is_member(id));

create policy members_select on public.household_members
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy invites_select on public.household_invites
  for select to authenticated
  using (public.is_member(household_id));

create policy events_select on public.events
  for select to authenticated
  using (public.is_member(household_id));

create policy events_insert on public.events
  for insert to authenticated
  with check (public.is_member(household_id));

create policy events_update on public.events
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));
-- Pas de politique DELETE : suppressions uniquement en soft delete.

create policy babies_select on public.babies
  for select to authenticated
  using (public.is_member(household_id));

create policy babies_insert on public.babies
  for insert to authenticated
  with check (public.is_member(household_id));

create policy babies_update on public.babies
  for update to authenticated
  using (public.is_member(household_id))
  with check (public.is_member(household_id));

-- ── RPC exposées ───────────────────────────────────────────────────────────

-- Crée un foyer, y inscrit l'appelant et renvoie le code d'invitation
-- (retourné une seule fois en clair ; seul le hash est conservé).
create or replace function public.create_household()
returns table (household_id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
  code text;
begin
  if (select auth.uid()) is null then
    raise exception 'authentification requise';
  end if;
  insert into public.households default values returning id into hid;
  insert into public.household_members (household_id, user_id)
  values (hid, (select auth.uid()));
  code := public.gen_invite_code();
  insert into public.household_invites (household_id, code_hash, created_by)
  values (hid, public.hash_code(code), (select auth.uid()));
  return query select hid, code;
end;
$$;

-- Rejoint un foyer via un code. Renvoie l'id du foyer, ou NULL si le code est
-- invalide ou révoqué (aucun détail supplémentaire divulgué). Idempotent.
create or replace function public.join_household(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  hid uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'authentification requise';
  end if;
  select i.household_id into hid
  from public.household_invites i
  where i.code_hash = public.hash_code(code)
    and i.revoked = false
  limit 1;
  if hid is null then
    return null;
  end if;
  insert into public.household_members (household_id, user_id)
  values (hid, (select auth.uid()))
  on conflict do nothing;
  return hid;
end;
$$;

-- Révoque les codes actifs puis génère un nouveau code (membres seulement).
create or replace function public.regenerate_invite(h uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if (select auth.uid()) is null or not public.is_member(h) then
    raise exception 'non autorisé';
  end if;
  update public.household_invites
  set revoked = true
  where household_id = h and revoked = false;
  code := public.gen_invite_code();
  insert into public.household_invites (household_id, code_hash, created_by)
  values (h, public.hash_code(code), (select auth.uid()));
  return code;
end;
$$;

-- Révoque tous les codes actifs du foyer (membres seulement).
create or replace function public.revoke_invites(h uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_member(h) then
    raise exception 'non autorisé';
  end if;
  update public.household_invites
  set revoked = true
  where household_id = h and revoked = false;
end;
$$;

-- Upsert d'événements, SECURITY INVOKER : la RLS s'applique à l'appelant.
-- Garde de fraîcheur : une version plus ancienne n'écrase jamais une version
-- plus récente ; à horodatage égal, le tombstone gagne (règle déterministe,
-- identique au client). Rejouable sans doublon (conflit par id).
create or replace function public.upsert_events(rows jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.events
    (id, household_id, type, data, occurred_at, updated_at, deleted, device_id)
  select
    r->>'id',
    (r->>'household_id')::uuid,
    r->>'type',
    r->'data',
    (r->>'occurred_at')::timestamptz,
    (r->>'updated_at')::timestamptz,
    coalesce((r->>'deleted')::boolean, false),
    r->>'device_id'
  from jsonb_array_elements(rows) as r
  on conflict (id) do update
    set type = excluded.type,
        data = excluded.data,
        occurred_at = excluded.occurred_at,
        updated_at = excluded.updated_at,
        deleted = excluded.deleted,
        device_id = excluded.device_id
    where excluded.updated_at > public.events.updated_at
       or (excluded.updated_at = public.events.updated_at
           and excluded.deleted and not public.events.deleted);
end;
$$;

-- Upsert du profil bébé, même principe (INVOKER + garde de fraîcheur).
create or replace function public.upsert_baby(h uuid, d jsonb, u timestamptz)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.babies (household_id, data, updated_at)
  values (h, d, u)
  on conflict (household_id) do update
    set data = excluded.data,
        updated_at = excluded.updated_at
    where excluded.updated_at >= public.babies.updated_at;
end;
$$;

-- ── Permissions ────────────────────────────────────────────────────────────

-- Tables : aucun accès direct pour anon (et RLS pour authenticated).
revoke all on public.households,
              public.household_members,
              public.household_invites,
              public.events,
              public.babies
from anon;

-- Fonctions internes : aucun accès client.
revoke execute on function public.gen_invite_code() from public, anon, authenticated;
revoke execute on function public.hash_code(text) from public, anon, authenticated;
revoke execute on function public.normalize_code(text) from public, anon, authenticated;

-- RPC exposées : authenticated uniquement (les sessions anonymes Supabase
-- utilisent ce rôle ; anon = aucune session → aucun accès).
revoke execute on function public.is_member(uuid) from public, anon;
revoke execute on function public.create_household() from public, anon;
revoke execute on function public.join_household(text) from public, anon;
revoke execute on function public.regenerate_invite(uuid) from public, anon;
revoke execute on function public.revoke_invites(uuid) from public, anon;
revoke execute on function public.upsert_events(jsonb) from public, anon;
revoke execute on function public.upsert_baby(uuid, jsonb, timestamptz) from public, anon;

grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.create_household() to authenticated;
grant execute on function public.join_household(text) to authenticated;
grant execute on function public.regenerate_invite(uuid) to authenticated;
grant execute on function public.revoke_invites(uuid) to authenticated;
grant execute on function public.upsert_events(jsonb) to authenticated;
grant execute on function public.upsert_baby(uuid, jsonb, timestamptz) to authenticated;

-- ── Temps réel ─────────────────────────────────────────────────────────────
alter publication supabase_realtime add table public.events;
alter publication supabase_realtime add table public.babies;
