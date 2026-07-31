import Icon from "@/components/Icon";
import { supabaseHost } from "@/lib/db";

/**
 * Shown when an admin page cannot load its data.
 *
 * Next.js redacts server-component error messages in production, so an
 * uncaught throw here reaches the user as nothing but "a server-side exception
 * has occurred" plus a digest — no way to tell a missing environment variable
 * from an unreachable database. Catching it and rendering the message, along
 * with which variables are actually present, turns that into something
 * actionable.
 *
 * Only booleans are reported. No key material is ever rendered.
 */
export default function AdminError({ error }: { error: string }) {
  const env = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY", set: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) },
    { name: "SUPABASE_SERVICE_ROLE_KEY", set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) },
    { name: "ADMIN_PASSWORD_HASH", set: Boolean(process.env.ADMIN_PASSWORD_HASH) },
    { name: "ADMIN_SESSION_SECRET", set: Boolean(process.env.ADMIN_SESSION_SECRET) },
  ];
  const missing = env.filter((e) => !e.set);
  const host = supabaseHost();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-extrabold tracking-tight">
          Could not load admin data
        </h1>
        <p
          className="mt-1 text-sm leading-relaxed"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          You are signed in — this is the data layer, not your login.
        </p>
      </div>

      <div
        className="card p-4"
        style={{ borderColor: "rgb(var(--bad) / 0.4)" }}
      >
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <span style={{ color: "rgb(var(--bad))" }}>
            <Icon name="info" size={15} />
          </span>
          What went wrong
        </h2>
        <p
          className="mt-2 break-words font-mono text-xs leading-relaxed"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {error}
        </p>
      </div>

      <div>
        <h2 className="mb-2 text-[13px] font-bold uppercase tracking-wider">
          Environment variables
        </h2>
        <div className="card divide-y" style={{ borderColor: "rgb(var(--border))" }}>
          {env.map((e) => (
            <div
              key={e.name}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <code className="text-xs">{e.name}</code>
              <span
                className="chip"
                style={
                  e.set
                    ? {
                        background: "rgb(var(--good-soft))",
                        color: "rgb(var(--good))",
                      }
                    : {
                        background: "rgb(var(--bad-soft))",
                        color: "rgb(var(--bad))",
                      }
                }
              >
                {e.set ? "set" : "missing"}
              </span>
            </div>
          ))}
        </div>
        <p
          className="mt-2 text-xs"
          style={{ color: "rgb(var(--text-faint))" }}
        >
          Presence only — values are never displayed.
        </p>

        {host && (
          <div className="card mt-3 px-4 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span
                className="text-xs"
                style={{ color: "rgb(var(--text-muted))" }}
              >
                Connecting to
              </span>
              {/* Host only — it is public anyway, and seeing it makes a
                  mistyped project URL obvious. */}
              <code className="text-xs font-bold">{host}</code>
            </div>
          </div>
        )}
      </div>

      <div className="card p-4">
        <h2 className="text-sm font-bold">Likely fixes</h2>
        <ul
          className="mt-2 space-y-1.5 text-sm leading-relaxed"
          style={{ color: "rgb(var(--text-muted))" }}
        >
          {missing.length > 0 ? (
            <li>
              <strong>
                {missing.map((m) => m.name).join(", ")}{" "}
                {missing.length === 1 ? "is" : "are"} missing.
              </strong>{" "}
              Add {missing.length === 1 ? "it" : "them"} in Vercel under
              Settings → Environment Variables, then redeploy — new variables
              only take effect on a fresh deployment.
            </li>
          ) : (
            <>
              <li>
                All five variables are set, so this is the database rejecting
                the request. Check the message above.
              </li>
              <li>
                <strong>&ldquo;relation does not exist&rdquo;</strong> — run{" "}
                <code>supabase/schema.sql</code> in the Supabase SQL editor.
              </li>
              <li>
                <strong>&ldquo;Invalid API key&rdquo; / &ldquo;JWT&rdquo;</strong>{" "}
                — the keys may be from a different Supabase project, or the
                service role key and anon key may be swapped.
              </li>
              <li>
                <strong>&ldquo;fetch failed&rdquo;</strong> — check{" "}
                <code>NEXT_PUBLIC_SUPABASE_URL</code> is the full{" "}
                <code>https://…supabase.co</code> project URL.
              </li>
              <li>
                <strong>
                  &ldquo;Invalid path specified in request URL&rdquo;
                </strong>{" "}
                — the project URL has extra path on it. It must be just{" "}
                <code>https://your-project.supabase.co</code>, with no{" "}
                <code>/rest/v1</code> and no trailing slash.
              </li>
            </>
          )}
        </ul>
      </div>
    </div>
  );
}
