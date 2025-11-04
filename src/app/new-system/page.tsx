"use client";
import { useEffect, useState, FormEvent } from "react";
import { previewNewSystemForm, runNewSystemSyncForm, saveNewSystemSettingsForm } from "../actions/newSystem";
import { logout } from "../actions/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { getAppSettings } from "../actions/settings";
import { Shell } from "@/components/shell";

type PreviewItem = {
  sku: string;
  name: string;
  regular_price?: string;
  stock_quantity?: number;
};

export default function NewSystemPage() {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [imageBaseUrl, setImageBaseUrl] = useState<string>("");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [doCreateNew, setDoCreateNew] = useState(true);
  const [doUpdateExisting, setDoUpdateExisting] = useState(true);
  const [updateStockOnly, setUpdateStockOnly] = useState(false);
  const [updateImagesOnUpdate, setUpdateImagesOnUpdate] = useState(true);
  const [profitMarginPercent, setProfitMarginPercent] = useState<number>(0);
  const [applyMarginOn, setApplyMarginOn] = useState<"regular" | "sale" | "both">("regular");
  const [roundToInteger, setRoundToInteger] = useState<boolean>(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncLabel, setSyncLabel] = useState<string>("");
  const [processed, setProcessed] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [speed, setSpeed] = useState<number>(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const s = await getAppSettings();
        if (s.newApiUrl) setApiUrl(s.newApiUrl);
        if (s.newImageBaseUrl) setImageBaseUrl(s.newImageBaseUrl);
        if (typeof s.doCreateNew === "boolean") setDoCreateNew(s.doCreateNew);
        if (typeof s.doUpdateExisting === "boolean") setDoUpdateExisting(s.doUpdateExisting);
        if (typeof s.updateStockOnly === "boolean") setUpdateStockOnly(s.updateStockOnly);
        if (typeof s.updateImagesOnUpdate === "boolean") setUpdateImagesOnUpdate(s.updateImagesOnUpdate);
        if (typeof s.profitMarginPercent === "number") setProfitMarginPercent(s.profitMarginPercent);
        if (s.applyMarginOn) setApplyMarginOn(s.applyMarginOn);
        if (typeof s.roundToInteger === "boolean") setRoundToInteger(s.roundToInteger);
      } catch (e) {
        console.warn("Ayarlar yüklenemedi", e);
      }
    })();
  }, []);

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    try {
      setLoading(true);
      const fd = new FormData();
      fd.append("api_url", apiUrl);
      fd.append("image_base_url", imageBaseUrl);
      const res = await previewNewSystemForm(fd);
      setItems(res);
      toast.success("Önizleme başarıyla yüklendi");
    } catch (e: any) {
      toast.error(e?.message || "Önizleme başarısız");
    } finally {
      setLoading(false);
    }
  }

  async function onSync() {
    try {
      setLoading(true);
      setSyncRunning(true);
      setSyncLabel("Senkronizasyon başlatılıyor...");
      setProcessed(0);
      setTotal(0);
      setElapsedMs(0);
      setSpeed(0);
      const fd = new FormData();
      fd.append("api_url", apiUrl);
      fd.append("image_base_url", imageBaseUrl);
      fd.append("deleteMissing", deleteMissing ? "1" : "");
      fd.append("doCreateNew", doCreateNew ? "1" : "");
      fd.append("doUpdateExisting", doUpdateExisting ? "1" : "");
      fd.append("updateStockOnly", updateStockOnly ? "1" : "");
      fd.append("updateImagesOnUpdate", updateImagesOnUpdate ? "1" : "");
      fd.append("profitMarginPercent", String(profitMarginPercent || 0));
      fd.append("applyMarginOn", applyMarginOn);
      fd.append("roundToInteger", roundToInteger ? "1" : "");
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
            } else if (evt.type === "created_product") {
              setSyncLabel(`Oluşturulan: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "updated_product") {
              setSyncLabel(`Güncellenen: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "updated_stock") {
              setSyncLabel(`Stok güncellendi: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "deleted_missing") {
              setSyncLabel(`Eksik silindi: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "progress") {
              setProcessed(evt.processed || 0);
              setTotal(evt.total || 0);
              setElapsedMs(evt.elapsedMs || 0);
              setSpeed(evt.speed || 0);
            } else if (evt.type === "done") {
              setSyncLabel(`Tamamlandı: +${evt.created} / ~${evt.updated} / -${evt.deleted}`);
              toast.success(`Senkronizasyon tamamlandı: Eklenen ${evt.created}, Güncellenen ${evt.updated}, Silinen ${evt.deleted}`);
            } else if (evt.type === "error") {
              setSyncLabel(`Hata: ${evt.error}`);
            } else if (evt.type === "fatal") {
              setSyncLabel(`Kritik hata: ${evt.message}`);
            }
          } catch {
            // metinsel satırları görmezden gel
          }
        }
      }
      router.push("/analysis");
    } catch (e: any) {
      toast.error(e?.message || "Senkronizasyon hata");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setSyncRunning(false);
    }
  }

  async function onUploadAndSync() {
    try {
      if (!selectedFile) {
        toast.error("Lütfen bir JSON dosyası seçin");
        return;
      }
      setLoading(true);
      setSyncRunning(true);
      setSyncLabel("Dosya yükleniyor...");
      setProcessed(0);
      setTotal(0);
      setElapsedMs(0);
      setSpeed(0);

      // 1) Dosyayı yükle
      const formUpload = new FormData();
      formUpload.append("file", selectedFile);
      const upRes = await fetch("/api/new-system/upload", { method: "POST", body: formUpload });
      const upJson = await upRes.json();
      if (!upRes.ok || !upJson.ok) {
        throw new Error(upJson.error || "Dosya yüklenemedi");
      }
      const filePath = upJson.file_path as string;
      setSyncLabel("Dosyadan senkronizasyon başlatılıyor...");

      // 2) Dosyadan senkronizasyonu başlat (stream)
      const fd = new FormData();
      fd.append("file_path", filePath);
      fd.append("image_base_url", imageBaseUrl);
      fd.append("deleteMissing", deleteMissing ? "1" : "");
      fd.append("doCreateNew", doCreateNew ? "1" : "");
      fd.append("doUpdateExisting", doUpdateExisting ? "1" : "");
      fd.append("updateStockOnly", updateStockOnly ? "1" : "");
      fd.append("updateImagesOnUpdate", updateImagesOnUpdate ? "1" : "");
      fd.append("profitMarginPercent", String(profitMarginPercent || 0));
      fd.append("applyMarginOn", applyMarginOn);
      fd.append("roundToInteger", roundToInteger ? "1" : "");
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
            } else if (evt.type === "saved_file") {
              setSyncLabel(`Kaydedilen dosya: ${evt.file} (toplam ${evt.count})`);
            } else if (evt.type === "created_product") {
              setSyncLabel(`Oluşturulan: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "updated_product") {
              setSyncLabel(`Güncellenen: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "updated_stock") {
              setSyncLabel(`Stok güncellendi: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "deleted_missing") {
              setSyncLabel(`Eksik silindi: ${evt.name} (SKU: ${evt.sku})`);
            } else if (evt.type === "progress") {
              setProcessed(evt.processed || 0);
              setTotal(evt.total || 0);
              setElapsedMs(evt.elapsedMs || 0);
              setSpeed(evt.speed || 0);
            } else if (evt.type === "done") {
              setSyncLabel(`Tamamlandı: +${evt.created} / ~${evt.updated} / -${evt.deleted}`);
              toast.success(`Senkronizasyon tamamlandı: Eklenen ${evt.created}, Güncellenen ${evt.updated}, Silinen ${evt.deleted}`);
            } else if (evt.type === "error") {
              setSyncLabel(`Hata: ${evt.error}`);
            } else if (evt.type === "fatal") {
              setSyncLabel(`Kritik hata: ${evt.message}`);
            }
          } catch {}
        }
      }
      router.push("/analysis");
    } catch (e: any) {
      toast.error(e?.message || "Senkronizasyon hata");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
      setSyncRunning(false);
    }
  }

  return (
    <Shell>
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Yeni Sistem İçe Aktarım</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setItems([])}>Temizle</Button>
          <Button variant="destructive" onClick={async () => { await logout(); router.push("/login"); }}>Çıkış</Button>
        </div>
      </div>

      <Card className="p-4 space-y-3">
        <form className="space-y-3" onSubmit={onPreview}>
          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm">API URL</label>
              <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://example.com/api/products" />
            </div>
            <div>
              <label className="text-sm">Görsel Base URL</label>
              <Input value={imageBaseUrl} onChange={(e) => setImageBaseUrl(e.target.value)} placeholder="https://example.com/images" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="flex items-center gap-2">
              <input id="doCreateNew" type="checkbox" checked={doCreateNew} onChange={(e) => setDoCreateNew(e.target.checked)} />
              <label htmlFor="doCreateNew" className="text-sm">Yeni ürünleri ekle</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="doUpdateExisting" type="checkbox" checked={doUpdateExisting} onChange={(e) => setDoUpdateExisting(e.target.checked)} />
              <label htmlFor="doUpdateExisting" className="text-sm">Mevcut olanları güncelle</label>
            </div>
            <div className="flex items-center gap-2">
              <input id="updateStockOnly" type="checkbox" checked={updateStockOnly} onChange={(e) => setUpdateStockOnly(e.target.checked)} />
              <label htmlFor="updateStockOnly" className="text-sm">Sadece stokları güncelle</label>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input id="updateImagesOnUpdate" type="checkbox" checked={updateImagesOnUpdate} onChange={(e) => setUpdateImagesOnUpdate(e.target.checked)} />
            <label htmlFor="updateImagesOnUpdate" className="text-sm">Fotoğrafları güncelle (mevcut ürünlerde)</label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-sm">Kar oranı (%)</label>
              <Input type="number" value={profitMarginPercent} onChange={(e) => setProfitMarginPercent(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-sm">Kar uygulanacak fiyat</label>
              <select className="border rounded h-9 px-2" value={applyMarginOn} onChange={(e) => setApplyMarginOn(e.target.value as any)}>
                <option value="regular">Regular price</option>
                <option value="sale">Sale price</option>
                <option value="both">Her ikisi</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input id="roundToInteger" type="checkbox" checked={roundToInteger} onChange={(e) => setRoundToInteger(e.target.checked)} />
              <label htmlFor="roundToInteger" className="text-sm">Yuvarla (tam TL)</label>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={loading}>{loading ? "Önizleme yükleniyor..." : "Önizleme"}</Button>
            <Button type="button" variant="outline" disabled={loading} onClick={async () => {
              try {
                const fd = new FormData();
                fd.append("api_url", apiUrl);
                fd.append("image_base_url", imageBaseUrl);
                fd.append("doCreateNew", doCreateNew ? "1" : "");
                fd.append("doUpdateExisting", doUpdateExisting ? "1" : "");
                fd.append("updateStockOnly", updateStockOnly ? "1" : "");
                fd.append("updateImagesOnUpdate", updateImagesOnUpdate ? "1" : "");
                fd.append("profitMarginPercent", String(profitMarginPercent || 0));
                fd.append("applyMarginOn", applyMarginOn);
                fd.append("roundToInteger", roundToInteger ? "1" : "");
                await saveNewSystemSettingsForm(fd);
                toast.success("Ayarlar kaydedildi");
              } catch (e: any) {
                toast.error(e?.message || "Ayarlar kaydedilemedi");
              }
            }}>Ayarları Kaydet</Button>
          </div>
        </form>
      </Card>

      <div className="flex items-center gap-2">
        <input id="deleteMissing" type="checkbox" checked={deleteMissing} onChange={(e) => setDeleteMissing(e.target.checked)} />
        <label htmlFor="deleteMissing" className="text-sm">Yeni sistemde olmayan ürünleri sil</label>
      </div>

      {/* Her zaman görünür canlı durum etiketi ve senkronizasyon butonu */}
      <Card className="p-4 flex flex-col gap-3">
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
        <div className="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
            disabled={loading || syncRunning || !apiUrl}
            title={!apiUrl ? "API URL gerekli" : undefined}
          >
            {syncRunning ? "Senkronizasyon yapılıyor..." : "API'den Kaydet ve Senkronize Et"}
          </Button>
          <div className="flex items-center gap-2">
            <input type="file" accept=".json,application/json" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
            <Button variant="outline" disabled={loading || syncRunning || !selectedFile} onClick={onUploadAndSync}>
              {syncRunning ? "Senkronizasyon yapılıyor..." : "Dosya Yükle ve Senkronize Et"}
            </Button>
          </div>
        </div>
      </Card>

      {items.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Önizleme ({items.length})</div>
          </div>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Ad</TableHead>
                  <TableHead>Fiyat</TableHead>
                  <TableHead>Stok</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.sku}>
                    <TableCell className="font-mono">{item.sku}</TableCell>
                    <TableCell>{item.name}</TableCell>
                    <TableCell>{item.regular_price ?? "-"}</TableCell>
                    <TableCell>{item.stock_quantity ?? "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Emin misiniz?</AlertDialogTitle>
          </AlertDialogHeader>
          <p>Yeni sistemde olmayan ürünler WooCommerce’dan kalıcı olarak silinecek. Emin misiniz?</p>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={onSync}>Evet, sil ve senkronize et</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </Shell>
  );
}