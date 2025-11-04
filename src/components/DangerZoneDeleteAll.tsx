"use client";

import React from "react";

export default function DangerZoneDeleteAll() {
  const [running, setRunning] = React.useState(false);
  const [lastLabel, setLastLabel] = React.useState<string>("");
  const [logs, setLogs] = React.useState<string[]>([]);
  const [logFile, setLogFile] = React.useState<string>("");
  const [storeUrl, setStoreUrl] = React.useState<string>("");

  const start = async () => {
    if (running) return;
    setRunning(true);
    setLastLabel("İşlem başlatılıyor...");
    setLogs([]);
    try {
      const res = await fetch("/api/delete-all", { method: "POST" });
      if (!res.body) {
        throw new Error("Akış başlatılamadı");
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      // Sürekli okumaya devam et
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        const lines = text.split("\n").filter((l) => l.trim().length > 0);
        for (const line of lines) {
          try {
            const evt = JSON.parse(line);
            if (evt.type === "start") {
              setLastLabel("Silme işlemi başlatıldı");
            } else if (evt.type === "context") {
              setStoreUrl(evt.store || "");
              setLogs((prev) => ["Mağaza: " + (evt.store || "(bilinmiyor)"), ...prev].slice(0, 50));
            } else if (evt.type === "saved_file") {
              setLogFile(evt.file || "");
              const label = `Log dosyası: ${evt.file}`;
              setLogs((prev) => [label, ...prev].slice(0, 50));
            } else if (evt.type === "deleted_product") {
              const label = `Silinen ürün: ${evt.name || "(isimsiz)"} (ID: ${evt.id}${evt.sku ? ", SKU: " + evt.sku : ""})`;
              setLastLabel(label);
              setLogs((prev) => [label, ...prev].slice(0, 50));
            } else if (evt.type === "deleted_category") {
              const label = `Silinen kategori: ${evt.name || "(isimsiz)"} (ID: ${evt.id})`;
              setLastLabel(label);
              setLogs((prev) => [label, ...prev].slice(0, 50));
            } else if (evt.type === "error") {
              const label = `Hata (${evt.scope} ${evt.id}): ${evt.error}`;
              setLastLabel(label);
              setLogs((prev) => [label, ...prev].slice(0, 50));
            } else if (evt.type === "info") {
              setLogs((prev) => [String(evt.message), ...prev].slice(0, 50));
            } else if (evt.type === "done") {
              setLastLabel("Silme işlemi tamamlandı");
            } else if (evt.type === "fatal") {
              setLastLabel(`Kritik hata: ${evt.message}`);
              setLogs((prev) => [String(evt.message), ...prev].slice(0, 50));
            }
          } catch {
            // metin satırı; doğrudan ekle
            setLogs((prev) => [line, ...prev].slice(0, 50));
          }
        }
      }
    } catch (e: any) {
      setLastLabel(`Başlatma hatası: ${String(e?.message || e)}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm text-red-600">Bu işlem WooCommerce içindeki TÜM ürün ve kategorileri kalıcı olarak siler.</p>
      <button
        type="button"
        onClick={start}
        disabled={running}
        className="px-3 py-2 rounded bg-red-600 text-white disabled:opacity-60"
      >
        {running ? "Silme işlemi yapılıyor..." : "Tüm Ürünleri ve Kategorileri Sil (Canlı İzle)"}
      </button>
      <div className="text-sm">
        <span className="font-medium">Durum:</span> {lastLabel || "Beklemede"}
      </div>
      {(storeUrl || logFile) && (
        <div className="text-xs text-gray-600">
          {storeUrl && (
            <div>
              <span className="font-medium">Mağaza URL:</span> {storeUrl}
            </div>
          )}
          {logFile && (
            <div>
              <span className="font-medium">Log dosyası:</span> {logFile}
            </div>
          )}
        </div>
      )}
      {logs.length > 0 && (
        <div className="mt-2 p-2 border rounded text-xs max-h-48 overflow-auto">
          <div className="font-semibold mb-1">Son Kayıtlar</div>
          <ul className="list-disc pl-5 space-y-1">
            {logs.map((l, idx) => (
              <li key={idx}>{l}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}