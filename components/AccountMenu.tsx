"use client";

import { useRouter } from "next/navigation";
import { Menu, MenuTrigger, MenuItem } from "@geckoui/geckoui";
import { useRead, useWrite } from "@/lib/spoosh";

export function AccountMenu() {
  const { data: me } = useRead((api) => api("auth/me").GET());
  const { trigger: signOut } = useWrite((api) => api("auth/sign-out").POST());
  const router = useRouter();

  if (!me) return null;

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Menu menuClassName="min-w-[220px] p-0">
      <MenuTrigger>
        {({ toggleMenu }) => (
          <div
            className="grid h-8 w-8 cursor-pointer place-items-center rounded-full border border-line-2 bg-hover text-[12.5px] font-semibold text-fg-2 hover:bg-hover-2"
            onClick={toggleMenu}
          >
            {me.email.slice(0, 2).toUpperCase()}
          </div>
        )}
      </MenuTrigger>

      <div className="break-all border-b border-line px-3.5 py-3 text-[12.5px] text-fg-2">{me.email}</div>
      <MenuItem onClick={() => router.push("/account")}>Account</MenuItem>
      <MenuItem onClick={handleSignOut}>
        <span className="text-danger">Sign out</span>
      </MenuItem>
    </Menu>
  );
}
