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
import { Tip } from "@/components/Tip";
import { conditionText, describe, TONE as FX_TONE } from "@/components/CouncilorCard";
import type { TraitEffect } from "@/lib/types";
import { FAST_LEARNERS, impossible, indexOf, presetMatches, RARE_PCT, typeChances } from "@/lib/profileCheck";

/** 0,4% / 3% / 25%: un decimale solo sotto l'1% */
const fmtPct = (p: number) => { const v = p * 100; return `${v < 1 ? v.toFixed(1) : Math.round(v)}%`; };

export type Severity = "warning" | "info";
export type ListKey = "all" | "any" | "none";

export interface Profile {
  id?: number;
  name: string;
  /** dal motore: il nome, o uno costruito dalle condizioni se manca */
  label?: string;
  enabled: boolean;
  severity: Severity;
  all: string[];
  any: string[];
  none: string[];
  newMissionsOnly: boolean;
  /** scorciatoia: oltre al resto, Quick Learner o Striver */
  fastLearner?: boolean;
  /** fascia d'eta'; null = nessun limite da quella parte */
  ageMin?: number | null;
  ageMax?: number | null;
}

export interface Option {
  id: string; name: string; group?: number | null; attribute?: string | null;
  /** tipi di consigliere su cui il tratto esce / che hanno la missione */
  types?: string[];
  /** solo tratti: missioni che da' e che toglie */
  grants?: string[]; restricts?: string[];
  /** solo tratti: {tipo: probabilita' in %} su un consigliere nuovo */
  chances?: Record<string, number>;
  /** solo tratti: descrizione del gioco ed effetti dal template */
  description?: string | null;
  effects?: TraitEffect[];
}

/** consigliere predefinito del gioco, con tratti fissi */
export interface Preset {
  id: string; name: string; type: string; traits: string[]; missions: string[]; ideologies: string[];
}

export interface ProfilesData {
  profiles: Profile[];
  thresholds: { high: number; low: number };
  options: { traits: Option[]; missions: Option[]; attributes: Option[]; types: Option[];
             /** gruppi da escludere in un clic: tratti fissi (profiles.trait_sets) */
             traitSets?: { noInspire: string[]; loyaltyLoss: string[] };
             presets: Preset[]; ageRange: [number, number] };
  /** ideologia della fazione del giocatore (Destroy, Resist...): quali predefiniti escono */
  ideology?: string | null;
  /** id profilo (stringa) -> candidati che corrispondono */
  matches: Record<string, { id: number; name: string; met: string[] }[]>;
}

const EMPTY: Profile = {
  name: "", enabled: true, severity: "warning", all: [], any: [], none: [], newMissionsOnly: false, fastLearner: false,
  ageMin: null, ageMax: null,
};

/** Due cursori sulla stessa barra, con la fascia fra i due evidenziata. Agli
 *  estremi un lato vale «nessun limite» (null). */
