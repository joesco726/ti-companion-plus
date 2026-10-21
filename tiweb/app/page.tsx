"use client";

import { useState } from "react";
import { api, useApi, useSnapshot } from "@/lib/api";
import { ResearchPanel } from "@/components/ResearchPanel";
import { useSettings } from "@/lib/settings";
import { GAME_LOCALES } from "@/lib/i18n";
import { Bars, Empty, MissionIcon, Panel, ResourceIcon, Tag, nf, gameAgo } from "@/components/ui";
import { Tip } from "@/components/Tip";
import type { Alert, Snapshot } from "@/lib/types";

/** Opzioni di visualizzazione (Service.options): stanno nel database del
 *  companion, perche' le allerte si calcolano nel motore. */
interface Options { orgAlerts: boolean; alienSitesLastYear: boolean }

function useOptions() {
  const { refreshAlerts } = useSettings();
  const { data, reload } = useApi<Options>("/api/options");
  // la casella cambia subito, senza aspettare la risposta del motore
  const [local, setLocal] = useState<Partial<Options>>({});
  const set = async (patch: Partial<Options>) => {
    setLocal((l) => ({ ...l, ...patch }));
    await api("/api/options", { method: "PUT", body: JSON.stringify(patch) });
    reload();
    if ("orgAlerts" in patch) refreshAlerts();
  };
  return { opts: data && { ...data, ...local }, set };
}

/** Casella piccola nell'intestazione di un pannello, con la spiegazione al passaggio. */
function OptionToggle({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <Tip title={label} width={320} content={<p className="m-0">{hint}</p>}>
      <label className="flex items-center gap-1.5 text-faint text-[11.5px] cursor-pointer">
        <input type="checkbox" className="p-0" checked={checked}
          onChange={(e) => onChange(e.target.checked)} />
        {label}
      </label>
    </Tip>
  );
}

/** L'allerta su ogni org acquistabile: con i profili delle org, spesso rumore. */
function OrgAlertsToggle() {
  const { t } = useSettings();
  const { opts, set } = useOptions();
  if (!opts) return null;
  return (
    <OptionToggle label={t.overview.orgAlerts} hint={t.overview.orgAlertsHint}
      checked={opts.orgAlerts} onChange={(v) => { void set({ orgAlerts: v }); }} />
  );
}

/** Siti alieni dell'ultimo anno di gioco, se l'opzione e' accesa. */
const ALIEN_RECENT_DAYS = 365;

const TONE = {
  critical: { border: "border-bad", text: "text-bad" },
  warning: { border: "border-warn", text: "text-warn" },
  info: { border: "border-accent", text: "text-accent" },
} as const;

/** Una voce di flusso: icona della risorsa, nome tradotto, valore firmato. */
function Flow({ snap, k, v, bold }: {
  snap: Snapshot; k: string; v: number; bold?: boolean;
}) {
  const r = snap.flows.resources?.[k];
  return (
    <span className={`flex items-baseline gap-1 ${v < 0 ? "text-bad" : "text-good"}
                      ${bold ? "font-semibold" : ""}`}>
      <ResourceIcon icon={r?.icon} size={14} title={r?.name ?? k} />
      <span className="text-dim">{r?.name ?? k}</span>
      {v > 0 ? "+" : ""}{nf(v)}
    </span>
  );
}

// a fine partita i siti sono un centinaio: in colonna allungavano la pagina
// di metri. Contano gli ultimi, a cui non hai ancora reagito; gli altri a
// richiesta, su piu' colonne
const RECENT_SITES = 6;

type SiteSort = "date" | "name" | "nation";
type Site = Snapshot["alienSites"][number];

function SiteRow({ s, snap, game, label }: { s: Site; snap: Snapshot; game: string; label: string }) {
  return (
    <div className="flex justify-between items-baseline gap-3">
      <span>{label}</span>
      <span className="flex items-baseline gap-2">
        <span className="text-faint text-[11.5px]">
          {gameAgo(s.sinceKey, snap.dateKey, GAME_LOCALES[game] ?? "en")}
        </span>
        <Tag tone="warn">{s.since}</Tag>
      </span>
    </div>
  );
}

