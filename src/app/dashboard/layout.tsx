import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const h = await headers();
  const host = h.get("host") || "localhost";
  const port = host.includes(":") ? host.split(":")[1] : "80";
  const cookieName = `auth_${port}`;
  const c = await cookies();
  const auth = c.get(cookieName)?.value;
  if (!auth) {
    redirect("/login");
  }
  return <>{children}</>;
}