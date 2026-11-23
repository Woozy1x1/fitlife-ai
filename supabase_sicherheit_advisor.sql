-- VYORA AI – Hinweise aus dem Supabase Security Advisor (23.11.2026)
-- rls_auto_enable() ist eine Event-Trigger-Funktion (schaltet RLS bei neuen
-- Tabellen automatisch ein). Sie wird nur von der Datenbank selbst ausgelöst –
-- niemand muss sie über die API aufrufen können.
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- Performance Advisor: Indizes für Fremdschlüssel ohne Index
-- (beschleunigt u. a. das Löschen eines Kontos über die Kaskade)
create index if not exists idx_meal_plan_recipe_id on public.meal_plan (recipe_id);
create index if not exists idx_medication_intakes_medication_id on public.medication_intakes (medication_id);
create index if not exists idx_push_subscriptions_user_id on public.push_subscriptions (user_id);
create index if not exists idx_oura_oauth_states_user_id on private.oura_oauth_states (user_id);
