import { useEffect, useMemo, useRef, useState, type UIEvent } from "react";
import "./App.css";
import {
  createMainRow,
  deleteMainRow,
  fetchMainRows,
  fetchRecalcStatus,
  saveMainRowUpdate,
  type MainRow,
} from "./api/mainRows";
import { runtimeConfig } from "./config";

const PAGE_SIZE = 50;
const SCROLL_THRESHOLD_PX = 420;
const SCROLL_THRESHOLD_VIEWPORT_MULTIPLIER = 1.5;
const MACHINE_FIELDS = [
  "strung_colchester",
  "strung_cnc",
  "freze_mici",
  "freze_mari",
  "gaurire",
  "rectificare",
  "bwk",
  "sip",
  "norte",
  "tos",
  "bridgeport",
  "eco",
  "schaublin",
  "hurco",
  "matec",
  "parpas",
  "ajustare",
  "filetare",
  "marcare",
  "curatare_filete",
] as const;

type MachineField = (typeof MACHINE_FIELDS)[number];

type ComposerDraft = {
  nr_fisa: string;
  reper: string;
  client: string;
  buc: string;
  data_intrare: string;
  data_livrare: string;
  comanda: string;
  tratament: string;
  observatii: string;
  status: string;
  control_status: string;
  magazie_status: string;
} & Record<MachineField, string>;

type RowEditDraft = {
  nr_fisa: string;
  reper: string;
  client: string;
  buc: string;
  data_intrare: string;
  data_livrare: string;
  comanda: string;
  tratament: string;
  observatii: string;
  status: string;
  control_status: string;
  magazie_status: string;
  timp_per_buc: string;
  ore_totale: string;
  valoare_per_buc: string;
  valoare_totala: string;
  utilaj_folosit: string;
  soft_folosit: string;
  programator: string;
  locatie_dosar: string;
  created_by: string;
  updated_by: string;
  recalc_at: string;
} & Record<MachineField, string>;

const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
  nr_fisa: "",
  reper: "",
  client: "",
  buc: "1",
  data_intrare: "",
  data_livrare: "",
  comanda: "",
  tratament: "",
  observatii: "",
  status: "in_lucru",
  control_status: "",
  magazie_status: "",
  strung_colchester: "",
  strung_cnc: "",
  freze_mici: "",
  freze_mari: "",
  gaurire: "",
  rectificare: "",
  bwk: "",
  sip: "",
  norte: "",
  tos: "",
  bridgeport: "",
  eco: "",
  schaublin: "",
  hurco: "",
  matec: "",
  parpas: "",
  ajustare: "",
  filetare: "",
  marcare: "",
  curatare_filete: "",
};

function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return <span className="empty-cell">-</span>;
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function parseOptionalNumber(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error("Numeric fields must contain valid numbers.");
  }
  return parsed;
}

