import Database from "better-sqlite3";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "app.db");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

ensureDir();

export const db = new Database(DB_PATH);

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    xml_path TEXT,
    onlyCreateNew INTEGER DEFAULT 0,
    updateImagesOnUpdate INTEGER DEFAULT 1,
    profitMarginPercent REAL DEFAULT 0,
    applyMarginOn TEXT DEFAULT 'regular',
    roundToInteger INTEGER DEFAULT 1
  );
  INSERT OR IGNORE INTO app_settings (id) VALUES (1);

  CREATE TABLE IF NOT EXISTS woo_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    base_url TEXT,
    consumer_key TEXT,
    consumer_secret TEXT
  );
  INSERT OR IGNORE INTO woo_settings (id) VALUES (1);
`);

export type AppSettings = {
  xml_path?: string;
  onlyCreateNew?: boolean;
  updateImagesOnUpdate?: boolean;
  profitMarginPercent?: number;
  applyMarginOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
};

export type WooSettings = {
  base_url?: string;
  consumer_key?: string;
  consumer_secret?: string;
};

export function getAppSettings(): AppSettings {
  const row = db.prepare("SELECT * FROM app_settings WHERE id = 1").get() as any;
  return {
    xml_path: row?.xml_path ?? undefined,
    onlyCreateNew: !!row?.onlyCreateNew,
    updateImagesOnUpdate: row?.updateImagesOnUpdate !== undefined ? !!row.updateImagesOnUpdate : true,
    profitMarginPercent: row?.profitMarginPercent ?? 0,
    applyMarginOn: (row?.applyMarginOn as any) ?? "regular",
    roundToInteger: row?.roundToInteger !== undefined ? !!row.roundToInteger : true,
  };
}

export function saveAppSettings(s: AppSettings) {
  db.prepare(`UPDATE app_settings SET 
    xml_path = COALESCE(?, xml_path),
    onlyCreateNew = COALESCE(?, onlyCreateNew),
    updateImagesOnUpdate = COALESCE(?, updateImagesOnUpdate),
    profitMarginPercent = COALESCE(?, profitMarginPercent),
    applyMarginOn = COALESCE(?, applyMarginOn),
    roundToInteger = COALESCE(?, roundToInteger)
    WHERE id = 1
  `).run(
    s.xml_path ?? null,
    s.onlyCreateNew === undefined ? null : (s.onlyCreateNew ? 1 : 0),
    s.updateImagesOnUpdate === undefined ? null : (s.updateImagesOnUpdate ? 1 : 0),
    s.profitMarginPercent ?? null,
    s.applyMarginOn ?? null,
    s.roundToInteger === undefined ? null : (s.roundToInteger ? 1 : 0)
  );
}

export function getWooSettings(): WooSettings {
  const row = db.prepare("SELECT * FROM woo_settings WHERE id = 1").get() as any;
  return {
    base_url: row?.base_url ?? undefined,
    consumer_key: row?.consumer_key ?? undefined,
    consumer_secret: row?.consumer_secret ?? undefined,
  };
}

export function saveWooSettings(s: WooSettings) {
  db.prepare(`UPDATE woo_settings SET 
    base_url = COALESCE(?, base_url),
    consumer_key = COALESCE(?, consumer_key),
    consumer_secret = COALESCE(?, consumer_secret)
    WHERE id = 1
  `).run(
    s.base_url ?? null,
    s.consumer_key ?? null,
    s.consumer_secret ?? null
  );
}