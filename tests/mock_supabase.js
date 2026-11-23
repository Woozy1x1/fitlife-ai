// Testhilfe: Einführung (Dialog) in alten Tests nicht öffnen
if (!window.__allowTour) HTMLDialogElement.prototype.showModal = function(){};
// Minimaler Supabase-Ersatz für lokale UI-Tests
const user = { id: "u1", email: "test@example.com" };
const tables = { nutrition_entries: [], workout_entries: [], health_entries: [], workout_plans: [], user_consents: [], oura_connections: [], user_goals: [], training_program: [], measurements: [], daily_metrics: [], import_tokens: [], water_log: [], reminders: [], push_subscriptions: [], wellbeing_log: [], veg_log: [], medications: [], medication_intakes: [], symptom_log: [], lab_results: [], recipes: [], meal_plan: [], shopping_items: [], user_challenges: [], week_plans: [], shift_plan: [] };
window.__rpc = [];
window.__oauth = [];
window.__tables = tables;
// Ältere Tests erwarten alle Gesundheits-Karten sichtbar (vor den Reitern)
if (!window.__realTabs) { const st = document.createElement("style"); st.textContent = ".hpanel.hidden{display:block!important}"; (document.head || document.documentElement).append(st); }
// Optional: Daten über ein Neuladen hinweg behalten (für Tests mit reload)
try { if (sessionStorage.getItem("__persist") === "1") { Object.assign(tables, JSON.parse(sessionStorage.getItem("__mockTables") || "{}")); window.__mfa = JSON.parse(sessionStorage.getItem("__mockMfa") || "null") || undefined; } } catch (e) {}
window.__save = () => { try { if (sessionStorage.getItem("__persist") === "1") { sessionStorage.setItem("__mockTables", JSON.stringify(tables)); sessionStorage.setItem("__mockMfa", JSON.stringify(window.__mfa || null)); } } catch (e) {} };
window.addEventListener("pagehide", () => window.__save());
let n = 0;

class Q {
  constructor(t) { this.t = t; this.f = []; this.op = "select"; this.o = []; this.lim = null; }
  select() { return this; }
  insert(row) { this.op = "insert"; this.row = row; return this; }
  delete() { this.op = "delete"; return this; }
  update(row) { this.op = "update"; this.row = row; return this; }
  lte(k, v) { this.f.push(r => r[k] <= v); return this; }
  upsert(row, opt) { this.op = "upsert"; this.row = row; this.keys = (opt?.onConflict || "user_id").split(","); return this; }
  gte(k, v) { this.f.push(r => r[k] >= v); return this; }
  maybeSingle() { this.single = true; return this; }
  eq(k, v) { this.f.push(r => String(r[k]) === String(v)); return this; }
  in(k, arr) { this.f.push(r => arr.map(String).includes(String(r[k]))); return this; }
  lt(k, v) { this.f.push(r => r[k] < v); return this; }
  ilike(k, v) { const p = v.replace(/\\(.)/g, "$1").toLowerCase(); this.f.push(r => String(r[k]).toLowerCase() === p); return this; }
  order(k, o) { this.o.push([k, o?.ascending !== false]); return this; }
  limit(l) { this.lim = l; return this; }
  then(res, rej) {
    if (window.__netFail) return Promise.resolve({ data: null, error: { message: "TypeError: Failed to fetch" } }).then(res, rej);
    try {
      const rows = tables[this.t];
      if (this.op === "insert") {
        for (const r of (Array.isArray(this.row) ? this.row : [this.row]))
          rows.push({ id: "id" + (++n), created_at: new Date(Date.now() + n).toISOString(), ...r });
        return Promise.resolve({ error: null }).then(res, rej);
      }
      if (this.op === "upsert") {
        for (const one of (Array.isArray(this.row) ? this.row : [this.row])) {
          const r = { user_id: "u1", ...one };
          const i = rows.findIndex(x => this.keys.every(k => x[k] === r[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...r }; else rows.push(r);
        }
        return Promise.resolve({ error: null }).then(res, rej);
      }
      if (this.op === "update") {
        for (const r of rows) if (this.f.every(f => f(r))) Object.assign(r, this.row);
        return Promise.resolve({ error: null }).then(res, rej);
      }
      if (this.op === "delete") {
        tables[this.t] = rows.filter(r => !this.f.every(f => f(r)));
        return Promise.resolve({ error: null }).then(res, rej);
      }
      let out = rows.filter(r => this.f.every(f => f(r)));
      out.sort((a, b) => { for (const [k, asc] of this.o) { if (a[k] < b[k]) return asc ? -1 : 1; if (a[k] > b[k]) return asc ? 1 : -1; } return 0; });
      if (this.lim) out = out.slice(0, this.lim);
      const data = JSON.parse(JSON.stringify(out));
      return Promise.resolve({ data: this.single ? (data[0] || null) : data, error: null }).then(res, rej);
    } catch (e) { return Promise.reject(e).then(res, rej); }
  }
}

export function createClient() {
  return {
    from: t => new Q(t),
    rpc: async (name) => { window.__rpc.push(name); if (name === 'delete_my_account') { for (const k in tables) tables[k] = []; window.__deleted = true; } return { data: null, error: null }; },
    auth: {
      getUser: async () => window.__netFail ? { data: { user: null }, error: { name: "AuthRetryableFetchError", message: "Failed to fetch" } } : (window.__deleted ? { data: { user: null }, error: null } : { data: { user }, error: null }),
      getSession: async () => ({ data: { session: { access_token: "x", user } }, error: null }),
      onAuthStateChange: (cb) => { window.__authCb = cb; },
      resetPasswordForEmail: async (email, opts) => { window.__reset = {email, opts}; return { error: null }; },
      updateUser: async (attrs) => { window.__updated = attrs; return { error: null }; },
      signOut: async () => { window.__signedOut = (window.__signedOut||0)+1; return { error: null }; },
      mfa: {
        getAuthenticatorAssuranceLevel: async () => { const m = window.__mfa || {}; return { data: { currentLevel: m.aal || "aal1", nextLevel: m.verified ? "aal2" : (m.aal || "aal1") }, error: null }; },
        listFactors: async () => { const m = window.__mfa || {}; const f = m.factors || []; return { data: { all: f, totp: f.filter(x => x.status === "verified") }, error: null }; },
        enroll: async (o) => { const m = window.__mfa = window.__mfa || {}; m.factors = m.factors || []; const f = { id: "f" + (++n), factor_type: "totp", status: "unverified", created_at: new Date().toISOString() }; m.factors.push(f); return { data: { id: f.id, totp: { qr_code: "data:image/svg+xml;utf-8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10'/>", secret: "JBSWY3DPEHPK3PXP" } }, error: null }; },
        challengeAndVerify: async ({ factorId, code }) => { const m = window.__mfa = window.__mfa || {}; if (code !== "123456") return { data: null, error: { message: "Invalid TOTP code entered" } }; const f = (m.factors || []).find(x => x.id === factorId); if (f) f.status = "verified"; m.verified = true; m.aal = "aal2"; return { data: {}, error: null }; },
        unenroll: async ({ factorId }) => { const m = window.__mfa || {}; m.factors = (m.factors || []).filter(x => x.id !== factorId); if (!m.factors.some(x => x.status === "verified")) m.verified = false; return { data: {}, error: null }; },
      },
      signInWithOAuth: async (o) => { window.__oauth.push(o); return { error: null }; },
    },
  };
}
