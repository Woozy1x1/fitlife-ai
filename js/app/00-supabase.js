// VYORA AI – lädt die Supabase-Bibliothek aus dem eigenen Repository
// (kein Nachladen von fremden Servern, Version fixiert) und gibt sie an
// 01-grundlagen.js weiter. Diese Datei ist ein Modul, alle anderen Teile
// sind normale Skripte, die sich einen gemeinsamen Bereich teilen.
import { createClient } from "../../vendor/supabase-js-2.119.2.js";

globalThis.__vyoraCreateClient = createClient;
