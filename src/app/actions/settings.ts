"use server";
import { getAppSettings as dbGetApp, saveAppSettings as dbSaveApp, getWooSettings as dbGetWoo, saveWooSettings as dbSaveWoo, AppSettings, WooSettings } from "@/lib/db";

export async function getAppSettings(): Promise<AppSettings> {
  return dbGetApp();
}

export async function saveAppSettings(s: AppSettings): Promise<void> {
  dbSaveApp(s);
}

export async function getWooSettings(): Promise<WooSettings> {
  return dbGetWoo();
}

export async function saveWooSettings(s: WooSettings): Promise<void> {
  dbSaveWoo(s);
}

export async function saveAppSettingsForm(formData: FormData) {
  const s: AppSettings = {
    xml_path: formData.get("xml_path")?.toString() || undefined,
    // Hem eski hem yeni alanları destekle
    onlyCreateNew: formData.get("onlyCreateNew") ? true : undefined,
    doCreateNew: formData.get("doCreateNew") ? true : undefined,
    doUpdateExisting: formData.get("doUpdateExisting") ? true : undefined,
    updateStockOnly: formData.get("updateStockOnly") ? true : undefined,
    updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
    profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
    applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
    roundToInteger: formData.get("roundToInteger") ? true : false,
  };
  // Basit validasyon: URL ise geçerli olsun
  if (s.xml_path && (s.xml_path.startsWith("http://") || s.xml_path.startsWith("https://"))) {
    try { new URL(s.xml_path); } catch { throw new Error("Geçersiz XML URL formatı"); }
  }
  dbSaveApp(s);
}

export async function saveWooSettingsForm(formData: FormData) {
  const s: WooSettings = {
    base_url: formData.get("base_url")?.toString() || undefined,
    consumer_key: formData.get("consumer_key")?.toString() || undefined,
    consumer_secret: formData.get("consumer_secret")?.toString() || undefined,
  };
  if (s.base_url) {
    try { new URL(s.base_url); } catch { throw new Error("Geçersiz Base URL"); }
    if (!s.consumer_key || !s.consumer_secret) {
      throw new Error("Consumer Key/Secret gereklidir");
    }
  }
  dbSaveWoo(s);
}