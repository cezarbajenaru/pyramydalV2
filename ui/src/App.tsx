import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from "react";
import "./App.css";
import {
  createMainRow,
  deleteMainRow,
  fetchMainRowById,
  fetchMainRows,
  fetchRecalcStatus,
  saveMainRowUpdate,
  searchMainRows,
  type MainRow,
} from "./api/mainRows";
import { runtimeConfig } from "./config";

const PAGE_SIZE = 50;
const SCROLL_THRESHOLD_PX = 900;
const SCROLL_THRESHOLD_VIEWPORT_MULTIPLIER = 2.75;
const COLUMN_LABELS_STORAGE_KEY = "pyramydal.mainRows.columnLabels.v1";
const MAX_COLUMN_LABEL_LENGTH = 64;
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
type ColumnKey = keyof MainRow | "id" | "actions";
type SearchField = "all" | "id" | keyof MainRow;
type SearchMode = "contains" | "has_value" | "is_empty";
type FilterField = Exclude<SearchField, "all">;
type FilterRule = {
  id: string;
  field: FilterField;
  mode: SearchMode;
  query: string;
};

const COLUMN_ORDER: ColumnKey[] = [
  "id",
  "nr_fisa",
  "reper",
  "client",
  "buc",
  "data_intrare",
  "data_livrare",
  "comanda",
  "tratament",
  "observatii",
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
  "timp_per_buc",
  "ore_totale",
  "valoare_per_buc",
  "valoare_totala",
  "utilaj_folosit",
  "soft_folosit",
  "programator",
  "locatie_dosar",
  "status",
  "control_status",
  "magazie_status",
  "created_at",
  "created_by",
  "updated_at",
  "updated_by",
  "recalc_at",
  "actions",
];

const DEFAULT_COLUMN_LABELS: Record<ColumnKey, string> = {
  id: "ID",
  nr_fisa: "Nr Fisa",
  reper: "Reper",
  client: "Client",
  buc: "Buc",
  data_intrare: "Data Intrare",
  data_livrare: "Data Livrare",
  comanda: "Comanda",
  tratament: "Tratament",
  observatii: "Observatii",
  strung_colchester: "Strung Colchester",
  strung_cnc: "Strung CNC",
  freze_mici: "Freze Mici",
  freze_mari: "Freze Mari",
  gaurire: "Gaurire",
  rectificare: "Rectificare",
  bwk: "BWK",
  sip: "SIP",
  norte: "Norte",
  tos: "TOS",
  bridgeport: "Bridgeport",
  eco: "Eco",
  schaublin: "Schaublin",
  hurco: "Hurco",
  matec: "Matec",
  parpas: "Parpas",
  ajustare: "Ajustare",
  filetare: "Filetare",
  marcare: "Marcare",
  curatare_filete: "Curatare Filete",
  timp_per_buc: "Timp/Buc",
  ore_totale: "Ore Totale",
  valoare_per_buc: "Valoare/Buc",
  valoare_totala: "Valoare Totala",
  utilaj_folosit: "Utilaj Folosit",
  soft_folosit: "Soft Folosit",
  programator: "Programator",
  locatie_dosar: "Locatie Dosar",
  status: "Status",
  control_status: "Control Status",
  magazie_status: "Magazie Status",
  created_at: "Created At",
  created_by: "Created By",
  updated_at: "Updated At",
  updated_by: "Updated By",
  recalc_at: "Recalc At",
  actions: "Actions",
};

const SEARCHABLE_FIELDS: SearchField[] = [
  "all",
  "id",
  "nr_fisa",
  "reper",
  "client",
  "buc",
  "data_intrare",
  "data_livrare",
  "comanda",
  "tratament",
  "observatii",
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
  "timp_per_buc",
  "ore_totale",
  "valoare_per_buc",
  "valoare_totala",
  "utilaj_folosit",
  "soft_folosit",
  "status",
  "control_status",
  "magazie_status",
  "programator",
  "locatie_dosar",
  "created_by",
  "updated_by",
  "recalc_at",
];

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

function hasMeaningfulValue(value: unknown): boolean {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === "string") {
    return value.trim().length > 0;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  return true;
}

function shouldLoadNextPageForPosition(scrollTop: number, clientHeight: number): boolean {
  const adaptiveThreshold = Math.max(
    SCROLL_THRESHOLD_PX,
    clientHeight * SCROLL_THRESHOLD_VIEWPORT_MULTIPLIER,
  );
  return scrollTop <= adaptiveThreshold;
}

