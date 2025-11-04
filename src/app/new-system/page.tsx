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
      const res = await runNewSystemSyncForm(fd);
      toast.success(`Senkronizasyon tamamlandı: Eklenen ${res.created}, Güncellenen ${res.updated}, Silinen ${res.deleted}`);
      router.push("/analysis");
    } catch (e: any) {
      toast.error(e?.message || "Senkronizasyon hata");
    } finally {
      setLoading(false);
      setConfirmOpen(false);
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

      {items.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="font-medium">Önizleme ({items.length})</div>
            <div className="flex items-center gap-2">
              <Button variant="destructive" onClick={() => setConfirmOpen(true)} disabled={loading}>Senkronize Et</Button>
            </div>
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