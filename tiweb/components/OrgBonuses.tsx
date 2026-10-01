"use client";

/* Cio' che un'org da' e quanto costa, con le icone del gioco come nella sua
   scheda in partita, in tre colonne (attributi | bonus | rendite). Lo usano
   il mercato delle org e la lista delle org di ogni consigliere:
   - attributi            «+1 [icona]»
   - priorita' e ricerca  «+2% [icona] Nome»
   - rendite              «+ [icona] 4»
   - costo                «[icona]588» */

import { AttrIcon, GameIcon, ResourceIcon } from "@/components/ui";
import { CATEGORY_ICON, INCOME_ICON, ORG_BONUS_ICON } from "@/lib/gameIcons";
import type { Org } from "@/lib/types";
import { useSettings } from "@/lib/settings";
import { short } from "@/components/CouncilorCard";

const sign = (v: number) => (v < 0 ? "−" : "+");
const pctOf = (v: number) => `${sign(v)}${Math.round(Math.abs(v) * 1000) / 10}%`;
const COST_ICON: Record<string, string> = {
  money: "ICO_currency", influence: "ICO_influence", ops: "ICO_ops", boost: "ICO_boost",
};

/** I nomi delle rendite, dalle etichette dell'interfaccia (come IncomeLine). */
function useIncomeName() {
  const { t } = useSettings();
  const r = t.recruit as unknown as Record<string, string>;
  const key: Record<string, string> = {
    money: "resMoney", influence: "resInfluence", ops: "resOps", research: "resResearch", boost: "resBoost",
  };
  return (k: string) => (key[k] && r[key[k]]) || (k === "missionControl" ? t.orgProfiles.missionControl
    : k === "projects" ? t.orgProfiles.projects : k);
}

/** Le tre parti di cio' che un'org da': attributi, bonus (priorita', spazio,
 *  ricerca) e rendite, ognuna gia' come elementi da mostrare. */
function useParts(o: Org) {
  const incomeName = useIncomeName();
  const neg = (v: number) => (v < 0 ? "text-bad" : "");
  const attrs: React.ReactNode[] = [], bonuses: React.ReactNode[] = [], income: React.ReactNode[] = [];
  for (const [k, v] of Object.entries(o.attributes)) if (v) attrs.push(
    <span key={`a${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`} title={short(k)}>
      {sign(v)}{Math.abs(v)}<AttrIcon attr={k} size={14} title={short(k)} />
    </span>);
  for (const [k, v] of Object.entries(o.bonuses ?? {})) if (v) bonuses.push(
    <span key={`b${k}`} className={`inline-flex items-center gap-0.5 whitespace-nowrap ${neg(v)}`}>
      {pctOf(v)}{ORG_BONUS_ICON[k] && <GameIcon bundle="icons_2d" icon={ORG_BONUS_ICON[k]} size={14} />}
      {/* senza icona (estrazione) serve lo spazio */}
      <span className={ORG_BONUS_ICON[k] ? "" : "ml-1"}>{o.bonusNames?.[k] ?? k}</span>
    </span>);
  for (const [k, v] of Object.entries(o.techBonuses ?? {})) if (v) bonuses.push(
    <span key={`s${k}`} className={`inline-flex items-center gap-0.5 whitespace-nowrap ${neg(v)}`}>
      {pctOf(v)}{CATEGORY_ICON[k] && <GameIcon bundle="icons_2d" icon={CATEGORY_ICON[k]} size={14} />}
      <span className={CATEGORY_ICON[k] ? "" : "ml-1"}>{o.techNames?.[k] ?? k}</span>
    </span>);
  const inc: [string, number][] = [...Object.entries(o.income), ["projects", o.projectSlots]];
  for (const [k, v] of inc) if (v) income.push(
    <span key={`i${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`} title={incomeName(k)}>
      {sign(v)}<ResourceIcon icon={INCOME_ICON[k]} size={14} title={incomeName(k)} />{Math.abs(v)}
    </span>);
  return { attrs, bonuses, income };
}

// le celle si allungano a tutta la riga: le linee fra le colonne restano
// continue anche dove una colonna e' vuota
const cell = "flex flex-wrap items-center content-center gap-x-2.5 gap-y-0.5 sm:min-h-[1.4rem]";

/** Attributi | bonus | rendite, in tre colonne separate; sui telefoni una
 *  sotto l'altra. Le colonne vuote restano, cosi' le altre non si spostano. */
export function OrgBonuses({ o }: { o: Org }) {
  const { attrs, bonuses, income } = useParts(o);
  if (!attrs.length && !bonuses.length && !income.length) return <span className="text-dim">—</span>;
  return (
    <div className="grid gap-x-4 gap-y-1 sm:[grid-template-columns:minmax(5.5rem,auto)_1fr_auto]">
      <div className={cell}>{attrs}</div>
      <div className={`${cell} sm:border-l sm:border-edge sm:pl-3`}>{bonuses}</div>
      <div className={`${cell} sm:border-l sm:border-edge sm:pl-3`}>{income}</div>
    </div>
  );
}

/** La lista delle org di un consigliere come tabella: nome | attributi |
 *  bonus | rendite, colonne allineate fra una riga e l'altra. */
export function OrgTable({ orgs }: { orgs: Org[] }) {
  return (
    <div className="grid gap-x-4 sm:gap-y-1
                    sm:[grid-template-columns:minmax(8rem,max-content)_minmax(5.5rem,auto)_1fr_auto]">
      {orgs.map((o) => <OrgRow key={o.id} o={o} />)}
    </div>
  );
}

function OrgRow({ o }: { o: Org }) {
  const { attrs, bonuses, income } = useParts(o);
  return (
    <div className="contents">
      {/* sui telefoni le tre parti vanno sotto il nome, rientrate */}
      <span className="text-ink self-center max-sm:mt-1.5">{o.name}</span>
      <div className={`${cell} max-sm:pl-3`}>{attrs}</div>
      <div className={`${cell} max-sm:pl-3 sm:border-l sm:border-edge sm:pl-3`}>{bonuses}</div>
      <div className={`${cell} max-sm:pl-3 sm:border-l sm:border-edge sm:pl-3`}>{income}</div>
    </div>
  );
}

export function OrgCost({ o }: { o: Org }) {
  const incomeName = useIncomeName();
  const parts = Object.entries(o.cost).filter(([, v]) => v);
  if (!parts.length) return <span>—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2.5">
      {parts.map(([k, v]) => (
        <span key={k} className="inline-flex items-center gap-0.5" title={incomeName(k)}>
          <ResourceIcon icon={COST_ICON[k]} size={14} title={incomeName(k)} />{v}
        </span>
      ))}
    </span>
  );
}
