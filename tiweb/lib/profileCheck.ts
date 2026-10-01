/* Controllo dei profili di reclutamento: modulo senza React, cosi' si prova
   anche fuori dal browser. I tipi vengono da RecruitProfiles.tsx. */

import type { Profile, ProfilesData } from "@/components/RecruitProfiles";
type Option = ProfilesData["options"]["traits"][number];

/* -- combinazioni impossibili ------------------------------------------------
   Un consigliere generato a caso ha un tipo; ogni tratto esce solo su certi
   tipi (Military Scientist: Officer, Scientist, Astronaut, Professor), al
   massimo uno per sezione, e le missioni vengono dal tipo o da un tratto, meno
   quelle che un tratto toglie (Pacifist: niente Assassinate). Il controllo
   cerca almeno un tipo con cui tutto torna. Gli attributi non si controllano.
   I consiglieri predefiniti del gioco possono fare eccezione. */

export type Idx = { traits: Map<string, Option>; missions: Map<string, Option>; types: string[] };

export function indexOf(data: ProfilesData): Idx {
  return {
    traits: new Map(data.options.traits.map((o) => [o.id, o])),
    missions: new Map(data.options.missions.map((o) => [o.id, o])),
    types: data.options.types.map((o) => o.id),
  };
}

/** Le condizioni `req` (tutte presenti) e `noneTokens` (tutte assenti) possono
 *  valere per un consigliere di tipo `type`? */
export function fitsType(type: string, req: string[], noneTokens: string[], ix: Idx): boolean {
  const traits = req.filter((x) => x.startsWith("trait:")).map((x) => ix.traits.get(x.slice(6)));
  const missions = req.filter((x) => x.startsWith("mission:")).map((x) => x.slice(8));
  const used = new Set<number>();
  for (const tr of traits) {
    if (!tr || !(tr.types ?? []).includes(type)) return false;
    if (tr.group != null) {
      if (used.has(tr.group)) return false;
      used.add(tr.group);
    }
  }
  const restricted = new Set(traits.flatMap((tr) => tr?.restricts ?? []));
  for (const m of missions) {
    if (restricted.has(m)) return false;
    if ((ix.missions.get(m)?.types ?? []).includes(type)) continue;
    if (traits.some((tr) => (tr?.grants ?? []).includes(m))) continue;
    // un tratto in piu' che la dia: possibile sul tipo, sezione libera, non escluso
    const extra = [...ix.traits.values()].some((x) => (x.grants ?? []).includes(m)
      && (x.types ?? []).includes(type) && !noneTokens.includes(`trait:${x.id}`)
      && (x.group == null || !used.has(x.group)));
    if (!extra) return false;
  }
  // «nessuna» missione che il tipo da' sempre: impossibile, salvo un tratto richiesto che la tolga
  for (const tok of noneTokens) {
    if (!tok.startsWith("mission:")) continue;
    const m = tok.slice(8);
    if ((ix.missions.get(m)?.types ?? []).includes(type) && !restricted.has(m)) return false;
  }
  return true;
}

const fits = (req: string[], none: string[], ix: Idx) => ix.types.some((ty) => fitsType(ty, req, none, ix));

/** null se il profilo puo' corrispondere a un consigliere generato a caso;
 *  altrimenti le condizioni che non stanno insieme (le piu' poche trovate). */
export function impossible(d: Profile, ix: Idx): { tokens: string[]; anyPart: boolean } | null {
  const all = d.all.filter((x) => !x.startsWith("high:") && !x.startsWith("low:"));
  const any = d.any.filter((x) => !x.startsWith("high:") && !x.startsWith("low:"));
  const anyAttrOnly = d.any.length > 0 && any.length < d.any.length;  // un attributo non si controlla
  if (!fits(all, d.none, ix)) {
    for (const a of all) if (!fits([a], d.none, ix)) return { tokens: [a], anyPart: false };
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (!fits([all[i], all[j]], d.none, ix)) return { tokens: [all[i], all[j]], anyPart: false };
      }
    }
    return { tokens: all, anyPart: false };
  }
  if (any.length && !anyAttrOnly && !any.some((a) => fits([...all, a], d.none, ix))) {
    return { tokens: all, anyPart: true };
  }
  return null;
}

