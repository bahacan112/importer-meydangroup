"use client";
import { useEffect, useState, FormEvent } from "react";
import { previewXml, runSync } from "../actions/sync";
import { logout } from "../actions/auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";

type PreviewItem = {
  sku: string;
  name: string;
  regular_price?: string;
  stock_quantity?: number;
};

export default function DashboardPage() {
  const [xmlPath, setXmlPath] = useState<string>(process.env.NEXT_PUBLIC_XML_PATH || "");
  const [items, setItems] = useState<PreviewItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => {
    // env’den otomatik doldurma
    if (!xmlPath && typeof window !== "undefined") {
      // Sunucu taraflı env’i client’a aktarmamak için boş bırakıyoruz.
    }
  }, [xmlPath]);

  async function onPreview(e: FormEvent) {
    e.preventDefault();
    if (!xmlPath) {
      toast.error("XML dosya yolunu giriniz");
      return;
    }
    setLoading(true);
    try {
      const data = await previewXml(xmlPath);
      setItems(
        data.map((d: any) => ({
          sku: d.sku,
          name: d.name,
          regular_price: d.regular_price,
          stock_quantity: d.stock_quantity,
        }))
      );
      toast.success(`Önizleme yüklendi (${data.length} ürün)`);
    } catch (e: any) {
      toast.error(e?.message || "Önizleme yüklenemedi");
    }
    setLoading(false);
  }

  async function onSync() {
    setLoading(true);
    try {
      const result = await runSync(xmlPath, { deleteMissing });
      toast.success(
        `Senkronizasyon tamamlandı. Eklendi: ${result.created}, Güncellendi: ${result.updated}, Silindi: ${result.deleted}`
      );
    } catch (e: any) {
      toast.error(e?.message || "Senkronizasyon başarısız");
    }
    setLoading(false);
  }

  async function onLogout() {
    await logout();
    window.location.href = "/login";
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">WC Importer Dashboard</h1>
        <Button variant="secondary" onClick={onLogout}>Çıkış Yap</Button>
      </div>
      <Card className="p-4 space-y-3">
        <form onSubmit={onPreview} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="text-sm">XML Dosya Yolu</label>
              <Input value={xmlPath} onChange={(e) => setXmlPath(e.target.value)} placeholder="C:\\Users\\baha\\Desktop\\Projeler\\importer\\mxml.xml" />
            </div>
            <Button type="submit" disabled={loading}>Önizleme</Button>
          </div>
        </form>
        <div className="flex items-center gap-2">
          <input id="deleteMissing" type="checkbox" checked={deleteMissing} onChange={(e) => setDeleteMissing(e.target.checked)} />
          <label htmlFor="deleteMissing" className="text-sm">XML’de olmayan ürünleri sil</label>
        </div>
        <Button disabled={loading} onClick={() => deleteMissing ? setConfirmOpen(true) : onSync()}>
          {loading ? "Çalışıyor..." : "Senkronizasyonu Başlat"}
        </Button>
      </Card>

      {items.length > 0 && (
        <Card className="p-4">
          <h2 className="font-medium mb-2">Önizleme ({items.length} ürün)</h2>
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
                {items.map((it) => (
                  <TableRow key={it.sku}>
                    <TableCell className="font-mono">{it.sku}</TableCell>
                    <TableCell>{it.name}</TableCell>
                    <TableCell>{it.regular_price || "-"}</TableCell>
                    <TableCell>{it.stock_quantity ?? "-"}</TableCell>
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
            <AlertDialogTitle>Silme işlemini onayla</AlertDialogTitle>
          </AlertDialogHeader>
          <p>XML’de olmayan ürünler WooCommerce’dan kalıcı olarak silinecek. Emin misiniz?</p>
          <AlertDialogFooter>
            <AlertDialogCancel>İptal</AlertDialogCancel>
            <AlertDialogAction onClick={onSync}>Evet, sil ve senkronize et</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}