"use client";
import { useState } from "react";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function TestImportPage() {
  // Tek ürün test alanları
  const [manualSku, setManualSku] = useState<string>("");
  const [singleFilePath, setSingleFilePath] = useState<string>("");
  const [manualName, setManualName] = useState<string>("");
  const [manualStockQuantity, setManualStockQuantity] = useState<number | "">("");
  const [manualRegularPrice, setManualRegularPrice] = useState<string>("");
  const [manualSalePrice, setManualSalePrice] = useState<string>("");
  const [manualManageStock, setManualManageStock] = useState<boolean>(true);
  const [singleDoCreateNew, setSingleDoCreateNew] = useState<boolean>(true);
  const [singleDoUpdateExisting, setSingleDoUpdateExisting] = useState<boolean>(true);
  const [singleUpdateStockAndPriceOnly, setSingleUpdateStockAndPriceOnly] = useState<boolean>(false);

  // Toplu test alanları
  const [filePath, setFilePath] = useState<string>("uploads/system1.json");
  const [limit, setLimit] = useState<number | "">(50);
  const [perItemDelayMs, setPerItemDelayMs] = useState<number | "">(500);
  const [processDirection, setProcessDirection] = useState<"asc" | "desc">("asc");
  const [batchDoCreateNew, setBatchDoCreateNew] = useState<boolean>(true);
  const [batchDoUpdateExisting, setBatchDoUpdateExisting] = useState<boolean>(true);
  const [batchUpdateStockAndPriceOnly, setBatchUpdateStockAndPriceOnly] = useState<boolean>(false);
  const [mediaMode, setMediaMode] = useState<"upload" | "prefer_existing_by_filename" | "none">("prefer_existing_by_filename");

  // Durum
  const [loading, setLoading] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncLabel, setSyncLabel] = useState<string>("");
  const [processed, setProcessed] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(0);

  async function runStream(fd: FormData) {
    const res = await fetch("/api/new-system/sync", { method: "POST", body: fd });
    if (!res.body) throw new Error("Canlı akış başlatılamadı");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((l) => l.trim().length > 0);
      for (const line of lines) {
        try {
          const evt = JSON.parse(line);
          if (evt.type === "start") {
            setSyncLabel("Senkronizasyon başlatıldı");
          } else if (evt.type === "info") {
            // bilgileri durum satırında kısa göster
            setSyncLabel(`${evt.message}${evt.sku ? ` (SKU: ${evt.sku})` : ""}`);
          } else if (evt.type === "order_applied") {
            setSyncLabel(`Sıralama: ${evt.direction}`);
          } else if (evt.type === "limit_applied") {
            setSyncLabel(`Limit: ${evt.effective}/${evt.limit}`);
          } else if (evt.type === "created_product" || evt.type === "created_product_deferred") {
            setSyncLabel(`Oluşturulan: ${evt.name} (SKU: ${evt.sku})`);
          } else if (evt.type === "updated_stock" || evt.type === "updated_stock_price" || evt.type === "updated_stock_price_deferred") {
            setSyncLabel(`Güncellendi: ${evt.name} (SKU: ${evt.sku})`);
          } else if (evt.type === "skip_conflict" || evt.type === "retry_conflict_deferred" || evt.type === "skip_conflict_deferred") {
            setSyncLabel(`Çakışma: ${evt.sku} - ${evt.error ?? "in-progress"}`);
          } else if (evt.type === "progress") {
            setProcessed(evt.processed || 0);
            setTotal(evt.total || 0);
            setElapsedMs(evt.elapsedMs || 0);
            setSpeed(evt.speed || 0);
          } else if (evt.type === "done") {
            setSyncLabel(`Tamamlandı: +${evt.created} / ~${evt.updated} / -${evt.deleted}`);
            toast.success(`Senkronizasyon tamamlandı: Eklenen ${evt.created}, Güncellenen ${evt.updated}, Silinen ${evt.deleted}`);
          } else if (evt.type === "error" || evt.type === "fatal") {
            setSyncLabel(`Hata: ${evt.error || evt.message}`);
            toast.error(evt.error || evt.message);
          }
        } catch {}
      }
    }
  }

  async function onRunSingle() {
    try {
      if (!manualSku) {
        toast.error("KOD gerekli");
        return;
      }
      setLoading(true);
      setSyncRunning(true);
      setSyncLabel("Başlatılıyor...");
      setProcessed(0); setTotal(0); setElapsedMs(0); setSpeed(0);
      const fd = new FormData();
      fd.append("manualSku", manualSku);
      if (singleFilePath) fd.append("file_path", singleFilePath);
      if (manualName) fd.append("manualName", manualName);
      if (manualRegularPrice) fd.append("manualRegularPrice", manualRegularPrice);
      if (manualSalePrice) fd.append("manualSalePrice", manualSalePrice);
      if (manualStockQuantity !== "" && manualStockQuantity != null) fd.append("manualStockQuantity", String(manualStockQuantity));
      if (manualManageStock) fd.append("manualManageStock", "1");
      fd.append("doCreateNew", singleDoCreateNew ? "1" : "");
      fd.append("doUpdateExisting", singleDoUpdateExisting ? "1" : "");
      fd.append("updateStockAndPriceOnly", singleUpdateStockAndPriceOnly ? "1" : "");
      await runStream(fd);
    } catch (e: any) {
      toast.error(e?.message || "Tek ürün testi başarısız");
    } finally {
      setLoading(false);
      setSyncRunning(false);
    }
  }

  async function onRunBatch() {
    try {
      if (!filePath) {
        toast.error("Dosya yolu gerekli");
        return;
      }
      setLoading(true);
      setSyncRunning(true);
      setSyncLabel("Başlatılıyor...");
      setProcessed(0); setTotal(0); setElapsedMs(0); setSpeed(0);
      const fd = new FormData();
      fd.append("file_path", filePath);
      if (limit !== "" && limit != null) fd.append("limit", String(limit));
      if (perItemDelayMs !== "" && perItemDelayMs != null) fd.append("perItemDelayMs", String(perItemDelayMs));
      fd.append("processDirection", processDirection);
      fd.append("mediaMode", mediaMode);
      fd.append("doCreateNew", batchDoCreateNew ? "1" : "");
      fd.append("doUpdateExisting", batchDoUpdateExisting ? "1" : "");
      fd.append("updateStockAndPriceOnly", batchUpdateStockAndPriceOnly ? "1" : "");
      await runStream(fd);
    } catch (e: any) {
      toast.error(e?.message || "Toplu test başarısız");
    } finally {
      setLoading(false);
      setSyncRunning(false);
    }
  }

  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">Test İçe Aktarım</h1>

        {/* Durum etiketi */}
        <Card className="p-4">
          <div className="text-xs text-gray-600">
            <span className="font-medium">Durum:</span> {syncLabel || "Beklemede"}
            {total > 0 && (
              <span className="ml-2">| {processed}/{total} ({Math.floor((processed/Math.max(total,1))*100)}%)</span>
            )}
            {elapsedMs > 0 && (
              <span className="ml-2">| {Math.round(elapsedMs/1000)} sn</span>
            )}
            {speed > 0 && (
              <span className="ml-2">| {speed.toFixed(1)} kayıt/sn</span>
            )}
          </div>
        </Card>

        {/* Tek ürün testi */}
        <Card className="p-4 space-y-3">
          <div className="font-medium">Tek Ürün Testi (SKU ile Oluştur/Güncelle)</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">KOD (SKU = 'kaya-' + KOD)</label>
              <Input value={manualSku} onChange={(e) => setManualSku(e.target.value)} placeholder="Örn: 000-1400" />
            </div>
            <div>
              <label className="text-sm">Dosya yolu (public altında, opsiyonel)</label>
              <Input value={singleFilePath} onChange={(e) => setSingleFilePath(e.target.value)} placeholder="uploads/new-system/xxx.json" />
            </div>
            <div>
              <label className="text-sm">Ad (isteğe bağlı)</label>
              <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Ürün adı" />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm">Stok Adet (isteğe bağlı)</label>
              <Input type="number" value={manualStockQuantity} onChange={(e) => setManualStockQuantity(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Örn: 2" />
            </div>
            <div>
              <label className="text-sm">Regular Price (isteğe bağlı)</label>
              <Input value={manualRegularPrice} onChange={(e) => setManualRegularPrice(e.target.value)} placeholder="Örn: 150" />
            </div>
            <div>
              <label className="text-sm">Sale Price (isteğe bağlı)</label>
              <Input value={manualSalePrice} onChange={(e) => setManualSalePrice(e.target.value)} placeholder="Örn: 120" />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 items-center">
            <div className="flex items-center gap-2">
              <input id="manualManageStock" type="checkbox" checked={manualManageStock} onChange={(e) => setManualManageStock(e.target.checked)} />
              <label htmlFor="manualManageStock" className="text-sm">manage_stock</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="singleDoCreateNew" type="checkbox" checked={singleDoCreateNew} onChange={(e) => setSingleDoCreateNew(e.target.checked)} />
              <label htmlFor="singleDoCreateNew" className="text-sm">Yeni oluştur</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="singleDoUpdateExisting" type="checkbox" checked={singleDoUpdateExisting} onChange={(e) => setSingleDoUpdateExisting(e.target.checked)} />
              <label htmlFor="singleDoUpdateExisting" className="text-sm">Mevcut güncelle</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="singleUpdateStockAndPriceOnly" type="checkbox" checked={singleUpdateStockAndPriceOnly} onChange={(e) => setSingleUpdateStockAndPriceOnly(e.target.checked)} />
            <label htmlFor="singleUpdateStockAndPriceOnly" className="text-sm">Sadece stok/fiyat güncelle</label>
          </div>
          <div>
            <Button onClick={onRunSingle} disabled={loading || syncRunning || !manualSku}>
              {syncRunning ? "Çalışıyor..." : "Tek Ürün Testini Başlat"}
            </Button>
          </div>
        </Card>

        {/* Toplu test */}
        <Card className="p-4 space-y-3">
          <div className="font-medium">Toplu Test (Dosyadan, parçalı yükleme)</div>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">Dosya yolu (public altında)</label>
              <Input value={filePath} onChange={(e) => setFilePath(e.target.value)} placeholder="uploads/new-system/xxx.json" />
            </div>
            <div>
              <label className="text-sm">Limit (parçalı yükleme)</label>
              <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Örn: 50" />
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="text-sm">Per-item Delay (ms)</label>
              <Input type="number" value={perItemDelayMs} onChange={(e) => setPerItemDelayMs(e.target.value === "" ? "" : Number(e.target.value))} placeholder="Örn: 500" />
            </div>
            <div>
              <label className="text-sm">Sıralama</label>
              <select className="border rounded h-9 px-2" value={processDirection} onChange={(e) => setProcessDirection(e.target.value as any)}>
                <option value="asc">Baştan</option>
                <option value="desc">Sondan</option>
              </select>
            </div>
            <div>
              <label className="text-sm">Görsel modu</label>
              <select className="border rounded h-9 px-2" value={mediaMode} onChange={(e) => setMediaMode(e.target.value as any)}>
                <option value="prefer_existing_by_filename">Mevcut varsa dosya adına göre</option>
                <option value="none">Görsel gönderme</option>
                <option value="upload">Her zaman yükle</option>
              </select>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-3 items-center">
            <div className="flex items-center gap-2">
              <input id="batchDoCreateNew" type="checkbox" checked={batchDoCreateNew} onChange={(e) => setBatchDoCreateNew(e.target.checked)} />
              <label htmlFor="batchDoCreateNew" className="text-sm">Yeni oluştur</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="batchDoUpdateExisting" type="checkbox" checked={batchDoUpdateExisting} onChange={(e) => setBatchDoUpdateExisting(e.target.checked)} />
              <label htmlFor="batchDoUpdateExisting" className="text-sm">Mevcut güncelle</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="batchUpdateStockAndPriceOnly" type="checkbox" checked={batchUpdateStockAndPriceOnly} onChange={(e) => setBatchUpdateStockAndPriceOnly(e.target.checked)} />
              <label htmlFor="batchUpdateStockAndPriceOnly" className="text-sm">Sadece stok/fiyat güncelle</label>
            </div>
          </div>
          <div>
            <Button onClick={onRunBatch} disabled={loading || syncRunning || !filePath}>
              {syncRunning ? "Çalışıyor..." : "Toplu Testi Başlat"}
            </Button>
          </div>
        </Card>

      </div>
    </Shell>
  );
}