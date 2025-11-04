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
  // Legacy: onlyCreateNew artık iki bayrak ile ayrıştırıldı
  onlyCreateNew?: boolean;
  doCreateNew?: boolean; // yeni ürünleri ekle
  doUpdateExisting?: boolean; // mevcut olanları güncelle
  updateStockOnly?: boolean; // sadece stok güncelle
  updateImagesOnUpdate?: boolean;
  profitMarginPercent?: number;
  applyMarginOn?: "regular" | "sale" | "both";
  roundToInteger?: boolean;
  // Yeni Sistem için ayarlar
  newApiUrl?: string;
  newImageBaseUrl?: string;
};

export type WooSettings = {
  base_url?: string;
  consumer_key?: string;
  consumer_secret?: string;
};

function ensureAppSettingsColumns() {
  const cols = db.prepare("PRAGMA table_info(app_settings)").all() as { name: string }[];
  const has = (name: string) => cols.some((c) => c.name === name);
  if (!has("doCreateNew")) db.exec("ALTER TABLE app_settings ADD COLUMN doCreateNew INTEGER DEFAULT 1");
  if (!has("doUpdateExisting")) db.exec("ALTER TABLE app_settings ADD COLUMN doUpdateExisting INTEGER DEFAULT 1");
  if (!has("updateStockOnly")) db.exec("ALTER TABLE app_settings ADD COLUMN updateStockOnly INTEGER DEFAULT 0");
  if (!has("newApiUrl")) db.exec("ALTER TABLE app_settings ADD COLUMN newApiUrl TEXT");
  if (!has("newImageBaseUrl")) db.exec("ALTER TABLE app_settings ADD COLUMN newImageBaseUrl TEXT");
}

export function getAppSettings(): AppSettings {
  ensureAppSettingsColumns();
  const row = db.prepare("SELECT * FROM app_settings WHERE id = 1").get() as any;
  return {
    xml_path: row?.xml_path ?? undefined,
    // Geri uyumluluk: onlyCreateNew varsa onu da expose edelim
    onlyCreateNew: row?.onlyCreateNew !== undefined ? !!row.onlyCreateNew : undefined,
    doCreateNew: row?.doCreateNew !== undefined ? !!row.doCreateNew : (row?.onlyCreateNew !== undefined ? !row.onlyCreateNew : true),
    doUpdateExisting: row?.doUpdateExisting !== undefined ? !!row.doUpdateExisting : (row?.onlyCreateNew !== undefined ? !row.onlyCreateNew : true),
    updateStockOnly: row?.updateStockOnly !== undefined ? !!row.updateStockOnly : false,
    updateImagesOnUpdate: row?.updateImagesOnUpdate !== undefined ? !!row.updateImagesOnUpdate : true,
    profitMarginPercent: row?.profitMarginPercent ?? 0,
    applyMarginOn: (row?.applyMarginOn as any) ?? "regular",
    roundToInteger: row?.roundToInteger !== undefined ? !!row.roundToInteger : true,
    newApiUrl: row?.newApiUrl ?? undefined,
    newImageBaseUrl: row?.newImageBaseUrl ?? undefined,
  };
}

export function saveAppSettings(s: AppSettings) {
  ensureAppSettingsColumns();
  db.prepare(`UPDATE app_settings SET 
    xml_path = COALESCE(?, xml_path),
    onlyCreateNew = COALESCE(?, onlyCreateNew),
    doCreateNew = COALESCE(?, doCreateNew),
    doUpdateExisting = COALESCE(?, doUpdateExisting),
    updateStockOnly = COALESCE(?, updateStockOnly),
    updateImagesOnUpdate = COALESCE(?, updateImagesOnUpdate),
    profitMarginPercent = COALESCE(?, profitMarginPercent),
    applyMarginOn = COALESCE(?, applyMarginOn),
    roundToInteger = COALESCE(?, roundToInteger),
    newApiUrl = COALESCE(?, newApiUrl),
    newImageBaseUrl = COALESCE(?, newImageBaseUrl)
    WHERE id = 1
  `).run(
    s.xml_path ?? null,
    s.onlyCreateNew === undefined ? null : (s.onlyCreateNew ? 1 : 0),
    s.doCreateNew === undefined ? null : (s.doCreateNew ? 1 : 0),
    s.doUpdateExisting === undefined ? null : (s.doUpdateExisting ? 1 : 0),
    s.updateStockOnly === undefined ? null : (s.updateStockOnly ? 1 : 0),
    s.updateImagesOnUpdate === undefined ? null : (s.updateImagesOnUpdate ? 1 : 0),
    s.profitMarginPercent ?? null,
    s.applyMarginOn ?? null,
    s.roundToInteger === undefined ? null : (s.roundToInteger ? 1 : 0),
    s.newApiUrl ?? null,
    s.newImageBaseUrl ?? null
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