function AlienSites({ snap }: { snap: Snapshot }) {
  const { t, game } = useSettings();
  const { opts, set } = useOptions();
  const [all, setAll] = useState(false);
  const [sort, setSort] = useState<SiteSort>("date");
  const loc = GAME_LOCALES[game] ?? "en";
  const lastYear = !!opts?.alienSitesLastYear;
  const now = Date.parse(snap.dateKey);
  const shown = lastYear
    ? snap.alienSites.filter((s) => !(now - Date.parse(s.sinceKey) > ALIEN_RECENT_DAYS * 86_400_000))
    : snap.alienSites;
  const older = snap.alienSites.length - shown.length;
  const more = shown.length > RECENT_SITES;
  // dal backend arrivano gia' dal piu' recente
  const sorted = sort === "name"
    ? [...shown].sort((a, b) => a.region.localeCompare(b.region, loc))
    : shown;
  const sites = all ? sorted : sorted.slice(0, RECENT_SITES);
  // per nazione: prima chi ne ha di piu', dentro ogni gruppo dal piu' recente
  const groups = new Map<string, Site[]>();
  if (sort === "nation") {
    for (const s of shown) {
      const k = s.nation ?? "?";
      groups.set(k, [...(groups.get(k) ?? []), s]);
    }
  }
  const byNation = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], loc));
  const grid = "grid gap-x-6 gap-y-1.5 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]";
  return (
    <Panel title={t.overview.alienSites} right={opts && (
      <OptionToggle label={t.overview.alienSitesLastYear} hint={t.overview.alienSitesLastYearHint}
        checked={lastYear} onChange={(v) => { void set({ alienSitesLastYear: v }); }} />
    )}>
      {more && (
        <div className="flex gap-1 mb-2 text-[12px]">
          {(["date", "name", "nation"] as SiteSort[]).map((k) => (
            <button key={k} type="button"
              onClick={() => { setSort(k); if (k !== "date") setAll(true); }}
              className={`px-2 py-0.5 border cursor-pointer ${sort === k
                ? "border-accent text-accent" : "border-edge text-dim hover:text-ink"}`}>
              {t.overview.alienSitesSort[k]}
            </button>
          ))}
        </div>
      )}
      {sort === "nation" ? (
        <div className={`text-[12.5px] ${grid}`}>
          {byNation.map(([nation, list]) => (
            <div key={nation} className="flex flex-col gap-1">
              <div className="flex justify-between items-baseline border-b border-edge pb-0.5 font-semibold">
                <span>{nation}</span><span className="text-faint">{list.length}</span>
              </div>
              {list.map((s) => (
                <SiteRow key={s.region} s={s} snap={snap} game={game} label={s.regionName ?? s.region} />
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className={`text-[12.5px] ${all ? grid : "flex flex-col gap-1.5"}`}>
          {sites.map((s) => <SiteRow key={s.region} s={s} snap={snap} game={game} label={s.region} />)}
        </div>
      )}
      {more && (
        <button type="button" onClick={() => { setAll(!all); if (all) setSort("date"); }}
          className="mt-2 text-[12px] text-accent hover:underline cursor-pointer">
          {all ? t.overview.alienSitesRecent : t.overview.alienSitesAll.replace("{n}", String(shown.length))}
        </button>
      )}
      {older > 0 && (
        <p className="mt-2 mb-0 text-faint text-[12px]">
          {t.overview.alienSitesOlder.replace("{n}", String(older))}
        </p>
      )}
    </Panel>
  );
}

function AlertCard({ a, label }: { a: Alert; label: string }) {
  const tone = TONE[a.severity];
  return (
    <div className={`border-l-[3px] ${tone.border} bg-panel px-3 py-2 mb-[2px]`}>
      {/* il colore del filetto dice gia' la severita': l'etichetta compare solo
          quando è qualcosa di più di un'informazione */}
      <div className="flex items-baseline gap-2">
        <span className={`font-semibold text-[13px] ${
          a.severity === "info" ? "" : tone.text}`}>{a.title}</span>
        {a.severity !== "info" && (
          <span className={`text-[10.5px] uppercase tracking-[.06em] ${tone.text}`}
            title={label}>{label}</span>
        )}
      </div>
      <p className="text-dim text-[12px] mt-0.5 mb-0">{a.detail}</p>
    </div>
  );
}

export default function Overview() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;

  const net = snap.flows.net;
  const active = snap.projects.items.filter((p) => p.active);
  const cps = Object.entries(snap.controlPoints.byNation).sort((a, b) => b[1] - a[1]);
  const cap = snap.controlPoints.capacity;

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div>
          <Panel title={t.overview.alerts} right={<OrgAlertsToggle />}
            sub={live.alerts.length ? undefined : t.overview.noAlerts}>
            {live.alerts.length === 0
              ? null
              : live.alerts.map((a) => (
                <AlertCard key={a.id} a={a} label={t.severity[a.severity]} />
              ))}
          </Panel>

          <Panel title={t.overview.flows}
            sub={`${String(snap.flows.month).padStart(2, "0")}/${snap.flows.year}`}>
            <div className="flex flex-col gap-1.5">
              {Object.entries(snap.flows.byCategory).map(([cat, vals]) => {
                const meta = snap.flows.categories?.find((c) => c.id === cat);
                return (
                  <div key={cat} className="flex gap-3 text-[12.5px] items-baseline">
                    <span className="w-56 shrink-0 truncate flex items-baseline gap-1.5">
                      <MissionIcon icon={meta?.icon} size={15} title={meta?.name ?? cat} />
                      {meta?.kind === "unresolved" ? (
                        // il salvataggio scrive un hash, non un id risolvibile:
                        // dirlo è più onesto che inventare un nome
                        <span className="text-faint italic" title={t.common.code.replace("{code}", cat)}>
                          {t.overview.flowUnresolved}
                        </span>
                      ) : (
                        <span className="text-dim">{meta?.name ?? cat}</span>
                      )}
                    </span>
                    <span className="flex gap-3 flex-wrap">
                      {Object.entries(vals)
                        .filter(([, v]) => Math.abs(v) > 0.05)
                        .map(([k, v]) => <Flow key={k} snap={snap} k={k} v={v} />)}
                    </span>
                  </div>
                );
              })}
              <div className="border-t border-edge mt-1 pt-2 flex gap-3 text-[12.5px]">
                <span className="w-56 shrink-0 font-semibold">{t.overview.net}</span>
                <span className="flex gap-3 flex-wrap">
                  {Object.entries(net)
                    .filter(([, v]) => Math.abs(v) > 0.05)
                    .map(([k, v]) => <Flow key={k} snap={snap} k={k} v={v} bold />)}
                </span>
              </div>
            </div>
          </Panel>

          <Panel title={t.overview.controlPoints}>
            <Bars rows={cps} value={(r) => r[1]}
              label={(r) => snap.controlPoints.names?.[r[0]] ?? r[0]}
              format={(r) => String(r[1])} highlight={() => true} />
            {cap && (
              <div className="mt-4 text-[12.5px]" title={t.overview.cpCapHint
                .replace("{base}", String(cap.base)).replace("{councilors}", String(cap.councilors))
                .replace("{effects}", String(cap.effects))}>
                <div className="flex items-baseline justify-between">
                  <span className="text-faint">{t.overview.cpCap}</span>
                  <span>
                    <span className="display text-[15px]">{nf(cap.used, 1)}</span>
                    <span className="text-faint"> / {cap.cap}</span>
                  </span>
                </div>
                {/* barra: usato vs tetto; oltre il tetto diventa rossa */}
                <div className="h-2 bg-bar-deep mt-1.5 relative overflow-hidden">
                  <div className={`absolute inset-y-0 left-0 ${cap.free < 0 ? "bg-bad" : "bg-accent"}`}
                    style={{ width: `${Math.min(100, (cap.used / Math.max(cap.cap, 1)) * 100)}%` }} />
                </div>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-faint">{cap.free < 0 ? t.overview.cpCapOver : t.overview.cpCapLeft}</span>
                  <span className={`display text-[18px] ${cap.free < 0 ? "text-bad" : "text-good"}`}>
                    {cap.free >= 0 ? "+" : ""}{nf(cap.free, 1)}
                  </span>
                </div>
                {cap.habsMissing && <p className="text-faint mt-1 mb-0">{t.overview.cpCapHabs}</p>}
                {(cap.unknownEffects?.length ?? 0) > 0 && (
                  <p className="text-warn text-[12px] mt-1 mb-0" title={cap.unknownEffects!.join("\n")}>
                    ⚠ {t.overview.cpCapMod.replace("{n}", String(cap.unknownEffects!.length))}
                  </p>
                )}
              </div>
            )}
            {snap.cpCapOverage && (
              <p className="text-warn text-[12.5px] mt-3 mb-0">⚠ {t.overview.capOverage}</p>
            )}
          </Panel>

          {snap.alienSites.length > 0 && <AlienSites snap={snap} />}
        </div>

        {/* la corsa alla ricerca e' la card piu' alta: da sola a destra, cosi'
            le due colonne finiscono piu' o meno insieme */}
        <div>
          <ResearchPanel />

        </div>
      </div>
    </>
  );
}
