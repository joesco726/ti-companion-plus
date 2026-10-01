"use client";

/* Profili di reclutamento (ticore/profiles.py): cosa cerco fra i candidati.
   Ogni profilo ha condizioni «tutte», «almeno una» e «nessuna» su tratti,
   missioni e attributi alti/bassi; quando un candidato corrisponde arriva
   un'allerta. Le soglie degli attributi valgono per tutti i profili e stanno
   in fondo. */

import { useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Button, Tag } from "@/components/ui";

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

interface Option { id: string; name: string }

export interface ProfilesData {
  profiles: Profile[];
  thresholds: { high: number; low: number };
  options: { traits: Option[]; missions: Option[]; attributes: Option[] };
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

/** Una lista di condizioni: le scelte come etichette, e un menu per aggiungerne. */
function Conditions({ title, hint, value, onChange, data }: {
  title: string; hint: string; value: string[]; onChange: (v: string[]) => void;
  data: ProfilesData;
}) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const label = useLabel(data);
  const add = (token: string) => { if (token && !value.includes(token)) onChange([...value, token]); };
  return (
    <div className="space-y-1">
      <div className="text-[12px]"><span className="font-semibold">{title}</span>
        <span className="text-faint"> · {hint}</span></div>
      <div className="flex flex-wrap items-center gap-1.5">
        {value.map((tok) => (
          <span key={tok} className="inline-flex items-center gap-1 border border-edge px-1.5 py-[1px] text-[12px]">
            {label(tok)}
            <button onClick={() => onChange(value.filter((x) => x !== tok))}
              className="text-dim hover:text-bad" aria-label={p.remove}>×</button>
          </span>
        ))}
        <select value="" onChange={(e) => add(e.target.value)} className="text-[12px]">
          <option value="">{p.add}</option>
          <optgroup label={p.traits}>
            {data.options.traits.map((o) => <option key={o.id} value={`trait:${o.id}`}>{o.name}</option>)}
          </optgroup>
          <optgroup label={p.missions}>
            {data.options.missions.map((o) => <option key={o.id} value={`mission:${o.id}`}>{o.name}</option>)}
          </optgroup>
          <optgroup label={p.high.replace("{n}", String(data.thresholds.high))}>
            {data.options.attributes.map((o) => <option key={o.id} value={`high:${o.id}`}>{o.name} ≥ {data.thresholds.high}</option>)}
          </optgroup>
          <optgroup label={p.low.replace("{n}", String(data.thresholds.low))}>
            {data.options.attributes.map((o) => <option key={o.id} value={`low:${o.id}`}>{o.name} ≤ {data.thresholds.low}</option>)}
          </optgroup>
        </select>
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
  const set = (k: ListKey) => (v: string[]) => setD((x) => ({ ...x, [k]: v }));
  const empty = d.all.length === 0 && d.any.length === 0;
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
      </div>
      <Conditions title={p.all} hint={p.allHint} value={d.all} onChange={set("all")} data={data} />
      <Conditions title={p.any} hint={p.anyHint} value={d.any} onChange={set("any")} data={data} />
      <Conditions title={p.none} hint={p.noneHint} value={d.none} onChange={set("none")} data={data} />
      <label className="flex items-center gap-1.5 text-[12.5px]">
        <input type="checkbox" checked={d.newMissionsOnly}
          onChange={(e) => setD({ ...d, newMissionsOnly: e.target.checked })} />
        {p.newOnly}
      </label>
      {empty && <p className="text-warn text-[12px] m-0">{p.needCondition}</p>}
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