function toInput(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function rowToEditDraft(row: MainRow): RowEditDraft {
  return {
    nr_fisa: toInput(row.nr_fisa),
    reper: toInput(row.reper),
    client: toInput(row.client),
    buc: toInput(row.buc),
    data_intrare: toInput(row.data_intrare),
    data_livrare: toInput(row.data_livrare),
    comanda: toInput(row.comanda),
    tratament: toInput(row.tratament),
    observatii: toInput(row.observatii),
    status: toInput(row.status),
    control_status: toInput(row.control_status),
    magazie_status: toInput(row.magazie_status),
    timp_per_buc: toInput(row.timp_per_buc),
    ore_totale: toInput(row.ore_totale),
    valoare_per_buc: toInput(row.valoare_per_buc),
    valoare_totala: toInput(row.valoare_totala),
    utilaj_folosit: toInput(row.utilaj_folosit),
    soft_folosit: toInput(row.soft_folosit),
    programator: toInput(row.programator),
    locatie_dosar: toInput(row.locatie_dosar),
    created_by: toInput(row.created_by),
    updated_by: toInput(row.updated_by),
    recalc_at: toInput(row.recalc_at),
    strung_colchester: toInput(row.strung_colchester),
    strung_cnc: toInput(row.strung_cnc),
    freze_mici: toInput(row.freze_mici),
    freze_mari: toInput(row.freze_mari),
    gaurire: toInput(row.gaurire),
    rectificare: toInput(row.rectificare),
    bwk: toInput(row.bwk),
    sip: toInput(row.sip),
    norte: toInput(row.norte),
    tos: toInput(row.tos),
    bridgeport: toInput(row.bridgeport),
    eco: toInput(row.eco),
    schaublin: toInput(row.schaublin),
    hurco: toInput(row.hurco),
    matec: toInput(row.matec),
    parpas: toInput(row.parpas),
    ajustare: toInput(row.ajustare),
    filetare: toInput(row.filetare),
    marcare: toInput(row.marcare),
    curatare_filete: toInput(row.curatare_filete),
  };
}

function App() {
  const [rows, setRows] = useState<MainRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<RowEditDraft | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [isLeftNavCollapsed, setIsLeftNavCollapsed] = useState(false);
  const [status, setStatus] = useState<string>("Loading rows...");
  const [recalcStatus, setRecalcStatus] = useState<string>("Loading...");
  const [isSaving, setIsSaving] = useState(false);
  const [composerDraft, setComposerDraft] = useState<ComposerDraft>(EMPTY_COMPOSER_DRAFT);
  const [nextPage, setNextPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(true);
  const [propertiesWidth, setPropertiesWidth] = useState(420);
  const tableWrapRef = useRef<HTMLElement | null>(null);
  const propertiesResizeRef = useRef(false);
  const shouldStickBottomRef = useRef(true);
  const loadingPageRef = useRef<number | null>(null);
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const prependScrollAdjustRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const composerFirstInputRef = useRef<HTMLInputElement | null>(null);

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedRowId) ?? null,
    [rows, selectedRowId],
  );
  const displayRows = useMemo(
    () => [...rows].sort((a, b) => a.id - b.id),
    [rows],
  );
  const filteredRows = useMemo(() => {
    const q = appliedSearchQuery.trim().toLowerCase();
    if (!q) {
      return displayRows;
    }
    return displayRows.filter((row) => {
      return (
        String(row.id).includes(q) ||
        row.nr_fisa.toLowerCase().includes(q) ||
        row.reper.toLowerCase().includes(q) ||
        row.client.toLowerCase().includes(q)
      );
    });
  }, [displayRows, appliedSearchQuery]);
  const isSearchActive = appliedSearchQuery.trim().length > 0;

  function applySearch() {
    setAppliedSearchQuery(searchInput);
  }

  async function loadPage(pageToLoad: number, reset = false) {
    if (isLoadingMore && !reset) {
      return;
    }
    if (!reset && (loadingPageRef.current === pageToLoad || loadedPagesRef.current.has(pageToLoad))) {
      return;
    }
    if (reset) {
      loadedPagesRef.current.clear();
    }
    loadingPageRef.current = pageToLoad;
    const el = tableWrapRef.current;
    if (!reset && el) {
      prependScrollAdjustRef.current = {
        previousScrollHeight: el.scrollHeight,
        previousScrollTop: el.scrollTop,
      };
    } else if (reset) {
      prependScrollAdjustRef.current = null;
    }
    setIsLoadingMore(true);
    setStatus(reset ? "Loading rows..." : "Loading more rows...");
    try {
      const result = await fetchMainRows(pageToLoad, PAGE_SIZE);
      setRows((prev) => {
        const merged = reset ? result.rows : [...prev, ...result.rows];
        const byId = new Map<number, MainRow>();
        for (const row of merged) {
          byId.set(row.id, row);
        }
        return [...byId.values()];
      });
      loadedPagesRef.current.add(pageToLoad);
      setNextPage(pageToLoad + 1);
      setHasMoreRows(result.rows.length === PAGE_SIZE);
      setStatus(`Loaded rows from ${result.mode} endpoint.`);
    } catch (error) {
      setStatus(`Load failed: ${error instanceof Error ? error.message : "unknown"}`);
      if (reset) {
        setRows([]);
      }
      setHasMoreRows(false);
    } finally {
      setIsLoadingMore(false);
      loadingPageRef.current = null;
    }
  }

  async function loadRecalc() {
    try {
      const result = await fetchRecalcStatus();
      setRecalcStatus(result.message);
    } catch {
      setRecalcStatus("Failed to load recalc status.");
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    void loadPage(1, true);
    void loadRecalc();
  }, []);

  function onTableScroll(event: UIEvent<HTMLElement>) {
    if (isSearchActive) {
      return;
    }
    if (!hasMoreRows || isLoadingMore) {
      return;
    }
    const target = event.currentTarget;
    const adaptiveThreshold = Math.max(
      SCROLL_THRESHOLD_PX,
      target.clientHeight * SCROLL_THRESHOLD_VIEWPORT_MULTIPLIER,
    );
    if (target.scrollTop <= adaptiveThreshold) {
      void loadPage(nextPage);
    }
  }

  function refreshRows() {
    setHasMoreRows(true);
    setNextPage(1);
    shouldStickBottomRef.current = true;
    void loadPage(1, true);
  }

  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el || isSearchActive || !hasMoreRows || isLoadingMore) {
      return;
    }
    const notScrollableYet = el.scrollHeight <= el.clientHeight + 2;
    if (notScrollableYet && rows.length > 0) {
      void loadPage(nextPage);
    }
  }, [rows, hasMoreRows, isLoadingMore, nextPage, isSearchActive]);

  useEffect(() => {
    const pending = prependScrollAdjustRef.current;
    const el = tableWrapRef.current;
    if (!pending || !el) {
      return;
    }
    const addedHeight = el.scrollHeight - pending.previousScrollHeight;
    el.scrollTop = pending.previousScrollTop + addedHeight;
    prependScrollAdjustRef.current = null;
  }, [rows]);

  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el || !shouldStickBottomRef.current) {
      return;
    }
    // Excel-like: land user at latest rows (bottom) on initial load/refresh.
    el.scrollTop = el.scrollHeight;
    const scrollableNow = el.scrollHeight > el.clientHeight + 2;
    if (!isLoadingMore && (scrollableNow || !hasMoreRows)) {
      shouldStickBottomRef.current = false;
    }
  }, [rows, isLoadingMore, hasMoreRows]);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      if (!propertiesResizeRef.current) {
        return;
      }
      const minWidth = 320;
      const maxWidth = 920;
      const next = window.innerWidth - event.clientX;
      setPropertiesWidth(Math.max(minWidth, Math.min(maxWidth, next)));
    };
    const onMouseUp = () => {
      propertiesResizeRef.current = false;
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  function selectRow(row: MainRow) {
    setSelectedRowId(row.id);
    setEditingDraft(rowToEditDraft(row));
  }

  async function saveSelectedRow() {
    if (!selectedRow || !editingDraft) {
      return;
    }
    let patch: Partial<MainRow>;
    try {
      const machineValues = Object.fromEntries(
        MACHINE_FIELDS.map((field) => [field, parseOptionalNumber(editingDraft[field])]),
      ) as Record<MachineField, number | null>;
      patch = {
        nr_fisa: editingDraft.nr_fisa.trim(),
        reper: editingDraft.reper.trim(),
        client: editingDraft.client.trim(),
        buc: Number(editingDraft.buc),
        data_intrare: editingDraft.data_intrare || null,
        data_livrare: editingDraft.data_livrare || null,
        comanda: editingDraft.comanda || null,
        tratament: editingDraft.tratament || null,
        observatii: editingDraft.observatii || null,
        status: editingDraft.status || null,
        control_status: editingDraft.control_status || null,
        magazie_status: editingDraft.magazie_status || null,
        timp_per_buc: parseOptionalNumber(editingDraft.timp_per_buc),
        ore_totale: parseOptionalNumber(editingDraft.ore_totale),
        valoare_per_buc: parseOptionalNumber(editingDraft.valoare_per_buc),
        valoare_totala: parseOptionalNumber(editingDraft.valoare_totala),
        utilaj_folosit: editingDraft.utilaj_folosit || null,
        soft_folosit: editingDraft.soft_folosit || null,
        programator: editingDraft.programator || null,
        locatie_dosar: editingDraft.locatie_dosar || null,
        created_by: editingDraft.created_by || null,
        updated_by: editingDraft.updated_by || null,
        recalc_at: editingDraft.recalc_at || null,
        ...machineValues,
      };
      if (Number.isNaN(patch.buc)) {
        setStatus("Buc must be numeric.");
        return;
      }
      if (!patch.nr_fisa || !patch.reper || !patch.client) {
        setStatus("Nr Fisa, Reper, Client are required.");
        return;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid row values.");
      return;
    }

    setIsSaving(true);
    const result = await saveMainRowUpdate(selectedRow.id, patch);
    setIsSaving(false);

    if (!result.ok) {
      setStatus(`Save failed: ${result.message}`);
      return;
    }

    setRows((prev) =>
      prev.map((row) =>
        row.id === selectedRow.id
          ? {
              ...row,
              ...patch,
              updated_at: new Date().toISOString(),
            }
          : row,
      ),
    );
    setStatus(`Row ${selectedRow.id} saved via ${result.mode}.`);
    void loadRecalc();
  }

  function useRowAsTemplate(row: MainRow) {
    const nextDraft: ComposerDraft = {
      nr_fisa: row.nr_fisa,
      reper: row.reper,
      client: row.client,
      buc: String(row.buc),
      data_intrare: row.data_intrare ?? "",
      data_livrare: row.data_livrare ?? "",
      comanda: row.comanda ?? "",
      tratament: row.tratament ?? "",
      observatii: row.observatii ?? "",
      status: row.status ?? "in_lucru",
      control_status: row.control_status ?? "",
      magazie_status: row.magazie_status ?? "",
      strung_colchester: row.strung_colchester === null ? "" : String(row.strung_colchester),
      strung_cnc: row.strung_cnc === null ? "" : String(row.strung_cnc),
      freze_mici: row.freze_mici === null ? "" : String(row.freze_mici),
      freze_mari: row.freze_mari === null ? "" : String(row.freze_mari),
      gaurire: row.gaurire === null ? "" : String(row.gaurire),
      rectificare: row.rectificare === null ? "" : String(row.rectificare),
      bwk: row.bwk === null ? "" : String(row.bwk),
      sip: row.sip === null ? "" : String(row.sip),
      norte: row.norte === null ? "" : String(row.norte),
      tos: row.tos === null ? "" : String(row.tos),
      bridgeport: row.bridgeport === null ? "" : String(row.bridgeport),
      eco: row.eco === null ? "" : String(row.eco),
      schaublin: row.schaublin === null ? "" : String(row.schaublin),
      hurco: row.hurco === null ? "" : String(row.hurco),
      matec: row.matec === null ? "" : String(row.matec),
      parpas: row.parpas === null ? "" : String(row.parpas),
      ajustare: row.ajustare === null ? "" : String(row.ajustare),
      filetare: row.filetare === null ? "" : String(row.filetare),
      marcare: row.marcare === null ? "" : String(row.marcare),
      curatare_filete: row.curatare_filete === null ? "" : String(row.curatare_filete),
    };
    setComposerDraft(nextDraft);
    composerFirstInputRef.current?.focus();
    setStatus(`Template loaded from row ${row.id}.`);
  }

  function clearComposer() {
    setComposerDraft(EMPTY_COMPOSER_DRAFT);
  }

  async function createFromComposer() {
    const parsedQty = Number(composerDraft.buc);
    if (Number.isNaN(parsedQty)) {
      setStatus("Quantity must be numeric.");
      return;
    }
    if (!composerDraft.nr_fisa.trim() || !composerDraft.reper.trim() || !composerDraft.client.trim()) {
      setStatus("Nr Fisa, Reper, Client are required.");
      return;
    }
    setIsSaving(true);
    let result;
    try {
      const machineValues = Object.fromEntries(
        MACHINE_FIELDS.map((field) => [field, parseOptionalNumber(composerDraft[field])]),
      ) as Record<MachineField, number | null>;
      result = await createMainRow({
        nr_fisa: composerDraft.nr_fisa.trim(),
        reper: composerDraft.reper.trim(),
        client: composerDraft.client.trim(),
        buc: parsedQty,
        data_intrare: composerDraft.data_intrare || null,
        data_livrare: composerDraft.data_livrare || null,
        comanda: composerDraft.comanda || null,
        tratament: composerDraft.tratament || null,
        observatii: composerDraft.observatii || null,
        status: composerDraft.status || null,
        control_status: composerDraft.control_status || null,
        magazie_status: composerDraft.magazie_status || null,
        ...machineValues,
      });
    } catch (error) {
      setIsSaving(false);
      setStatus(error instanceof Error ? error.message : "Invalid numeric values.");
      return;
    }
    setIsSaving(false);
    if (!result.ok || !result.row) {
      setStatus(`Create failed: ${result.message}`);
      return;
    }
    const createdRow = result.row;
    setRows((prev) => {
      const byId = new Map<number, MainRow>();
      for (const row of [...prev, createdRow]) {
        byId.set(row.id, row);
      }
      return [...byId.values()];
    });
    selectRow(createdRow);
    clearComposer();
    const el = tableWrapRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
    setStatus(`Row ${createdRow.id} created via ${result.mode}.`);
  }

  async function deleteSelectedRow() {
    if (!selectedRow) {
      return;
    }
    const expected = selectedRow.reper;
    const typed = window.prompt(
      `Type row name to delete.\nExpected: ${expected}`,
      "",
    );
    if (typed === null) {
      return;
    }
    if (typed.trim() !== expected) {
      setStatus("Delete canceled: typed value does not match row name.");
      return;
    }
    setIsSaving(true);
    const result = await deleteMainRow(selectedRow.id);
    setIsSaving(false);
    if (!result.ok) {
      setStatus(`Delete failed: ${result.message}`);
      return;
    }
    setRows((prev) => prev.filter((row) => row.id !== selectedRow.id));
    setSelectedRowId(null);
    setEditingDraft(null);
    setStatus(`Row ${selectedRow.id} deleted via ${result.mode}.`);
  }

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `${isLeftNavCollapsed ? 52 : 220}px minmax(0, 1fr) 6px ${propertiesWidth}px`,
      }}
    >
      <aside className={`left-nav ${isLeftNavCollapsed ? "collapsed" : ""}`}>
        <button
          className="collapse-nav-btn"
          onClick={() => setIsLeftNavCollapsed((prev) => !prev)}
          title={isLeftNavCollapsed ? "Show navigation" : "Hide navigation"}
        >
          {isLeftNavCollapsed ? "»" : "«"}
        </button>
        {!isLeftNavCollapsed && (
          <>
            <h1>Pyramydal UI</h1>
            <nav>
              <button className="nav-item active">Main Rows</button>
              <button className="nav-item">Reference Lists</button>
              <button className="nav-item">Uploads</button>
              <button className="nav-item">Export</button>
            </nav>
          </>
        )}
      </aside>

      <main className="workspace">
        <header className="toolbar">
          <div>
            <strong>Main Rows</strong>
            <p>{status}</p>
            <p className="sparse-hint">Empty cells reflect source XLSX data.</p>
          </div>
          <div className="toolbar-actions">
            <input
              className="search-input"
              type="search"
              placeholder="Search ID, fisa, reper, client"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  applySearch();
                }
              }}
            />
            <button onClick={applySearch}>Search</button>
            <button onClick={refreshRows}>Refresh</button>
            <button onClick={() => void loadRecalc()}>Recalc Status</button>
            <span className="mode-pill">{runtimeConfig.mode}</span>
          </div>
        </header>

        <section ref={tableWrapRef} className="table-wrap" onScroll={onTableScroll}>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nr Fisa</th>
                <th>Reper</th>
                <th>Client</th>
                <th>Buc</th>
                <th>Data Intrare</th>
                <th>Data Livrare</th>
                <th>Comanda</th>
                <th>Tratament</th>
                <th>Observatii</th>
                <th>Strung Colchester</th>
                <th>Strung CNC</th>
                <th>Freze Mici</th>
                <th>Freze Mari</th>
                <th>Gaurire</th>
                <th>Rectificare</th>
                <th>BWK</th>
                <th>SIP</th>
                <th>Norte</th>
                <th>TOS</th>
                <th>Bridgeport</th>
                <th>Eco</th>
                <th>Schaublin</th>
                <th>Hurco</th>
                <th>Matec</th>
                <th>Parpas</th>
                <th>Ajustare</th>
                <th>Filetare</th>
                <th>Marcare</th>
                <th>Curatare Filete</th>
                <th>Timp/Buc</th>
                <th>Ore Totale</th>
                <th>Valoare/Buc</th>
                <th>Valoare Totala</th>
                <th>Utilaj Folosit</th>
                <th>Soft Folosit</th>
                <th>Programator</th>
                <th>Locatie Dosar</th>
                <th>Status</th>
                <th>Control Status</th>
                <th>Magazie Status</th>
                <th>Created At</th>
                <th>Created By</th>
                <th>Updated At</th>
                <th>Updated By</th>
                <th>Recalc At</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  onClick={() => selectRow(row)}
                  className={selectedRowId === row.id ? "selected-row" : ""}
                >
                  <td>{row.id}</td>
                  <td>{row.nr_fisa}</td>
                  <td>{row.reper}</td>
                  <td>{row.client}</td>
                  <td>{formatCell(row.buc)}</td>
                  <td>{formatCell(row.data_intrare)}</td>
                  <td>{formatCell(row.data_livrare)}</td>
                  <td>{formatCell(row.comanda)}</td>
                  <td>{formatCell(row.tratament)}</td>
                  <td>{formatCell(row.observatii)}</td>
                  <td>{formatCell(row.strung_colchester)}</td>
                  <td>{formatCell(row.strung_cnc)}</td>
                  <td>{formatCell(row.freze_mici)}</td>
                  <td>{formatCell(row.freze_mari)}</td>
                  <td>{formatCell(row.gaurire)}</td>
                  <td>{formatCell(row.rectificare)}</td>
                  <td>{formatCell(row.bwk)}</td>
                  <td>{formatCell(row.sip)}</td>
                  <td>{formatCell(row.norte)}</td>
                  <td>{formatCell(row.tos)}</td>
                  <td>{formatCell(row.bridgeport)}</td>
                  <td>{formatCell(row.eco)}</td>
                  <td>{formatCell(row.schaublin)}</td>
                  <td>{formatCell(row.hurco)}</td>
                  <td>{formatCell(row.matec)}</td>
                  <td>{formatCell(row.parpas)}</td>
                  <td>{formatCell(row.ajustare)}</td>
                  <td>{formatCell(row.filetare)}</td>
                  <td>{formatCell(row.marcare)}</td>
                  <td>{formatCell(row.curatare_filete)}</td>
                  <td>{formatCell(row.timp_per_buc)}</td>
                  <td>{formatCell(row.ore_totale)}</td>
                  <td>{formatCell(row.valoare_per_buc)}</td>
                  <td>{formatCell(row.valoare_totala)}</td>
                  <td>{formatCell(row.utilaj_folosit)}</td>
                  <td>{formatCell(row.soft_folosit)}</td>
                  <td>{formatCell(row.programator)}</td>
                  <td>{formatCell(row.locatie_dosar)}</td>
                  <td>{formatCell(row.status)}</td>
                  <td>{formatCell(row.control_status)}</td>
                  <td>{formatCell(row.magazie_status)}</td>
                  <td>{formatCell(row.created_at)}</td>
                  <td>{formatCell(row.created_by)}</td>
                  <td>{formatCell(row.updated_at)}</td>
                  <td>{formatCell(row.updated_by)}</td>
                  <td>{formatCell(row.recalc_at)}</td>
                  <td>
                    <button
                      className="small-btn"
                      onClick={(event) => {
                        event.stopPropagation();
                        useRowAsTemplate(row);
                      }}
                      disabled={isSaving}
                    >
                      Use as template
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="infinite-status">
            {!isLoadingMore && filteredRows.length === 0 && <span>No matching rows.</span>}
            {!isSearchActive && isLoadingMore && <span>Loading more...</span>}
            {!hasMoreRows && <span>End of results.</span>}
          </div>
        </section>
        <section className="composer">
          <strong>New Work Order</strong>
          <div className="composer-grid">
            <input
              ref={composerFirstInputRef}
              className="cell-input"
              placeholder="Nr Fisa"
              value={composerDraft.nr_fisa}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, nr_fisa: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Reper"
              value={composerDraft.reper}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, reper: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Client"
              value={composerDraft.client}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, client: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Buc"
              value={composerDraft.buc}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, buc: event.target.value }))
              }
            />
            <input
              className="cell-input"
              type="date"
              value={composerDraft.data_intrare}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, data_intrare: event.target.value }))
              }
            />
            <input
              className="cell-input"
              type="date"
              value={composerDraft.data_livrare}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, data_livrare: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Comanda"
              value={composerDraft.comanda}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, comanda: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Tratament"
              value={composerDraft.tratament}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, tratament: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Observatii"
              value={composerDraft.observatii}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, observatii: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Status"
              value={composerDraft.status}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, status: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Control Status"
              value={composerDraft.control_status}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, control_status: event.target.value }))
              }
            />
            <input
              className="cell-input"
              placeholder="Magazie Status"
              value={composerDraft.magazie_status}
              onChange={(event) =>
                setComposerDraft((prev) => ({ ...prev, magazie_status: event.target.value }))
              }
            />
            {MACHINE_FIELDS.map((field) => (
              <input
                key={field}
                className="cell-input"
                placeholder={field}
                value={composerDraft[field]}
                onChange={(event) =>
                  setComposerDraft((prev) => ({ ...prev, [field]: event.target.value }))
                }
              />
            ))}
          </div>
          <div className="composer-actions">
            <button onClick={() => void createFromComposer()} disabled={isSaving}>
              Create new row
            </button>
            <button onClick={clearComposer} disabled={isSaving}>
              Clear
            </button>
            {selectedRow && (
              <button onClick={() => useRowAsTemplate(selectedRow)} disabled={isSaving}>
                Copy selected to draft
              </button>
            )}
          </div>
        </section>
      </main>

      <div
        className="panel-resizer"
        onMouseDown={() => {
          propertiesResizeRef.current = true;
        }}
      />
      <aside className="properties">
        <h2>Row Properties</h2>
        {selectedRow && editingDraft ? (
          <>
            <p>
              <strong>ID:</strong> {selectedRow.id}
            </p>
            <div className="properties-grid">
              <label>Nr Fisa</label>
              <input
                value={editingDraft.nr_fisa}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, nr_fisa: event.target.value } : prev))
                }
              />
              <label>Reper</label>
              <input
                value={editingDraft.reper}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, reper: event.target.value } : prev))
                }
              />
              <label>Client</label>
              <input
                value={editingDraft.client}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, client: event.target.value } : prev))
                }
              />
              <label>Buc</label>
              <input
                value={editingDraft.buc}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, buc: event.target.value } : prev))
                }
              />
              <label>Data Intrare</label>
              <input
                type="date"
                value={editingDraft.data_intrare}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, data_intrare: event.target.value } : prev,
                  )
                }
              />
              <label>Data Livrare</label>
              <input
                type="date"
                value={editingDraft.data_livrare}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, data_livrare: event.target.value } : prev,
                  )
                }
              />
              <label>Comanda</label>
              <input
                value={editingDraft.comanda}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, comanda: event.target.value } : prev))
                }
              />
              <label>Tratament</label>
              <input
                value={editingDraft.tratament}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, tratament: event.target.value } : prev,
                  )
                }
              />
              <label>Observatii</label>
              <input
                value={editingDraft.observatii}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, observatii: event.target.value } : prev,
                  )
                }
              />
              <label>Status</label>
              <input
                value={editingDraft.status}
                onChange={(event) =>
                  setEditingDraft((prev) => (prev ? { ...prev, status: event.target.value } : prev))
                }
              />
              <label>Control Status</label>
              <input
                value={editingDraft.control_status}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, control_status: event.target.value } : prev,
                  )
                }
              />
              <label>Magazie Status</label>
              <input
                value={editingDraft.magazie_status}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, magazie_status: event.target.value } : prev,
                  )
                }
              />
              {MACHINE_FIELDS.map((field) => (
                <div key={field} className="properties-field">
                  <label>{field}</label>
                  <input
                    value={editingDraft[field]}
                    onChange={(event) =>
                      setEditingDraft((prev) =>
                        prev ? { ...prev, [field]: event.target.value } : prev,
                      )
                    }
                  />
                </div>
              ))}
              <label>Timp/Buc</label>
              <input
                value={editingDraft.timp_per_buc}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, timp_per_buc: event.target.value } : prev,
                  )
                }
              />
              <label>Ore Totale</label>
              <input
                value={editingDraft.ore_totale}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, ore_totale: event.target.value } : prev,
                  )
                }
              />
              <label>Valoare/Buc</label>
              <input
                value={editingDraft.valoare_per_buc}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, valoare_per_buc: event.target.value } : prev,
                  )
                }
              />
              <label>Valoare Totala</label>
              <input
                value={editingDraft.valoare_totala}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, valoare_totala: event.target.value } : prev,
                  )
                }
              />
              <label>Utilaj Folosit</label>
              <input
                value={editingDraft.utilaj_folosit}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, utilaj_folosit: event.target.value } : prev,
                  )
                }
              />
              <label>Soft Folosit</label>
              <input
                value={editingDraft.soft_folosit}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, soft_folosit: event.target.value } : prev,
                  )
                }
              />
              <label>Programator</label>
              <input
                value={editingDraft.programator}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, programator: event.target.value } : prev,
                  )
                }
              />
              <label>Locatie Dosar</label>
              <input
                value={editingDraft.locatie_dosar}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, locatie_dosar: event.target.value } : prev,
                  )
                }
              />
              <label>Created By</label>
              <input
                value={editingDraft.created_by}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, created_by: event.target.value } : prev,
                  )
                }
              />
              <label>Updated By</label>
              <input
                value={editingDraft.updated_by}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, updated_by: event.target.value } : prev,
                  )
                }
              />
              <label>Recalc At (ISO)</label>
              <input
                value={editingDraft.recalc_at}
                onChange={(event) =>
                  setEditingDraft((prev) =>
                    prev ? { ...prev, recalc_at: event.target.value } : prev,
                  )
                }
              />
            </div>
            <button onClick={() => void saveSelectedRow()} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button className="danger-btn" onClick={() => void deleteSelectedRow()} disabled={isSaving}>
              Delete Row
            </button>
          </>
        ) : (
          <p>Select row to edit.</p>
        )}

        <div className="recalc-card">
          <h3>Recalc Status</h3>
          <p>{recalcStatus}</p>
        </div>
      </aside>
    </div>
  );
}

export default App;
