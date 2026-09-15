"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [entering, setEntering] =
    useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setEntering(false);
    }, 100);

    return () =>
      clearTimeout(timer);
  }, []);

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F6F7F8]">
      {/* Continuação da transição */}

      <div
        className={
          entering
            ? "dashboard-transition"
            : "dashboard-transition dashboard-transition-hide"
        }
        aria-hidden="true"
      >
        <div className="dashboard-transition-logo">
          <Image
            src="/logo.webp"
            alt=""
            width={240}
            height={110}
            className="h-auto w-[190px] object-contain brightness-0 invert"
          />
        </div>
      </div>

      {/* Conteúdo temporário */}

      <section className="dashboard-content flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-[720px] text-center">
          <Image
            src="/logo.webp"
            alt="Coca-Cola FEMSA"
            width={230}
            height={100}
            className="mx-auto h-auto w-[190px] object-contain"
          />

          <h1 className="mt-10 text-3xl font-semibold tracking-[-0.04em] text-[#191919] sm:text-4xl">
            Bem-vindo.
          </h1>

          <p className="mx-auto mt-4 max-w-[500px] text-sm leading-7 text-[#747980]">
            O ambiente está pronto para receber o dashboard operacional.
          </p>
        </div>
      </section>
    </main>
  );
}