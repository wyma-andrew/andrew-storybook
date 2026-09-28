"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { LinkButton, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@geckoui/geckoui";
import { Body } from "@/components/ui/Layout";
import { useWrite } from "@/lib/spoosh";

export default function SignUpPage() {
  const router = useRouter();
  const { trigger: signUp, loading, error } = useWrite((api) => api("auth/sign-up").POST());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [mismatch, setMismatch] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    const { data } = await signUp({ body: { email, password } });
    if (data) {
      if (data.needsEmailConfirmation) setNeedsConfirmation(true);
      else {
        router.replace("/");
        router.refresh();
      }
    }
  }

  if (needsConfirmation) {
    return (
      <Frame>
        <Body>
          <div className="mx-auto max-w-[380px] px-6 py-15">
            <h1 className="mb-1.5 text-xl font-semibold">Check your email</h1>
            <div className="mb-7 text-[13px] text-fg-3">We sent a confirmation link to {email}. Sign in once you&apos;ve confirmed it.</div>
            <LinkButton variant="primary" href="/sign-in">
              Back to sign in
            </LinkButton>
          </div>
        </Body>
      </Frame>
    );
  }

  return (
    <Frame>
      <Body>
        <div className="mx-auto max-w-[380px] px-6 py-15">
          <h1 className="mb-1.5 text-xl font-semibold">Create account</h1>
          <div className="mb-7 text-[13px] text-fg-3">Start writing long-form, consistent-visual stories.</div>
          <form onSubmit={handleSubmit}>
            {error && <div className="mb-3.5 text-[13px] text-danger">{error.error}</div>}
            {mismatch && <div className="mb-3.5 text-[13px] text-danger">Passwords don&apos;t match.</div>}
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirm password">
              <Input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <LoadingButton variant="primary" type="submit" loading={loading} className="w-full">
              Create account
            </LoadingButton>
          </form>
          <div className="mt-4.5 text-[13px] text-fg-3">
            Already have an account? <Link href="/sign-in" className="text-fg no-underline">Sign in</Link>
          </div>
        </div>
      </Body>
    </Frame>
  );
}
