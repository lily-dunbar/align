import { redirect } from "next/navigation";

export default function LegacySignInRoute() {
  redirect("/sign-in");
}
