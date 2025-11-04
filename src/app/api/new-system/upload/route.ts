import { NextRequest } from "next/server";
import fs from "fs/promises";
import path from "path";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") {
      return Response.json({ ok: false, error: "Dosya bulunamadı" }, { status: 400 });
    }

    const arrayBuffer = await (file as Blob).arrayBuffer();
    const buf = Buffer.from(arrayBuffer);

    const uploadsDir = path.join(process.cwd(), "public", "uploads", "new-system");
    await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

    const ts = new Date();
    const y = ts.getFullYear();
    const m = String(ts.getMonth() + 1).padStart(2, "0");
    const d = String(ts.getDate()).padStart(2, "0");
    const hh = String(ts.getHours()).padStart(2, "0");
    const mm = String(ts.getMinutes()).padStart(2, "0");
    const ss = String(ts.getSeconds()).padStart(2, "0");
    const safeName = (file as any).name ? String((file as any).name).replace(/[^a-zA-Z0-9_.-]/g, "_") : "upload.json";
    const filename = `upload-${y}${m}${d}-${hh}${mm}${ss}-${safeName}`;
    const abs = path.join(uploadsDir, filename);

    await fs.writeFile(abs, buf);

    // Eski JSON'ları sil
    try {
      const entries = await fs.readdir(uploadsDir, { withFileTypes: true });
      for (const e of entries) {
        if (e.isFile() && e.name.endsWith(".json") && e.name !== filename) {
          await fs.unlink(path.join(uploadsDir, e.name)).catch(() => {});
        }
      }
    } catch {}

    const publicPath = path.join("uploads", "new-system", filename).replace(/\\/g, "/");
    return Response.json({ ok: true, file_path: publicPath });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}