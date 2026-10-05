import type {
  ReactNode,
} from "react";

import {
  ReliabilityFiltersProvider,
} from "@/components/reliability/reiliability-filters-provider";

interface ReliabilityLayoutProps {
  children:
    ReactNode;
}

export default function ReliabilityLayout({
  children,
}: ReliabilityLayoutProps) {
  return (
    <ReliabilityFiltersProvider>
      {children}
    </ReliabilityFiltersProvider>
  );
}