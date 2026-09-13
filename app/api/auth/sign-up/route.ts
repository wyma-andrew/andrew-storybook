import { NextResponse } from "next/server";

// Sign-up is closed — accounts are created out of band for now.
//
// This is the layer that actually gates it. The sign-in page no longer links
// here, /sign-up redirects in the proxy AND in the page itself, but a bookmarked
// URL, a stale open tab, or a direct POST all arrive at this handler, and only
// this one can refuse them.
//
// The previous implementation was a single supabase.auth.signUp call — restore
// it from git history when sign-up reopens, alongside app/sign-up/page.form.tsx.
export async function POST() {
  return NextResponse.json({ error: "Sign-up is closed." }, { status: 403 });
}
