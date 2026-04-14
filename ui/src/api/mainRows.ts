import { runtimeConfig } from "../config";

export type MainRow = {
  id: number;
  nr_fisa: string;
  reper: string;
  client: string;
  buc: number;
  timp_per_buc: number;
  ore_totale: number;
  updated_at: string;
};

type RowsResponse = {
  rows: MainRow[];
  mode: "aws" | "localstack";
};

export async function fetchMainRows(
  page: number,
  pageSize: number,
): Promise<RowsResponse> {
  const response = await fetch(
    `${runtimeConfig.baseUrl}/api/main-rows?page=${page}&page_size=${pageSize}`,
  );

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}`);
  }

  const payload = (await response.json()) as { rows: MainRow[] };
  return { rows: payload.rows, mode: runtimeConfig.mode };
}

export async function saveMainRowUpdate(
  id: number,
  patch: Partial<Pick<MainRow, "nr_fisa" | "reper" | "client" | "buc">>,
) {
  try {
    const response = await fetch(`${runtimeConfig.baseUrl}/api/main-rows/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      return {
        ok: false,
        message: `Server returned ${response.status}`,
        mode: runtimeConfig.mode,
      };
    }

    return { ok: true, message: "Saved", mode: runtimeConfig.mode };
  } catch {
    return { ok: false, message: "Network error", mode: runtimeConfig.mode };
  }
}

export async function createMainRow(payload: {
  nr_fisa: string;
  reper: string;
  client: string;
  buc: number;
}): Promise<{ ok: boolean; row?: MainRow; message: string; mode: "aws" | "localstack" }> {
  try {
    const response = await fetch(`${runtimeConfig.baseUrl}/api/main-rows`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Server returned ${response.status}`,
        mode: runtimeConfig.mode,
      };
    }
    const body = (await response.json()) as { row: MainRow };
    return { ok: true, row: body.row, message: "Created", mode: runtimeConfig.mode };
  } catch {
    return { ok: false, message: "Network error", mode: runtimeConfig.mode };
  }
}

export async function deleteMainRow(
  id: number,
): Promise<{ ok: boolean; message: string; mode: "aws" | "localstack" }> {
  try {
    const response = await fetch(`${runtimeConfig.baseUrl}/api/main-rows/${id}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      return {
        ok: false,
        message: `Server returned ${response.status}`,
        mode: runtimeConfig.mode,
      };
    }
    return { ok: true, message: "Deleted", mode: runtimeConfig.mode };
  } catch {
    return { ok: false, message: "Network error", mode: runtimeConfig.mode };
  }
}

export async function fetchRecalcStatus(): Promise<{ message: string }> {
  const response = await fetch(`${runtimeConfig.baseUrl}/api/recalc/status`);
  if (!response.ok) {
    throw new Error("Status endpoint failed");
  }

  const payload = (await response.json()) as { status: string };
  return { message: payload.status };
}
