"use server";
import { getAppSettings as dbGetApp, saveAppSettings as dbSaveApp, getWooSettings as dbGetWoo, saveWooSettings as dbSaveWoo, AppSettings, WooSettings } from "@/lib/db";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

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

// Yardımcı: public/uploads klasörü
function getPublicUploadsDir() {
  return path.join(process.cwd(), "public", "uploads");
}

// Önceki public dosyayı güvenli şekilde sil
async function tryDeletePublicFile(prevPath?: string) {
  try {
    if (!prevPath) return;
    // Yalnızca public/uploads altındaki dosyaları sil
    let rel = "";
    if (prevPath.startsWith("/uploads/")) {
      rel = prevPath.replace(/^\//, "");
    } else if (prevPath.includes(path.join("public", "uploads"))) {
      // Tam yol verilmiş olabilir
      const idx = prevPath.lastIndexOf("public");
      rel = prevPath.slice(idx + "public/".length);
    } else {
      return; // URL veya farklı bir yol ise dokunma
    }
    const abs = path.join(process.cwd(), "public", rel);
    await fs.unlink(abs);
  } catch {}
}

// Dosyayı public/uploads'a yükle ve DB'de xml_path'i '/uploads/...' olarak güncelle
export async function uploadXmlToPublic(formData: FormData) {
  const file = formData.get("xml_file") as File | null;
  if (!file || file.size === 0) {
    throw new Error("Yüklenecek XML dosyası bulunamadı");
  }
  const current = await dbGetApp();
  await tryDeletePublicFile(current.xml_path);

  const dir = getPublicUploadsDir();
  await fs.mkdir(dir, { recursive: true });
  const safeName = `xml-upload-${crypto.randomUUID()}.xml`;
  const absPath = path.join(dir, safeName);
  const buf = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(absPath, buf);
  const relPath = `/uploads/${safeName}`;

  dbSaveApp({ xml_path: relPath } as AppSettings);
  return { ok: true, xml_path: relPath };
}

// Dashboard için form tabanlı kayıt: xml_url veya xml_file gelirse dosyayı public'e kaydeder
export async function saveDashboardSettingsForm(formData: FormData) {
  let xml_path: string | undefined = undefined;
  const xmlUrl = formData.get("xml_url")?.toString() || "";
  const file = formData.get("xml_file") as File | null;

  if (file && file.size > 0) {
    const res = await uploadXmlToPublic(formData);
    xml_path = res.xml_path;
  } else if (xmlUrl) {
    // Basit URL validasyonu
    try { new URL(xmlUrl); } catch { throw new Error("Geçersiz XML URL"); }
    xml_path = xmlUrl;
  }

  const s: AppSettings = {
    xml_path,
    doCreateNew: formData.get("doCreateNew") ? true : undefined,
    doUpdateExisting: formData.get("doUpdateExisting") ? true : undefined,
    updateStockOnly: formData.get("updateStockOnly") ? true : undefined,
    updateImagesOnUpdate: formData.get("updateImagesOnUpdate") ? true : false,
    profitMarginPercent: formData.get("profitMarginPercent") ? Number(formData.get("profitMarginPercent")) : undefined,
    applyMarginOn: (formData.get("applyMarginOn")?.toString() as any) || undefined,
    roundToInteger: formData.get("roundToInteger") ? true : false,
  };
  dbSaveApp(s);
  return { ok: true, xml_path };
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