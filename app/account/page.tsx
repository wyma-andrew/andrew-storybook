"use client";

import { useState } from "react";
import Link from "next/link";
import { Frame } from "@/components/Frame";
import { AccountMenu } from "@/components/AccountMenu";
import { ThemeToggleButton } from "@/components/ThemeToggleButton";
import { AdminBlock } from "@/components/ui/AdminBlock";
import { LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@geckoui/geckoui";
import { TopBar, Crumb, Body, Wrap, Foot } from "@/components/ui/Layout";
import { useRead, useWrite } from "@/lib/spoosh";

export default function AccountPage() {
  const { data: me } = useRead((api) => api("auth/me").GET());
  const { trigger: changePassword, loading, error } = useWrite((api) => api("auth/password").PATCH());

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return;
    if (password !== confirm) {
      setMismatch(true);
      return;
    }
    setMismatch(false);
    setDone(false);
    const { error } = await changePassword({ body: { password } });
    if (!error) {
      setDone(true);
      setPassword("");
      setConfirm("");
    }
  }

  if (!me) return null;

  return (
    <Frame>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Account</span>
        </Crumb>
        <div className="ml-auto flex items-center gap-2.5">
          <ThemeToggleButton />
          <AccountMenu />
        </div>
      </TopBar>

      <Body>
        <Wrap>
          <div className="mb-6">
            <h1 className="text-[18px] font-semibold">Account</h1>
          </div>

          <Field label="Email">
            <Input className="opacity-60" type="text" value={me.email} disabled />
          </Field>

          <AdminBlock title="Change password" className="mt-5.5">
            <form onSubmit={handleSubmit}>
              {error && <div className="mb-2.5 text-[13px] text-danger">{error.error}</div>}
              {mismatch && <div className="mb-2.5 text-[13px] text-danger">Passwords don&apos;t match.</div>}
              {done && <div className="mb-2.5 text-[13px] text-matched">Password updated.</div>}
              <Field label="New password">
                <Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              </Field>
              <Field label="Confirm new password">
                <Input type="password" required minLength={6} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </Field>
              <LoadingButton variant="primary" type="submit" loading={loading}>
                Update password
              </LoadingButton>
            </form>
          </AdminBlock>
        </Wrap>
      </Body>

      <Foot />
    </Frame>
  );
}
