import {
  redirect,
} from "next/navigation";

import {
  EquipmentCriticalityPage,
} from "@/components/equipment-criticality/equipment-criticality-page";

import {
  getSession,
} from "@/lib/session";


export default async function AssetsPage() {
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
    <EquipmentCriticalityPage
      userName={
        session.name
      }
    />
  );
}