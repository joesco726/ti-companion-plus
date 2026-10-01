"use client";

/* Profili delle org (ticore/profiles.py, parte «org»): quali org del mercato
   mi interessano. Stesse liste dei profili di reclutamento («ha tutte»,
   «almeno una», «nessuna») e stessa griglia di etichette, su cio' che l'org
   da': attributi, bonus alle priorita' nazionali e allo spazio, ricerca per
   categoria, rendite; in una seconda scheda le missioni. Con un profilo delle
   org attivo, l'allerta su ogni org acquistabile tace. */

import { useState } from "react";
import { api } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { AttrIcon, Button, Tag } from "@/components/ui";
import { MARK, NEXT, TONE, type ListKey, type Severity, type State } from "@/components/RecruitProfiles";

export interface OrgProfile {
  id?: number;
  kind?: "org";
  name: string;
  enabled: boolean;
  severity: Severity;
  all: string[];
  any: string[];
  none: string[];
  affordableOnly: boolean;
  /** limiti per condizione, nelle unita' mostrate (priorita' e ricerca in %) */
  ranges?: Record<string, { min?: number; max?: number }>;
  /** dimensioni in stelle (1-3); vuoto = qualunque */
  tiers?: number[];
  holdableOnly: boolean;
}

interface Opt { id: string; name: string | null; icon?: string | null; attribute?: string | null }

export interface OrgProfilesData {
  profiles: OrgProfile[];
  options: { attributes: Opt[]; priorities: Opt[]; science: Opt[]; income: Opt[]; missions: Opt[];
             /** valori che un'org puo' avere per ogni condizione, [min, max] */
             ranges: Record<string, [number, number]> };
  /** id profilo (stringa) -> org del mercato che corrispondono */
  matches: Record<string, { id: number; name: string; met: string[] }[]>;
}

const EMPTY: OrgProfile = {
  kind: "org", name: "", enabled: true, severity: "warning", all: [], any: [], none: [],
  affordableOnly: true, holdableOnly: true, ranges: {}, tiers: [],
};

/** Stelle della dimensione, come nel gioco (1 piccola, 3 grande). */
export const stars = (n: number) => "★".repeat(n);

/** «≥ 2 ≤ 3» accanto al nome, per riepiloghi e allerte. */
export function rangeText(r?: { min?: number; max?: number }, pct = false) {
  if (!r) return "";
  const u = pct ? "%" : "";
  if (r.min != null && r.max != null) return ` ${r.min}–${r.max}${u}`;
  if (r.min != null) return ` ≥ ${r.min}${u}`;
  if (r.max != null) return ` ≤ ${r.max}${u}`;
  return "";
}

/** Nome di una condizione `tipo:id`: dal gioco, o dall'interfaccia per
 *  l'estrazione, che nel gioco non ha un nome di priorita'. */
function useOrgLabel(data: OrgProfilesData) {
  const { t } = useSettings();
  const p = t.orgProfiles;
  const pools: Record<string, Opt[]> = {
    attr: data.options.attributes, prio: data.options.priorities, sci: data.options.science,
    inc: data.options.income, mission: data.options.missions,
  };
  const fallback: Record<string, string> = { miningBonus: p.mining };
  return (token: string) => {
    const [kind, id] = token.split(":");
    const name = pools[kind]?.find((o) => o.id === id)?.name ?? fallback[id] ?? id;
    if (kind === "mission") return `${p.missionPrefix} ${name}`;
    // stesso nome in due colonne (Mission Control): la rendita si distingue
    return kind === "inc" ? `${name} (${p.incomeShort})` : name;
  };
}

