"""Scheda Estrazione: dove conviene scavare e quali org aiutano nello spazio.

Siti. Il salvataggio ha la resa VERA di ogni sito (`water_day` & co.), ma il
gioco la mostra solo dopo la prospezione del corpo celeste (Codex, «Siti di
habitat»). Regole lette dall'IL di Assembly-CSharp.dll:

- `TIFactionState.Prospected(corpo)`: intel sul corpo >= 1,0. Una sonda in
  viaggio porta l'intel a 0,1 (`ProspectorEnRoute`: >= 0,1 e non prospettato).
- Prima della prospezione la lista dei siti del pannello di un corpo
  (`BaseSiteListItemController.SetListItem`, per ogni corpo con siti, anche
  non esplorabile) mostra solo la forchetta `Min/MaxProductivity` = attesa
  -/+ ampiezza/2, mai sotto il minimo del profilo. L'attesa
  (`GetHabSiteExpectedProductivity_month`) e' la media del profilo corretta da
  `ModifyBaseValueForConditions`; i nobili non superano meta' dei metalli.
  L'attesa la usiamo noi per il Valore e per ordinare: l'interfaccia mostra
  la forchetta, come il gioco.
- `ModifyBaseValueForConditions`: se il profilo ha `modifyBySize`, un corpo
  piu' leggero di `maxMassforMiningResourceMalus` (5e16 kg) rende in
  proporzione alla massa; per metalli, nobili e fissili conta anche la
  densita': sotto 1,25 g/cm3 malus proporzionale, sopra 3 bonus. Il fattore
  sta fra 0,75 e 1,25. Poi il moltiplicatore globale della partita.
- Resa mensile = giornaliera x 30,436874 (`GetMonthlyProduction`).
- `CanExplore`: il corpo e' raggiungibile se la fazione ha uno dei suoi
  effetti di esplorazione (`effectToExplore`, `alternativeEffectToExplore`),
  o se non ne ha nessuno. Il limite di distanza in UA (contesto 145) qui non
  si applica.

La resa non comprende il bonus di org ed effetti della fazione
(`GetCurrentMiningMultiplierFromOrgsAndEffects`): vale per tutti i siti allo
stesso modo, quindi non cambia la classifica.

Il VALORE (resa x prezzo di mercato del salvataggio) e' una misura nostra per
ordinare: il gioco non la calcola. Accanto ci sono sempre le rese grezze.

Org. Si guardano i bonus spaziali dei `TIOrgState` (estrazione, controllo
missioni, sviluppo spaziale, volo spaziale, capacita' di lancio). Sono visibili:
le nostre, quelle del nostro mercato, quelle dei consiglieri altrui con intel
>= 0,50 (`intelToSeeCouncilorDetails`, come in factions.py) e le non assegnate
di una fazione con intel >= 0,25 (`FactionView.knownUnassignedOrgsPool`).
Queste ultime due sono i bersagli possibili di Acquisizione ostile: la
schermata del gioco elenca anche il pool non assegnato della fazione
(`UI.OrgTargeting.CouncilorTip`).
"""

from functools import lru_cache

from . import gamedata, transfer
from .council import org_view
from .factions import COUNCILOR_GATES, GATES, _faction_ref, _intel_on
from .names import Namer

OUTPOST_CORE = "OutpostCore"        # il modulo con cui si fonda una base
DAYS_PER_MONTH = 30.436874          # TIHabSiteState.GetMonthlyProduction
INTEL_PROSPECTED = 1.0              # TIFactionState.Prospected
INTEL_PROBE_EN_ROUTE = 0.1          # TIFactionState.ProspectorEnRoute
INTEL_TO_SEE_HAB = 0.1              # come space.INTEL_TO_SEE
MAX_MASS_FOR_MALUS = 5e16           # TIGlobalConfig.maxMassforMiningResourceMalus
METALS_MALUS_DENSITY = 1.25         # TIGlobalConfig.metalsMalusDensityCutPoint
METALS_BONUS_DENSITY = 3.0          # TIGlobalConfig.metalsBonusDensityCutPoint
DEFAULT_DENSITY = 2.0               # TISpaceBodyState.density_gcm3 senza valore

# campo del sito/profilo -> chiave di UI.Global e di resourceMarketValues
RESOURCES = (("water", "Water"), ("volatiles", "Volatiles"), ("metals", "Metals"),
             ("nobles", "NobleMetals"), ("fissiles", "Fissiles"))
