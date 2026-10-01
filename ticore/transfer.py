"""Finestra di lancio dalla Terra verso un corpo celeste.

Il gioco la mostra nella schermata Intel (UI.Intel.LaunchWindowText) e nel
pannello del corpo (UI.Space.EarthLaunchWindow): una percentuale da 0 a 50 e
una freccia, verde se la finestra si avvicina, rossa se e' passata. Nel
salvataggio non c'e' (`HohmannDates` non viene scritto): si ricalcola come fa
il gioco, dalle orbite dei template. Regole lette dall'IL di
Assembly-CSharp.dll:

- `TINaturalSpaceObjectState.GetNextHohmannLaunchWindowDate`: data della
  prossima finestra di Hohmann, dalla differenza delle longitudini medie dei
  due corpi attorno al baricentro comune e dall'anticipo che serve al bersaglio
  (180 gradi meno quanto si muove durante il trasferimento).
- `TISpaceObjectState.genericSynodicPeriod_s`: periodo sinodico fra i due
  oggetti che orbitano il Sole (per una luna, il suo pianeta).
- `TISpaceObjectState.GetHohmannTimePenaltyFraction`: giorni alla finestra
  successiva o dalla precedente, il minore, diviso il periodo sinodico; poi
  gli effetti del contesto GenericTransfer_OffDate_PCT (Solar Steamers x0,75).
  `penaltyFromPrior` = la finestra e' passata (freccia rossa).
- Allungano solo il TEMPO di trasferimento (`GenericTransferTime_s`): il costo
  in spinta da Terra (`GenericTransferBoostFromEarthSurface`) usa un delta-v di
  Hohmann fisso.

Niente finestra per la Terra, le sue lune e i corpi senza periodo sinodico
utile (come nel gioco: testo vuoto).
"""

import math
from datetime import datetime

G = 6.67384E-11                     # costante del gioco
AU_M = 149597870700.0
MAX_SYNODIC_DAYS = 219145.3125      # oltre: nessuna finestra
OFF_DATE_CONTEXT = "GenericTransfer_OffDate_PCT"


def _dt(d):
    if not d:
        return None
    return datetime(d["year"], d["month"], d["day"], d.get("hour", 0), d.get("minute", 0),
                    d.get("second", 0), d.get("millisecond", 0) * 1000)


def apply_effects(effect_tpl, names, base):
    """TIEffectsState.SumEffectsModifiers + base: gli effetti nell'ordine in
    cui la fazione li ha, ognuno con la sua operazione."""
    v = base
    for n in names:
        e = effect_tpl.get(n) or {}
        if e.get("strValue"):
            continue
        op, x = e.get("operation"), e.get("value") or 0
        if op == "SetToFixedValue":
            v = x
        elif op == "IncreaseToValue":
            v = max(v, x)
        elif op == "DecreaseToValue":
            v = min(v, x)
        elif op == "Additive":
            v += x
        elif op == "Multiplicative":
            v *= x
    return v


def faction_effects(g, faction_id, context):
    """Nomi degli effetti attivi della fazione in un contesto, in ordine."""
    for es in g.state("TIEffectsState").values():
        for e in es.get("factionEffectsNames") or []:
            if (e.get("Key") or {}).get("value") == faction_id:
                return list((e.get("Value") or {}).get(context) or [])
    return []


