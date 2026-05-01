import { signIn } from "@/auth";

const githubEnabled =
  Boolean(process.env.AUTH_GITHUB_ID) && Boolean(process.env.AUTH_GITHUB_SECRET);
const emailEnabled =
  Boolean(process.env.AUTH_RESEND_KEY) && Boolean(process.env.AUTH_EMAIL_FROM);

export default function SignInPage() {
  const githubExample = `AUTH_GITHUB_ID=your_github_client_id
AUTH_GITHUB_SECRET=your_github_client_secret
AUTH_URL=http://localhost:4000
AUTH_SECRET=your_long_random_secret`;

  const magicLinkExample = `AUTH_RESEND_KEY=re_your_resend_api_key
AUTH_EMAIL_FROM=Align <no-reply@your-domain.com>
AUTH_URL=http://localhost:4000
AUTH_SECRET=your_long_random_secret`;

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-zinc-50 px-4 dark:bg-zinc-950">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-center text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Sign in to Align
        </h1>

        <p className="mt-2 text-center text-sm text-zinc-600 dark:text-zinc-400">
          {githubEnabled && emailEnabled
            ? "Use GitHub or an email magic link."
            : githubEnabled
              ? "Use your GitHub account to continue."
              : emailEnabled
                ? "Use an email magic link to continue."
                : "No auth provider is configured yet."}
        </p>

        {githubEnabled ? (
          <form
            className="mt-6"
            action={async () => {
              "use server";
              await signIn("github", { redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Continue with GitHub
            </button>
          </form>
        ) : null}

        {emailEnabled ? (
          <form
            className="mt-4 flex flex-col gap-3"
            action={async (formData) => {
              "use server";
              const email = formData.get("email");
              if (typeof email === "string" && email.trim()) {
                await signIn("resend", {
                  email: email.trim(),
                  redirectTo: "/",
                });
              }
            }}
          >
            <input
              type="email"
              name="email"
              required
              placeholder="you@example.com"
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none ring-zinc-400 focus:ring-2 dark:border-zinc-700 dark:bg-zinc-950"
            />
            <button
              type="submit"
              className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              Send magic link
            </button>
          </form>
        ) : null}

        {!githubEnabled && !emailEnabled ? (
          <p className="mt-4 text-xs text-zinc-500">
            Add provider env vars in <code>.env.local</code> (see <code>.env.example</code>).
          </p>
        ) : null}
      </div>

      <div className="w-full max-w-2xl rounded-xl border border-zinc-200 bg-white p-6 text-left shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">
          Recommended setup
        </h2>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-zinc-700 dark:text-zinc-300">
          <li>Open <code>.env.local</code>.</li>
          <li>Copy one block below and fill in your real values.</li>
          <li>Save the file.</li>
          <li>Restart the dev server: <code>npm run dev</code>.</li>
        </ol>

        <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          GitHub OAuth (easiest to start)
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {githubExample}
        </pre>

        <p className="mt-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
          Email magic link (optional)
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-zinc-100 p-3 text-xs text-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
          {magicLinkExample}
        </pre>
      </div>
    </div>
  );
}
