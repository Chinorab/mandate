"use client";

/**
 * Agent orders for Sample Sports Outlet with AG Grid Enterprise: quick search, set filters,
 * grouping (drag a column or pick one), master detail with the mandate and the check, status bar
 * with totals, and CSV or Excel export of exactly what is shown.
 */
import { AllEnterpriseModule, LicenseManager, ModuleRegistry, type ColDef, type GridApi, type GridReadyEvent, type ValueFormatterParams } from "ag-grid-enterprise";
import { AgGridReact } from "ag-grid-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StateIcon } from "@/components/ui/icons";
import { CATEGORIES } from "@/lib/catalog/data";
import { merchantApi } from "@/lib/client/api";
import type { MerchantOrder } from "@/lib/merchant/orders";
import { formatUsd } from "@/lib/pricing";
import { CheckCell, MandateCell, MandateStateCell, MonoCell, StatusCell } from "./cells";
import { DetailRow } from "./DetailRow";
import { mandateGridTheme } from "./theme";
import s from "./grid.module.css";

ModuleRegistry.registerModules([AllEnterpriseModule]);
// AG Grid license keys are designed to ship in the browser bundle. Unset: the grid shows a watermark.
if (process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY) LicenseManager.setLicenseKey(process.env.NEXT_PUBLIC_AG_GRID_LICENSE_KEY);

const PLACED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });

type GroupBy = "none" | "status" | "mandateState" | "day";
type MandateFilter = "all" | "Active" | "Expired" | "Revoked";
const STATUSES = ["Paid", "Shipped", "Delivered", "In dispute", "Resolved", "Refunded"];

