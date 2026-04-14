import { runtimeConfig } from "../config";

export type MainRow = {
  id: number;
  nr_fisa: string;
  reper: string;
  client: string;
  buc: number;
  data_intrare: string | null;
  data_livrare: string | null;
  comanda: string | null;
  tratament: string | null;
  observatii: string | null;
  strung_colchester: number | null;
  strung_cnc: number | null;
  freze_mici: number | null;
  freze_mari: number | null;
  gaurire: number | null;
  rectificare: number | null;
  bwk: number | null;
  sip: number | null;
  norte: number | null;
  tos: number | null;
  bridgeport: number | null;
  eco: number | null;
  schaublin: number | null;
  hurco: number | null;
  matec: number | null;
  parpas: number | null;
  ajustare: number | null;
  filetare: number | null;
  marcare: number | null;
  curatare_filete: number | null;
  timp_per_buc: number | null;
  ore_totale: number | null;
  valoare_per_buc: number | null;
  valoare_totala: number | null;
  utilaj_folosit: string | null;
  soft_folosit: string | null;
  programator: string | null;
  locatie_dosar: string | null;
  status: string | null;
  control_status: string | null;
  magazie_status: string | null;
  created_at: string | null;
  created_by: string | null;
  updated_at: string | null;
  updated_by: string | null;
  recalc_at: string | null;
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
  patch: Partial<Omit<MainRow, "id" | "created_at" | "updated_at">>,
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
  data_intrare?: string | null;
  data_livrare?: string | null;
  comanda?: string | null;
  tratament?: string | null;
  observatii?: string | null;
  strung_colchester?: number | null;
  strung_cnc?: number | null;
  freze_mici?: number | null;
  freze_mari?: number | null;
  gaurire?: number | null;
  rectificare?: number | null;
  bwk?: number | null;
  sip?: number | null;
  norte?: number | null;
  tos?: number | null;
  bridgeport?: number | null;
  eco?: number | null;
  schaublin?: number | null;
  hurco?: number | null;
  matec?: number | null;
  parpas?: number | null;
  ajustare?: number | null;
  filetare?: number | null;
  marcare?: number | null;
  curatare_filete?: number | null;
  status?: string | null;
  control_status?: string | null;
  magazie_status?: string | null;
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
