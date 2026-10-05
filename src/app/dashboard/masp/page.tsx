import {
  redirect,
} from "next/navigation";

import {
  MaspListPage,
} from "@/components/masp/masp-list-page";

import {
  isAnalystRole,
} from "@/lib/roles";

import {
  getSession,
} from "@/lib/session";


export const dynamic =
  "force-dynamic";

export default async function MaspPage() {
  const session =
    await getSession();

  if (
    !session
  ) {
    redirect(
      "/login",
    );
  }

  return (
    <MaspListPage
      userName={
        session.name
      }
      canCreate={
        isAnalystRole(
          session.role,
        )
      }
    />
  );
}

