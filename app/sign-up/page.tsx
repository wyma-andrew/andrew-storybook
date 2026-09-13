import { redirect } from "next/navigation";

// Sign-up is closed — accounts are created out of band for now.
//
// The route is kept rather than deleted so the URL resolves instead of 404ing,
// and so reopening sign-up is restoring one file. The real form is preserved in
// page.form.tsx next to this; the proxy also redirects /sign-up, and
// POST /api/auth/sign-up refuses with 403 — this is the third of the three
// layers, for the case where the proxy does not run.
export default function SignUpPage() {
  redirect("/sign-in");
}
