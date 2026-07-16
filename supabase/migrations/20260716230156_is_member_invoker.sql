-- is_member peut être SECURITY INVOKER : il ne lit que la ligne d'appartenance
-- de l'appelant, autorisée par la politique members_select (user_id =
-- auth.uid()). Aucune récursion (members_select n'appelle pas is_member).
-- Réduit un avertissement du Security Advisor sans changer le comportement.
create or replace function public.is_member(h uuid)
returns boolean
language sql
security invoker
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.household_members m
    where m.household_id = h and m.user_id = (select auth.uid())
  );
$$;
