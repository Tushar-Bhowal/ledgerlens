"use client";

import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowDownUp, ArrowUp, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, EllipsisVertical, Inbox, RotateCcw, Search, SearchX, Settings, SlidersHorizontal, type LucideIcon } from "lucide-react";
import { DropdownMenu, Popover } from "radix-ui";
import { CountUp } from "./count-up";
import { StateMessage } from "./state-message";

export type DataTableColumn<Row> = {
  id: string;
  label: string;
  cell: (row: Row) => ReactNode;
  icon?: LucideIcon;
  compare?: (a: Row, b: Row) => number;
  align?: "right";
  cellClassName?: string;
};

type DataTableFilter<Row> = {
  id: string;
  label: string;
  allLabel: string;
  options: readonly { value: string; label: string }[];
  getValue: (row: Row) => string;
  display?: "buttons" | "select";
};

type Sort = { columnId: string; direction: "ascending" | "descending" };

type DataTableProps<Row> = {
  label: string;
  rows: readonly Row[];
  getRowKey: (row: Row) => string;
  columns: readonly DataTableColumn<Row>[];
  search?: { label: string; placeholder: string; getText: (row: Row) => string };
  filters?: readonly DataTableFilter<Row>[];
  defaultSort?: Sort;
  pageSize?: number | false;
  emptyMessage?: string;
  selectable?: boolean;
  getRowLabel?: (row: Row) => string;
  rowActions?: (row: Row) => readonly TableAction[];
  density?: "compact" | "comfortable";
};

type TableAction = { label: string; onSelect: () => void };

