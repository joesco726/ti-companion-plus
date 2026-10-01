"use client";

import { useApi } from "@/lib/api";
import { useSettings } from "@/lib/settings";
import { SITE } from "@/lib/site";
import { Panel } from "@/components/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h3 className="display text-[12px] uppercase tracking-[.06em] text-dim m-0">{title}</h3>
      <div className="text-[13px] leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

interface VersionInfo {
  data: { gameVersion: string | null; steamBuild: string | null; source: "bundle" | "install" };
  save: string | null;
  campaignStart: string | null;
}

/** Versione del companion (scritta in build da next.config.ts), dei dati del
 *  gioco che usa e del gioco che ha scritto il salvataggio. */
function Versions() {
  const { t, ui } = useSettings();
  const a = t.about;
  const { data: v } = useApi<VersionInfo>("/api/version");
  const built = process.env.NEXT_PUBLIC_BUILD_DATE;
  const when = built && process.env.NODE_ENV === "production"
    ? new Date(built).toLocaleString(ui === "it" ? "it-IT" : "en-GB",
        { dateStyle: "short", timeStyle: "short" })
    : a.devBuild;
  const game = v?.data.gameVersion;
  const mismatch = game && v?.save && v.save !== game;
  const row = (k: string, val: React.ReactNode) => (
    <div className="flex gap-3">
      <span className="text-dim w-40 shrink-0">{k}</span>
      <span>{val}</span>
    </div>
  );
  return (
    <Section title={a.versionTitle}>
      {row(a.versionApp, <>
        {process.env.NEXT_PUBLIC_APP_VERSION}
        <span className="text-faint"> · {when}{process.env.NEXT_PUBLIC_COMMIT && ` · ${process.env.NEXT_PUBLIC_COMMIT}`}</span>
      </>)}
      {row(a.versionData, <>
        {game ?? "—"}
        {v?.data.steamBuild && <span className="text-faint"> · Steam build {v.data.steamBuild}</span>}
        {v && <span className="text-faint"> · {v.data.source === "bundle" ? a.fromBundle : a.fromInstall}</span>}
      </>)}
      {row(a.versionSave, v?.save ?? "—")}
      {mismatch && <p className="text-warn text-[12px]">
        {a.versionMismatch.replace("{save}", v!.save!).replace("{data}", game!)}
      </p>}
    </Section>
  );
}

export default function AboutPage() {
  const { t } = useSettings();
  const a = t.about;

  return (
    <Panel title={a.title}>
      {/* tutta la larghezza, come le altre schede: su schermi larghi due
          colonne invece di righe lunghissime */}
      <div>
      <div className="grid gap-x-10 gap-y-6 py-1 lg:grid-cols-2">
        <Section title={a.whoTitle}>
          <p>{a.who.replace("{name}", SITE.name).replace("{upstream}", SITE.upstream.name)
            .replace("{upstreamAuthor}", SITE.upstream.author)}</p>
          <p><a href={SITE.upstream.repo} target="_blank" rel="noopener noreferrer"
            className="text-accent hover:underline">{SITE.upstream.repo.replace("https://", "")}</a></p>
        </Section>

        <Section title={a.whatTitle}>
          <p>{a.what}</p>
          <p className="text-dim">{a.heuristics}</p>
        </Section>

        <Section title={a.privacyTitle}>
          <p>{a.privacy}</p>
        </Section>

        <Section title={a.contactTitle}>
          <p>{a.contact}</p>
          <p><a href={`${SITE.repo}/issues`} target="_blank" rel="noopener noreferrer"
            className="text-accent hover:underline">{`${SITE.repo}/issues`.replace("https://", "")}</a></p>
        </Section>

        <Versions />

        <p className="lg:col-span-2 text-faint text-[11.5px] border-t border-edge pt-3">{a.disclaimer}</p>
      </div>
      </div>
    </Panel>
  );
}