class Orbits:
    """Orbite dei corpi naturali: template (TISpaceObjectTemplate) + epoca
    del salvataggio (TISpaceObjectState.epoch_DateTime)."""

    def __init__(self, g, body_tpl):
        self.tpl = body_tpl
        self.epoch = {b.get("templateName"): _dt(b.get("epoch_DateTime"))
                      for b in g.state("TISpaceBodyState").values()}

    def parent(self, name):
        return (self.tpl.get(name) or {}).get("barycenterName")

    def mass(self, name):
        return (self.tpl.get(name) or {}).get("mass_kg") or 0.0

    def a_m(self, name):
        t = self.tpl.get(name) or {}
        if t.get("semiMajorAxis_km") is not None:
            return t["semiMajorAxis_km"] * 1000.0
        return (t.get("semiMajorAxis_AU") or 0.0) * AU_M

    def period_s(self, name):
        """TISpaceBodyState._orbitalPeriod_s: attorno al baricentro, senza la
        massa del corpo."""
        p = self.parent(name)
        if not p:
            return 1.0
        return 2 * math.pi * math.sqrt(self.a_m(name) ** 3 / (G * self.mass(p)))

    def chain(self, name):
        out = []
        while name and name not in out:
            out.append(name)
            name = self.parent(name)
        return out

    def sun_related(self, name):
        """GetSunOrbitingRelatedObject: l'antenato che orbita il Sole."""
        for n in self.chain(name):
            p = self.parent(n)
            if p and not self.parent(p):
                return n
        return None

    def common(self, a, b):
        """FindCommonBarycenter."""
        cb = self.chain(b)
        return next((n for n in self.chain(a) if n in cb), None)

    def _angles(self, name):
        """(Omega, omega, M0) in radianti; None se il template non li ha (il
        gioco li tira a caso a ogni caricamento: niente finestra stabile)."""
        t = self.tpl.get(name) or {}
        lan, ap, ma = t.get("longAscendingNode_Deg"), t.get("argPeriapsis_Deg"), t.get("meanAnomalyAtEpoch_Deg")
        lp, ml = t.get("longPeriapsis_Deg"), t.get("meanLongitude_Deg")
        if lan is None:
            return None
        if ap is None:
            if lp is None:
                return None
            ap = lp - lan
        if ma is None:
            if ml is None or lp is None:
                return None
            ma = ml - lp
        return math.radians(lan), math.radians(ap), math.radians(ma)

    def mean_longitude(self, name, when):
        """Omega + omega + M(t) (OrbitalElementsState.MeanLongitudeAtTime_Rad)."""
        ang, ep = self._angles(name), self.epoch.get(name)
        if ang is None or ep is None:
            return None
        lan, ap, m0 = ang
        m = m0 + 2 * math.pi * ((when - ep).total_seconds() / self.period_s(name))
        return lan + ap + (m % (2 * math.pi))

    def inclination(self, name):
        return math.radians((self.tpl.get(name) or {}).get("inclination_Deg") or 0.0)

    def lan(self, name):
        return math.radians((self.tpl.get(name) or {}).get("longAscendingNode_Deg") or 0.0)


def _synodic_s(o, origin, dest):
    """genericSynodicPeriod_s, con la retrogradita' dalle normali delle orbite."""
    a, b = o.sun_related(origin), o.sun_related(dest)
    if a == b:
        a, b = origin, dest
    if a == b or not a or not b or o.period_s(a) <= 0 or o.period_s(b) <= 0:
        return math.inf, False

    def normal(n):
        i, w = o.inclination(n), o.lan(n)
        v = (math.sin(i) * math.sin(w), -math.sin(i) * math.cos(w), math.cos(i))
        k = math.sqrt(sum(x * x for x in v))
        return [x / k for x in v]
    sign = 1 if sum(x * y for x, y in zip(normal(a), normal(b))) > 0 else -1
    return abs(1.0 / (1.0 / o.period_s(a) - sign / o.period_s(b))), sign == -1