function AgeRange({ d, setD, range }: {
  d: Profile; setD: (f: (x: Profile) => Profile) => void; range: [number, number];
}) {
  const { t } = useSettings();
  const p = t.recruit.profiles;
  const [L, R] = range;
  const lo = d.ageMin ?? L, hi = d.ageMax ?? R;
  const pos = (v: number) => `${((v - L) / (R - L)) * 100}%`;
  const set = (which: "ageMin" | "ageMax", v: number) => setD((x) => {
    const cur = { lo: x.ageMin ?? L, hi: x.ageMax ?? R };
    const nlo = which === "ageMin" ? Math.min(v, cur.hi) : cur.lo;
    const nhi = which === "ageMax" ? Math.max(v, cur.lo) : cur.hi;
    return { ...x, ageMin: nlo === L ? null : nlo, ageMax: nhi === R ? null : nhi };
  });
  // il pollice si prende col mouse, la barra sotto no: i due input si sovrappongono
  const thumb = "absolute inset-0 w-full appearance-none bg-transparent pointer-events-none "
    + "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none "
    + "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full "
    + "[&::-webkit-slider-thumb]:bg-sky-300 [&::-webkit-slider-thumb]:cursor-pointer "
    + "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 "
    + "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-300 [&::-moz-range-thumb]:border-0";
  const any = d.ageMin == null && d.ageMax == null;
  return (
    <span className="flex items-center gap-2 text-[12px]">
      <span className="text-dim">{p.age}</span>
      <span className="relative w-44 h-4 flex items-center">
        <span className="absolute inset-x-0 h-1.5 rounded bg-edge-lit" />
        <span className="absolute h-1.5 rounded bg-sky-300" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
        <input type="range" min={L} max={R} value={lo} aria-label={p.ageFrom}
          onChange={(e) => set("ageMin", Number(e.target.value))} className={thumb} />
        <input type="range" min={L} max={R} value={hi} aria-label={p.ageTo}
          onChange={(e) => set("ageMax", Number(e.target.value))} className={thumb} />
      </span>
      <span className={`tabular-nums w-16 ${any ? "text-faint" : "text-sky-300"}`}>
        {any ? p.ageAny : `${lo}–${hi}`}
      </span>
    </span>
  );
}

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

export type State = "off" | ListKey;
export const NEXT: Record<State, State> = { off: "all", all: "any", any: "none", none: "off" };
export const MARK: Record<State, string> = { off: "", all: "✓ ", any: "◇ ", none: "✕ " };
export const TONE: Record<State, string> = {
  off: "border-edge text-dim hover:text-ink hover:border-edge-lit",
  all: "border-good text-good bg-good/10",
  // azzurro fisso, non l'accent: quello segue il colore della fazione
  any: "border-sky-300 text-sky-300 bg-sky-300/10",
  none: "border-bad text-bad bg-bad/10",
};
/** sezioni dei tratti (il `grouping` del gioco, come nel wiki) messe a righe:
 *  le piccole affiancate, cosi' la griglia sta tutta senza scorrere. I gruppi
 *  che non compaiono qui vanno in una riga prima di quelli senza gruppo. */