function Grid({ d, setD, data }: {
  d: OrgProfile; setD: (f: (x: OrgProfile) => OrgProfile) => void; data: OrgProfilesData;
}) {
  const { t } = useSettings();
  const p = t.orgProfiles;
  const label = useOrgLabel(data);
  const [tab, setTab] = useState<"bonuses" | "missions">("bonuses");

  const setRange = (tok: string, which: "min" | "max", raw: string) => setD((x) => {
    const cur = { ...(x.ranges?.[tok] ?? {}) };
    if (raw === "" || Number.isNaN(Number(raw))) delete cur[which];
    else cur[which] = Number(raw);
    const ranges = { ...(x.ranges ?? {}) };
    if (cur.min == null && cur.max == null) delete ranges[tok]; else ranges[tok] = cur;
    return { ...x, ranges };
  });
  const toggleTier = (n: number) => setD((x) => {
    const has = (x.tiers ?? []).includes(n);
    return { ...x, tiers: has ? (x.tiers ?? []).filter((v) => v !== n) : [...(x.tiers ?? []), n].sort() };
  });
  const stateOf = (tok: string): State =>
    d.all.includes(tok) ? "all" : d.any.includes(tok) ? "any" : d.none.includes(tok) ? "none" : "off";
  const setState = (tok: string, to: State) => setD((x) => {
    const y = { ...x, all: x.all.filter((v) => v !== tok), any: x.any.filter((v) => v !== tok),
                none: x.none.filter((v) => v !== tok) };
    if (to !== "off") y[to] = [...y[to], tok];
    return y;
  });
  const chip = (tok: string, name: string) => {
    const st = stateOf(tok);
    return (
      <button key={tok} onClick={() => setState(tok, NEXT[st])} title={t.recruit.profiles.legend}
        className={`px-1.5 py-[1px] border text-[12px] text-left ${TONE[st]}`}>
        {MARK[st]}{name}
      </button>
    );
  };
  const col = (title: string, items: React.ReactNode[]) => (
    <div className="space-y-1">
      <div className="text-dim text-[11px] uppercase tracking-[.06em]">{title}</div>
      <div className="flex flex-col items-start gap-1">{items}</div>
    </div>
  );
  const fallback: Record<string, string> = { miningBonus: p.mining };
  const count = (kinds: string[]) => [...d.all, ...d.any, ...d.none]
    .filter((x) => kinds.includes(x.split(":")[0])).length;
  const nb = count(["attr", "prio", "sci", "inc"]), nm = count(["mission"]);

  return (
    <div className="space-y-2">
      {(["all", "any", "none"] as ListKey[]).map((k) => (
        <div key={k} className="flex flex-wrap items-baseline gap-1.5 text-[12px]">
          <span className={`font-semibold w-28 shrink-0 ${TONE[k].split(" ")[1]}`}>
            {MARK[k]}{t.recruit.profiles[k]}
          </span>
          {d[k].length ? d[k].map((tok) => {
            const span = data.options.ranges[tok];
            const r = d.ranges?.[tok] ?? {};
            const pct = tok.startsWith("prio:") || tok.startsWith("sci:");
            const num = (which: "min" | "max", ph?: number) => (
              <input type="number" value={r[which] ?? ""} placeholder={ph != null ? String(ph) : ""}
                aria-label={which === "min" ? p.atLeast : p.atMost}
                onChange={(e) => setRange(tok, which, e.target.value)}
                // lo stile globale degli input (padding 4px 8px) qui e' troppo
                style={{ padding: "0 3px", width: "3.2rem" }} className="text-right tabular-nums" />
            );
            return (
              <span key={tok} className="inline-flex items-center gap-1 border border-edge px-1.5 py-[1px]">
                {label(tok)}
                {span && <>
                  <span className="text-faint ml-1">≥</span>{num("min", span[0])}
                  <span className="text-faint">≤</span>{num("max", span[1])}
                  {pct && <span className="text-faint">%</span>}
                </>}
                <button onClick={() => setState(tok, "off")} className="text-dim hover:text-bad ml-0.5"
                  aria-label={t.recruit.profiles.remove}>×</button>
              </span>
            );
          }) : <span className="text-faint">{p[`${k}Hint` as "allHint"]}</span>}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2 border-t border-edge pt-2">
        {([["bonuses", p.tabBonuses, nb], ["missions", p.tabMissions, nm]] as const).map(([k, name, n]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-2 py-[2px] border text-[12px] ${tab === k
              ? "border-accent text-accent bg-accent/10" : "border-edge text-dim hover:text-ink"}`}>
            {name}{n ? ` (${n})` : ""}
          </button>
        ))}
        {/* dimensione: nessuna stella scelta = qualunque */}
        <span className="flex items-center gap-1 text-[12px] ml-1">
          <span className="text-dim">{p.size}</span>
          {[1, 2, 3].map((n) => {
            const on = (d.tiers ?? []).includes(n);
            return (
              <button key={n} onClick={() => toggleTier(n)} title={p.sizeHint}
                className={`px-1.5 py-[1px] border text-[12px] tracking-tight ${on
                  ? "border-warn text-warn bg-warn/10" : "border-edge text-dim hover:text-ink"}`}>
                {stars(n)}
              </button>
            );
          })}
        </span>
        <span className="text-faint text-[11.5px]">{t.recruit.profiles.legend} · {p.presence}</span>
      </div>

      {tab === "bonuses" && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(11rem,1fr))]">
          {col(p.colAttributes, data.options.attributes.map((o) => chip(`attr:${o.id}`, o.name ?? o.id)))}
          {col(p.colPriorities, data.options.priorities.map((o) =>
            chip(`prio:${o.id}`, o.name ?? fallback[o.id] ?? o.id)))}
          {col(p.colScience, data.options.science.map((o) => chip(`sci:${o.id}`, o.name ?? o.id)))}
          {col(p.colIncome, data.options.income.map((o) => chip(`inc:${o.id}`, o.name ?? o.id)))}
        </div>
      )}
      {tab === "missions" && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(12rem,1fr))]">
          {[...data.options.attributes.map((a) => a.id), null].map((attr) => {
            const ms = data.options.missions.filter((o) => (o.attribute ?? null) === attr);
            if (!ms.length) return null;
            const name = attr ? data.options.attributes.find((a) => a.id === attr)?.name ?? attr
              : t.recruit.profiles.noRoll;
            return (
              <div key={attr ?? "none"} className="space-y-1">
                <div className="text-dim text-[11px] uppercase tracking-[.06em] flex items-center gap-1">
                  {attr && <AttrIcon attr={attr} size={13} />}{name}
                </div>
                <div className="flex flex-col items-start gap-1">
                  {ms.map((o) => chip(`mission:${o.id}`, o.name ?? o.id))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Editor({ start, data, onSave, onCancel }: {
  start: OrgProfile; data: OrgProfilesData; onSave: (p: OrgProfile) => Promise<void>; onCancel: () => void;
}) {
  const { t } = useSettings();
  const p = t.orgProfiles, rp = t.recruit.profiles;
  const [d, setD] = useState<OrgProfile>(start);
  const [err, setErr] = useState<string | null>(null);
  const empty = d.all.length === 0 && d.any.length === 0;
  return (
    <div className="border border-accent/50 bg-panel p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">{rp.name}
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
            className="bg-transparent border border-edge px-1.5 py-[2px] w-56" maxLength={80} />
        </label>
        <label className="flex items-center gap-1.5">{rp.severity}
          <select value={d.severity} onChange={(e) => setD({ ...d, severity: e.target.value as Severity })}>
            <option value="warning">{rp.severityWarning}</option>
            <option value="info">{rp.severityInfo}</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={d.affordableOnly}
            onChange={(e) => setD({ ...d, affordableOnly: e.target.checked })} />
          {p.affordableOnly}
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={d.holdableOnly}
            onChange={(e) => setD({ ...d, holdableOnly: e.target.checked })} />
          {p.holdableOnly}
        </label>
      </div>
      <Grid d={d} setD={setD} data={data} />
      {empty && <p className="text-warn text-[12px] m-0">{rp.needCondition}</p>}
      {err && <p className="text-bad text-[12px] m-0">{err}</p>}
      <div className="flex gap-2">
        <Button tone="primary" disabled={!d.name.trim() || empty}
          onClick={() => { onSave(d).catch((e) => setErr(String(e.message ?? e))); }}>
          {rp.save}
        </Button>
        <Button onClick={onCancel}>{rp.cancel}</Button>
      </div>
    </div>
  );
}

export function OrgProfiles({ data, onChange }: { data: OrgProfilesData; onChange: () => void }) {
  const { t, game, refreshAlerts } = useSettings();
  const p = t.orgProfiles, rp = t.recruit.profiles;
  const label = useOrgLabel(data);
  const [editing, setEditing] = useState<OrgProfile | null>(null);
  const [open, setOpen] = useState(data.profiles.length === 0);

  const send = async (path: string, method: string, body?: unknown) => {
    await api(`${path}?lang=${game}`, { method, body: body ? JSON.stringify(body) : undefined });
    onChange();
    refreshAlerts();
  };
  const save = async (d: OrgProfile) => {
    if (d.id) await send(`/api/orgprofiles/${d.id}`, "PUT", d);
    else await send("/api/orgprofiles", "POST", d);
    setEditing(null);
  };
  const withRange = (pr: OrgProfile) => (tok: string) =>
    label(tok) + rangeText(pr.ranges?.[tok], tok.startsWith("prio:") || tok.startsWith("sci:"));
  const summary = (pr: OrgProfile) => [
    ...([["all", rp.all], ["any", rp.any], ["none", rp.none]] as [ListKey, string][])
      .filter(([k]) => pr[k].length)
      .map(([k, title]) => `${title}: ${pr[k].map(withRange(pr)).join(", ")}`),
    ...(pr.tiers?.length ? [`${p.size} ${pr.tiers.map(stars).join(" / ")}`] : []),
  ].join(" · ");
  const active = data.profiles.filter((x) => x.enabled).length;

  return (
    <details className="border border-edge p-3 mb-3" open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="cursor-pointer text-[13px] font-semibold">
        {p.title} <span className="text-dim font-normal">
          · {rp.activeCount.replace("{n}", String(active)).replace("{total}", String(data.profiles.length))}
        </span>
      </summary>
      <div className="mt-2 space-y-2">
        <p className="text-dim text-[12px] m-0">{active ? p.hintActive : p.hint}</p>
        {data.profiles.map((pr) => {
          const hits = data.matches[String(pr.id)] ?? [];
          return editing?.id === pr.id ? (
            <Editor key={pr.id} start={pr} data={data} onSave={save} onCancel={() => setEditing(null)} />
          ) : (
            <div key={pr.id} className={`flex flex-wrap items-baseline gap-2 text-[12.5px] ${pr.enabled ? "" : "opacity-50"}`}>
              <input type="checkbox" checked={pr.enabled} title={rp.enabled}
                onChange={(e) => { void send(`/api/orgprofiles/${pr.id}`, "PUT", { ...pr, enabled: e.target.checked }); }} />
              <span className="font-semibold">{pr.name}</span>
              <Tag tone={pr.severity === "warning" ? "warn" : "dim"}>
                {pr.severity === "warning" ? rp.severityWarning : rp.severityInfo}
              </Tag>
              <span className="text-dim">{summary(pr)}</span>
              <span className={hits.length ? "text-good" : "text-faint"}>
                {!pr.enabled ? rp.off : hits.length
                  ? `${rp.matchesNow}: ${hits.map((h) => h.name).join(", ")}` : p.noMatches}
              </span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => setEditing(pr)} className="text-dim hover:text-ink underline">{rp.edit}</button>
                <button onClick={() => { if (window.confirm(rp.confirmDelete.replace("{name}", pr.name))) void send(`/api/orgprofiles/${pr.id}`, "DELETE"); }}
                  className="text-dim hover:text-bad underline">{rp.delete}</button>
              </span>
            </div>
          );
        })}
        {editing && !editing.id
          ? <Editor start={editing} data={data} onSave={save} onCancel={() => setEditing(null)} />
          : !editing && <Button onClick={() => setEditing({ ...EMPTY })}>+ {rp.new}</Button>}
      </div>
    </details>
  );
}
