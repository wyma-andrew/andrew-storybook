"use client";

import { useState } from "react";
import Link from "next/link";
import { ConfirmDialog, Input, Switch, toast } from "@geckoui/geckoui";
import { Trash2, UserPlus } from "lucide-react";
import { AdminBlock } from "@/components/ui/AdminBlock";
import { Button, LoadingButton } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Body, Crumb, TopBar, Wrap } from "@/components/ui/Layout";
import { Skeleton } from "@/components/ui/Skeleton";
import { FEATURE_KEYS, FEATURE_LABELS, NO_FEATURES, type UserFeatures } from "@/lib/constants/features";
import { useRead, useWrite } from "@/lib/spoosh";
import type { AdminUser } from "@/lib/api/types";

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function AdminPage() {
  const { data: me } = useRead((api) => api("auth/me").GET());
  const { data: users, loading } = useRead((api) => api("admin/users").GET());

  return (
    <>
      <TopBar>
        <Crumb>
          <Link href="/stories">Stories</Link> / <span className="text-fg">Admin</span>
        </Crumb>
      </TopBar>

      <Body>
        <Wrap wide>
          <div className="mb-6">
            <h1 className="text-[18px] font-semibold">Users</h1>
            <p className="mt-1 text-[13px] text-fg-3">
              Create accounts and choose which features each one can use. A feature that is off is refused by the
              database, not only hidden.
            </p>
          </div>

          <CreateAccount />

          {loading && !users ? (
            <div role="status" aria-label="Loading users" className="mt-5.5">
              <Skeleton className="mb-2 h-12 w-full" />
              <Skeleton className="mb-2 h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <AdminBlock title="Accounts" badge={users?.length ? `${users.length}` : undefined} className="mt-5.5">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] uppercase tracking-wider text-fg-3">
                      <th className="pb-2.5 font-medium">Email</th>
                      {FEATURE_KEYS.map((key) => (
                        <th key={key} className="pb-2.5 text-center font-medium">
                          {FEATURE_LABELS[key]}
                        </th>
                      ))}
                      <th className="pb-2.5 text-center font-medium">Admin</th>
                      <th className="pb-2.5 font-medium">Created</th>
                      <th className="pb-2.5 font-medium">Last sign-in</th>
                      <th className="pb-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {users?.map((user) => (
                      <UserRow key={user.id} user={user} isSelf={user.id === me?.id} />
                    ))}
                  </tbody>
                </table>
              </div>
            </AdminBlock>
          )}
        </Wrap>
      </Body>
    </>
  );
}

function UserRow({ user, isSelf }: { user: AdminUser; isSelf: boolean }) {
  const { trigger: updateUser } = useWrite((api) => api("admin/users/:id").PATCH());
  const { trigger: deleteUser } = useWrite((api) => api("admin/users/:id").DELETE());

  async function patch(body: { isAdmin?: boolean; features?: Partial<UserFeatures> }, next: Partial<AdminUser>) {
    const { error } = await updateUser({
      params: { id: user.id },
      body,
      // The row the switch lives in comes from this read, and the signed-in
      // user's own nav is driven by auth/me — flipping your own access has to
      // refresh both.
      invalidate: ["admin/users", "auth/me"],
      optimistic: (cache) =>
        cache("admin/users").set((current: AdminUser[]) =>
          current.map((row) => (row.id === user.id ? { ...row, ...next } : row))
        ),
    });
    if (error) toast.error(error.error);
  }

  function confirmDelete() {
    ConfirmDialog.show({
      title: `Delete ${user.email}?`,
      content:
        "The account and everything it owns is removed — stories, chapters, recap projects, and the uploaded video and rendered files behind them. This cannot be undone.",
      confirmButtonLabel: "Delete account",
      cancelButtonLabel: "Cancel",
      onConfirm: async ({ dismiss }) => {
        const { error } = await deleteUser({ params: { id: user.id } });
        dismiss();
        if (error) toast.error(error.error);
        else toast.info(`${user.email} deleted.`);
      },
    });
  }

  return (
    <tr className="border-t border-line">
      <td className="py-3 pr-4">
        <span className="font-medium">{user.email}</span>
        {isSelf && <span className="ml-2 text-[11px] text-fg-3">you</span>}
      </td>
      {FEATURE_KEYS.map((key) => (
        <td key={key} className="py-3 text-center">
          <Switch
            size="sm"
            checked={user.features[key]}
            onChange={(checked) =>
              patch({ features: { [key]: checked } }, { features: { ...user.features, [key]: checked } })
            }
            aria-label={`${FEATURE_LABELS[key]} for ${user.email}`}
          />
        </td>
      ))}
      <td className="py-3 text-center">
        <Switch
          size="sm"
          checked={user.isAdmin}
          onChange={(checked) => patch({ isAdmin: checked }, { isAdmin: checked })}
          disabled={isSelf}
          aria-label={`Admin for ${user.email}`}
        />
      </td>
      <td className="py-3 pr-4 text-fg-3">{formatDate(user.createdAt)}</td>
      <td className="py-3 pr-4 text-fg-3">{formatDate(user.lastSignInAt)}</td>
      <td className="py-3 text-right">
        <Button
          variant="danger"
          size="sm"
          onClick={confirmDelete}
          disabled={isSelf}
          title={isSelf ? "You cannot delete your own account" : undefined}
          aria-label={`Delete ${user.email}`}
        >
          <Trash2 size={14} />
        </Button>
      </td>
    </tr>
  );
}

function CreateAccount() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [features, setFeatures] = useState<UserFeatures>(NO_FEATURES);
  const { trigger: createUser, loading, error } = useWrite((api) => api("admin/users").POST());

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const { error } = await createUser({ body: { email, password, features } });
    if (error) return;
    setEmail("");
    setPassword("");
    setFeatures(NO_FEATURES);
    setOpen(false);
    toast.info("Account created. Give the person their password — there is no invite email.");
  }

  if (!open) {
    return (
      <Button variant="primary" onClick={() => setOpen(true)}>
        <UserPlus size={15} /> Create account
      </Button>
    );
  }

  return (
    <AdminBlock title="Create account">
      <form onSubmit={handleSubmit}>
        {error && <div className="mb-2.5 text-[13px] text-danger">{error.error}</div>}
        <Field label="Email">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="Set it here and pass it on — there is no sign-up page and no invite email.">
          <Input type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="mb-[18px] max-w-[560px]">
          {FEATURE_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
              <span>{FEATURE_LABELS[key]}</span>
              <Switch
                size="sm"
                checked={features[key]}
                onChange={(checked) => setFeatures((current) => ({ ...current, [key]: checked }))}
              />
            </label>
          ))}
        </div>
        <div className="flex gap-2">
          <LoadingButton variant="primary" type="submit" loading={loading}>
            Create account
          </LoadingButton>
          <Button type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        </div>
      </form>
    </AdminBlock>
  );
}
