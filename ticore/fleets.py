"""Flotte aliene con una portaerei d'assalto dirette verso la Terra.

Il gioco avvisa da solo quando una lancia (`TISpaceFleetState.
GlobalCheckNotifyFleetLaunch` -> `LogAssaultCarrierLaunchesTowardEarth`, con la
data d'arrivo), ma solo al lancio. Qui la stessa regola resta accesa finche'
la flotta e' in viaggio, letta dall'IL di Assembly-CSharp.dll:

- flotta della fazione aliena, visibile al giocatore: intel sulla flotta >=
  `intelToSeeSpaceAssetLocationandComposition` (0,1: posizione E composizione,
  `TISpaceAssetState.VisibleToFaction`), come per la notifica del gioco;
- con una nave che ha un modulo `LandArmy` (`HasSpecialModuleCapability`:
  l'Alien Army Pod della portaerei d'assalto). Il gioco controlla anche che
  il modulo funzioni; il danno ai moduli qui non si legge;
- destinazione la Terra o un'orbita terrestre
  (`trajectory.destination.ref_spaceBody.isEarth`), traiettoria lanciata;
- giorni all'arrivo da `trajectory.arrivalTime`.
"""

from datetime import datetime

INTEL_TO_SEE = 0.1                  # TIGlobalConfig.intelToSeeSpaceAssetLocationandComposition
LAND_ARMY = "LandArmy"              # SpecialModuleRule
# se l'estratto non ha ancora i moduli: quello della portaerei d'assalto
LAND_ARMY_FALLBACK = {"AlienArmyPod"}


def _dt(d):
    if not isinstance(d, dict) or "year" not in d:
        return None
    return datetime(d["year"], d["month"], d["day"], d.get("hour", 0), d.get("minute", 0),
                    d.get("second", 0), d.get("millisecond", 0) * 1000)


def _resolve(obj, scope):
    """Json.NET conserva i riferimenti: {"$ref": "35375"} punta all'oggetto
    con "$id" 35375, di solito nella stessa traiettoria."""
    if not isinstance(obj, dict) or "$ref" not in obj:
        return obj
    want = obj["$ref"]
    stack = [scope]
    while stack:
        x = stack.pop()
        if isinstance(x, dict):
            if x.get("$id") == want:
                return x
            stack.extend(x.values())
        elif isinstance(x, list):
            stack.extend(x)
    return None


def _land_army_modules(utility_tpl):
    mods = {n for n, t in (utility_tpl or {}).items() if LAND_ARMY in (t.get("specialModuleRules") or [])}
    return mods or LAND_ARMY_FALLBACK


def incoming_carriers(g, utility_tpl, now):
    """[{name, ships, carriers, arrival, days}] delle flotte aliene visibili con
    una portaerei d'assalto in viaggio verso la Terra, dalla piu' vicina."""
    my_id = (g.me.get("ID") or {}).get("value")
    alien = next((f for f in g.factions.values() if f.get("templateName") == "AlienCouncil"), None)
    if not alien or now is None:
        return []
    alien_id = (alien.get("ID") or {}).get("value")
    pods = _land_army_modules(utility_tpl)
    carrier_designs = {d.get("dataName") for d in alien.get("shipDesigns") or []
                       if any(m.get("moduleName") in pods for m in d.get("moduleTemplateEntries") or [])}
    intel = {e["Key"]["value"]: e.get("Value") or 0 for e in g.me.get("intel") or []
             if str(e["Key"].get("$type", "")).endswith("TISpaceFleetState")}
    ships = g.state("TISpaceShipState")
    orbits = g.state("TIOrbitState")
    bodies = {b.get("ID", {}).get("value"): b.get("templateName") for b in g.state("TISpaceBodyState").values()}

    def earth(ref):
        if not ref:
            return False
        v, t = ref.get("value"), str(ref.get("$type", ""))
        if t.endswith("TIOrbitState"):
            return bodies.get(((orbits.get(v) or {}).get("barycenter") or {}).get("value")) == "Earth"
        return bodies.get(v) == "Earth"

    out = []
    for fid, f in g.state("TISpaceFleetState").items():
        if (f.get("faction") or {}).get("value") != alien_id or not f.get("exists", True) or f.get("archived"):
            continue
        if intel.get(fid, 0) + 1e-6 < INTEL_TO_SEE:
            continue
        tr = f.get("trajectory") or {}
        if not tr.get("launched") or not earth(tr.get("destination")):
            continue
        arrival = _dt(_resolve(tr.get("arrivalTime"), tr))
        if arrival is None or arrival < now:
            continue
        fleet_ships = [ships.get(r.get("value")) or {} for r in f.get("ships") or []]
        carriers = sum(1 for s in fleet_ships if s.get("templateName") in carrier_designs)
        if not carriers:
            continue
        name = next((e.get("Value") for e in f.get("displayNameByFaction") or []
                     if (e.get("Key") or {}).get("value") == my_id), None) or f.get("displayName")
        out.append({"id": fid, "name": name, "ships": len(fleet_ships), "carriers": carriers,
                    "arrival": arrival.strftime("%Y-%m-%d"),
                    "days": round((arrival - now).total_seconds() / 86400.0, 1)})
    out.sort(key=lambda x: x["days"])
    return out