const GROUP_ROWS: (number | null)[][] = [[1, 2, 3], [4, 5], [6, 7, 8, 9, 10], [19, 20]];
const GROUP_ORDER: (number | null)[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, null];
const groupRows = (present: (number | null)[]) => {
  const placed = new Set(GROUP_ROWS.flat());
  const rest = present.filter((g) => g != null && !placed.has(g));
  return [...GROUP_ROWS, rest, [null]]
    .map((row) => row.filter((g) => present.includes(g)))
    .filter((row) => row.length);
};
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
  const chip = (tok: string, name: string, tip?: React.ReactNode) => {
    const st = stateOf(tok);
    const button = (
      <button key={tok} onClick={() => setState(tok, NEXT[st])} title={tip ? undefined : p.legend}
        className={`px-1.5 py-[1px] border text-[12px] text-left ${TONE[st]}`}>
        {MARK[st]}{name}
      </button>
    );
    return tip ? <Tip key={tok} title={name} width={320} content={tip}>{button}</Tip> : button;
  };
  /** cosa fa un tratto, come nella scheda del consigliere: un effetto per
   *  riga, con la condizione per esteso, poi la descrizione del gioco */
  const traitTip = (o: Option) => {
    const fx = o.effects ?? [];
    return (
      <>
        {fx.map((e, i) => {
          const f = describe(e, t);
          const when = "when" in e ? conditionText(e.when, t) : null;
          return (
            <div key={i} className={FX_TONE[f.tone]}>
              {f.text}{when && <span className="text-faint"> — {when}</span>}
            </div>
          );
        })}
        {o.description && <p className={`m-0 text-faint italic ${fx.length ? "mt-1.5" : ""}`}>{o.description}</p>}
        {!fx.length && !o.description && <span className="text-faint">—</span>}
      </>
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
        <AgeRange d={d} setD={setD} range={data.options.ageRange ?? [20, 80]} />
        <span className="text-faint text-[11.5px]">{p.legend}</span>
      </div>

      <div className="space-y-3">
        {tab === "traits" && groupRows(groups.map((x) => x.g)).map((row) => (
          <div key={row.join("-")} className="flex flex-wrap gap-x-6 gap-y-3">
            {row.map((g) => {
              const items = groups.find((x) => x.g === g)!.items;
              return (
                // le sezioni con tanti tratti prendono piu' spazio nella riga
                <div key={String(g)} className="min-w-[10rem]" style={{ flex: `${items.length} 1 0` }}>
                  <div className="text-dim text-[11px] uppercase tracking-[.06em] mb-1">{groupName(g)}</div>
                  <div className="flex flex-wrap gap-1.5">{items.map((o) => chip(`trait:${o.id}`, o.name, traitTip(o)))}</div>
                </div>
              );
            })}
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
  const empty = d.all.length === 0 && d.any.length === 0 && !d.fastLearner;
  const label = useLabel(data);
  const ix = indexOf(data);
  const bad = empty ? null : impossible(d, ix);
  const typeName = (id: string) => data.options.types.find((x) => x.id === id)?.name ?? id;
  const chances = empty || bad ? [] : typeChances(d, ix);
  // impossibile per un consigliere generato a caso: forse un predefinito del gioco c'e'
  const presets = bad ? presetMatches(d, data.options.presets) : [];
  const forMe = presets.filter((x) => !data.ideology || x.ideologies.includes(data.ideology));
  const notMe = presets.filter((x) => !forMe.includes(x));
  const who = (xs: typeof presets) => xs.map((x) => `${x.name} (${typeName(x.type)})`).join(", ");
  const rare = chances.length > 0 && chances[0].p * 100 <= RARE_PCT ? chances[0] : null;
  const fastNames = FAST_LEARNERS.map(label).join(` ${p.or} `);
  const partLabel = (tok: string) => (tok === "any" ? p.any : tok === "fast" ? fastNames : label(tok));
  return (
    <div className="border border-accent/50 bg-panel p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">{p.name}
          <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
            placeholder={p.namePlaceholder}
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
        {(["noInspire", "loyaltyLoss"] as const).map((k) => {
          const toks = (data.options.traitSets?.[k] ?? []).map((id) => `trait:${id}`);
          if (!toks.length) return null;
          const on = toks.every((x) => d.none.includes(x));
          // un clic mette tutto il gruppo fra «nessuna» (togliendolo dalle altre
          // liste), il secondo lo toglie; i singoli tratti restano modificabili
          // spegnendo, restano i tratti che anche un altro gruppo acceso esclude
          // (Cynic sta in tutti e due)
          const sets = data.options.traitSets ?? { noInspire: [], loyaltyLoss: [] };
          const keep = (["noInspire", "loyaltyLoss"] as const).filter((o) => o !== k)
            .map((o) => sets[o].map((id) => `trait:${id}`))
            .filter((xs) => xs.length && xs.every((v) => d.none.includes(v))).flat();
          const toggle = () => setD((x) => on
            ? { ...x, none: x.none.filter((v) => !toks.includes(v) || keep.includes(v)) }
            : { ...x, all: x.all.filter((v) => !toks.includes(v)), any: x.any.filter((v) => !toks.includes(v)),
                none: [...x.none, ...toks.filter((v) => !x.none.includes(v))] });
          return (
            <Tip key={k} title={p.sets[k]} width={320} content={
              <><p className="m-0">{p.sets[`${k}Hint`]}</p>
                <p className="m-0 mt-1.5 text-ink">{toks.map(label).join(", ")}</p></>
            }>
              <button type="button" onClick={toggle}
                className={`px-1.5 py-[1px] border text-[12px] ${on ? TONE.none : "border-edge text-dim hover:text-ink"}`}>
                {MARK.none}{p.sets[k]}
              </button>
            </Tip>
          );
        })}
        <label className="flex items-center gap-1.5" title={p.fastHint}>
          <input type="checkbox" checked={!!d.fastLearner}
            onChange={(e) => setD({ ...d, fastLearner: e.target.checked })} />
          {p.fastLearner.replace("{names}", fastNames)}
        </label>
      </div>
      <ConditionGrid d={d} setD={setD} data={data} />
      {empty && <p className="text-warn text-[12px] m-0">{p.needCondition}</p>}
      {bad && forMe.length > 0 && (
        <p className="text-warn text-[12px] m-0">
          <span aria-hidden className="mr-1">⚠</span>
          {p.presetOnly.replace("{who}", who(forMe))}
          {" "}<span className="text-dim">{p.presetOnlyHint}</span>
        </p>
      )}
      {bad && !forMe.length && (
        <p className="text-warn text-[12px] m-0">
          <span aria-hidden className="mr-1">⚠</span>
          {(bad.anyPart ? (bad.tokens.length ? p.impossibleAny : p.impossibleAnyAlone)
            : bad.tokens.length === 1 ? p.impossibleOne
            : p.impossible).replace("{items}", bad.tokens.map(label).join(" + "))}
          {" "}<span className="text-dim">
            {notMe.length ? p.presetNotMine.replace("{who}", who(notMe)) : p.impossibleHint}
          </span>
        </p>
      )}
      {rare && (
        <p className="text-warn text-[12px] m-0">
          <span aria-hidden className="mr-1">⚠</span>
          {p.rare.replace("{type}", typeName(rare.type)).replace("{p}", fmtPct(rare.p))}
          {" "}({rare.parts.map(([tok, v]) => `${partLabel(tok)} ${fmtPct(v)}`).join(" · ")}).
          {" "}<span className="text-dim">{p.rareHint}</span>
        </p>
      )}
      {chances.length > 0 && (
        <p className="text-faint text-[12px] m-0">
          {p.possibleTypes} {chances.map((c) => `${typeName(c.type)} ${fmtPct(c.p)}`).join(", ")}
        </p>
      )}
      {err && <p className="text-bad text-[12px] m-0">{err}</p>}
      <div className="flex gap-2">
        <Button tone="primary" disabled={empty}
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
    .map(([k, title]) => `${title}: ${pr[k].map(label).join(", ")}`)
    .concat(pr.fastLearner ? [p.fastLearner.replace("{names}", FAST_LEARNERS.map(label).join(` ${p.or} `))] : [])
    .join(" · ");

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
              <span className="font-semibold">{pr.label ?? pr.name}</span>
              <Tag tone={pr.severity === "warning" ? "warn" : "dim"}>
                {pr.severity === "warning" ? p.severityWarning : p.severityInfo}
              </Tag>
              <span className="text-dim">{summary(pr)}{pr.newMissionsOnly ? ` · ${p.newOnlyShort}` : ""}
                {pr.ageMin != null || pr.ageMax != null
                  ? ` · ${p.age} ${pr.ageMin ?? data.options.ageRange[0]}–${pr.ageMax ?? data.options.ageRange[1]}` : ""}</span>
              <span className={hits.length ? "text-good" : "text-faint"}>
                {!pr.enabled ? p.off : hits.length
                  ? `${p.matchesNow}: ${hits.map((h) => h.name).join(", ")}` : p.noMatches}
              </span>
              <span className="ml-auto flex gap-2">
                <button onClick={() => setEditing(pr)} className="text-dim hover:text-ink underline">{p.edit}</button>
                <button onClick={() => { if (window.confirm(p.confirmDelete.replace("{name}", pr.label ?? pr.name))) void send(`/api/profiles/${pr.id}`, "DELETE"); }}
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