# risorse per cui conta la densita' (secondo argomento di ModifyBaseValueForConditions)
_DENSE = {"metals", "nobles", "fissiles"}

# bonus spaziali di un'org: campo di TIOrgState
ORG_BONUSES = ("miningBonus", "MCBonus", "spaceDevBonus", "spaceflightBonus")
# campo -> priorita' nazionali a cui si applica (chiavi di gamedata.PRIORITIES).
# Da `TIOrgState.description`, che scrive ogni bonus con GetPriorityString.
ORG_PRIORITIES = {
    "spaceDevBonus": ("spaceProgram",),
    "spaceflightBonus": ("initSpaceProgram", "boost", "sto"),
    "MCBonus": ("missionControl",),
}


def _factor(profile, body_tpl, dense):
    if not profile.get("modifyBySize"):
        return 1.0
    f = 1.0
    mass = body_tpl.get("mass_kg") or 5e-324
    if mass <= MAX_MASS_FOR_MALUS:
        f *= mass / MAX_MASS_FOR_MALUS
    if dense:
        d = body_tpl.get("density_gcm3")
        d = DEFAULT_DENSITY if d is None else d
        if d <= METALS_MALUS_DENSITY:
            f *= d / METALS_MALUS_DENSITY
        elif d >= METALS_BONUS_DENSITY:
            f *= d / METALS_BONUS_DENSITY
    return min(1.25, max(0.75, f))


def _modify(value, profile, body_tpl, dense, global_mult):
    if value > 0:
        value *= _factor(profile, body_tpl, dense)
    return value * global_mult


def expected(profile, body_tpl, global_mult=1.0):
    """{risorsa: (attesa, minima, massima)} al mese, come il gioco prima della
    prospezione."""
    out = {}
    for k, _ in RESOURCES:
        dense = k in _DENSE
        mean = _modify(profile.get(k + "_mean") or 0, profile, body_tpl, dense, global_mult)
        if k == "nobles":
            mean = min(out["metals"][0] / 2, mean)
        half = _modify(profile.get(k + "_width") or 0, profile, body_tpl, False, global_mult) / 2
        lo = max(profile.get(k + "_min") or 0, mean - half)
        out[k] = (mean, lo, mean + half)
    return out


# -- quanto e' buono un sito per la sua classe ----------------------------------
# TIHabSiteState.SetDailyOutputValue: per ogni risorsa media (corretta per il
# corpo) + k salti di una larghezza (ogni salto con probabilita' `jump`, segno
# a caso) + uniforme nella larghezza, mai sotto minimo x U(0,8; 1,2). I nobili
# non superano meta' o un terzo dei metalli. Le risorse "della classe" sono
# quelle con media positiva (Carbonaceo comune: acqua e volatili): si confronta
# la loro somma con la stessa somma su molti siti simulati della stessa classe
# sullo stesso corpo. Il percentile e' una misura nostra; le rese sono vere
# (corpo esplorato), ma il gioco non dice quanto sono fortunate.

TOP_PERCENTILE = 0.9                # stella dal 90esimo percentile in su
SIMULATIONS = 3000


def class_resources(profile):
    return [k for k, _ in RESOURCES if (profile.get(k + "_mean") or 0) > 0]


def _width(width, jump, global_mult):
    """ModifyWidthValueFromSettings."""
    if global_mult > 2:
        return width * (2 + global_mult ** (1 - jump))
    return width * global_mult


def _nothing(profile, k):
    return all((profile.get(k + f) or 0) <= 0 for f in ("_mean", "_min", "_width"))


