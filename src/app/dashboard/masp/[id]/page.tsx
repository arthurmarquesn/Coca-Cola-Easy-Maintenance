import {
  notFound,
  redirect,
} from "next/navigation";

import {
  MaspDetailPage,
} from "@/components/masp/masp-detail-page";

import {
  getSession,
} from "@/lib/session";


export const dynamic =
  "force-dynamic";

export default async function MaspDetailRoute({
  params,
}: {
  params: Promise<{
    id: string;
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

  const {
    id,
  } =
    await params;

  const maspId =
    Number(
      id,
    );

  if (
    !Number.isInteger(
      maspId,
    ) ||
    maspId <= 0
  ) {
    notFound();
  }

  return (
    <MaspDetailPage
      userName={
        session.name
      }
      maspId={
        maspId
      }
    />
  );
}
