export interface MaspOptionsResponse {
  success: boolean;
  message?: string;
  units: Array<{
    id: number;
    code:
      | string
      | null;
    name: string;
    city:
      | string
      | null;
  }>;
  equipments: Array<{
    id: number;
    unit_id: number;
    code: string;
    name: string;
    production_line_id:
      | number
      | null;
  }>;
  productionLines: Array<{
    id: number;
    unit_id: number;
    code: string;
    name: string;
  }>;
  users: Array<{
    id: number;
    name: string;
    unit_id: number;
  }>;
  recentEvents: Array<{
    id: number;
    unit_id: number;
    event_date: string;
    equipment_name:
      | string
      | null;
    line_name:
      | string
      | null;
    observation:
      | string
      | null;
    downtime_minutes:
      | number
      | string
      | null;
  }>;
}

export async function readApiResponse<
  T,
>(
  response: Response,
): Promise<T> {
  const data =
    await response.json() as
      T & {
        message?: string;
      };

  if (
    !response.ok
  ) {
    throw new Error(
      data.message ??
      "Não foi possível concluir a operação.",
    );
  }

  return data;
}

