"use client";
import React, { useState } from "react";

export default function ExportCsvPage() {
  const [sampleCsvPath, setSampleCsvPath] = useState<string>(
    "public/uploads/sample-csv/wc-product-export-5-11-2025-1762332204355.csv"
  );
  const [jsonPath, setJsonPath] = useState<string>("uploads/system1.json");
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [count, setCount] = useState<number>(0);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    setGenerating(true);
    setError("");
    setResultUrl("");
    setCount(0);
    try {
      const fd = new FormData();
      fd.append("sampleCsvPath", sampleCsvPath);
      fd.append("jsonPath", jsonPath);
      const res = await fetch("/api/export-csv", { method: "POST", body: fd });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `İstek başarısız: ${res.status}`);
      }
      const j = await res.json();
      setResultUrl(j.url || "");
      setCount(j.count || 0);
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">CSV Dışa Aktar (WooCommerce Import için)</h1>
      <p className="text-sm text-gray-600">
        Mevcut örnek CSV başlığını kullanarak (export edilmiş dosya), uploads/system1.json kaynağından ürünleri CSV
        formatına dönüştürür. Üretilen dosya public/uploads/new-system içine kaydedilir.
      </p>

      <form onSubmit={handleGenerate} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium">Örnek CSV dosya yolu (başlık alınır)</label>
          <input
            type="text"
            value={sampleCsvPath}
            onChange={(e) => setSampleCsvPath(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="public/uploads/sample-csv/...csv"
          />
          <small className="text-gray-500">Örnek: public/uploads/sample-csv/wc-product-export-...csv</small>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium">JSON kaynak dosya yolu</label>
          <input
            type="text"
            value={jsonPath}
            onChange={(e) => setJsonPath(e.target.value)}
            className="w-full border rounded p-2"
            placeholder="uploads/system1.json"
          />
          <small className="text-gray-500">Örnek: uploads/system1.json</small>
        </div>

        <button
          type="submit"
          disabled={generating}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          {generating ? "Oluşturuluyor..." : "CSV Oluştur"}
        </button>
      </form>

      {error && (
        <div className="text-red-600 text-sm">Hata: {error}</div>
      )}

      {resultUrl && (
        <div className="space-y-2">
          <div className="text-green-700 text-sm">Başarılı! Ürün sayısı: {count}</div>
          <a href={resultUrl} target="_blank" rel="noreferrer" className="text-blue-700 underline">
            CSV dosyasını indir ({resultUrl})
          </a>
        </div>
      )}
    </div>
  );
}