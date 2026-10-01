"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { api, useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, ResourceIcon, Stat, Tag, nf, pct } from "@/components/ui";
import { Guide } from "@/components/Guide";
import { Tip, TipRow } from "@/components/Tip";

type ResKey = "water" | "volatiles" | "metals" | "nobles" | "fissiles";
interface Res { id: ResKey; name: string; icon: string | null; price: number }
interface FactionRef { name: string; template: string | null; colors: { accent?: string | null } | null }
interface Yield { value: number; min?: number; max?: number }
interface Site {
  id: string; name: string; profile: string;
  body: { id: string; name: string; type: string | null; au: number | null };
  prospected: boolean; probeEnRoute: boolean; reachable: boolean;
  yields: Record<ResKey, Yield>; value: number;
  occupant: (FactionRef & { mine: boolean }) | null;
}
interface Priority { id: string; name: string; icon: string | null; bonus: number }
interface Org {
  id: number; name: string; tier: number; type: string | null; homeNation: string | null;
  bonuses: { miningBonus: number; MCBonus: number; spaceDevBonus: number; spaceflightBonus: number };
  priorities: Priority[];
  boost: number; missionControl: number;
  cost: { money: number; influence: number; ops: number; boost: number };
  where: "mine" | "market" | "rival";
  owner: (Partial<FactionRef> & { councilor?: string }) | null;
}
interface LaunchWindow { penalty: number; rising: boolean; date: string; synodicDays: number }
interface LaunchBody {
  id: string; name: string; sites: number; free: number; reachable: boolean;
  window: LaunchWindow | null; outpostBoost?: number | null;
}
interface Watch { band: [number, number]; bodies: Record<string, { boost: boolean }> }
interface Mining {
  launch: LaunchBody[];
  watch: Watch;
  boost: number;
  resources: Res[];
  sites: Site[];
  prospectedBodies: number;
  orgs: Org[];
  orgMiningBonus: number;
  labels: { miningBonus: string | null };
  thresholds: { prospected: number; councilor: number; faction: number };
}

type SortKey = "site" | "body" | "au" | "window" | "value" | "status" | "occupied" | ResKey;
// testo in ordine alfabetico, numeri dal piu' grande
const ASC_FIRST: SortKey[] = ["site", "body", "au", "window", "occupied"];
const LIMIT = 40;

const digits = (v: number) => (v < 1 ? 2 : v < 10 ? 1 : 0);

/** Resa di una risorsa: vera se il corpo e' prospettato, altrimenti la
    forchetta minima–massima, che e' quello che mostra il gioco. */
function YieldCell({ y, site, res }: { y: Yield; site: Site; res: Res }) {
  const { t } = useSettings();
  const m = t.mining;
  if (site.prospected) {
    return y.value < 0.005 ? <span className="text-faint">—</span> : <>{nf(y.value, digits(y.value))}</>;
  }
  const lo = y.min ?? 0, hi = y.max ?? 0;
  if (hi < 0.005) return <span className="text-faint">—</span>;
  return (
    <Tip title={`${res.name} · ${site.name}`} width={300} content={
      <>
        <TipRow strong label={m.range} value={`${nf(lo, 2)} – ${nf(hi, 2)}`} />
        <TipRow label={m.expected} value={nf(y.value, 2)} />
        <p className="m-0 mt-1.5 text-faint">{m.estimateHint}</p>
      </>
    }>
      <span className="text-dim">{nf(lo, digits(hi))}–{nf(hi, digits(hi))}</span>
    </Tip>
  );
}

function ValueCell({ site, res }: { site: Site; res: Res[] }) {
  const { t } = useSettings();
  const m = t.mining;
  return (
    <Tip title={`${site.name} · ${m.value}`} width={320} content={
      <>
        {res.map((r) => {
          const v = site.yields[r.id].value;
          return v ? <TipRow key={r.id} label={`${r.name} ${nf(v, 2)} × ${nf(r.price, 1)}`} value={nf(v * r.price, 1)} /> : null;
        })}
        <TipRow strong label={m.value} value={nf(site.value, 1)} />
        <p className="m-0 mt-1.5 text-faint">{m.valueHint}</p>
      </>
    }>
      <span className={site.prospected ? "text-ink" : "text-dim"}>{site.prospected ? "" : "≈ "}{nf(site.value, 0)}</span>
    </Tip>
  );
}

