import {
  redirect,
} from "next/navigation";

import {
  MaspCreatePage,
} from "@/components/masp/masp-create-page";

import {
  getSession,
} from "@/lib/session";


export const dynamic =
  "force-dynamic";

export default async function NewMaspPage({
  searchParams,
}: {
  searchParams: Promise<{
    eventId?: string;
  }>;
}) {
  const session =
    await getSession();

  if (
    !session
  ) {
    redirect(
      "/login",
    );
  }

  const params =
    await searchParams;

  const parsedEventId =
    Number(
      params.eventId,
    );

  return (
    <MaspCreatePage
      userName={
        session.name
      }
      initialEventId={
        Number.isInteger(
          parsedEventId,
        ) &&
        parsedEventId > 0
          ? parsedEventId
          : null
      }
    />
  );
}

