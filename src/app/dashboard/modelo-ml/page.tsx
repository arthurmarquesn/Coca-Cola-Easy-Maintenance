import {
  redirect,
} from "next/navigation";

import {
  getSession,
} from "@/lib/session";

import {
  MlTestPanel,
} from "@/components/ml/ml-test-panel";


export default async function ModeloMlPage() {
  const session =
    await getSession();

  if (!session) {
    redirect(
      "/login",
    );
  }

  return (
    <MlTestPanel />
  );
}