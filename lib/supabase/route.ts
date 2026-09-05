import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Session-bound (anon key) client for Route Handlers — RLS applies, scoped
// to whichever user's cookies are on the request. Use this for every
// user-owned table, including visual_styles (owner_id-scoped). Admin-only
// writes (e.g. system_prompts presets, now file constants — see
// lib/constants/) use supabaseAdmin() instead.
export async function supabaseRoute() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called outside a Route Handler/Server Action — middleware's
            // session refresh already keeps cookies current in that case.
          }
        },
      },
    }
  );
}

export async function getSessionUser() {
  const supabase = await supabaseRoute();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
