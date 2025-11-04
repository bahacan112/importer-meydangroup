import { Shell } from "@/components/shell";
import { getWooSettings, saveWooSettingsForm } from "../actions/settings";
import { Button } from "@/components/ui/button";
import DangerZoneDeleteAll from "@/components/DangerZoneDeleteAll";

export default async function SettingsPage() {
  const woo = await getWooSettings();
  return (
    <Shell>
      <div className="grid md:grid-cols-1 gap-6">
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

        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-red-600">Tehlikeli İşlemler</h2>
          <DangerZoneDeleteAll />
        </section>
      </div>
    </Shell>
  );
}