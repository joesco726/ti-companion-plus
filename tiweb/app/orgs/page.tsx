"use client";

/* Organizzazioni: i profili delle org (cosa cerco) e il mercato, con le
   etichette dei profili sulle schede. Prima stavano in fondo al Consiglio. */

import { useApi, useSnapshot } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { Empty, Panel, Tag } from "@/components/ui";
import { OrgProfiles, stars, type OrgProfilesData } from "@/components/OrgProfiles";
import { OrgBonuses, OrgCost } from "@/components/OrgBonuses";

export default function OrgsPage() {
  const { t, game, live } = useSettings();
  const { data: snap, error } = useSnapshot(live.version, game);
  const orgProfiles = useApi<OrgProfilesData>(`/api/orgprofiles?lang=${game}`, [live.version]);

  if (error) return <Empty>{t.common.error}: {error}</Empty>;
  if (!snap) return <Empty>{t.common.loading}</Empty>;

  return (
    <Panel title={t.council.market}>
      {orgProfiles.data && <OrgProfiles data={orgProfiles.data} onChange={orgProfiles.reload} />}
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {snap.orgMarket.map((o) => {
          // i profili delle org a cui corrisponde
          const matched = (orgProfiles.data?.profiles ?? []).filter((pr) =>
            (orgProfiles.data?.matches[String(pr.id)] ?? []).some((h) => h.id === o.id));
          return (
            <div key={o.id}
              className={`bg-panel border rounded-lg p-3 ${o.affordable ? "border-good/40" : "border-edge"}`}>
              <div className="flex justify-between items-baseline gap-2">
                <span className="font-semibold text-[13.5px]">
                  {o.name}
                  {/* dimensione dell'org, in stelle come nel gioco */}
                  {o.tier ? <span className="text-warn font-normal ml-1.5 text-[12px]" title={`${t.orgProfiles.size} ${o.tier}`}>
                    {stars(o.tier)}</span> : null}
                </span>
                <span className="flex flex-wrap gap-1 justify-end">
                  {matched.map((pr) => <Tag key={pr.id} tone="mine">{pr.name}</Tag>)}
                  <Tag tone={o.affordable ? "mine" : "dim"}>
                    {o.affordable ? t.council.affordable : t.council.notAffordable}
                  </Tag>
                </span>
              </div>
              <div className="text-[12px] text-dim mt-1 flex flex-wrap items-center gap-x-1">
                <OrgCost o={o} />
                {o.paybackMonths != null && ` · ${t.council.payback} ~${o.paybackMonths} ${t.common.month}`}
              </div>
              <div className="text-[12px] mt-1"><OrgBonuses o={o} /></div>
              <div className="text-[11.5px] mt-1.5">
                <span className="text-dim">{t.council.canHold}: </span>
                {o.eligible && o.eligible.length
                  ? <span className="text-good">{o.eligible.join(", ")}</span>
                  : <span className="text-bad">{t.council.nobody}</span>}
              </div>
              {o.missionsGranted.length > 0 && (
                <div className="text-[11.5px] text-accent mt-1">
                  {t.council.moreMissions.replace("{n}", String(o.missionsGranted.length))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
