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

const PAGE_SIZE = 10;
const SCROLL_THRESHOLD_PX = 120;

function App() {
  const [rows, setRows] = useState<MainRow[]>([]);
  const [selectedRowId, setSelectedRowId] = useState<number | null>(null);
  const [editingNrFisa, setEditingNrFisa] = useState("");
  const [editingReper, setEditingReper] = useState("");
  const [editingClient, setEditingClient] = useState("");
  const [editingQty, setEditingQty] = useState<string>("");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearchQuery, setAppliedSearchQuery] = useState("");
  const [status, setStatus] = useState<string>("Loading rows...");
  const [recalcStatus, setRecalcStatus] = useState<string>("Loading...");
  const [isSaving, setIsSaving] = useState(false);
  const [composerDraft, setComposerDraft] = useState<{
    nr_fisa: string;
    reper: string;
    client: string;
    buc: string;
  }>({
    nr_fisa: "",
    reper: "",
    client: "",
    buc: "1",
  });
  const [nextPage, setNextPage] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreRows, setHasMoreRows] = useState(true);
  const tableWrapRef = useRef<HTMLElement | null>(null);
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
    if (target.scrollTop <= SCROLL_THRESHOLD_PX) {
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

  function selectRow(row: MainRow) {
    setSelectedRowId(row.id);
    setEditingNrFisa(row.nr_fisa);
    setEditingReper(row.reper);
    setEditingClient(row.client);
    setEditingQty(String(row.buc));
  }

  async function saveQty() {
    if (!selectedRow) {
      return;
    }

    const parsedQty = Number(editingQty);
    if (Number.isNaN(parsedQty)) {
      setStatus("Quantity must be numeric.");
      return;
    }
    if (!editingNrFisa.trim() || !editingReper.trim() || !editingClient.trim()) {
      setStatus("Nr Fisa, Reper, Client are required.");
      return;
    }

    setIsSaving(true);
    const result = await saveMainRowUpdate(selectedRow.id, {
      nr_fisa: editingNrFisa.trim(),
      reper: editingReper.trim(),
      client: editingClient.trim(),
      buc: parsedQty,
    });
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
              nr_fisa: editingNrFisa.trim(),
              reper: editingReper.trim(),
              client: editingClient.trim(),
              buc: parsedQty,
              ore_totale: parsedQty * row.timp_per_buc,
              updated_at: new Date().toISOString(),
            }
          : row,
      ),
    );
    setStatus(`Row ${selectedRow.id} saved via ${result.mode}.`);
    void loadRecalc();
  }

  function useRowAsTemplate(row: MainRow) {
    setComposerDraft({
      nr_fisa: row.nr_fisa,
      reper: row.reper,
      client: row.client,
      buc: String(row.buc),
    });
    composerFirstInputRef.current?.focus();
    setStatus(`Template loaded from row ${row.id}.`);
  }

  function clearComposer() {
    setComposerDraft({
      nr_fisa: "",
      reper: "",
      client: "",
      buc: "1",
    });
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
    const result = await createMainRow({
      nr_fisa: composerDraft.nr_fisa.trim(),
      reper: composerDraft.reper.trim(),
      client: composerDraft.client.trim(),
      buc: parsedQty,
    });
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
    setEditingNrFisa("");
    setEditingReper("");
    setEditingClient("");
    setEditingQty("");
    setStatus(`Row ${selectedRow.id} deleted via ${result.mode}.`);
  }

  return (
    <div className="app-shell">
      <aside className="left-nav">
        <h1>Pyramydal UI</h1>
        <nav>
          <button className="nav-item active">Main Rows</button>
          <button className="nav-item">Reference Lists</button>
          <button className="nav-item">Uploads</button>
          <button className="nav-item">Export</button>
        </nav>
      </aside>

      <main className="workspace">
        <header className="toolbar">
          <div>
            <strong>Main Rows</strong>
            <p>{status}</p>
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
                <th>Timp/Buc</th>
                <th>Ore Totale</th>
                <th>Updated At</th>
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
                  <td>{row.buc}</td>
                  <td>{row.timp_per_buc.toFixed(2)}</td>
                  <td>{row.ore_totale.toFixed(2)}</td>
                  <td>{new Date(row.updated_at).toLocaleString()}</td>
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

      <aside className="properties">
        <h2>Row Properties</h2>
        {selectedRow ? (
          <>
            <p>
              <strong>ID:</strong> {selectedRow.id}
            </p>
            <label htmlFor="nr_fisa">Nr Fisa (editable)</label>
            <input
              id="nr_fisa"
              value={editingNrFisa}
              onChange={(event) => setEditingNrFisa(event.target.value)}
            />
            <label htmlFor="reper">Reper (editable)</label>
            <input
              id="reper"
              value={editingReper}
              onChange={(event) => setEditingReper(event.target.value)}
            />
            <label htmlFor="client">Client (editable)</label>
            <input
              id="client"
              value={editingClient}
              onChange={(event) => setEditingClient(event.target.value)}
            />
            <label htmlFor="qty">Buc (editable)</label>
            <input
              id="qty"
              value={editingQty}
              onChange={(event) => setEditingQty(event.target.value)}
            />
            <button onClick={() => void saveQty()} disabled={isSaving}>
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