def next_window(o, origin, dest, now):
    """(data della prossima finestra, periodo sinodico in s) come
    GetNextHohmannLaunchWindowDate; (None, inf) se non c'e' finestra."""
    com = o.common(origin, dest)
    if origin == dest or com in (origin, dest):
        return None, math.inf
    syn, retro = _synodic_s(o, origin, dest)
    if syn / 86400.0 > MAX_SYNODIC_DAYS:
        return None, math.inf
    if o.parent(origin) != com:
        origin = o.parent(origin)
    if o.parent(dest) != com:
        dest = o.parent(dest)
    mu = G * o.mass(com)
    hohmann_s = math.pi * math.sqrt((o.a_m(origin) + o.a_m(dest)) ** 3 / (8 * mu))
    rate_o = 360.0 / (o.period_s(origin) / 86400.0)
    rate_d = 360.0 / o.period_s(dest) * 86400.0 * (-1 if retro else 1)
    lead = 180.0 - 360.0 / o.period_s(dest) * hohmann_s
    while lead < 0:
        lead += 360.0
    lo, ld = o.mean_longitude(origin, now), o.mean_longitude(dest, now)
    if lo is None or ld is None:
        return None, math.inf
    diff = math.degrees((ld - lo) % (2 * math.pi))
    rel = rate_d - rate_o
    gap = lead - diff
    if gap < 0 and rel > 0:
        gap += 360.0
    elif gap > 0 and rel < 0:
        gap -= 360.0
    from datetime import timedelta
    return now + timedelta(days=gap / rel), syn


def penalty(when, now, synodic_s, off_date=lambda x: x):
    """GetHohmannTimePenaltyFraction: (frazione 0..0,5 con gli effetti,
    finestra gia' passata?)."""
    if when is None or synodic_s == math.inf:
        return None, False
    syn_d = synodic_s / 86400.0
    to_next = (when - now).total_seconds() / 86400.0
    since_prev = syn_d - to_next
    frac = min(to_next, since_prev) / syn_d
    return off_date(frac), since_prev < to_next


def earth_window(g, o, body, my_id, effect_tpl):
    """Finestra dalla Terra verso `body` per la fazione: None se il gioco non
    la mostra (Terra, sue lune), altrimenti {penalty, rising, date}."""
    if body == "Earth" or o.parent(body) == "Earth":
        return None
    now = _dt(next(iter(g.state("TITimeState").values()), {}).get("currentDateTime"))
    when, syn = next_window(o, "Earth", body, now)
    names = faction_effects(g, my_id, OFF_DATE_CONTEXT)
    frac, prior = penalty(when, now, syn, lambda x: apply_effects(effect_tpl, names, x))
    if frac is None:
        return None
    return {"penalty": round(frac, 4), "rising": prior, "date": when.strftime("%Y-%m-%d"),
            "synodicDays": round(syn / 86400.0, 1)}


# -- spinta per un modulo lanciato dalla Terra ---------------------------------
# TIHabModuleTemplate.CostFromEarth -> BoostCostFromEarth ->
# TISpaceObjectState.GenericTransferBoostFromEarthSurface: massa x e^(dV/EV) x
# spaceResourceToTons. dV = Hohmann dall'orbita bassa terrestre (piu' il cambio
# di inclinazione) + atterraggio sul sito. Nessuna dipendenza dalla finestra.

BASE_EV_KPS = 2.11                  # TISpaceObjectState.GenericTransferEV_kps
EV_CONTEXT = "GenericTransferEV_kps"
SPACE_RESOURCE_TO_TONS = 0.1        # TIGlobalConfig.spaceResourceToTons
GENERIC_LANDING_ALT_M = 200000.0    # DeltaVToLandFromInterface_kps, generic
# DragDeltaVSavingsToLand_Frac(aerodynamic=True)
DRAG_SAVINGS = {"Massive": 0.925, "Thick": 0.9, "Standard": 0.85, "Thin": 0.325}