function rowMatchesRule(row: MainRow, rule: FilterRule): boolean {
  const cellValue: unknown = rule.field === "id" ? row.id : row[rule.field];
  if (rule.mode === "has_value") {
    return hasMeaningfulValue(cellValue);
  }
  if (rule.mode === "is_empty") {
    return !hasMeaningfulValue(cellValue);
  }
  return String(cellValue ?? "").toLowerCase().includes(rule.query.trim().toLowerCase());
}

function isFilterField(columnKey: ColumnKey): columnKey is FilterField {
  return columnKey !== "actions" && SEARCHABLE_FIELDS.includes(columnKey as SearchField);
}

function App() {
  const [rows, setRows] = useState<MainRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("all");
  const [searchMode, setSearchMode] = useState<SearchMode>("contains");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [appliedSearchField, setAppliedSearchField] = useState<SearchField>("all");
  const [appliedSearchMode, setAppliedSearchMode] = useState<SearchMode>("contains");
  const [filterRules, setFilterRules] = useState<FilterRule[]>([]);
  const [appliedFilterRules, setAppliedFilterRules] = useState<FilterRule[]>([]);
  const [isLeftNavCollapsed, setIsLeftNavCollapsed] = useState(false);
  const [status, setStatus] = useState<string>("Loading rows...");
  const [recalcStatus, setRecalcStatus] = useState<string>("Loading...");
  const [isSaving, setIsSaving] = useState(false);
  const [activeCell, setActiveCell] = useState<{ rowId: number; field: keyof MainRow } | null>(null);
  const [activeCellValue, setActiveCellValue] = useState("");
  const [composerDraft, setComposerDraft] = useState<ComposerDraft>(EMPTY_COMPOSER_DRAFT);
  const [nextPage, setNextPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(true);
  const [activeHeaderColumn, setActiveHeaderColumn] = useState<ColumnKey | null>(null);
  const [activeHeaderValue, setActiveHeaderValue] = useState("");
  const [activeHeaderFilterField, setActiveHeaderFilterField] = useState<FilterField | null>(null);
  const [activeHeaderFilterMode, setActiveHeaderFilterMode] = useState<SearchMode>("contains");
  const [activeHeaderFilterQuery, setActiveHeaderFilterQuery] = useState("");
  const [columnLabels, setColumnLabels] = useState<Record<ColumnKey, string>>(() => {
    const defaults = { ...DEFAULT_COLUMN_LABELS };
    if (typeof window === "undefined") {
      return defaults;
    }
    try {
      const raw = window.localStorage.getItem(COLUMN_LABELS_STORAGE_KEY);
      if (!raw) {
        return defaults;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return defaults;
      }
      for (const key of COLUMN_ORDER) {
        const candidate = (parsed as Record<string, unknown>)[key];
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          defaults[key] = candidate;
        }
      }
    } catch {
      return defaults;
    }
    return defaults;
  });
  const tableWrapRef = useRef<HTMLElement | null>(null);
  const shouldStickBottomRef = useRef(true);
  const loadingPageRef = useRef<number | null>(null);
  const loadedPagesRef = useRef<Set<number>>(new Set());
  const prependScrollAdjustRef = useRef<{
    previousScrollHeight: number;
    previousScrollTop: number;
  } | null>(null);
  const composerFirstInputRef = useRef<HTMLInputElement | null>(null);
  const headerInputRef = useRef<HTMLInputElement | null>(null);
  const filterIdRef = useRef(1);

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
    let baseRows = displayRows;
    if (!q && appliedSearchMode === "contains") {
      baseRows = displayRows;
    } else if (appliedSearchField !== "all") {
      baseRows = displayRows.filter((row) => {
        const cellValue: unknown =
          appliedSearchField === "id" ? row.id : row[appliedSearchField];
        if (appliedSearchMode === "has_value") {
          return hasMeaningfulValue(cellValue);
        }
        if (appliedSearchMode === "is_empty") {
          return !hasMeaningfulValue(cellValue);
        }
        return String(cellValue ?? "").toLowerCase().includes(q);
      });
    } else if (appliedSearchMode === "has_value" || appliedSearchMode === "is_empty") {
      baseRows = displayRows.filter((row) => {
        const values: unknown[] = [
          row.nr_fisa,
          row.reper,
          row.client,
          row.buc,
          row.data_intrare,
          row.data_livrare,
          row.comanda,
          row.tratament,
          row.observatii,
          row.strung_colchester,
          row.strung_cnc,
          row.freze_mici,
          row.freze_mari,
          row.gaurire,
          row.rectificare,
          row.bwk,
          row.sip,
          row.norte,
          row.tos,
          row.bridgeport,
          row.eco,
          row.schaublin,
          row.hurco,
          row.matec,
          row.parpas,
          row.ajustare,
          row.filetare,
          row.marcare,
          row.curatare_filete,
          row.timp_per_buc,
          row.ore_totale,
          row.valoare_per_buc,
          row.valoare_totala,
          row.utilaj_folosit,
          row.soft_folosit,
          row.programator,
          row.locatie_dosar,
          row.status,
          row.control_status,
          row.magazie_status,
          row.created_by,
          row.updated_by,
          row.recalc_at,
        ];
        const hasAny = values.some((value) => hasMeaningfulValue(value));
        return appliedSearchMode === "has_value" ? hasAny : !hasAny;
      });
    } else {
      baseRows = displayRows.filter((row) => {
        const nrFisa = String(row.nr_fisa ?? "").toLowerCase();
        const reper = String(row.reper ?? "").toLowerCase();
        const client = String(row.client ?? "").toLowerCase();
        return (
          String(row.id).includes(q) ||
          nrFisa.includes(q) ||
          reper.includes(q) ||
          client.includes(q)
        );
      });
    }
    if (appliedFilterRules.length === 0) {
      return baseRows;
    }
    return baseRows.filter((row) => appliedFilterRules.every((rule) => rowMatchesRule(row, rule)));
  }, [displayRows, appliedSearchQuery, appliedSearchField, appliedSearchMode, appliedFilterRules]);
  const isSearchActive =
    appliedSearchMode === "contains"
      ? appliedSearchQuery.trim().length > 0 || appliedFilterRules.length > 0
      : true;
  const numericEditableFields = useMemo(
    () =>
      new Set<keyof MainRow>([
        "buc",
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
        "timp_per_buc",
        "ore_totale",
        "valoare_per_buc",
        "valoare_totala",
      ]),
    [],
  );
  const editableCellFields = useMemo(
    () =>
      new Set<keyof MainRow>([
        "nr_fisa",
        "reper",
        "client",
        "buc",
        "data_intrare",
        "data_livrare",
        "comanda",
        "tratament",
        "observatii",
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
        "timp_per_buc",
        "ore_totale",
        "valoare_per_buc",
        "valoare_totala",
        "utilaj_folosit",
        "soft_folosit",
        "programator",
        "locatie_dosar",
        "status",
        "control_status",
        "magazie_status",
        "created_by",
        "updated_by",
        "recalc_at",
      ]),
    [],
  );

  function openHeaderFilter(field: FilterField) {
    const existing = filterRules.find((rule) => rule.field === field);
    setActiveHeaderFilterField(field);
    setActiveHeaderFilterMode(existing?.mode ?? "contains");
    setActiveHeaderFilterQuery(existing?.query ?? "");
  }

  function closeHeaderFilter() {
    setActiveHeaderFilterField(null);
    setActiveHeaderFilterMode("contains");
    setActiveHeaderFilterQuery("");
  }

  function applyHeaderFilter() {
    if (!activeHeaderFilterField) {
      return;
    }
    const normalizedQuery = activeHeaderFilterQuery.trim();
    if (activeHeaderFilterMode === "contains" && !normalizedQuery) {
      setStatus(`Filter value required for ${DEFAULT_COLUMN_LABELS[activeHeaderFilterField]}.`);
      return;
    }
    const nextRule: FilterRule = {
      id: `filter-${filterIdRef.current++}`,
      field: activeHeaderFilterField,
      mode: activeHeaderFilterMode,
      query: normalizedQuery,
    };
    setFilterRules((prev) => {
      const withoutField = prev.filter((rule) => rule.field !== activeHeaderFilterField);
      return [...withoutField, nextRule];
    });
    setAppliedFilterRules((prev) => {
      const withoutField = prev.filter((rule) => rule.field !== activeHeaderFilterField);
      return [...withoutField, nextRule];
    });
    setStatus(`Filter applied on ${DEFAULT_COLUMN_LABELS[activeHeaderFilterField]}.`);
    closeHeaderFilter();
  }

  function clearHeaderFilter(field: FilterField) {
    setFilterRules((prev) => prev.filter((rule) => rule.field !== field));
    setAppliedFilterRules((prev) => prev.filter((rule) => rule.field !== field));
    if (activeHeaderFilterField === field) {
      closeHeaderFilter();
    }
    setStatus(`Filter cleared on ${DEFAULT_COLUMN_LABELS[field]}.`);
  }

  async function applySearch() {
    const trimmed = searchInput.trim();
    if (searchMode !== "contains" && searchField === "all") {
      setStatus("Select a column when using Has value or Is empty.");
      return;
    }
    if (!trimmed && searchMode === "contains") {
      setAppliedSearchQuery("");
      setAppliedSearchField("all");
      setAppliedSearchMode("contains");
      setAppliedFilterRules(
        filterRules.map((rule) => ({
          ...rule,
          query: rule.query.trim(),
        })),
      );
      setStatus(filterRules.length === 0 ? "Search cleared." : "Search cleared. Column filters still active.");
      return;
    }
    const normalizedRules = filterRules.map((rule) => ({
      ...rule,
      query: rule.query.trim(),
    }));
    const invalidRule = normalizedRules.find(
      (rule) => rule.mode === "contains" && rule.query.length === 0,
    );
    if (invalidRule) {
      const label = DEFAULT_COLUMN_LABELS[invalidRule.field];
      setStatus(`Filter value required for ${label}.`);
      return;
    }
    setAppliedFilterRules(normalizedRules);
    if (searchField !== "all" || searchMode !== "contains") {
      setAppliedSearchField(searchField);
      setAppliedSearchMode(searchMode);
      setAppliedSearchQuery(trimmed);
      const fieldLabel =
        searchField === "all" ? "All columns" : DEFAULT_COLUMN_LABELS[searchField];
      if (searchMode === "contains") {
        setStatus(
          `Filtering by ${fieldLabel} for "${trimmed}" with ${normalizedRules.length} extra filter(s).`,
        );
      } else if (searchMode === "has_value") {
        setStatus(
          `Filtering rows where ${fieldLabel} has a value with ${normalizedRules.length} extra filter(s).`,
        );
      } else {
        setStatus(
          `Filtering rows where ${fieldLabel} is empty with ${normalizedRules.length} extra filter(s).`,
        );
      }
      return;
    }
    setAppliedSearchField("all");
    setAppliedSearchMode("contains");
    const searchResult = await searchMainRows(trimmed, 150);
    if (searchResult.ok && searchResult.rows.length > 0) {
      setRows((prev) => {
        const byId = new Map<number, MainRow>();
        for (const row of [...prev, ...searchResult.rows]) {
          byId.set(row.id, row);
        }
        return [...byId.values()];
      });
      setAppliedSearchQuery(trimmed);
      setStatus(
        `Found ${searchResult.rows.length} rows for "${trimmed}" with ${normalizedRules.length} extra filter(s).`,
      );
      return;
    }
    setAppliedSearchQuery(trimmed);
    if (/^\d+$/.test(trimmed)) {
      const rowId = Number(trimmed);
      const result = await fetchMainRowById(rowId);
      if (!result.ok || !result.row) {
        setStatus(`No rows found for "${trimmed}".`);
        return;
      }
      const foundRow = result.row;
      setRows((prev) => {
        const byId = new Map<number, MainRow>();
        for (const row of [...prev, foundRow]) {
          byId.set(row.id, row);
        }
        return [...byId.values()];
      });
      setSelectedRowId(rowId);
      setAppliedSearchQuery(trimmed);
      setStatus(`Jumped to row ID ${rowId}.`);
      setTimeout(() => {
        const rowEl = document.getElementById(`row-${rowId}`);
        rowEl?.scrollIntoView({ block: "center", inline: "nearest" });
      }, 0);
      return;
    }
    setStatus(`No rows found for "${trimmed}".`);
  }

  function beginCellEdit(row: MainRow, field: keyof MainRow) {
    if (!editableCellFields.has(field)) {
      return;
    }
    setActiveCell({ rowId: row.id, field });
    setActiveCellValue(row[field] === null || row[field] === undefined ? "" : String(row[field]));
  }

  async function commitCellEdit() {
    if (!activeCell) {
      return;
    }
    const { rowId, field } = activeCell;
    let nextValue: unknown = activeCellValue;
    try {
      if (numericEditableFields.has(field)) {
        nextValue = parseOptionalNumber(activeCellValue);
        if (field === "buc" && (nextValue === null || Number.isNaN(nextValue))) {
          setStatus("Buc must be numeric.");
          return;
        }
      } else if (field === "data_intrare" || field === "data_livrare") {
        nextValue = activeCellValue ? activeCellValue : null;
      } else {
        nextValue = activeCellValue === "" ? null : activeCellValue;
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Invalid cell value.");
      return;
    }

    setIsSaving(true);
    const result = await saveMainRowUpdate(rowId, { [field]: nextValue } as Partial<MainRow>);
    setIsSaving(false);
    if (!result.ok) {
      setStatus(`Save failed: ${result.message}`);
      return;
    }
    setRows((prev) =>
      prev.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]: nextValue as never,
              updated_at: new Date().toISOString(),
            }
          : row,
      ),
    );
    setActiveCell(null);
    setActiveCellValue("");
    setStatus(`Cell ${String(field)} saved.`);
  }

  function cancelCellEdit() {
    setActiveCell(null);
    setActiveCellValue("");
  }

  function onCellEditorKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitCellEdit();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelCellEdit();
    }
  }

  function renderGridCell(row: MainRow, field: keyof MainRow) {
    const isEditing = activeCell?.rowId === row.id && activeCell.field === field;
    if (isEditing) {
      const inputType = field === "data_intrare" || field === "data_livrare" ? "date" : "text";
      return (
        <input
          autoFocus
          type={inputType}
          className="cell-inline-editor"
          value={activeCellValue}
          onChange={(event) => setActiveCellValue(event.target.value)}
          onBlur={() => void commitCellEdit()}
          onKeyDown={onCellEditorKeyDown}
          onClick={(event) => event.stopPropagation()}
        />
      );
    }
    return (
      <span
        className={editableCellFields.has(field) ? "editable-cell" : ""}
      >
        {formatCell(row[field])}
      </span>
    );
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
    if (shouldLoadNextPageForPosition(target.scrollTop, target.clientHeight)) {
      void loadPage(nextPage);
    }
  }

  function refreshRows() {
    setHasMoreRows(true);
    setNextPage(1);
    shouldStickBottomRef.current = true;
    void loadPage(1, true);
  }

  function beginHeaderEdit(columnKey: ColumnKey) {
    setActiveHeaderColumn(columnKey);
    setActiveHeaderValue(columnLabels[columnKey] ?? DEFAULT_COLUMN_LABELS[columnKey]);
  }

  function cancelHeaderEdit() {
    setActiveHeaderColumn(null);
    setActiveHeaderValue("");
  }

  function commitHeaderEdit(keepEditingOnError = false) {
    if (!activeHeaderColumn) {
      return;
    }

    const trimmed = activeHeaderValue.trim();
    if (!trimmed) {
      setStatus("Column name cannot be empty.");
      if (keepEditingOnError) {
        setTimeout(() => headerInputRef.current?.focus(), 0);
      }
      return;
    }
    if (trimmed.length > MAX_COLUMN_LABEL_LENGTH) {
      setStatus(`Column name too long (max ${MAX_COLUMN_LABEL_LENGTH} chars).`);
      if (keepEditingOnError) {
        setTimeout(() => headerInputRef.current?.focus(), 0);
      }
      return;
    }

    setColumnLabels((prev) => ({
      ...prev,
      [activeHeaderColumn]: trimmed,
    }));
    setStatus(`Column renamed to "${trimmed}".`);
    cancelHeaderEdit();
  }

  function onHeaderEditorKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commitHeaderEdit(true);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelHeaderEdit();
    }
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
    const el = tableWrapRef.current;
    if (!el || isSearchActive || !hasMoreRows || isLoadingMore) {
      return;
    }
    if (shouldLoadNextPageForPosition(el.scrollTop, el.clientHeight)) {
      void loadPage(nextPage);
    }
  }, [nextPage, hasMoreRows, isLoadingMore, isSearchActive, rows]);

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
    try {
      window.localStorage.setItem(COLUMN_LABELS_STORAGE_KEY, JSON.stringify(columnLabels));
    } catch {
      // Ignore localStorage failures (private mode/quota).
    }
  }, [columnLabels]);

  useEffect(() => {
    if (!activeHeaderColumn) {
      return;
    }
    headerInputRef.current?.focus();
    headerInputRef.current?.select();
  }, [activeHeaderColumn]);

  function selectRow(row: MainRow) {
    setSelectedRowId(row.id);
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
    setStatus(`Row ${selectedRow.id} deleted via ${result.mode}.`);
  }

  return (
    <div
      className="app-shell"
      style={{
        gridTemplateColumns: `${isLeftNavCollapsed ? 52 : 220}px minmax(0, 1fr)`,
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
            <div className="search-field">
              <select
                className="search-column-select"
                value={searchField}
                onChange={(event) => setSearchField(event.target.value as SearchField)}
                aria-label="Search column"
                title="Select search column"
              >
                {SEARCHABLE_FIELDS.map((field) => (
                  <option key={field} value={field}>
                    {field === "all" ? "All columns" : DEFAULT_COLUMN_LABELS[field]}
                  </option>
                ))}
              </select>
              <select
                className="search-mode-select"
                value={searchMode}
                onChange={(event) => setSearchMode(event.target.value as SearchMode)}
                aria-label="Search mode"
                title="Select search mode"
              >
                <option value="contains">Contains</option>
                <option value="has_value">Has value</option>
                <option value="is_empty">Is empty</option>
              </select>
              <div className="search-input-wrap">
                <input
                  className="search-input"
                  type="text"
                  placeholder={searchMode === "contains" ? "Search value" : "Value ignored for this mode"}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  disabled={searchMode !== "contains"}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void applySearch();
                    }
                  }}
                />
                {searchInput.length > 0 && (
                  <button
                    type="button"
                    className="search-clear-btn"
                    aria-label="Clear search input"
                    onClick={() => setSearchInput("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <button onClick={() => void applySearch()}>Search</button>
            <button onClick={refreshRows}>Refresh</button>
            <button onClick={() => void loadRecalc()}>Recalc Status</button>
            <button onClick={() => void deleteSelectedRow()} disabled={isSaving || !selectedRow}>
              Delete Selected
            </button>
            <span className="mode-pill">{runtimeConfig.mode}</span>
          </div>
        </header>

        <section ref={tableWrapRef} className="table-wrap" onScroll={onTableScroll}>
          <table>
            <thead>
              <tr>
                {COLUMN_ORDER.map((columnKey) => (
                  <th
                    key={columnKey}
                    onDoubleClick={() => beginHeaderEdit(columnKey)}
                    title="Double-click to edit column label"
                  >
                    {activeHeaderColumn === columnKey ? (
                      <div className="header-editor">
                        <input
                          ref={headerInputRef}
                          className="header-editor-input"
                          value={activeHeaderValue}
                          onChange={(event) => setActiveHeaderValue(event.target.value)}
                          onKeyDown={onHeaderEditorKeyDown}
                          onBlur={() => commitHeaderEdit(true)}
                        />
                        <button
                          type="button"
                          className="header-editor-btn"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => commitHeaderEdit(true)}
                          title="Save"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="header-editor-btn"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={cancelHeaderEdit}
                          title="Cancel"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="header-title-wrap">
                        <span className="editable-header-label">
                          {columnLabels[columnKey] ?? DEFAULT_COLUMN_LABELS[columnKey]}
                        </span>
                        {isFilterField(columnKey) && (
                          <button
                            type="button"
                            className={`header-filter-btn ${appliedFilterRules.some((rule) => rule.field === columnKey) ? "active" : ""}`}
                            title="Column filter"
                            aria-label={`Filter ${DEFAULT_COLUMN_LABELS[columnKey]}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              openHeaderFilter(columnKey);
                            }}
                          >
                            ▾
                          </button>
                        )}
                      </div>
                    )}
                    {isFilterField(columnKey) && activeHeaderFilterField === columnKey && (
                      <div
                        className="header-filter-popover"
                        onClick={(event) => event.stopPropagation()}
                        onDoubleClick={(event) => event.stopPropagation()}
                      >
                        <select
                          className="header-filter-select"
                          value={activeHeaderFilterMode}
                          onChange={(event) => setActiveHeaderFilterMode(event.target.value as SearchMode)}
                        >
                          <option value="contains">Contains</option>
                          <option value="has_value">Has value</option>
                          <option value="is_empty">Is empty</option>
                        </select>
                        <input
                          className="header-filter-input"
                          type="text"
                          placeholder={activeHeaderFilterMode === "contains" ? "Filter value" : "Value ignored"}
                          value={activeHeaderFilterQuery}
                          disabled={activeHeaderFilterMode !== "contains"}
                          onChange={(event) => setActiveHeaderFilterQuery(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              applyHeaderFilter();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              closeHeaderFilter();
                            }
                          }}
                        />
                        <div className="header-filter-actions">
                          <button type="button" className="header-editor-btn" onClick={applyHeaderFilter}>
                            Apply
                          </button>
                          <button
                            type="button"
                            className="header-editor-btn"
                            onClick={() => clearHeaderFilter(columnKey)}
                          >
                            Clear
                          </button>
                          <button type="button" className="header-editor-btn" onClick={closeHeaderFilter}>
                            Close
                          </button>
                        </div>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  id={`row-${row.id}`}
                  onClick={() => selectRow(row)}
                  className={selectedRowId === row.id ? "selected-row" : ""}
                >
                  <td>{row.id}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "nr_fisa")}>{renderGridCell(row, "nr_fisa")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "reper")}>{renderGridCell(row, "reper")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "client")}>{renderGridCell(row, "client")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "buc")}>{renderGridCell(row, "buc")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "data_intrare")}>{renderGridCell(row, "data_intrare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "data_livrare")}>{renderGridCell(row, "data_livrare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "comanda")}>{renderGridCell(row, "comanda")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "tratament")}>{renderGridCell(row, "tratament")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "observatii")}>{renderGridCell(row, "observatii")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "strung_colchester")}>{renderGridCell(row, "strung_colchester")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "strung_cnc")}>{renderGridCell(row, "strung_cnc")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "freze_mici")}>{renderGridCell(row, "freze_mici")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "freze_mari")}>{renderGridCell(row, "freze_mari")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "gaurire")}>{renderGridCell(row, "gaurire")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "rectificare")}>{renderGridCell(row, "rectificare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "bwk")}>{renderGridCell(row, "bwk")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "sip")}>{renderGridCell(row, "sip")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "norte")}>{renderGridCell(row, "norte")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "tos")}>{renderGridCell(row, "tos")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "bridgeport")}>{renderGridCell(row, "bridgeport")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "eco")}>{renderGridCell(row, "eco")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "schaublin")}>{renderGridCell(row, "schaublin")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "hurco")}>{renderGridCell(row, "hurco")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "matec")}>{renderGridCell(row, "matec")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "parpas")}>{renderGridCell(row, "parpas")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "ajustare")}>{renderGridCell(row, "ajustare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "filetare")}>{renderGridCell(row, "filetare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "marcare")}>{renderGridCell(row, "marcare")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "curatare_filete")}>{renderGridCell(row, "curatare_filete")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "timp_per_buc")}>{renderGridCell(row, "timp_per_buc")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "ore_totale")}>{renderGridCell(row, "ore_totale")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "valoare_per_buc")}>{renderGridCell(row, "valoare_per_buc")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "valoare_totala")}>{renderGridCell(row, "valoare_totala")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "utilaj_folosit")}>{renderGridCell(row, "utilaj_folosit")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "soft_folosit")}>{renderGridCell(row, "soft_folosit")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "programator")}>{renderGridCell(row, "programator")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "locatie_dosar")}>{renderGridCell(row, "locatie_dosar")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "status")}>{renderGridCell(row, "status")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "control_status")}>{renderGridCell(row, "control_status")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "magazie_status")}>{renderGridCell(row, "magazie_status")}</td>
                  <td>{formatCell(row.created_at)}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "created_by")}>{renderGridCell(row, "created_by")}</td>
                  <td>{formatCell(row.updated_at)}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "updated_by")}>{renderGridCell(row, "updated_by")}</td>
                  <td onDoubleClick={() => beginCellEdit(row, "recalc_at")}>{renderGridCell(row, "recalc_at")}</td>
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
        <div className="recalc-card">
          <h3>Recalc Status</h3>
          <p>{recalcStatus}</p>
        </div>
      </main>
    </div>
  );
}

export default App;
