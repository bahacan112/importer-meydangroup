import { Shell } from "@/components/shell";
import { getAppSettings, getWooSettings, saveAppSettingsForm, saveWooSettingsForm } from "../actions/settings";
import { Button } from "@/components/ui/button";

export default async function SettingsPage() {
  const app = await getAppSettings();
  const woo = await getWooSettings();
  return (
    <Shell>
      <div className="grid md:grid-cols-2 gap-6">
        <section className="space-y-4">
          <h1 className="text-lg font-semibold">Importer Varsayılanları</h1>
          <form action={saveAppSettingsForm} className="space-y-3">
            <div>
              <label className="text-sm">XML Path veya URL</label>
              <input name="xml_path" type="url" defaultValue={app.xml_path || ""} placeholder="http://... veya C:\\..." className="mt-1 w-full border rounded px-2 py-1" />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="onlyCreateNew" defaultChecked={!!app.onlyCreateNew} />
              <span className="text-sm">Sadece yeni ürünleri ekle</span>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="updateImagesOnUpdate" defaultChecked={app.updateImagesOnUpdate !== false} />
              <span className="text-sm">Güncellemede fotoğrafları yenile</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm">Kar Oranı (%)</label>
                <input name="profitMarginPercent" type="number" step="0.01" defaultValue={app.profitMarginPercent ?? 0} className="mt-1 w-full border rounded px-2 py-1" />
              </div>
              <div>
                <label className="text-sm">Kar Uygulanacak</label>
                <select name="applyMarginOn" defaultValue={app.applyMarginOn || "regular"} className="mt-1 w-full border rounded px-2 py-1">
                  <option value="regular">Regular</option>
                  <option value="sale">Sale</option>
                  <option value="both">Both</option>
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" name="roundToInteger" defaultChecked={app.roundToInteger !== false} />
              <span className="text-sm">Fiyatı tam TL’ye yuvarla</span>
            </div>
            <Button type="submit">Kaydet</Button>
          </form>
        </section>

        <section className="space-y-4">
          <h1 className="text-lg font-semibold">WooCommerce Genel Ayarlar</h1>
          <form action={saveWooSettingsForm} className="space-y-3">
            <div>
              <label className="text-sm">Base URL</label>
              <input name="base_url" type="url" defaultValue={woo.base_url || process.env.WC_API_URL || ""} placeholder="https://site.com/wp-json/wc/v3" className="mt-1 w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="text-sm">Consumer Key</label>
              <input name="consumer_key" defaultValue={woo.consumer_key || process.env.WC_CONSUMER_KEY || ""} className="mt-1 w-full border rounded px-2 py-1" />
            </div>
            <div>
              <label className="text-sm">Consumer Secret</label>
              <input name="consumer_secret" defaultValue={woo.consumer_secret || process.env.WC_CONSUMER_SECRET || ""} className="mt-1 w-full border rounded px-2 py-1" />
            </div>
            <Button type="submit">Kaydet</Button>
          </form>
        </section>
      </div>
    </Shell>
  );
}