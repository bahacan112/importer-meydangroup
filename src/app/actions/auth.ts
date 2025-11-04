"use server";
import { cookies, headers } from "next/headers";

export async function login(username: string, password: string) {
  const u = process.env.LOGIN_USERNAME || "admin";
  const p = process.env.LOGIN_PASSWORD || "admin";
  if (username === u && password === p) {
    const c = await cookies();
    const h = await headers();
    const host = h.get("host") || "localhost";
    const port = host.includes(":") ? host.split(":")[1] : "80";
    const cookieName = `auth_${port}`;
    c.set(cookieName, "1", { httpOnly: true, path: "/" });
    return { ok: true };
  }
  return { ok: false, error: "Kullanıcı adı veya şifre hatalı" };
}

export async function logout() {
  const c = await cookies();
  const h = await headers();
  const host = h.get("host") || "localhost";
  const port = host.includes(":") ? host.split(":")[1] : "80";
  const cookieName = `auth_${port}`;
  c.delete(cookieName);
  // Eski çerez kalmışsa onu da temizleyelim
  c.delete("auth");
}