function RowActions({ label, actions }: { label: string; actions: readonly TableAction[] }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const pendingAction = useRef<(() => void) | null>(null);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" className="table-row-menu" aria-label={`Actions for ${label}`} ref={trigger}>
          <EllipsisVertical size={16} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="table-popup table-action-popup" align="end" sideOffset={6} onCloseAutoFocus={(event) => {
          if (!pendingAction.current) return;
          event.preventDefault();
          trigger.current?.focus();
          const action = pendingAction.current;
          pendingAction.current = null;
          action();
        }}>
          {actions.map(({ label, onSelect }) => (
            <DropdownMenu.Item key={label} className="table-menu-item" onSelect={() => { pendingAction.current = onSelect; }}>
              {label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function DataTable<Row>({
  label,
  rows,
  getRowKey,
  columns,
  search,
  filters = [],
  defaultSort,
  pageSize = 10,
  emptyMessage,
  selectable = false,
  getRowLabel = getRowKey,
  rowActions,
  density = "comfortable",
}: DataTableProps<Row>) {
  const [query, setQuery] = useState("");
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [sort, setSort] = useState(defaultSort);
  const [page, setPage] = useState(0);
  const [pageSizeOverride, setPageSizeOverride] = useState<number>();
  const searchInput = useRef<HTMLInputElement>(null);
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const [selectedKeys, setSelectedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const sortableColumns = columns.filter((column) => column.compare);
  const activeFilters = filters.filter((filter) => selections[filter.id]).length;
  const term = query.trim().toLowerCase();
  const matching = rows.filter((row) => {
    if (search && term && !search.getText(row).toLowerCase().includes(term)) return false;
    return filters.every((filter) => {
      const value = selections[filter.id];
      return !value || filter.getValue(row) === value;
    });
  });
  const compare = columns.find((column) => column.id === sort?.columnId)?.compare;
  if (compare) matching.sort((a, b) => sort?.direction === "descending" ? compare(b, a) : compare(a, b));

  const defaultSize = pageSize === false ? 10 : Math.max(1, Math.floor(pageSize));
  const size = pageSize === false ? Math.max(1, matching.length) : pageSizeOverride ?? defaultSize;
  const pages = Math.max(1, Math.ceil(matching.length / size));
  const currentPage = Math.min(page, pages - 1);
  const visibleRows = matching.slice(currentPage * size, (currentPage + 1) * size);
  const sizeOptions = [...new Set([10, 20, 50, 100, defaultSize])].sort((a, b) => a - b);

  const visibleKeys = visibleRows.map(getRowKey);
  const selectedOnPage = visibleKeys.filter((key) => selectedKeys.has(key)).length;
  const selectedCount = rows.filter((row) => selectedKeys.has(getRowKey(row))).length;
  const allOnPageSelected = visibleKeys.length > 0 && selectedOnPage === visibleKeys.length;

  function selectRows(keys: string[], checked: boolean) {
    setSelectedKeys((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (checked) next.add(key);
        else next.delete(key);
      }
      return next;
    });
  }

  function changeFilter(id: string, value: string) {
    setSelections((previous) => ({ ...previous, [id]: value }));
    setPage(0);
  }

  function changeSort(columnId: string) {
    setSort((previous) => ({
      columnId,
      direction: previous?.columnId === columnId && previous.direction === "ascending" ? "descending" : "ascending",
    }));
    setPage(0);
  }

  return (
    <div className={density === "compact" ? "data-table compact-table" : "data-table"}>
      {(search || filters.length > 0 || sortableColumns.length > 0) && (
        <div className="table-toolbar">
          {search && (
            <label className="search-box">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">{search.label}</span>
              <input ref={searchInput} type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={search.placeholder} />
            </label>
          )}
          {sortableColumns.length > 0 && (
            <Popover.Root>
              <Popover.Trigger className="table-tool-button" type="button"><ArrowDownUp size={15} aria-hidden="true" /> Sort</Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="table-popup" aria-label="Sort table" align="start" sideOffset={6}>
                  <label className="table-sort-field">
                    <span>Sort by</span>
                    <select value={sort?.columnId ?? ""} onChange={(event) => changeSort(event.target.value)}>
                      <option value="" disabled>Choose a column</option>
                      {sortableColumns.map((column) => <option key={column.id} value={column.id}>{column.label}</option>)}
                    </select>
                  </label>
                  {sort && (
                    <div className="table-filter-buttons" role="group" aria-label="Sort direction">
                      {(["ascending", "descending"] as const).map((direction) => (
                        <button key={direction} type="button" aria-pressed={sort.direction === direction} onClick={() => {
                          setSort({ columnId: sort.columnId, direction });
                          setPage(0);
                        }}>
                          {direction === "ascending" ? "Ascending" : "Descending"}
                        </button>
                      ))}
                    </div>
                  )}
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
          {filters.length > 0 && (
            <Popover.Root>
              <Popover.Trigger ref={filterTrigger} className="table-tool-button" type="button">
                <SlidersHorizontal size={15} aria-hidden="true" /> Filter {activeFilters > 0 && <span className="table-filter-count">{activeFilters}</span>}
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content className="table-popup" aria-label="Filter table" align="start" sideOffset={6}>
                  {filters.map((filter) => {
                    const value = selections[filter.id] ?? "";
                    const options = [{ value: "", label: filter.allLabel }, ...filter.options];
                    return filter.display === "buttons" ? (
                      <fieldset key={filter.id} className="table-popup-group">
                        <legend>{filter.label}</legend>
                        <div className="table-filter-buttons">
                          {options.map((option) => (
                            <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => changeFilter(filter.id, option.value)}>
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </fieldset>
                    ) : (
                      <label key={filter.id} className="table-sort-field">
                        <span>{filter.label}</span>
                        <select value={value} onChange={(event) => changeFilter(filter.id, event.target.value)}>
                          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                      </label>
                    );
                  })}
                  {activeFilters > 0 && <button className="table-clear" type="button" onClick={() => { setSelections({}); setPage(0); }}>Clear filters</button>}
                  <Popover.Close className="table-tool-button" type="button">Done</Popover.Close>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          )}
        </div>
      )}
      <div className="table-wrap">
        <table aria-label={label}>
          <thead>
            <tr>
              {selectable && (
                <th scope="col" className="table-selection-cell">
                  <input type="checkbox" aria-label="Select all rows on this page" checked={allOnPageSelected} disabled={!visibleKeys.length}
                    ref={(element) => { if (element) element.indeterminate = selectedOnPage > 0 && !allOnPageSelected; }}
                    onChange={(event) => selectRows(visibleKeys, event.target.checked)} />
                </th>
              )}
              {columns.map(({ id, label: heading, icon: Icon, compare, align }) => {
                const direction = compare && sort?.columnId === id ? sort.direction : undefined;
                const content = <>{Icon && <Icon size={15} aria-hidden="true" />}{heading}</>;
                return (
                  <th key={id} scope="col" className={align === "right" ? "amount-cell" : undefined} aria-sort={direction}>
                    {compare ? (
                      <button type="button" className="table-heading sort-button" onClick={() => changeSort(id)}>
                        {content}
                        {direction === "ascending" && <ArrowUp className="sort-indicator" size={13} aria-hidden="true" />}
                        {direction === "descending" && <ArrowDown className="sort-indicator" size={13} aria-hidden="true" />}
                      </button>
                    ) : <span className="table-heading">{content}</span>}
                  </th>
                );
              })}
              {rowActions && <th scope="col" className="table-action-cell" aria-label="Actions"><span className="table-heading"><Settings size={14} aria-hidden="true" /><span>Action</span></span></th>}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const key = getRowKey(row);
              const selected = selectable && selectedKeys.has(key);
              const actions = rowActions?.(row);
              return (
                <tr key={key} data-selected={selected || undefined}>
                  {selectable && (
                    <td className="table-selection-cell">
                      <input type="checkbox" aria-label={`Select ${getRowLabel(row)}`} checked={selected} onChange={(event) => selectRows([key], event.target.checked)} />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.id} className={column.align === "right" ? `amount-cell ${column.cellClassName ?? ""}` : column.cellClassName}>
                      {column.cell(row)}
                    </td>
                  ))}
                  {rowActions && <td className="table-action-cell">{actions?.length ? <RowActions label={getRowLabel(row)} actions={actions} /> : null}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!visibleRows.length && (
        <StateMessage
          compact
          heading="h3"
          icon={term || activeFilters > 0 ? SearchX : Inbox}
          title={term || activeFilters > 0 ? "No matching records" : "No records in this view"}
          description={emptyMessage ?? (term || activeFilters > 0 ? "Try a different search or clear your filters to see more records." : "Records will appear here when they are available.")}
        >
          {(term || activeFilters > 0) && <button type="button" className="table-tool-button" onClick={() => { setQuery(""); setSelections({}); setPage(0); (searchInput.current ?? filterTrigger.current)?.focus(); }}><RotateCcw size={16} aria-hidden="true" /> Clear search and filters</button>}
        </StateMessage>
      )}
      <div className="table-footer">
        <div className="table-summary">
          <span role="status">
            {pageSize !== false && <>{matching.length ? currentPage * size + 1 : 0}–{Math.min((currentPage + 1) * size, matching.length)} of </>}
            <CountUp value={matching.length} initialOnly /> {matching.length === 1 ? "row" : "rows"}{selectable && selectedCount > 0 && ` · ${selectedCount} selected`}
          </span>
          {selectable && selectedCount > 0 && <button type="button" className="table-clear" onClick={() => setSelectedKeys(new Set())}>Clear selection</button>}
        </div>
        {pageSize !== false && (
          <div className="table-pagination-controls">
            <label className="table-page-size">
              Rows per page
              <select aria-label={`${label} rows per page`} value={size} onChange={(event) => { setPageSizeOverride(Number(event.target.value)); setPage(0); }}>
                {sizeOptions.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <nav className="pagination" aria-label={`${label} pagination`}>
              <span className="table-page-position">Page {matching.length ? currentPage + 1 : 0} of {matching.length ? pages : 0}</span>
              <div className="table-page-buttons">
                <button type="button" className="table-page-jump" disabled={currentPage === 0} onClick={() => setPage(0)} aria-label="First page"><ChevronsLeft size={16} aria-hidden="true" /></button>
                <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
                <button type="button" disabled={currentPage + 1 >= pages} onClick={() => setPage(currentPage + 1)} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
                <button type="button" className="table-page-jump" disabled={currentPage + 1 >= pages} onClick={() => setPage(pages - 1)} aria-label="Last page"><ChevronsRight size={16} aria-hidden="true" /></button>
              </div>
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
