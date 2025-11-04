import { Shell } from "@/components/shell";
import { OpsForm } from "./OpsForm";

export default function OperationsPage() {
  return (
    <Shell>
      <div className="space-y-4">
        <h1 className="text-lg font-semibold">Toplu İşlemler</h1>
        <section className="space-y-3">
          <h2 className="font-medium">Fiyatları Toplu Artır</h2>
          <OpsForm />
        </section>
      </div>
    </Shell>
  );
}