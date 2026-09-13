"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Frame } from "@/components/Frame";
import { LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@geckoui/geckoui";
import { Body } from "@/components/ui/Layout";
import { useWrite } from "@/lib/spoosh";

export default function SignInPage() {
  const router = useRouter();
  const { trigger: signIn, loading, error } = useWrite((api) => api("auth/sign-in").POST());
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { data } = await signIn({ body: { email, password } });
    if (data) {
      router.push("/stories");
      router.refresh();
    }
  }

  return (
    <Frame>
      <Body>
        <div className="mx-auto max-w-[380px] px-6 py-15">
          <h1 className="mb-1.5 text-xl font-semibold">Sign in</h1>
          <div className="mb-7 text-[13px] text-fg-3">Welcome back to AI Storybook.</div>
          <form onSubmit={handleSubmit}>
            {error && <div className="mb-3.5 text-[13px] text-danger">{error.error}</div>}
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <LoadingButton variant="primary" type="submit" loading={loading} className="w-full">
              Sign in
            </LoadingButton>
          </form>
        </div>
      </Body>
    </Frame>
  );
}
