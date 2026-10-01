"use client";

/* Cio' che un'org da' e quanto costa, con le icone del gioco come nella sua
   scheda in partita. Lo usano il mercato delle org e la lista delle org di
   ogni consigliere:
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

export function OrgBonuses({ o }: { o: Org }) {
  const incomeName = useIncomeName();
  const out: React.ReactNode[] = [];
  const neg = (v: number) => (v < 0 ? "text-bad" : "");
  for (const [k, v] of Object.entries(o.attributes)) if (v) out.push(
    <span key={`a${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`} title={short(k)}>
      {sign(v)}{Math.abs(v)}<AttrIcon attr={k} size={14} title={short(k)} />
    </span>);
  for (const [k, v] of Object.entries(o.bonuses ?? {})) if (v) out.push(
    <span key={`b${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`}>
      {pctOf(v)}{ORG_BONUS_ICON[k] && <GameIcon bundle="icons_2d" icon={ORG_BONUS_ICON[k]} size={14} />}
      {/* senza icona (estrazione) serve lo spazio */}
      <span className={ORG_BONUS_ICON[k] ? "" : "ml-1"}>{o.bonusNames?.[k] ?? k}</span>
    </span>);
  for (const [k, v] of Object.entries(o.techBonuses ?? {})) if (v) out.push(
    <span key={`s${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`}>
      {pctOf(v)}{CATEGORY_ICON[k] && <GameIcon bundle="icons_2d" icon={CATEGORY_ICON[k]} size={14} />}
      <span className={CATEGORY_ICON[k] ? "" : "ml-1"}>{o.techNames?.[k] ?? k}</span>
    </span>);
  const income: [string, number][] = [...Object.entries(o.income), ["projects", o.projectSlots]];
  for (const [k, v] of income) if (v) out.push(
    <span key={`i${k}`} className={`inline-flex items-center gap-0.5 ${neg(v)}`} title={incomeName(k)}>
      {sign(v)}<ResourceIcon icon={INCOME_ICON[k]} size={14} title={incomeName(k)} />{Math.abs(v)}
    </span>);
  return out.length
    ? <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">{out}</span>
    : <span className="text-dim">—</span>;
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
