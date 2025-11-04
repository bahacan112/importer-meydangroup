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
    onlyCreateNew: formData.get("onlyCreateNew") ? true : false,
    updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
    profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
    applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
    roundToInteger: formData.get("roundToInteger") ? true : false,
  };
  dbSaveApp(s);
}

export async function saveWooSettingsForm(formData: FormData) {
  const s: WooSettings = {
    base_url: formData.get("base_url")?.toString() || undefined,
    consumer_key: formData.get("consumer_key")?.toString() || undefined,
    consumer_secret: formData.get("consumer_secret")?.toString() || undefined,
  };
  dbSaveWoo(s);
}