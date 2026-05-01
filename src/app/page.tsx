import Link from "next/link";

import { auth, signIn, signOut } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">Align</h1>
      <p className="text-zinc-600">Metabolic intelligence for daily diabetes decisions.</p>

      {session?.user ? (
        <>
          <p className="text-sm text-zinc-500">
            Signed in as {session.user.email ?? session.user.name ?? session.user.id}
          </p>
          <div className="flex gap-3">
            <Link href="/auth/signin" className="rounded border px-4 py-2">
              Account
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/auth/signin" });
              }}
            >
              <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white">
                Sign out
              </button>
            </form>
          </div>
        </>
      ) : (
        <form
          action={async () => {
            "use server";
            await signIn("github", { redirectTo: "/" });
          }}
        >
          <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white">
            Sign in with GitHub
          </button>
        </form>
      )}
    </main>
  );
}