function Status({ s }: { s: Site }) {
  const { t } = useSettings();
  const m = t.mining;
  if (!s.reachable) return <Tip title={m.unreachable} content={m.unreachableHint}><span className="text-faint">{m.unreachable}</span></Tip>;
  if (s.prospected) return <span className="text-good">{m.prospected}</span>;
  if (s.probeEnRoute) return <span className="text-warn">{m.probe}</span>;
  return <Tip title={m.estimate} content={m.estimateHint}><span className="text-dim">{m.estimate}</span></Tip>;
}

function FactionName({ f, extra }: { f: Partial<FactionRef>; extra?: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 border-l-2 pl-1.5 whitespace-nowrap"
      style={{ borderColor: f.colors?.accent ?? "var(--edge-lit)" }}>
      {f.name}{extra}
    </span>
  );
}

/** Intestazione ordinabile: un clic ordina, il secondo inverte. */
function Th({ k, sort, asc, onSort, right, last, hint, children }: {
  k: SortKey; sort: SortKey; asc: boolean; onSort: (k: SortKey) => void;
  right?: boolean; last?: boolean; hint?: string; children: React.ReactNode;
}) {
  const active = k === sort;
  const button = (
    <button type="button" onClick={() => onSort(k)}
      className={`whitespace-nowrap hover:text-ink ${active ? "text-accent" : ""}`}>
      {children}{active ? (asc ? " ▲" : " ▼") : ""}
    </button>
  );
  return (
    <th className={`font-normal pb-1.5 ${last ? "" : "pr-3"} ${right ? "text-right" : ""}`}
      aria-sort={active ? (asc ? "ascending" : "descending") : undefined}>
      {hint ? <Tip title={children} content={hint}>{button}</Tip> : button}
    </th>
  );
}

/** Penalita' col segno sulla linea del tempo: negativa prima della finestra
 *  (il gioco: freccia verde), positiva dopo (freccia rossa). Come watch.py. */
const position = (w: LaunchWindow) => (w.rising ? 1 : -1) * w.penalty * 100;
const inBand = (w: LaunchWindow | null, band: [number, number]) =>
  !!w && position(w) >= band[0] - 1e-6 && position(w) <= band[1] + 1e-6;

/** La finestra di lancio dalla Terra, come la mostra il gioco: percentuale e freccia. */
function WindowCell({ b, band, boost }: { b: LaunchBody | undefined; band: [number, number]; boost: number }) {
  const { t } = useSettings();
  const m = t.mining;
  if (!b?.window) return <span className="text-faint">—</span>;
  const w = b.window;
  return (
    <Tip title={`${b.name} · ${m.window}`} width={300} content={
      <>
        <TipRow strong label={m.windowPenalty} value={`${nf(w.penalty * 100, 0)}%`} />
        <TipRow label={m.windowNext} value={w.date} />
        <TipRow label={m.windowSynodic} value={`${nf(w.synodicDays, 0)} ${m.windowDays}`} />
        {b.outpostBoost != null && (
          <TipRow label={m.outpostBoost} value={<span className={boost >= b.outpostBoost ? "text-good" : "text-bad"}>
            {nf(b.outpostBoost, 1)} / {nf(boost, 1)}</span>} />
        )}
        <p className="m-0 mt-1.5 text-faint">{w.rising ? m.windowRising : m.windowFalling}</p>
        {b.outpostBoost != null && <p className="m-0 mt-1.5 text-faint">{m.outpostBoostHint}</p>}
      </>
    }>
      <span className={`whitespace-nowrap tabular-nums ${inBand(w, band) ? "text-sky-300" : ""}`}>
        {nf(w.penalty * 100, 0)}%{" "}
        <span className={w.rising ? "text-bad" : "text-good"}>{w.rising ? "↑" : "↓"}</span>
      </span>
    </Tip>
  );
}

