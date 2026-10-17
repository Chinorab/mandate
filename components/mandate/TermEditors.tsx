"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { CATEGORIES, COLOR_IDS, COLOR_LABELS, SIZE_SYSTEMS, STORES, type CategoryId, type ColorId, type SizeSystem } from "@/lib/catalog/data";
import { SIZE_SYSTEM_LABELS } from "@/lib/check/explain";
import type { DraftTerms } from "@/lib/client/api";
import { fromEtInputs, toEtInputs } from "@/lib/time/et";
import s from "./builder.module.css";

export type TermKey = "budget" | "category" | "size" | "colors" | "purchases" | "merchants" | "expires";

type EditorProps = {
  terms: DraftTerms;
  busy: boolean;
  onSave: (next: DraftTerms) => void;
  onCancel: () => void;
};

function EditorShell({ children, busy, onCancel, onSubmit, saveLabel }: {
  children: React.ReactNode;
  busy: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  saveLabel: string;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form className={s.editor} onSubmit={submit}>
      {children}
      <div className={s.actions}>
        <Button type="submit" size="sm" disabled={busy}>
          {saveLabel}
        </Button>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function BudgetEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const [value, setValue] = useState(terms.budgetCents !== undefined ? (terms.budgetCents / 100).toFixed(2) : "");
  const [error, setError] = useState<string | null>(null);
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Budget"
      onSubmit={() => {
        const n = Number(value.replace(/[$,\s]/g, ""));
        if (!Number.isFinite(n) || n <= 0 || n > 10_000) return setError("Enter an amount between $0.01 and $10,000.");
        onSave({ ...terms, budgetCents: Math.round(n * 100) });
      }}
    >
      <div className={s.control}>
        <label htmlFor="budget-input">Budget in US dollars, total for this mandate</label>
        <input
          id="budget-input"
          className={s.input}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "budget-error" : undefined}
        />
        {error ? (
          <span id="budget-error" className={s.missing}>
            {error}
          </span>
        ) : null}
      </div>
    </EditorShell>
  );
}

export function CategoryEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const [value, setValue] = useState<string>(terms.category ?? "");
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Category"
      onSubmit={() => value && onSave({ ...terms, category: value as CategoryId })}
    >
      <div className={s.control}>
        <label htmlFor="category-input">Category</label>
        <select id="category-input" className={s.select} value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="" disabled>
            Choose a category
          </option>
          {Object.entries(CATEGORIES).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </EditorShell>
  );
}

export function SizeEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const current = terms.required?.size;
  const [system, setSystem] = useState<SizeSystem>(current?.system ?? "US_MENS");
  const [value, setValue] = useState(current?.value ?? "");
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Size"
      onSubmit={() => {
        const v = value.trim();
        const required = { ...terms.required };
        if (v) required.size = { system, value: v.slice(0, 8) };
        else delete required.size;
        onSave({ ...terms, required });
      }}
    >
      <div className={s.editorRow}>
        <div className={s.control}>
          <label htmlFor="sizesys">Size system</label>
          <select id="sizesys" className={s.select} value={system} onChange={(e) => setSystem(e.target.value as SizeSystem)}>
            {SIZE_SYSTEMS.map((x) => (
              <option key={x} value={x}>
                {SIZE_SYSTEM_LABELS[x]}
              </option>
            ))}
          </select>
        </div>
        <div className={s.control} style={{ flex: "0 1 120px" }}>
          <label htmlFor="size">Size</label>
          <input id="size" className={s.input} inputMode="decimal" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
      </div>
      <span className={s.help}>Leave the size empty to remove this term.</span>
    </EditorShell>
  );
}