export function OrdersGrid() {
  const api = useRef<GridApi<MerchantOrder> | null>(null);
  const [rows, setRows] = useState<MerchantOrder[] | null>(null);
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [mandateFilter, setMandateFilter] = useState<MandateFilter>("all");
  const [status, setStatus] = useState("all");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");
  const [kpi, setKpi] = useState({ shown: 0, attached: 0, dispute: 0 });

  useEffect(() => {
    merchantApi
      .orders()
      .then((r) => setRows(r.orders))
      .catch(() => setError(true));
  }, []);

  const columnDefs = useMemo<ColDef<MerchantOrder>[]>(
    () => [
      { field: "code", headerName: "Order", cellRenderer: "agGroupCellRenderer", cellClass: "mono", minWidth: 120, maxWidth: 140, pinned: "left" },
      {
        field: "placedAt",
        headerName: "Placed",
        sort: "desc",
        minWidth: 140,
        valueFormatter: (p: ValueFormatterParams<MerchantOrder, string>) => (p.value ? PLACED.format(new Date(p.value)) : ""),
        filter: "agDateColumnFilter",
        filterValueGetter: (p) => (p.data ? new Date(p.data.placedAt) : null),
      },
      {
        colId: "day",
        headerName: "Day",
        hide: true,
        enableRowGroup: true,
        valueGetter: (p) => (p.data ? DAY.format(new Date(p.data.placedAt)) : null),
      },
      { field: "item", headerName: "Item", flex: 2, minWidth: 220, tooltipField: "item" },
      {
        field: "category",
        headerName: "Category",
        hide: true,
        enableRowGroup: true,
        filter: "agSetColumnFilter",
        valueFormatter: (p) => CATEGORIES[p.value as keyof typeof CATEGORIES] ?? p.value,
      },
      { field: "buyer", headerName: "Buyer", cellClass: "mono", minWidth: 110 },
      {
        field: "amountCents",
        headerName: "Amount",
        type: "rightAligned",
        aggFunc: "sum",
        minWidth: 110,
        valueFormatter: (p) => (typeof p.value === "number" ? formatUsd(p.value) : ""),
        filter: "agNumberColumnFilter",
      },
      { field: "mandateCode", headerName: "Mandate", cellRenderer: MandateCell, minWidth: 150, filter: "agTextColumnFilter" },
      { field: "mandateState", headerName: "Mandate state", cellRenderer: MandateStateCell, filter: "agSetColumnFilter", enableRowGroup: true, minWidth: 160 },
      { colId: "check", headerName: "Check", cellRenderer: CheckCell, valueGetter: (p) => (p.data ? `${p.data.check.passed} of ${p.data.check.total}` : null), minWidth: 120 },
      { field: "status", headerName: "Status", cellRenderer: StatusCell, filter: "agSetColumnFilter", enableRowGroup: true, minWidth: 140 },
      { field: "paypalOrderId", headerName: "PayPal ID", cellRenderer: MonoCell, minWidth: 150 },
    ],
    [],
  );

  const refreshKpi = useCallback(() => {
    const g = api.current;
    if (!g) return;
    let shown = 0;
    let attached = 0;
    let dispute = 0;
    g.forEachNodeAfterFilter((n) => {
      if (!n.data) return;
      shown++;
      if (n.data.mandateCode) attached++;
      if (n.data.status === "In dispute") dispute++;
    });
    setKpi({ shown, attached, dispute });
  }, []);

  // External filter: mandate state segmented control.
  const isExternalFilterPresent = useCallback(() => mandateFilter !== "all", [mandateFilter]);
  const doesExternalFilterPass = useCallback((node: { data?: MerchantOrder }) => !node.data || node.data.mandateState === mandateFilter, [mandateFilter]);

  useEffect(() => {
    const g = api.current;
    if (!g) return;
    g.onFilterChanged();
  }, [mandateFilter]);

  useEffect(() => {
    const g = api.current;
    if (!g) return;
    void g.setColumnFilterModel("status", status === "all" ? null : { filterType: "set", values: [status] }).then(() => g.onFilterChanged());
  }, [status]);

  useEffect(() => {
    const g = api.current;
    if (!g) return;
    const groupCol = groupBy === "none" ? null : groupBy;
    g.applyColumnState({
      state: ["status", "mandateState", "day"].map((colId) => ({ colId, rowGroup: colId === groupCol, rowGroupIndex: colId === groupCol ? 0 : null })),
      defaultState: { rowGroup: false },
    });
  }, [groupBy]);

  const onUpdated = useCallback((o: MerchantOrder) => {
    setRows((prev) => (prev ?? []).map((x) => (x.code === o.code ? o : x)));
  }, []);

  const clear = () => {
    setQ("");
    setMandateFilter("all");
    setStatus("all");
    setGroupBy("none");
    api.current?.setFilterModel(null);
  };

  // Read the date at click time (a render time Date would be frozen into the prerendered page).
  const fileName = () => `agent-orders-${new Date().toISOString().slice(0, 10)}`;

  return (
    <main id="main" className={s.main}>
      <div className={s.head}>
        <div>
          <h1>Agent orders</h1>
          <p>Orders placed by shopping agents under a signed mandate, paid through PayPal in the sandbox. Fictional store.</p>
        </div>
        <dl className={s.kpis} aria-live="polite">
          <div>
            <dt>Orders shown</dt>
            <dd>{kpi.shown}</dd>
          </div>
          <div>
            <dt>Mandate attached</dt>
            <dd>{kpi.attached}</dd>
          </div>
          <div>
            <dt>In dispute</dt>
            <dd>{kpi.dispute}</dd>
          </div>
        </dl>
      </div>

      <form role="search" aria-label="Filter orders" className={s.toolbar} onSubmit={(e) => e.preventDefault()}>
        <div className={`${s.field} ${s.grow}`}>
          <label htmlFor="q">Search</label>
          <input id="q" type="search" className={s.input} autoComplete="off" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <fieldset className={s.fieldset}>
          <legend className={s.legend}>Mandate</legend>
          <div className={s.segmented}>
            {(["all", "Active", "Expired", "Revoked"] as MandateFilter[]).map((m) => (
              <button key={m} type="button" aria-pressed={mandateFilter === m} onClick={() => setMandateFilter(m)}>
                {m === "all" ? "All" : m}
              </button>
            ))}
          </div>
        </fieldset>
        <div className={s.field}>
          <label htmlFor="status">Status</label>
          <select id="status" className={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className={s.field}>
          <label htmlFor="group">Group by</label>
          <select id="group" className={s.select} value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
            <option value="none">No grouping</option>
            <option value="status">Status</option>
            <option value="mandateState">Mandate state</option>
            <option value="day">Day</option>
          </select>
        </div>
        <div className={s.exports}>
          <Button type="button" variant="secondary" size="sm" onClick={() => api.current?.exportDataAsCsv({ fileName: `${fileName()}.csv`, onlySelected: false })}>
            <StateIcon name="download" size={16} />
            Export CSV
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => api.current?.exportDataAsExcel({ fileName: `${fileName()}.xlsx`, sheetName: "Agent orders" })}>
            <StateIcon name="download" size={16} />
            Export Excel
          </Button>
        </div>
      </form>

      {error ? (
        <p role="alert">Orders could not be loaded. Reload the page.</p>
      ) : (
        <div className={s.gridBox}>
          <AgGridReact<MerchantOrder>
            theme={mandateGridTheme}
            rowData={rows}
            loading={rows === null}
            columnDefs={columnDefs}
            defaultColDef={{ sortable: true, resizable: true, filter: true, flex: 1, minWidth: 110 }}
            getRowId={(p) => p.data.code}
            quickFilterText={q}
            isExternalFilterPresent={isExternalFilterPresent}
            doesExternalFilterPass={doesExternalFilterPass}
            masterDetail
            detailCellRenderer={DetailRow}
            detailRowAutoHeight
            context={{ onUpdated }}
            rowGroupPanelShow="always"
            groupDisplayType="singleColumn"
            autoGroupColumnDef={{ headerName: "Group", minWidth: 220 }}
            isGroupOpenByDefault={(p) => p.rowNode.group === true && p.level === 0}
            sideBar={{ toolPanels: ["columns", "filters"], defaultToolPanel: undefined }}
            statusBar={{
              statusPanels: [
                { statusPanel: "agTotalAndFilteredRowCountComponent", align: "left" },
                { statusPanel: "agAggregationComponent", align: "right" },
              ],
            }}
            cellSelection
            // Few columns and rows: render every cell so narrow screens and screen readers get the whole row.
            suppressColumnVirtualisation
            domLayout="autoHeight"
            tooltipShowDelay={300}
            overlayNoRowsTemplate='<span style="padding: 24px">No agent orders yet. Orders appear here when a shopping agent pays inside a mandate.</span>'
            onGridReady={(e: GridReadyEvent<MerchantOrder>) => {
              api.current = e.api;
              refreshKpi();
            }}
            onModelUpdated={refreshKpi}
            onFilterChanged={refreshKpi}
          />
        </div>
      )}
      <div className={s.foot}>
        <span className="num">
          Showing {kpi.shown} of {rows?.length ?? 0} orders
        </span>
        <button type="button" onClick={clear} style={{ background: "none", border: 0, padding: 0, color: "inherit", textDecoration: "underline", minHeight: 44 }}>
          Clear Filters
        </button>
      </div>
    </main>
  );
}
