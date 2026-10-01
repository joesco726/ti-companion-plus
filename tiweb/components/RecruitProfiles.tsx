"use client";

/* Profili di reclutamento (ticore/profiles.py): cosa cerco fra i candidati.
   Ogni profilo ha condizioni «tutte», «almeno una» e «nessuna» su tratti,
   missioni e attributi alti/bassi; quando un candidato corrisponde arriva
   un'allerta. Le soglie degli attributi valgono per tutti i profili e stanno
   in fondo.

   Le condizioni si scelgono da una griglia di etichette, non da menu a
   tendina: un clic fa girare lo stato (spenta -> ha tutte -> almeno una ->
   nessuna -> spenta). I tratti sono divisi nelle sezioni del wiki ufficiale,
   che sono il `grouping` dei template del gioco. */

import { useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Button, Tag } from "@/components/ui";
import { impossible, indexOf, possibleTypes } from "@/lib/profileCheck";

type Severity = "warning" | "info";
type ListKey = "all" | "any" | "none";

export interface Profile {
  id?: number;
  name: string;
  enabled: boolean;
  severity: Severity;
  all: string[];
  any: string[];
  none: string[];
  newMissionsOnly: boolean;
}

export interface Option {
  id: string; name: string; group?: number | null; attribute?: string | null;
  /** tipi di consigliere su cui il tratto esce / che hanno la missione */
  types?: string[];
  /** solo tratti: missioni che da' e che toglie */
  grants?: string[]; restricts?: string[];
}

export interface ProfilesData {
  profiles: Profile[];
  thresholds: { high: number; low: number };
  options: { traits: Option[]; missions: Option[]; attributes: Option[]; types: Option[] };
  /** id profilo (stringa) -> candidati che corrispondono */
  matches: Record<string, { id: number; name: string; met: string[] }[]>;
}

const EMPTY: Profile = {
  name: "", enabled: true, severity: "warning", all: [], any: [], none: [], newMissionsOnly: false,
};

/** Nome leggibile di una condizione `tipo:id`, dai nomi del gioco. */
function useLabel(data: ProfilesData) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const by = (xs: Option[]) => Object.fromEntries(xs.map((x) => [x.id, x.name]));
  const traits = by(data.options.traits);
  const missions = by(data.options.missions);
  const attrs = by(data.options.attributes);
  return (token: string) => {
    const [kind, id] = token.split(":");
    if (kind === "trait") return traits[id] ?? id;
    if (kind === "mission") return `${p.missionPrefix} ${missions[id] ?? id}`;
    const a = attrs[id] ?? id;
    return kind === "high" ? `${a} ≥ ${data.thresholds.high}` : `${a} ≤ ${data.thresholds.low}`;
  };
}

type State = "off" | ListKey;
const NEXT: Record<State, State> = { off: "all", all: "any", any: "none", none: "off" };
const MARK: Record<State, string> = { off: "", all: "✓ ", any: "◇ ", none: "✕ " };
const TONE: Record<State, string> = {
  off: "border-edge text-dim hover:text-ink hover:border-edge-lit",
  all: "border-good text-good bg-good/10",
  // azzurro fisso, non l'accent: quello segue il colore della fazione
  any: "border-sky-300 text-sky-300 bg-sky-300/10",
  none: "border-bad text-bad bg-bad/10",
};
/** ordine delle sezioni dei tratti: quello del wiki, poi i tratti senza gruppo */
const GROUP_ORDER = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, null];
type Tab = "traits" | "missions" | "attributes";

/** Tutte le condizioni del profilo in una griglia: ogni etichetta e' spenta o
 *  sta in una delle tre liste, e il clic la porta allo stato dopo. */
