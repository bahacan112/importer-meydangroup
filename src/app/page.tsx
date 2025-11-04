import { redirect } from "next/navigation";

export default function Home() {
  // Ana sayfayı direkt dashboard’a yönlendir
  redirect("/dashboard");
}
