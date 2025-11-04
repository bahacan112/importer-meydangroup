import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Kamuya açık yollar
  const publicPaths = ["/login", "/api/health", "/api/sync"];
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }
  const host = req.headers.get("host") || "localhost";
  const port = host.includes(":") ? host.split(":")[1] : "80";
  const cookieName = `auth_${port}`;
  // Eski çerez ismini de kontrol ederek geri uyumluluk sağla
  const auth = req.cookies.get(cookieName)?.value || req.cookies.get("auth")?.value;
  if (!auth) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};