@gamedata.on_data_change
@lru_cache(maxsize=512)
def _simulated_sums(pname, f_plain, f_dense, global_mult):
    """Somme delle risorse della classe su SIMULATIONS siti simulati, ordinate."""
    import random
    profile = gamedata.templates()["miningProfiles"].get(pname) or {}
    keys = class_resources(profile)
    rnd = random.Random(pname)          # stesso risultato a ogni caricamento
    none = {k: _nothing(profile, k) for k, _ in RESOURCES}
    none["nobles"] = none["nobles"] or none["metals"]
    par = {}
    for k, _ in RESOURCES:
        f = f_dense if k in _DENSE else f_plain
        mean, mn = (profile.get(k + "_mean") or 0), (profile.get(k + "_min") or 0)
        par[k] = ((mean * f if mean > 0 else mean) * global_mult,
                  (mn * f if mn > 0 else mn) * global_mult,
                  _width(profile.get(k + "_width") or 0, profile.get(k + "_jump") or 0, global_mult),
                  profile.get(k + "_jump") or 0)

    def draw(k):
        mean, mn, w, jump = par[k]
        n = 0
        while rnd.random() < jump and n < 50:
            n += 1
        if n and rnd.random() < 0.5:
            n = -n
        v = mean + n * w - w / 2 + rnd.random() * w
        v = max(v, mn * (0.8 + rnd.random() * 0.4)) if mn > 0 else max(v, 0.0)
        return 0.0 if v < 0.01 else v

    out = []
    for _ in range(SIMULATIONS):
        y = {}
        for k, _ in RESOURCES:
            if none[k]:
                y[k] = 0.0
            elif k == "nobles":
                y[k] = min(y["metals"] / (2 + rnd.randrange(2)), draw(k))
            else:
                y[k] = draw(k)
        out.append(sum(y[k] for k in keys))
    out.sort()
    return out


def class_rank(profile, body_tpl, global_mult, monthly):
    """(risorse della classe, percentile della loro somma fra i siti della
    stessa classe sullo stesso corpo), o None."""
    keys = class_resources(profile)
    if not keys or not profile.get("dataName"):
        return None
    sims = _simulated_sums(profile["dataName"], round(_factor(profile, body_tpl, False), 3),
                           round(_factor(profile, body_tpl, True), 3), float(global_mult))
    total = sum(monthly[k] for k in keys)
    import bisect
    return keys, bisect.bisect_left(sims, total) / len(sims)


def _my_effects(g, my_id):
    names = set()
    for es in g.state("TIEffectsState").values():
        for e in es.get("factionEffectsNames") or []:
            if (e.get("Key") or {}).get("value") == my_id:
                for lst in (e.get("Value") or {}).values():
                    names.update(lst or [])
    return names


def _system_au(bodies_tpl, name):
    """Distanza media dal Sole: per una luna, quella del suo pianeta."""
    seen = set()
    while name and name not in seen:
        seen.add(name)
        t = bodies_tpl.get(name) or {}
        if t.get("barycenterName") in (None, "Sol"):
            return t.get("semiMajorAxis_AU")
        name = t.get("barycenterName")
    return None


def _sites(g, lang, my_id, nm):
    tpl = gamedata.templates()
    site_tpl, body_tpl, profiles = tpl["habSites"], tpl["spaceBodies"], tpl["miningProfiles"]
    gv = next(iter(g.state("TIGlobalValuesState").values()), {})
    market = gv.get("resourceMarketValues") or {}
    global_mult = ((gv.get("scenarioCustomizations") or {})
                   .get("miningProductivityMultiplier") or 1.0)
    body_intel = _intel_on(g.me, "intel", "TISpaceBodyState")
    hab_intel = _intel_on(g.me, "intel", "TIHabState")
    effects = _my_effects(g, my_id)
    bodies = g.state("TISpaceBodyState")
    habs = g.state("TIHabState")

    out = []
    for sid, s in g.state("TIHabSiteState").items():
        if not s.get("exists", True) or s.get("archived"):
            continue
        body_id = (s.get("parentBody") or {}).get("value")
        b = bodies.get(body_id) or {}
        bname = b.get("templateName")
        bt = body_tpl.get(bname) or {}
        st = site_tpl.get(s.get("templateName")) or {}
        profile = profiles.get(st.get("miningProfileName")) or {}

        intel = body_intel.get(body_id, 0)
        prospected = intel + 1e-6 >= INTEL_PROSPECTED
        probe = not prospected and intel + 1e-6 >= INTEL_PROBE_EN_ROUTE
        options = [e for e in (bt.get("effectToExplore"), bt.get("alternativeEffectToExplore")) if e]
        reachable = not options or any(e in effects for e in options)

        rank = None
        if prospected:
            y = {k: (s.get(k + "_day") or 0) * DAYS_PER_MONTH for k, _ in RESOURCES}
            rows = {k: {"value": v} for k, v in y.items()}
            r = class_rank(profile, bt, global_mult, y)
            if r:
                rank = {"resources": r[0], "percentile": round(r[1], 3),
                        "top": r[1] >= TOP_PERCENTILE}
        else:
            exp = expected(profile, bt, global_mult)
            y = {k: v[0] for k, v in exp.items()}
            rows = {k: {"value": v[0], "min": v[1], "max": v[2]} for k, v in exp.items()}
        value = sum(y[k] * (market.get(key) or 0) for k, key in RESOURCES)

        occupant = None
        seen = _visible_hab(g, s, my_id, hab_intel, habs)
        if seen:
            h, mine = seen
            f = g.factions.get((h.get("faction") or {}).get("value"))
            occupant = dict(_faction_ref(g, nm, f), mine=mine)

        out.append({
            "id": s.get("templateName"),
            "name": gamedata.loc(lang, "TIHabSiteTemplate", "displayName",
                                 s.get("templateName"), s.get("displayName")),
            "body": {"id": bname,
                     "name": gamedata.loc(lang, "TISpaceBodyTemplate", "displayName",
                                          bname, b.get("displayName")),
                     "type": bt.get("objectType"),
                     "au": _system_au(body_tpl, bname)},
            "profile": gamedata.loc(lang, "TIMiningProfileTemplate", "displayName",
                                    profile.get("dataName"), profile.get("friendlyName")),
            "prospected": prospected,
            "probeEnRoute": probe,
            "reachable": reachable,
            "yields": rows,
            "value": round(value, 1),
            "occupant": occupant,
            "classRank": rank,
        })
    out.sort(key=lambda r: -r["value"])
    return out, market