function ConditionGrid({ d, setD, data }: {
  d: Profile; setD: (f: (x: Profile) => Profile) => void; data: ProfilesData;
}) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const label = useLabel(data);
  const [tab, setTab] = useState<Tab>("traits");
  const [filter, setFilter] = useState("");

  const stateOf = (tok: string): State =>
    d.all.includes(tok) ? "all" : d.any.includes(tok) ? "any" : d.none.includes(tok) ? "none" : "off";
  const setState = (tok: string, to: State) => setD((x) => {
    const y = { ...x, all: x.all.filter((v) => v !== tok), any: x.any.filter((v) => v !== tok),
                none: x.none.filter((v) => v !== tok) };
    if (to !== "off") y[to] = [...y[to], tok];
    return y;
  });

  const f = filter.trim().toLowerCase();
  const shown = (name: string) => !f || name.toLowerCase().includes(f);
  const chip = (tok: string, name: string) => {
    const st = stateOf(tok);
    return (
      <button key={tok} onClick={() => setState(tok, NEXT[st])} title={p.legend}
        className={`px-1.5 py-[1px] border text-[12px] text-left ${TONE[st]}`}>
        {MARK[st]}{name}
      </button>
    );
  };
  const count = (kinds: string[]) => [...d.all, ...d.any, ...d.none]
    .filter((x) => kinds.includes(x.split(":")[0])).length;

  const groups = GROUP_ORDER.map((g) => ({
    g, items: data.options.traits.filter((o) => (o.group ?? null) === g && shown(o.name)),
  })).filter((x) => x.items.length);
  const groupName = (g: number | null) =>
    (p.groups as Record<string, string>)[g == null ? "none" : String(g)] ?? `${p.group} ${g}`;

  const tabs: [Tab, string, number][] = [
    ["traits", p.traits, count(["trait"])],
    ["missions", p.missions, count(["mission"])],
    ["attributes", p.attributes, count(["high", "low"])],
  ];
  return (
    <div className="space-y-2">
      {/* il profilo per come e' ora: le tre liste, togliendo con la × */}
      {(["all", "any", "none"] as ListKey[]).map((k) => (
        <div key={k} className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
          <span className={`font-semibold w-28 shrink-0 ${TONE[k].split(" ")[1]}`}>
            {MARK[k]}{p[k]}
          </span>
          {d[k].length ? d[k].map((tok) => (
            <span key={tok} className="inline-flex items-center gap-1 border border-edge px-1.5 py-[1px]">
              {label(tok)}
              <button onClick={() => setState(tok, "off")} className="text-dim hover:text-bad"
                aria-label={p.remove}>×</button>
            </span>
          )) : <span className="text-faint">{p[`${k}Hint` as "allHint"]}</span>}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-2">
        {tabs.map(([k, name, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-2 py-[2px] border text-[12px] ${tab === k
              ? "border-accent text-accent bg-accent/10" : "border-edge text-dim hover:text-ink"}`}>
            {name}{n ? ` (${n})` : ""}
          </button>
        ))}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={p.filter}
          className="bg-transparent border border-edge px-1.5 py-[2px] text-[12px] w-48" />
        <span className="text-faint text-[11.5px]">{p.legend}</span>
      </div>

      <div className="max-h-[22rem] overflow-y-auto pr-1 space-y-2">
        {tab === "traits" && groups.map(({ g, items }) => (
          <div key={String(g)}>
            <div className="text-dim text-[11px] uppercase tracking-[.06em] mb-1">{groupName(g)}</div>
            <div className="flex flex-wrap gap-1.5">{items.map((o) => chip(`trait:${o.id}`, o.name))}</div>
          </div>
        ))}
        {/* una colonna per attributo su cui tira la missione, poi quelle senza tiro */}
        {tab === "missions" && (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
            {[...data.options.attributes.map((a) => a.id), null].map((attr) => {
              const ms = data.options.missions.filter((o) => (o.attribute ?? null) === attr && shown(o.name));
              if (!ms.length) return null;
              const name = attr ? data.options.attributes.find((a) => a.id === attr)?.name ?? attr : p.noRoll;
              return (
                <div key={attr ?? "none"} className="space-y-1">
                  <div className="text-dim text-[11px] uppercase tracking-[.06em] flex items-center gap-1">
                    {attr && <AttrIcon attr={attr} size={13} />}{name}
                  </div>
                  <div className="flex flex-col items-start gap-1">
                    {ms.map((o) => chip(`mission:${o.id}`, o.name))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {tab === "attributes" && (
          <div className="grid gap-1.5 [grid-template-columns:auto_auto_1fr] items-center">
            {data.options.attributes.filter((o) => shown(o.name)).map((o) => (
              <div key={o.id} className="contents">
                <span className="text-[12px] text-dim pr-2">{o.name}</span>
                {chip(`high:${o.id}`, `${p.highShort} ≥ ${data.thresholds.high}`)}
                <span>{chip(`low:${o.id}`, `${p.lowShort} ≤ ${data.thresholds.low}`)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Editor({ start, data, onSave, onCancel }: {
  start: Profile; data: ProfilesData; onSave: (p: Profile) => Promise<void>; onCancel: () => void;
}) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const [d, setD] = useState<Profile>(start);
  const [err, setErr] = useState<string | null>(null);
  const empty = d.all.length === 0 && d.any.length === 0;
  const label = useLabel(data);
  const ix = indexOf(data);
  const bad = empty ? null : impossible(d, ix);
  const typeName = (id: string) => data.options.types.find((x) => x.id === id)?.name ?? id;
  const types = empty || bad ? [] : possibleTypes(d, ix);
  return (
    <div className="border border-accent/50 bg-panel p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">{p.name}
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
            className="bg-transparent border border-edge px-1.5 py-[2px] w-56" maxLength={80} />
        </label>
        <label className="flex items-center gap-1.5">{p.severity}
          <select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Severity })}>
            <option value="warning">{p.severityWarning}</option>
            <option value="info">{p.severityInfo}</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={d.newMissionsOnly}
            onChange={(e) => setD({ ...d, newMissionsOnly: e.target.checked })} />
          {p.newOnly}
        </label>
      </div>
      <ConditionGrid d={d} setD={setD} data={data} />
      {empty && <p className="text-warn text-[12px] m-0">{p.needCondition}</p>}
      {bad && (
        <p className="text-warn text-[12px] m-0">
          <span aria-hidden className="mr-1">⚠</span>
          {(bad.anyPart ? (bad.tokens.length ? p.impossibleAny : p.impossibleAnyAlone)
            : bad.tokens.length === 1 ? p.impossibleOne
            : p.impossible).replace("{items}", bad.tokens.map(label).join(" + "))}
          {" "}<span className="text-dim">{p.impossibleHint}</span>
        </p>
      )}
      {types.length > 0 && types.length < data.options.types.length && (
        <p className="text-faint text-[12px] m-0">
          {p.possibleTypes} {types.map(typeName).join(", ")}
        </p>
      )}
      {err && <p className="text-bad text-[12px] m-0">{err}</p>}
      <div className="flex gap-2">
        <Button tone="primary" disabled={!d.name.trim() || empty}
          onClick={() => { onSave(d).catch((e) => setErr(String(e.message ?? e))); }}>
          {p.save}
        </Button>
        <Button onClick={onCancel}>{p.cancel}</Button>
      </div>
    </div>
  );
}

function Thresholds({ data, onSave }: {
  data: ProfilesData; onSave: (th: { high: number; low: number }) => Promise<void>;
}) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const [high, setHigh] = useState(data.thresholds.high);
  const [low, setLow] = useState(data.thresholds.low);
  const changed = high !== data.thresholds.high || low !== data.thresholds.low;
  const num = (v: number, set: (n: number) => void) => (
    <input type="number" value={v} min={0} max={30}
      onChange={(e) => set(Number(e.target.value))}
      className="bg-transparent border border-edge px-1 py-[1px] w-14 text-right tabular-nums" />
  );
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12px] border-t border-edge pt-2">
      <span className="text-dim">{p.thresholds}</span>
      <label className="flex items-center gap-1.5">{p.highLabel} {num(high, setHigh)}</label>
      <label className="flex items-center gap-1.5">{p.lowLabel} {num(low, setLow)}</label>
      <Button disabled={!changed} onClick={() => { void onSave({ high, low }); }}>{p.apply}</Button>
    </div>
  );
}

export function RecruitProfiles({ data, onChange }: {
  data: ProfilesData; onChange: () => void;
}) {
  const { t, game, refreshAlerts } = useSettings();
  const p = t.recruit.profiles;
  const label = useLabel(data);
  const [editing, setEditing] = useState<Profile | null>(null);
  // aperto alla prima visita (nessun profilo), poi come lo lascia l'utente
  const [open, setOpen] = useState(data.profiles.length === 0);

  const send = async (path: string, method: string, body?: unknown) => {
    await api(`${path}?lang=${game}`, { method, body: body ? JSON.stringify(body) : undefined });
    onChange();
    refreshAlerts();
  };
  const save = async (d: Profile) => {
    if (d.id) await send(`/api/profiles/${d.id}`, "PUT", d);
    else await send("/api/profiles", "POST", d);
    setEditing(null);
  };
  const summary = (pr: Profile) => ([
    ["all", p.all], ["any", p.any], ["none", p.none],
  ] as [ListKey, string][]).filter(([k]) => pr[k].length)
    .map(([k, title]) => `${title}: ${pr[k].map(label).join(", ")}`).join(" · ");

  const active = data.profiles.filter((x) => x.enabled).length;
  return (
    <details className="border border-edge p-3 mb-3" open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[13px] font-semibold">
        {p.title} <span className="text-dim font-normal">
          · {p.activeCount.replace("{n}", String(active)).replace("{total}", String(data.profiles.length))}
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-dim text-[12px] m-0">{p.hint}</p>

        {data.profiles.map((pr) => {
          const hits = data.matches[String(pr.id)] ?? [];
          return editing?.id === pr.id ? (
            <Editor key={pr.id} start={pr} data={data} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div key={pr.id} className={`flex flex-wrap items-baseline gap-2 text-[12.5px] ${pr.enabled ? "" : "opacity-50"}`}>
              <input type="checkbox" checked={pr.enabled} title={p.enabled}
                onChange={(e) => { void send(`/api/profiles/${pr.id}`, "PUT", { ...pr, enabled: e.target.checked }); }} />
              <span className="font-semibold">{pr.name}</span>
              <Tag tone={pr.severity === "warning" ? "warn" : "dim"}>
                {pr.severity === "warning" ? p.severityWarning : p.severityInfo}
              </Tag>
              <span className="text-dim">{summary(pr)}{pr.newMissionsOnly ? ` · ${p.newOnlyShort}` : ""}</span>
              <span className={hits.length ? "text-good" : "text-faint"}>
                {!pr.enabled ? p.off : hits.length
                  ? `${p.matchesNow}: ${hits.map((h) => h.name).join(", ")}` : p.noMatches}
              </span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => setEditing(pr)} className="text-dim hover:text-ink underline">{p.edit}</button>
                <button onClick={() => { if (window.confirm(p.confirmDelete.replace("{name}", pr.name))) void send(`/api/profiles/${pr.id}`, "DELETE"); }}
                  className="text-dim hover:text-bad underline">{p.delete}</button>
              </span>
            </div>
          );
        })}

        {editing && !editing.id
          ? <Editor start={editing} data={data} onSave={save} onCancel={() => setEditing(null)} />
          : !editing && <Button onClick={() => setEditing({ ...EMPTY })}>+ {p.new}</Button>}

        <Thresholds key={`${data.thresholds.high}-${data.thresholds.low}`} data={data}
          onSave={(th) => send("/api/profiles/thresholds", "PUT", th)} />
      </div>
    </details>
  );
}