function ColorChecks({ legend, name, selected, onChange }: { legend: string; name: string; selected: ColorId[]; onChange: (c: ColorId[]) => void }) {
  return (
    <fieldset className={s.fieldset}>
      <legend className={s.legend}>{legend}</legend>
      <div className={s.checks}>
        {COLOR_IDS.map((c) => (
          <label key={c} className={s.check}>
            <input
              type="checkbox"
              name={name}
              checked={selected.includes(c)}
              onChange={(e) => onChange(e.target.checked ? [...selected, c] : selected.filter((x) => x !== c))}
            />
            {COLOR_LABELS[c]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function ColorsEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const [allowed, setAllowed] = useState<ColorId[]>(terms.required?.colors ?? []);
  const [excluded, setExcluded] = useState<ColorId[]>(terms.forbidden?.colors ?? []);
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Colors"
      onSubmit={() => {
        const required = { ...terms.required };
        const forbidden = { ...terms.forbidden };
        if (allowed.length) required.colors = [...allowed].sort();
        else delete required.colors;
        const ex = excluded.filter((c) => !allowed.includes(c));
        if (ex.length) forbidden.colors = ex.sort();
        else delete forbidden.colors;
        onSave({ ...terms, required, forbidden });
      }}
    >
      <ColorChecks legend="Allowed colors (none checked means any color)" name="allowed" selected={allowed} onChange={setAllowed} />
      <ColorChecks legend="Excluded colors" name="excluded" selected={excluded} onChange={setExcluded} />
    </EditorShell>
  );
}

export function PurchasesEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const [value, setValue] = useState(String(terms.maxPurchases ?? 1));
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Orders"
      onSubmit={() => {
        const n = Math.round(Number(value));
        if (Number.isFinite(n) && n >= 1 && n <= 20) onSave({ ...terms, maxPurchases: n });
      }}
    >
      <div className={s.control} style={{ maxWidth: 200 }}>
        <label htmlFor="purchases">Number of orders allowed</label>
        <input id="purchases" className={s.input} type="number" min={1} max={20} value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
    </EditorShell>
  );
}

export function MerchantsEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const [mode, setMode] = useState<"any" | "some">(terms.merchants === "ANY_LISTED" || !terms.merchants ? "any" : "some");
  const [chosen, setChosen] = useState<string[]>(Array.isArray(terms.merchants) ? terms.merchants : []);
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Merchants"
      onSubmit={() =>
        onSave({ ...terms, merchants: mode === "any" || chosen.length === 0 ? "ANY_LISTED" : ([...chosen].sort() as DraftTerms["merchants"]) })
      }
    >
      <fieldset className={s.fieldset}>
        <legend className={s.legend}>Where may your agent buy?</legend>
        <label className={s.check}>
          <input type="radio" name="merchants" checked={mode === "any"} onChange={() => setMode("any")} />
          Any of the 3 demo stores
        </label>
        <label className={s.check}>
          <input type="radio" name="merchants" checked={mode === "some"} onChange={() => setMode("some")} />
          Only these stores
        </label>
        {mode === "some" ? (
          <div className={s.checks} style={{ paddingLeft: 26 }}>
            {STORES.map((st) => (
              <label key={st.id} className={s.check}>
                <input
                  type="checkbox"
                  checked={chosen.includes(st.id)}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, st.id] : chosen.filter((x) => x !== st.id))}
                />
                {st.name}
              </label>
            ))}
          </div>
        ) : null}
      </fieldset>
    </EditorShell>
  );
}

export function ExpiresEditor({ terms, busy, onSave, onCancel }: EditorProps) {
  const initial = terms.expiresAt ? toEtInputs(terms.expiresAt) : { date: "", time: "23:59" };
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [error, setError] = useState<string | null>(null);
  return (
    <EditorShell
      busy={busy}
      onCancel={onCancel}
      saveLabel="Save Expiry"
      onSubmit={() => {
        const iso = fromEtInputs(date, time);
        if (!iso) return setError("Choose a date and a time.");
        if (new Date(iso).getTime() <= Date.now()) return setError("Choose a time in the future.");
        onSave({ ...terms, expiresAt: iso });
      }}
    >
      <div className={s.editorRow}>
        <div className={s.control}>
          <label htmlFor="exp-date">Date</label>
          <input id="exp-date" className={s.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className={s.control} style={{ flex: "0 1 160px" }}>
          <label htmlFor="exp-time">Time, US Eastern</label>
          <input id="exp-time" className={s.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
      </div>
      {error ? <span className={s.missing}>{error}</span> : null}
    </EditorShell>
  );
}