def _visible_hab(g, s, my_id, hab_intel, habs):
    """L'habitat sul sito, se la fazione lo vede (intel >= 0,1 o e' suo): un
    habitat invisibile lascia il sito libero anche nel gioco."""
    h = habs.get((s.get("hab") or {}).get("value"))
    if not h or not h.get("exists", True) or h.get("archived"):
        return None
    mine = (h.get("faction") or {}).get("value") == my_id
    hid = (h.get("ID") or {}).get("value")
    if mine or hab_intel.get(hid, 0) + 1e-6 >= INTEL_TO_SEE_HAB:
        return h, mine
    return None


def launch_bodies(g, lang="ita"):
    """Per ogni corpo con siti: finestra di lancio dalla Terra (transfer.py),
    siti liberi per quel che si vede, raggiungibilita'. Va nello snapshot per
    le allerte dei corpi sorvegliati (alerts.body_watch)."""
    my_id = (g.me.get("ID") or {}).get("value")
    tpl = gamedata.templates()
    body_tpl = tpl["spaceBodies"]
    hab_intel = _intel_on(g.me, "intel", "TIHabState")
    habs = g.state("TIHabState")
    bodies = g.state("TISpaceBodyState")
    effects = _my_effects(g, my_id)
    orbits = transfer.Orbits(g, body_tpl)
    launcher = transfer.Launcher(g, orbits, tpl["orbits"], tpl["effects"], my_id)
    core = tpl["habModules"].get(OUTPOST_CORE)
    rows = {}
    for s in g.state("TIHabSiteState").values():
        if not s.get("exists", True) or s.get("archived"):
            continue
        b = bodies.get((s.get("parentBody") or {}).get("value")) or {}
        name = b.get("templateName")
        if not name:
            continue
        r = rows.get(name)
        if r is None:
            bt = body_tpl.get(name) or {}
            options = [e for e in (bt.get("effectToExplore"), bt.get("alternativeEffectToExplore")) if e]
            r = rows[name] = {
                "id": name,
                "name": gamedata.loc(lang, "TISpaceBodyTemplate", "displayName", name, b.get("displayName")),
                "sites": 0, "free": 0,
                "reachable": not options or any(e in effects for e in options),
                "window": transfer.earth_window(g, orbits, name, my_id, tpl["effects"]),
                "outpostBoost": None,
            }
        r["sites"] += 1
        free = not _visible_hab(g, s, my_id, hab_intel, habs)
        r["free"] += free
        # Nucleo avamposto dalla Terra: fra i siti cambia solo la latitudine.
        # Il piu' economico fra i liberi; se non ce ne sono, fra tutti
        try:
            cost = launcher.module_boost(core, name, s.get("latitude"))
        except (ValueError, ZeroDivisionError, OverflowError):
            cost = None
        if cost is not None:
            best = r.setdefault("_cost", {})
            k = "free" if free else "all"
            best[k] = min(best.get(k, cost), cost)
    for r in rows.values():
        best = r.pop("_cost", {})
        c = best.get("free") if r["free"] else min(best.values(), default=None)
        r["outpostBoost"] = round(c, 1) if c is not None else None
    return sorted(rows.values(), key=lambda r: r["name"] or "")