class Body:
    """Grandezze di un corpo calcolate come TISpaceBodyState all'avvio."""

    def __init__(self, o, name):
        t = o.tpl.get(name) or {}
        self.name, self.t, self.o = name, t, o
        eq, mr = t.get("equatorialRadius_km"), t.get("meanRadius_km")
        dx = t.get("dimensionX_km") or (2 * eq if eq else 2 * (mr or 0))
        dy = t.get("dimensionY_km") or t.get("dimensionX_km") or (2 * eq if eq else 2 * (mr or 0))
        dz = (t.get("dimensionZ_km") or t.get("dimensionY_km") or t.get("dimensionX_km")
              or (2 * eq if eq else 2 * (mr or 0)))
        obl = t.get("oblateness")
        if obl is None:
            obl = (dx - dz) / dx if dx else 0.0
        if eq:
            polar = eq * (1 - obl)
        elif t.get("dimensionZ_km"):
            polar = t["dimensionZ_km"]
        else:
            polar = mr or 0.0
        if mr:
            self.mean_radius_km = mr
        elif eq:
            self.mean_radius_km = (2 * eq + polar) / 3
        else:
            self.mean_radius_km = (dx + dy + dz) / 6
        self.mean_radius_m = self.mean_radius_km * 1000.0
        self.max_radius_m = max(dx, dy, dz) / 2 * 1000.0
        self.mass = t.get("mass_kg") or 0.0
        self.mu = G * self.mass
        rot = t.get("rotationPeriod_strHours")
        if rot == "Lock":
            self.rotation_s = o.period_s(name)
        else:
            try:
                self.rotation_s = float(rot) * 3600.0
            except (TypeError, ValueError):
                self.rotation_s = 0.0
        self.surface_g = self.mu / self.mean_radius_m ** 2 if self.mean_radius_m else 0.0

    def mean_velocity(self):
        p = self.o.parent(self.name)
        a = self.o.a_m(self.name)
        return math.sqrt(G * self.o.mass(p) / a) if p and a else 0.0


def _orbit_sma(o, orbit_tpl, bary):
    """TIOrbitTemplate.SemiMajorAxis_m + i limiti di TIOrbitState (Hill, pavimento).
    La correzione per le orbite vicine alla rotazione sincrona resta fuori."""
    t = orbit_tpl or {}
    if t.get("semiMajorAxis_km") is not None:
        a = t["semiMajorAxis_km"] * 1000.0
    elif t.get("altitude_km") is not None:
        a = (bary.mean_radius_km + t["altitude_km"]) * 1000.0
    elif t.get("semiMajorAxis_AU") is not None:
        a = t["semiMajorAxis_AU"] * AU_M
    else:
        return None
    p = o.parent(bary.name)
    if p and o.mass(p):
        bt = bary.t
        hill = o.a_m(bary.name) * (1 - (bt.get("eccentricity") or 0)) * (bary.mass / (3 * o.mass(p))) ** (1 / 3)
        a = min(a, hill)
    a = max(a, bary.max_radius_m + 10000)
    if not a > bary.mean_radius_m + 1000:
        a = (bary.mean_radius_km + 2000) * 1000.0
    return a