/** Campanella del corpo: spenta → avvisa → avvisa anche per la spinta → spenta. */
function WatchButton({ b, watch, onSet }: {
  b: LaunchBody | undefined; watch: Watch; onSet: (id: string, v: { boost: boolean } | null) => void;
}) {
  const { t } = useSettings();
  const m = t.mining;
  if (!b?.window) return null;
  const cur = watch.bodies[b.id];
  const next = !cur ? { boost: false } : !cur.boost ? { boost: true } : null;
  const label = !cur ? m.watchOff : cur.boost ? m.watchBoost : m.watchOn;
  return (
    <Tip title={`${b.name} · ${label}`} width={300} content={
      <>
        <p className="m-0">{m.watchHint}</p>
        <p className="m-0 mt-1.5 text-faint">{m.watchCycle}</p>
      </>
    }>
      <button type="button" onClick={() => onSet(b.id, next)} aria-label={label}
        className={`ml-1.5 text-[12px] leading-none ${cur ? "text-sky-300" : "text-faint opacity-50 hover:opacity-100"}`}>
        {cur ? "🔔" : "🔕"}{cur?.boost ? "🚀" : ""}
      </button>
    </Tip>
  );
}

/** Banda della finestra: due cursori da −50% (finestra lontana, in arrivo) a
 *  +50% (lontana, passata). Lo zero e' la finestra. */