def _org_row(g, o, lang, where, owner=None):
    v = org_view(g, o, lang)
    return {
        "id": v["id"], "name": v["name"], "tier": v["tier"], "type": v["type"],
        "homeNation": v["homeNation"],
        "bonuses": {k: o.get(k) or 0 for k in ORG_BONUSES},
        "priorities": [dict(gamedata.priority_view(lang, p), bonus=o.get(k))
                       for k, ps in ORG_PRIORITIES.items() if o.get(k) for p in ps],
        "boost": v["income"]["boost"],
        "missionControl": v["income"]["missionControl"],
        "cost": v["cost"],
        "requiresNationality": v["requiresNationality"],
        "where": where,
        "owner": owner,
    }


def _is_space(o):
    return any(o.get(k) for k in ORG_BONUSES) or o.get("incomeBoost_month") or o.get("incomeMissionControl")


def _orgs(g, lang, my_id, nm):
    rows, seen = [], set()

    def add(ref, where, owner=None):
        o = g.orgs.get(ref)
        if not o or ref in seen or not _is_space(o):
            return
        seen.add(ref)
        rows.append(_org_row(g, o, lang, where, owner))

    for c in g.my_councilors():
        for r in c.get("orgs") or []:
            add(r["value"], "mine", {"councilor": c.get("displayName")})
    for r in g.me.get("unassignedOrgs") or []:
        add(r["value"], "mine")
    for r in g.me.get("availableOrgs") or []:
        add(r["value"], "market")

    c_intel = _intel_on(g.me, "intel", "TICouncilorState")
    f_intel = _intel_on(g.me, "intel", "TIFactionState")
    for cid, c in g.councilors.items():
        fid = (c.get("faction") or {}).get("value")
        if fid in (None, my_id) or c_intel.get(cid, 0) + 1e-6 < COUNCILOR_GATES["details"]:
            continue
        for r in c.get("orgs") or []:
            add(r["value"], "rival", dict(_faction_ref(g, nm, g.factions.get(fid)),
                                          councilor=c.get("displayName")))
    for fid, f in g.factions.items():
        if fid == my_id or f_intel.get(fid, 0) + 1e-6 < GATES["unassignedOrgs"][0]:
            continue
        for r in f.get("unassignedOrgs") or []:
            add(r["value"], "rival", _faction_ref(g, nm, f))

    order = {"mine": 0, "market": 1, "rival": 2}
    rows.sort(key=lambda r: (order[r["where"]], -r["bonuses"]["miningBonus"],
                             -(r["bonuses"]["MCBonus"] + r["boost"]), r["name"] or ""))
    mining_now = sum(r["bonuses"]["miningBonus"] for r in rows
                     if r["where"] == "mine" and r["owner"])
    return rows, mining_now


def overview(g, lang="ita"):
    nm = Namer(g, lang)
    my_id = (g.me.get("ID") or {}).get("value")
    sites, market = _sites(g, lang, my_id, nm)
    orgs, mining_now = _orgs(g, lang, my_id, nm)
    return {
        "resources": [dict(gamedata.resource_view(lang, key), id=k,
                           price=market.get(key) or 0) for k, key in RESOURCES],
        "sites": sites,
        "prospectedBodies": len({s["body"]["id"] for s in sites if s["prospected"]}),
        "orgs": orgs,
        "orgMiningBonus": round(mining_now, 3),
        "labels": {"miningBonus": gamedata.loc(lang, "UI", "OrgTargeting", "SpaceMiningBonus", None),
                   "priorities": {k: [gamedata.priority_view(lang, p) for p in ps]
                                  for k, ps in ORG_PRIORITIES.items()}},
        "thresholds": {"prospected": INTEL_PROSPECTED, "councilor": COUNCILOR_GATES["details"],
                       "faction": GATES["unassignedOrgs"][0]},
    }