/** I tipi di consigliere che possono corrispondere al profilo. */
export function possibleTypes(d: Profile, ix: Idx): string[] {
  const all = d.all.filter((x) => !x.startsWith("high:") && !x.startsWith("low:"));
  const any = d.any.filter((x) => !x.startsWith("high:") && !x.startsWith("low:"));
  return ix.types.filter((ty) => fitsType(ty, all, d.none, ix)
    && (!any.length || any.length < d.any.length || any.some((a) => fitsType(ty, [...all, a], d.none, ix))));
}

/* -- combinazioni rare ------------------------------------------------------
   Stima, non la formula del gioco: la probabilita' di ogni tratto su un
   consigliere nuovo di quel tipo (`chances`, in %, dai template) moltiplicata
   come se i tratti fossero indipendenti. Una missione che il tipo non ha vale
   quanto il tratto piu' probabile che la da'. «Almeno una»: 1 - prodotto dei
   «no». Con un attributo fra le «almeno una» quella parte non si stima. */

/** Soglia sotto cui (o pari) la combinazione si segnala come rara, in %. */
export const RARE_PCT = 5;

const pct = (o: Option | undefined, type: string) => ((o?.chances ?? {})[type] ?? 0) / 100;

/** Probabilita' (0-1) che un consigliere nuovo di tipo `type` abbia tutte le
 *  condizioni di `req`, con le esclusioni `none`; i fattori sono per condizione. */
function chanceOf(type: string, req: string[], none: string[], ix: Idx): { p: number; parts: [string, number][] } {
  const traits = req.filter((x) => x.startsWith("trait:"));
  const parts: [string, number][] = [];
  for (const tok of traits) parts.push([tok, pct(ix.traits.get(tok.slice(6)), type)]);
  const granted = new Set(traits.flatMap((tok) => ix.traits.get(tok.slice(6))?.grants ?? []));
  const used = new Set(traits.map((tok) => ix.traits.get(tok.slice(6))?.group).filter((g) => g != null));
  for (const tok of req.filter((x) => x.startsWith("mission:"))) {
    const m = tok.slice(8);
    if ((ix.missions.get(m)?.types ?? []).includes(type) || granted.has(m)) continue;
    const best = Math.max(0, ...[...ix.traits.values()]
      .filter((x) => (x.grants ?? []).includes(m) && !none.includes(`trait:${x.id}`)
        && (x.group == null || !used.has(x.group)))
      .map((x) => pct(x, type)));
    parts.push([tok, best]);
  }
  return { p: parts.reduce((a, [, v]) => a * v, 1), parts };
}

export interface TypeChance { type: string; p: number; parts: [string, number][] }

/** Per ogni tipo possibile, la probabilita' stimata della combinazione, dalla
 *  piu' alta. null se non si puo' stimare (solo attributi). */
export function typeChances(d: Profile, ix: Idx): TypeChance[] {
  const strip = (xs: string[]) => xs.filter((x) => !x.startsWith("high:") && !x.startsWith("low:"));
  const all = strip(d.all), any = strip(d.any);
  const anyKnown = !(d.any.length > 0 && any.length < d.any.length);
  if (!all.length && !(any.length && anyKnown)) return [];
  return possibleTypes(d, ix).map((type) => {
    const base = chanceOf(type, all, d.none, ix);
    let p = base.p;
    const parts = [...base.parts];
    if (any.length && anyKnown) {
      const opts = any.filter((a) => fitsType(type, [...all, a], d.none, ix));
      const none = opts.reduce((acc, a) => {
        const c = chanceOf(type, [...all, a], d.none, ix).p / (base.p || 1);
        return acc * (1 - Math.min(1, c));
      }, 1);
      p *= 1 - none;
      parts.push(["any", 1 - none]);
    }
    return { type, p, parts };
  }).sort((a, b) => b.p - a.p);
}
