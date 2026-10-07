import {
  notFound,
  redirect,
} from "next/navigation";

import type {
  RowDataPacket,
} from "mysql2/promise";

import {
  ReviewCategoryPage,
} from "@/components/review/review-category-page";

import {
  executeRows,
} from "@/lib/db";

import {
  getSession,
} from "@/lib/session";

import {
  isAnalystRole,
} from "@/lib/roles";

import {
  getCategoryLabel,
  isValidCategorySlug,
} from "@/lib/maintenance/problem-categories";

interface UnitRow extends RowDataPacket {
  name: string;
}

interface CategoryPageProps {
  params: Promise<{ category: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

function firstValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CategoryReviewPageRoute({
  params,
  searchParams,
}: CategoryPageProps) {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  /* Revisão, MASP e Ursus não fazem parte do perfil Gestor
     (o dashboard também esconde esses módulos). */
  if (!isAnalystRole(session.role)) {
    redirect("/dashboard");
  }


  const { category } = await params;

  if (!isValidCategorySlug(category)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;

  const units = await executeRows<UnitRow[]>(
    `
      SELECT name
      FROM units
      WHERE id = ? AND active = TRUE
      LIMIT 1
    `,
    [session.unitId],
  );

  const unit = units[0];

  if (!unit) {
    redirect("/login");
  }

  return (
    <ReviewCategoryPage
      user={{ name: session.name }}
      unit={{ name: unit.name }}
      categorySlug={category}
      categoryLabel={getCategoryLabel(category)}
      canWrite={isAnalystRole(session.role)}
      initialFilters={{
        line: firstValue(resolvedSearchParams.line) ?? "",
        equipment: firstValue(resolvedSearchParams.equipment) ?? "",
        shift: firstValue(resolvedSearchParams.shift) ?? "",
        status: firstValue(resolvedSearchParams.status) ?? "PENDENTE_REVISAO",
        dateFrom: firstValue(resolvedSearchParams.dateFrom) ?? "",
        dateTo: firstValue(resolvedSearchParams.dateTo) ?? "",
        search: firstValue(resolvedSearchParams.search) ?? "",
        confidenceMin: Number(
          firstValue(resolvedSearchParams.confidenceMin) ?? 0,
        ),
        confidenceMax: Number(
          firstValue(resolvedSearchParams.confidenceMax) ?? 100,
        ),
      }}
    />
  );
}
