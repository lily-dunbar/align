import Link from "next/link";
import { UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";

export default async function Home() {
  const { userId } = await auth();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-3xl font-semibold">Align</h1>
      <p className="text-zinc-600">
        Metabolic intelligence for daily diabetes decisions.
      </p>

      {userId ? (
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-500">Signed in</span>
          <UserButton />
        </div>
      ) : (
        <Link
          href="/auth/signin"
          className="rounded bg-zinc-900 px-4 py-2 text-white"
        >
          Sign in with email
        </Link>
      )}
    </main>
  );
}
