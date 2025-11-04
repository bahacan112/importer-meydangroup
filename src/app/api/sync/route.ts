import { NextResponse } from "next/server";
import { runSync } from "@/app/actions/sync";
import { getAppSettings, getWooSettings } from "@/app/actions/settings";
import path from "node:path";

function decodeBasicAuth(header?: string): { user?: string; pass?: string } {
  if (!header || !header.startsWith("Basic ")) return {};
  try {
    const b64 = header.slice("Basic ".length).trim();
    const raw = Buffer.from(b64, "base64").toString("utf8");
    const idx = raw.indexOf(":");
    if (idx === -1) return {};
    return { user: raw.slice(0, idx), pass: raw.slice(idx + 1) };
  } catch {
    return {};
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const qpUser = url.searchParams.get("user") || url.searchParams.get("username") || undefined;
    const qpPass = url.searchParams.get("pass") || url.searchParams.get("password") || undefined;
    const { user: basicUser, pass: basicPass } = decodeBasicAuth(req.headers.get("authorization") || undefined);
    const u = qpUser || basicUser;
    const p = qpPass || basicPass;

    // Basit doğrulama: Woo ayarlarından tüketici anahtarı ve gizli anahtar
    const woo = await getWooSettings();
    const expectedUser = woo.consumer_key || process.env.LOGIN_USERNAME || "admin";
    const expectedPass = woo.consumer_secret || process.env.LOGIN_PASSWORD || "admin";
    if (!u || !p || u !== expectedUser || p !== expectedPass) {
      return new NextResponse(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    }

    const app = await getAppSettings();
    let xmlPath = app.xml_path || process.env.XML_PATH || "";
    // Public uploads ise mutlak yola çevir
    if (xmlPath && xmlPath.startsWith("/uploads/")) {
      xmlPath = path.join(process.cwd(), "public", xmlPath.replace(/^\//, ""));
    }
    const report = await runSync(xmlPath, {
      deleteMissing: !!app.onlyCreateNew ? false : undefined, // eski alan ile uyum
      doCreateNew: app.doCreateNew,
      doUpdateExisting: app.doUpdateExisting,
      updateStockOnly: app.updateStockOnly,
      updateImagesOnUpdate: app.updateImagesOnUpdate,
      profitMarginPercent: app.profitMarginPercent,
      applyMarginOn: app.applyMarginOn,
      roundToInteger: app.roundToInteger,
    });
    return new NextResponse(JSON.stringify({ ok: true, report }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e: any) {
    return new NextResponse(JSON.stringify({ ok: false, error: e?.message || "Sync failed" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}