class Launcher:
    """Spinta per lanciare un modulo dalla Terra verso i siti, per una fazione."""

    def __init__(self, g, o, orbit_tpl, effect_tpl, my_id):
        self.o, self.orbit_tpl = o, orbit_tpl
        self.bodies = {}
        ids = {b.get("ID", {}).get("value"): b.get("templateName")
               for b in g.state("TISpaceBodyState").values()}
        self.interface = {}            # corpo -> [templateName delle orbite d'interfaccia]
        for orb in g.state("TIOrbitState").values():
            if not orb.get("interfaceOrbit") or orb.get("archived"):
                continue
            body = ids.get((orb.get("barycenter") or {}).get("value"))
            self.interface.setdefault(body, []).append(orb.get("templateName"))
        # GameStateManager.LEOStates()[0]: la prima orbita d'interfaccia terrestre
        leo = (self.interface.get("Earth") or [None])[0]
        self.leo_sma = _orbit_sma(o, orbit_tpl.get(leo), self.body("Earth")) if leo else None
        self.ev = apply_effects(effect_tpl, faction_effects(g, my_id, EV_CONTEXT), BASE_EV_KPS)

    def body(self, name):
        if name not in self.bodies:
            self.bodies[name] = Body(self.o, name)
        return self.bodies[name]

    def transfer_dv_mps(self, dest):
        """GenericTransferDeltaV_mps da LEO: Hohmann + inclinazione."""
        o = self.o
        if "Earth" in o.chain(dest):
            if dest == "Earth" or self.leo_sma is None:
                return None
            # una luna della Terra: dal raggio di LEO, con inclinazione e
            # velocita' della Terra (TIOrbitState.ref_spaceObject = la Terra)
            sat = next(n for n in o.chain(dest) if o.parent(n) == "Earth")
            c, r1, r2, n1, n2 = "Earth", self.leo_sma, o.a_m(sat), "Earth", sat
        else:
            sun = o.sun_related(dest)
            if not sun:
                return None
            c, r1, r2, n1, n2 = o.parent(sun), o.a_m("Earth"), o.a_m(sun), "Earth", sun
        mu = G * o.mass(c)
        if not (mu and r1 and r2) or abs(r2 - r1) < 1e-6 * max(r1, r2):
            return None                 # ramo di Lagrange: non serve per i siti
        dv1 = math.sqrt(mu / r1) * (math.sqrt(2 * r2 / (r1 + r2)) - 1)
        dv2 = math.sqrt(mu / r2) * (1 - math.sqrt(2 * r1 / (r1 + r2)))
        di = abs(o.inclination(n1) - o.inclination(n2))
        v = min(self.body(n1).mean_velocity(), self.body(n2).mean_velocity())
        return abs(dv1 + dv2) + 2 * math.sin(di / 2) * v

    def landing_kps(self, body, latitude):
        """TIHabSiteState.DeltaVToLandFromInterface_kps(generic, aerodynamic)."""
        P = self.body(body)
        if not P.mu or not P.mean_radius_m:
            return None
        alts = []
        for name in self.interface.get(body) or []:
            a = _orbit_sma(self.o, self.orbit_tpl.get(name), P)
            if a:
                alts.append(a - P.mean_radius_m)
        h = min(alts) if alts else None
        if h is None or h > GENERIC_LANDING_ALT_M:
            h = GENERIC_LANDING_ALT_M
        r = h + P.mean_radius_m
        v = math.sqrt(P.mu / r)
        g_o = P.mu / r ** 2
        v_rot = (math.cos(math.radians(latitude or 0)) * 2 * math.pi * P.mean_radius_km
                 / P.rotation_s * 1000.0) if P.rotation_s else 0.0
        dv_h = v - v_rot
        if dv_h < 0:
            dv_h = v + v_rot
        g = (g_o + P.surface_g) / 2
        dv_g = math.sqrt(2 * h / g) * g
        frac = DRAG_SAVINGS.get(P.t.get("atmosphere"), 0.0)
        return (dv_g + dv_h) * (1 - frac) / 1000.0

    def module_boost(self, module_tpl, body, latitude):
        """Spinta per un modulo nuovo (non un ampliamento) su un sito del
        corpo. Solo moduli senza regole speciali (il Nucleo avamposto)."""
        rules = [r for r in module_tpl.get("specialRules") or [] if r != "none"] if module_tpl else []
        if not module_tpl or rules or module_tpl.get("mine"):
            return None
        tr = self.transfer_dv_mps(body)
        land = self.landing_kps(body, latitude)
        if tr is None or land is None:
            return None
        irr = self.body(body).t.get("irradiatedMultiplier") or 0
        m1 = module_tpl.get("baseMass_tons") or 0
        weights = sum((module_tpl.get("weightedBuildMaterials") or {}).values())
        mass = weights * m1 + (m1 * irr - m1 if irr > 1 else 0)
        return mass * math.exp((tr / 1000.0 + land) / self.ev) * SPACE_RESOURCE_TO_TONS
