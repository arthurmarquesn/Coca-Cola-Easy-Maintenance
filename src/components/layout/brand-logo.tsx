import Image from "next/image";

/* Marca da top bar: Coca-Cola | FEMSA. A FEMSA some no mobile. */
export function BrandLogo() {
  return (
    <span className="flex shrink-0 items-center gap-4">
      <Image
        src="/logo.webp"
        alt="Coca-Cola"
        width={180}
        height={64}
        priority
        className="h-auto max-h-[42px] w-auto object-contain"
      />

      <span className="hidden h-8 w-px bg-border-theme sm:block" />

      <Image
        src="/femsa-logo.png"
        alt="FEMSA"
        width={544}
        height={129}
        priority
        className="hidden h-[22px] w-auto rounded-[2px] object-contain sm:block"
      />
    </span>
  );
}
