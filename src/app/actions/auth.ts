"use server";
import { cookies } from "next/headers";

export async function login(username: string, password: string) {
  const u = process.env.LOGIN_USERNAME || "admin";
  const p = process.env.LOGIN_PASSWORD || "admin";
  if (username === u && password === p) {
    const c = await cookies();
    c.set("auth", "1", { httpOnly: true, path: "/" });
    return { ok: true };
  }
  return { ok: false, error: "Kullanıcı adı veya şifre hatalı" };
}

export async function logout() {
  const c = await cookies();
  c.delete("auth");
}