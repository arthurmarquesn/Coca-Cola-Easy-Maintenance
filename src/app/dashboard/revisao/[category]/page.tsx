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
  getCategoryLabel,
  isValidCategorySlug,
} from "@/lib/maintenance/problem-categories";

interface UnitRow extends RowDataPacket {
  city: string | null;
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

  const { category } = await params;

  if (!isValidCategorySlug(category)) {
    notFound();
  }

  const resolvedSearchParams = await searchParams;

  const units = await executeRows<UnitRow[]>(
    `
      SELECT city
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
      unit={{ city: unit.city }}
      categorySlug={category}
      categoryLabel={getCategoryLabel(category)}
      initialFilters={{
        lineId: firstValue(resolvedSearchParams.lineId) ?? "",
        equipmentId: firstValue(resolvedSearchParams.equipmentId) ?? "",
        shift: firstValue(resolvedSearchParams.shift) ?? "",
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