function WindowBand({ band, setBand }: { band: [number, number]; setBand: (b: [number, number]) => void }) {
  const { t } = useSettings();
  const m = t.mining;
  const L = -50, R = 50;
  const [lo, hi] = band;
  const pos = (v: number) => `${((v - L) / (R - L)) * 100}%`;
  const thumb = "absolute inset-0 w-full appearance-none bg-transparent pointer-events-none "
    + "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none "
    + "[&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full "
    + "[&::-webkit-slider-thumb]:bg-sky-300 [&::-webkit-slider-thumb]:cursor-pointer "
    + "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 "
    + "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-sky-300 [&::-moz-range-thumb]:border-0";
  const fmt = (v: number) => `${v > 0 ? "+" : ""}${v}%`;
  return (
    <Tip title={m.bandTitle} width={340} content={<><p className="m-0">{m.bandHint}</p></>}>
      <span className="flex items-center gap-2 text-[12px]">
        <span className="text-dim">{m.band}</span>
        <span className="text-faint text-[11px]">{m.bandBefore}</span>
        <span className="relative w-48 h-4 flex items-center">
          <span className="absolute inset-x-0 h-1.5 rounded bg-edge-lit" />
          <span className="absolute h-1.5 rounded bg-sky-300" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` }} />
          <span className="absolute w-px h-3 bg-ink/60" style={{ left: pos(0) }} />
          <input type="range" min={L} max={R} value={lo} aria-label={m.bandFrom}
            onChange={(e) => setBand([Math.min(Number(e.target.value), hi), hi])} className={thumb} />
          <input type="range" min={L} max={R} value={hi} aria-label={m.bandTo}
            onChange={(e) => setBand([lo, Math.max(Number(e.target.value), lo)])} className={thumb} />
        </span>
        <span className="text-faint text-[11px]">{m.bandAfter}</span>
        <span className="tabular-nums text-sky-300 whitespace-nowrap">{fmt(lo)} … {fmt(hi)}</span>
      </span>
    </Tip>
  );
}

function Sites({ data, reload }: { data: Mining; reload: () => void }) {
  const { t } = useSettings();
  const m = t.mining;
  const [sort, setSort] = useState<SortKey>("value");
  const [asc, setAsc] = useState(false);
  const sortBy = (k: SortKey) => {
    if (k === sort) setAsc(!asc);
    else { setSort(k); setAsc(ASC_FIRST.includes(k)); }
  };
  const [q, setQ] = useState("");
  const [reachable, setReachable] = useState(true);
  const [hideOccupied, setHideOccupied] = useState(false);
  const [all, setAll] = useState(false);
  const { game, refreshAlerts } = useSettings();
  const launch = useMemo(() => Object.fromEntries(data.launch.map((b) => [b.id, b])), [data.launch]);

  // corpi sorvegliati e banda: si salvano interi (PUT /api/mining/watch). La
  // banda aspetta che il cursore si fermi, per non scrivere a ogni pixel.
  const [watch, setWatch] = useState<Watch>(data.watch);
  useEffect(() => setWatch(data.watch), [data.watch]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveWatch = (w: Watch, delay = 0) => {
    setWatch(w);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void api(`/api/mining/watch?lang=${game}`, { method: "PUT", body: JSON.stringify(w) })
        .then(() => { refreshAlerts(); reload(); });
    }, delay);
  };
  const setBody = (id: string, v: { boost: boolean } | null) => {
    const bodies = { ...watch.bodies };
    if (v) bodies[id] = v; else delete bodies[id];
    saveWatch({ ...watch, bodies });
  };
  const watched = data.launch.filter((b) => watch.bodies[b.id]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const xs = data.sites.filter((s) =>
      (!reachable || s.reachable)
      && (!hideOccupied || !s.occupant)
      && (!needle || s.name.toLowerCase().includes(needle) || s.body.name.toLowerCase().includes(needle)));
    const key = (s: Site): number | string => {
      switch (sort) {
        case "site": return s.name;
        case "body": return s.body.name;
        case "au": return s.body.au ?? Infinity;
        case "window": { const w = launch[s.body.id]?.window; return w ? position(w) : Infinity; }
        case "value": return s.value;
        case "status": return s.prospected ? 3 : s.probeEnRoute ? 2 : s.reachable ? 1 : 0;
        case "occupied": return s.occupant?.name ?? "￿";   // i liberi in fondo
        default: return s.yields[sort].value;
      }
    };
    const dir = asc ? 1 : -1;
    return xs.sort((a, b) => {
      const ka = key(a), kb = key(b);
      const c = typeof ka === "string" ? ka.localeCompare(kb as string) : ka - (kb as number);
      return c * dir || b.value - a.value;
    });
  }, [data.sites, sort, asc, q, reachable, hideOccupied, launch]);
  const shown = all ? rows : rows.slice(0, LIMIT);
  const th = { sort, asc, onSort: sortBy };

  return (
    <Panel title={m.sitesTitle}>
      <div className="flex gap-2.5 flex-wrap items-center mb-3">
        <input type="search" placeholder={m.filter} value={q}
          onChange={(e) => setQ(e.target.value)} className="min-w-[220px]" />
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={reachable} onChange={(e) => setReachable(e.target.checked)} className="p-0" />
          {m.onlyReachable}
        </label>
        <label className="flex items-center gap-1.5 text-dim text-[12.5px] cursor-pointer">
          <input type="checkbox" checked={hideOccupied} onChange={(e) => setHideOccupied(e.target.checked)} className="p-0" />
          {m.hideOccupied}
        </label>
        <Tip title={m.prices} content={
          <>{data.resources.map((r) => <TipRow key={r.id} label={r.name} value={nf(r.price, 2)} />)}</>
        }>
          <span className="text-faint text-[11.5px] underline decoration-dotted">{m.prices}</span>
        </Tip>
      </div>
      <div className="flex gap-x-4 gap-y-1.5 flex-wrap items-center mb-3">
        <WindowBand band={watch.band} setBand={(b) => saveWatch({ ...watch, band: b }, 500)} />
        <span className="text-faint text-[11.5px]">
          {watched.length
            ? `${m.watching}: ${watched.map((b) => b.name + (watch.bodies[b.id].boost ? " 🚀" : "")).join(", ")}`
            : m.watchingNone}
        </span>
      </div>

      {!rows.length ? <Empty>{m.none}</Empty> : (
        <div className="overflow-x-auto">
          <table className="text-[12px] w-full border-collapse">
            <thead>
              <tr className="text-left text-faint">
                <Th k="site" {...th}>{m.site}</Th>
                <Th k="body" {...th}>{m.body}</Th>
                <Th k="au" right hint={m.auHint} {...th}>{m.au}</Th>
                <Th k="window" hint={m.windowHint} {...th}>{m.window}</Th>
                {data.resources.map((r) => (
                  <Th key={r.id} k={r.id} right hint={m.yieldHint} {...th}>{r.name}</Th>
                ))}
                <Th k="value" right hint={m.valueHint} {...th}>{m.value}</Th>
                <Th k="status" {...th}>{m.status}</Th>
                <Th k="occupied" last {...th}>{m.occupied}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => (
                <tr key={s.id} className={`border-t border-edge align-top ${s.occupant?.mine ? "bg-sel/40" : ""}`}>
                  <td className="py-1.5 pr-3">
                    <div className="whitespace-nowrap">{s.name}</div>
                    <div className="text-faint text-[11px]">{s.profile}</div>
                  </td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {s.body.name}
                    <WatchButton b={launch[s.body.id]} watch={watch} onSet={setBody} />
                  </td>
                  <td className="py-1.5 pr-3 text-right text-faint">{s.body.au != null ? nf(s.body.au, s.body.au < 10 ? 2 : 0) : "—"}</td>
                  <td className="py-1.5 pr-3"><WindowCell b={launch[s.body.id]} band={watch.band} boost={data.boost} /></td>
                  {data.resources.map((r) => (
                    <td key={r.id} className="py-1.5 pr-3 text-right whitespace-nowrap">
                      <YieldCell y={s.yields[r.id]} site={s} res={r} />
                    </td>
                  ))}
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap"><ValueCell site={s} res={data.resources} /></td>
                  <td className="py-1.5 pr-3 whitespace-nowrap"><Status s={s} /></td>
                  <td className="py-1.5">
                    {s.occupant ? <FactionName f={s.occupant} extra={s.occupant.mine && <Tag tone="mine">{t.space.you}</Tag>} /> : <span className="text-faint">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > LIMIT && (
        <button type="button" className="mt-2 text-accent text-[12px]" onClick={() => setAll(!all)}>
          {all ? m.showLess : m.showAll.replace("{n}", String(rows.length))}
        </button>
      )}
    </Panel>
  );
}

function Orgs({ data }: { data: Mining }) {
  const { t } = useSettings();
  const m = t.mining;
  if (!data.orgs.length) return <Panel title={m.orgsTitle}><Empty>{m.noOrgs}</Empty></Panel>;
  return (
    <Panel title={m.orgsTitle}>
      <p className="text-faint text-[11.5px] mb-2">{m.orgsSub}</p>
      <div className="overflow-x-auto">
        <table className="text-[12px] w-full border-collapse">
          <thead>
            <tr className="text-left text-faint">
              <th className="font-normal pb-1.5 pr-3">{m.org}</th>
              <th className="font-normal pb-1.5 pr-3">{m.where}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.tier}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">
                {data.labels.miningBonus
                  ? <Tip title={m.mining} content={data.labels.miningBonus}>{m.mining}</Tip>
                  : m.mining}
              </th>
              <th className="font-normal pb-1.5 pr-3">{m.priorities}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.boost}</th>
              <th className="font-normal pb-1.5 pr-3 text-right">{m.mc}</th>
              <th className="font-normal pb-1.5">{m.cost}</th>
            </tr>
          </thead>
          <tbody>
            {data.orgs.map((o) => (
              <tr key={o.id} className={`border-t border-edge align-top ${o.where === "mine" ? "bg-sel/40" : ""}`}>
                <td className="py-1.5 pr-3">
                  <div>{o.name}</div>
                  {o.homeNation && <div className="text-faint text-[11px]">{o.homeNation}</div>}
                </td>
                <td className="py-1.5 pr-3">
                  {o.where === "mine" && (
                    <span className="inline-flex items-center gap-1.5"><Tag tone="mine">{m.yours}</Tag>
                      <span className="text-dim">{o.owner?.councilor ?? m.unassigned}</span></span>
                  )}
                  {o.where === "market" && <Tag tone="free">{m.market}</Tag>}
                  {o.where === "rival" && o.owner && (
                    <div className="flex flex-col gap-0.5">
                      <FactionName f={o.owner} />
                      <span className="text-dim text-[11px]">{o.owner.councilor ?? m.unassigned}</span>
                      <Tip title={m.takeover} content={m.takeoverHint}><Tag tone="warn">{m.takeover}</Tag></Tip>
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3 text-right">{o.tier}</td>
                <td className={`py-1.5 pr-3 text-right ${o.bonuses.miningBonus ? "text-good" : "text-faint"}`}>
                  {o.bonuses.miningBonus ? `+${pct(o.bonuses.miningBonus, 0)}` : "—"}
                </td>
                <td className="py-1.5 pr-3">
                  {o.priorities.length ? (
                    <span className="inline-flex flex-wrap gap-x-2.5 gap-y-0.5">
                      {o.priorities.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 whitespace-nowrap">
                          {p.icon && <ResourceIcon icon={p.icon} size={12} />}
                          <span className="text-dim">{p.name}</span> +{pct(p.bonus, 0)}
                        </span>
                      ))}
                    </span>
                  ) : <span className="text-faint">—</span>}
                </td>
                <td className={`py-1.5 pr-3 text-right ${o.boost ? "text-good" : "text-faint"}`}>
                  {o.boost ? `+${nf(o.boost, 1)}` : "—"}
                </td>
                <td className={`py-1.5 pr-3 text-right ${o.missionControl ? "text-good" : "text-faint"}`}>
                  {o.missionControl ? `+${nf(o.missionControl, 0)}` : "—"}
                </td>
                <td className="py-1.5 whitespace-nowrap">
                  {o.where === "market" ? (
                    <span className="inline-flex gap-2.5">
                      {o.cost.influence > 0 && <span><ResourceIcon icon="ICO_influence" size={12} /> {nf(o.cost.influence, 0)}</span>}
                      {o.cost.money > 0 && <span><ResourceIcon icon="ICO_currency" size={12} /> {nf(o.cost.money, 0)}</span>}
                    </span>
                  ) : <span className="text-faint">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

export default function MiningPage() {
  const { t, game, live } = useSettings();
  const { data, error, reload } = useApi<Mining>(`/api/mining?lang=${game}`, [live.version, game]);
  if (error) return <Empty>{error}</Empty>;
  if (!data) return <Empty>{t.common.loading}</Empty>;
  const m = t.mining;
  const reachable = data.sites.filter((s) => s.reachable).length;

  return (
    <>
      <Panel title={m.title}
        right={
          <Guide title={m.title} sections={[
            { body: [m.guideIntro] },
            { title: m.guideValueTitle, body: [m.guideValue] },
            { title: m.guideOrgsTitle, body: [m.guideOrgs
              .replace("{councilor}", nf(data.thresholds.councilor, 2))
              .replace("{faction}", nf(data.thresholds.faction, 2))] },
          ]} />
        }>
        <p className="text-faint text-[11.5px] mb-3">{m.sub}</p>
        <div className="flex flex-wrap gap-2">
          <Stat label={m.statProspected} value={data.prospectedBodies} />
          <Stat label={m.statReachable} value={`${reachable}/${data.sites.length}`} />
          <Stat label={m.statBonus} tone={data.orgMiningBonus ? "mine" : "accent"}
            value={`+${pct(data.orgMiningBonus, 0)}`} />
        </div>
      </Panel>
      <Sites data={data} reload={reload} />
      <Orgs data={data} />
    </>
  );
}
