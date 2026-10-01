"""Profili di reclutamento: cosa cerco fra i candidati del mercato.

Un profilo e' un insieme di condizioni sui candidati, tutte su dati che la
schermata di reclutamento del gioco mostra (tratti, missioni, attributi):

- `all`:  le ha tutte;
- `any`:  ne ha almeno una (se la lista non e' vuota);
- `none`: non ne ha nessuna.

Una condizione e' una stringa `tipo:id`:

- `trait:QuickLearner`  ha il tratto;
- `mission:Purge`       puo' fare la missione (con `newMissionsOnly`, in
                        `all`/`any` conta solo se il consiglio non la ha gia');
- `high:Persuasion`     attributo effettivo >= soglia alta;
- `low:Espionage`       attributo effettivo <= soglia bassa.

Le due soglie valgono per tutti i profili. Un profilo senza condizioni in
`all` e `any` non trova nessuno: "non ha Inflessibile" da solo non e' una
ricerca.
"""

import re

from . import gamedata
from .council import ATTRS

THRESHOLDS = {"high": 6, "low": 2}
# limiti del cursore dell'eta': agli estremi il profilo non filtra per eta'
# (nei salvataggi i consiglieri vanno da 21 a 73 anni, i candidati da 33 a 57)
AGE_MIN, AGE_MAX = 20, 80
SEVERITIES = ("warning", "info")
KINDS = ("trait", "mission", "high", "low")
_TOKEN = re.compile(r"^(trait|mission|high|low):([A-Za-z0-9_]+)$")
# profili delle org: attributo, priorita'/spazio, ricerca, rendita, missione
_ORG_TOKEN = re.compile(r"^(attr|prio|sci|inc|mission):([A-Za-z0-9_]+)$")
ORG_INCOME = ("money", "influence", "ops", "research", "boost", "missionControl", "projects")


def is_augment(data_name):
    """Gli aumenti si comprano coi progetti e il gioco li tiene fra i tratti
    (tag «Augmented» o un `projectDataName`): fra i candidati non ci sono."""
    t = gamedata.templates()["traits"].get(data_name) or {}
    return "Augmented" in (t.get("tags") or []) or bool(t.get("projectDataName"))


def spawnable(data_name):
    """Il tratto puo' uscire su un consigliere generato? `baseChance` per tutti,
    `classChance` per tipo (es. 50 per le Celebrita'). A zero sono i gradi che si
    comprano con l'XP (Senior, Chief, Iron Hand...) e i tratti da eventi
    (Indebted, Marked...): fra i candidati del mercato non ci sono (verificato
    sui candidati di quattro salvataggi)."""
    t = gamedata.templates()["traits"].get(data_name) or {}
    return (t.get("baseChance") or 0) > 0 or any(
        (e or {}).get("chance", 0) > 0 for e in t.get("classChance") or [])


def spawn_chances(data_name):
    """{tipo: probabilita' in %} del tratto su un consigliere nuovo di quel
    tipo: `classChance` del tipo se > 0, altrimenti `baseChance`. Che sia una
    percentuale per consigliere torna coi salvataggi: su 203 consiglieri
    generati a caso, Government attesi 68 e trovati 77, Family Ties 50 e 53,
    Affluent 48 e 52 (i tratti che si migliorano, come Agitator, se ne trovano
    meno: sono diventati Firebrand)."""
    t = gamedata.templates()["traits"].get(data_name) or {}
    base = t.get("baseChance") or 0
    own = {e.get("councilorClass"): e.get("chance", 0) for e in t.get("classChance") or []}
    out = {}
    for k in gamedata.templates()["councilorTypes"]:
        c = own.get(k, 0) or base
        if k != "Alien" and c > 0:
            out[k] = c
    return out


def spawn_types(data_name):
    """I tipi di consigliere su cui il tratto puo' uscire. Un tipo senza
    probabilita' propria in `classChance` (voce assente, senza numero o a 0)
    ricade su `baseChance`: verificato sui consiglieri generati a caso di
    quattro salvataggi (205 diversi, nessuna eccezione). Le eccezioni sono i
    consiglieri predefiniti del gioco (templateName «pregenC...», es. Levi
    Newell, Commando con Social Scientist), che hanno tratti scelti a mano."""
    t = gamedata.templates()["traits"].get(data_name) or {}
    base = t.get("baseChance") or 0
    own = {e.get("councilorClass"): e.get("chance", 0) for e in t.get("classChance") or []}
    return [k for k in gamedata.templates()["councilorTypes"]
            if k != "Alien" and (own.get(k, 0) > 0 or base > 0)]


def presets(lang):
    """I consiglieri predefiniti del gioco con tratti scelti a mano
    (TICouncilorTemplate, «pregenC...»): possono avere combinazioni che un
    consigliere generato a caso non ha (Levi Newell: Commando con Social
    Scientist e Military Scientist). Escono solo per le fazioni in
    `allowedIdeologies`: nei salvataggi, 18 predefiniti su 18 stanno in una
    fazione permessa. Quelli coi tratti casuali seguono le regole normali e
    restano fuori, come quelli di debug."""
    tpl = gamedata.templates()
    out = []
    for o in tpl.get("councilors", {}).values():
        if o.get("randomized") or o.get("alien") or o.get("debugOnly") \
                or o.get("randomizeTraits") or not o.get("traits"):
            continue
        typ = tpl["councilorTypes"].get(o.get("type")) or {}
        traits = [tpl["traits"].get(t) or {} for t in o["traits"]]
        missions = set(typ.get("missionNames") or [])
        for t in traits:
            missions |= set(t.get("missionsGrantedNames") or [])
        for t in traits:
            missions -= set(t.get("restrictedMissionNames") or [])
        out.append({
            "id": o["dataName"],
            "name": ("%s %s" % (o.get("personalName") or "", o.get("familyName") or "")).strip(),
            "type": o.get("type"),
            "traits": o["traits"],
            "missions": sorted(missions & set(gamedata.player_missions())),
            "ideologies": o.get("allowedIdeologies") or [],
        })
    return out


def normalize(p, thresholds=None):
    """Il profilo come lo salviamo: campi noti, condizioni valide, niente doppioni."""
    p = p if isinstance(p, dict) else {}

    org = p.get("kind") == "org"
    rx = _ORG_TOKEN if org else _TOKEN

    def tokens(key):
        out = []
        for x in p.get(key) or []:
            if isinstance(x, str) and rx.match(x) and x not in out:
                out.append(x)
        return out

    sev = p.get("severity")
    return {
        "name": str(p.get("name") or "").strip()[:80],
        "enabled": p.get("enabled") is not False,
        "severity": sev if sev in SEVERITIES else "warning",
        "all": tokens("all"),
        "any": tokens("any"),
        "none": tokens("none"),
        "newMissionsOnly": bool(p.get("newMissionsOnly")),
        # fascia d'eta' (anni compiuti, come nella schermata di reclutamento);
        # None = nessun limite da quella parte
        "ageMin": _age(p.get("ageMin"), AGE_MIN),
        "ageMax": _age(p.get("ageMax"), AGE_MAX),
    } if not org else {
        "kind": "org",
        "name": str(p.get("name") or "").strip()[:80],
        "enabled": p.get("enabled") is not False,
        "severity": sev if sev in SEVERITIES else "warning",
        "all": tokens("all"),
        "any": tokens("any"),
        "none": tokens("none"),
        # come l'allerta generica: org che posso pagare e che qualcuno puo' tenere
        "affordableOnly": p.get("affordableOnly") is not False,
        "holdableOnly": p.get("holdableOnly") is not False,
        # limiti per condizione, nelle unita' mostrate (attributi e rendite come
        # sono, priorita' e ricerca in %): {"attr:persuasion": {"min": 2, "max": 3}}
        "ranges": _org_ranges(p.get("ranges"), tokens("all") + tokens("any") + tokens("none")),
        # dimensione dell'org in stelle (tier 1-3); vuota = qualunque
        "tiers": sorted({int(x) for x in p.get("tiers") or [] if str(x) in ("1", "2", "3")}),
    }


def _age(v, edge):
    """Un estremo della fascia d'eta': intero fra i limiti, None se manca o se
    sta sul limite (= nessun filtro da quella parte)."""
    try:
        v = int(v)
    except (TypeError, ValueError):
        return None
    v = max(AGE_MIN, min(AGE_MAX, v))
    return None if v == edge else v


def normalize_thresholds(th):
    th = th if isinstance(th, dict) else {}
    out = {}
    for k, default in THRESHOLDS.items():
        try:
            out[k] = int(th.get(k, default))
        except (TypeError, ValueError):
            out[k] = default
    return out


def label(token, lang, thresholds, c=None):
    """Nome leggibile di una condizione, coi nomi della localizzazione del gioco.
    Con il candidato `c`, gli attributi mostrano anche il suo valore."""
    if token == "age":
        from .texts import t
        return t("profile.age", lang, (c or {}).get("age"))
    kind, ident = token.split(":", 1)
    if kind == "trait":
        return gamedata.trait_name(lang, ident)
    if kind == "mission":
        return gamedata.mission_name(lang, ident)
    attr = gamedata.resource_name(lang, ident)
    rule = ("≥ %d" % thresholds["high"]) if kind == "high" else ("≤ %d" % thresholds["low"])
    v = ((c or {}).get("attributes") or {}).get(ident)
    return "%s %s (%s)" % (attr, v, rule) if v is not None else "%s %s" % (attr, rule)


# Ordine dei tratti dentro alcune sezioni, al posto di quello alfabetico:
# - Influence (3): come sul wiki, ogni catena di miglioramenti da sinistra a
#   destra (Connected -> Puppet Master, Eminent -> Famous -> Megastar...);
# - Nation (4): dal piu' comune al piu' estremo, scelto dall'utente.
# Wealth (1) va per denaro al mese (incomeMoney), che e' anche la sua catena.
TRAIT_ORDER = {
    3: ["LowProfile", "Connected", "PuppetMaster", "Eminent", "Famous", "Megastar",
        "OpinionLeader", "MediaDarling", "ElderStatesman", "Counselor", "Unifier",
        "Agitator", "Firebrand", "Demagogue"],
    4: ["Government", "Criminal", "EnemyoftheState", "Pariah", "NationalHero"],
}


def _trait_rank(k, t):
    """Chiave d'ordine dentro la sezione: prima della chiave c'e' il nome."""
    g = t.get("grouping")
    if g == 1:
        return t.get("incomeMoney") or 0
    order = TRAIT_ORDER.get(g)
    if order and k in order:
        return order.index(k)
    return len(order) if order else 0


def options(lang, used=()):
    """Cosa si puo' scegliere: tratti che un candidato puo' avere (niente aumenti,
    niente gradi da XP o da eventi), missioni, attributi. `used`: tratti gia'
    nei profili salvati, che restano nella lista anche se esclusi."""
    tpl = gamedata.templates()
    # `group` e' il `grouping` del template: le stesse sezioni del wiki ufficiale
    # (1 Wealth, 2 Scientist, 3 Influence... 20 National Priority), None = senza gruppo
    # per il controllo delle combinazioni impossibili (RecruitProfiles.tsx):
    # tipi su cui esce, missioni che da' e che toglie. Due tratti dello stesso
    # `grouping` non escono insieme: su 205 consiglieri generati a caso nessuno
    # ne ha due della stessa sezione.
    traits = [{"id": k, "name": gamedata.trait_name(lang, k),
               "group": tpl["traits"][k].get("grouping"),
               "types": spawn_types(k),
               "chances": spawn_chances(k),
               "grants": tpl["traits"][k].get("missionsGrantedNames") or [],
               "restricts": tpl["traits"][k].get("restrictedMissionNames") or []}
              for k in tpl["traits"]
              if k in used or (k != "dummy" and not is_augment(k) and spawnable(k))]
    # `attribute`: su cosa tira la missione (None per Advise, Proteggi...)
    missions = [{"id": m, "name": gamedata.mission_name(lang, m),
                 "attribute": gamedata.mission_attribute(m),
                 "types": [k for k, v in tpl["councilorTypes"].items()
                           if k != "Alien" and m in (v.get("missionNames") or [])]}
                for m in gamedata.player_missions()]
    attrs = [{"id": a, "name": gamedata.resource_name(lang, a)} for a in ATTRS]
    by_name = lambda xs: sorted(xs, key=lambda x: x["name"].lower())
    # dentro ogni sezione: l'ordine di TRAIT_ORDER / incomeMoney, poi il nome
    traits = sorted(by_name(traits), key=lambda x: _trait_rank(x["id"], tpl["traits"][x["id"]]))
    types = [{"id": k, "name": gamedata.councilor_type_name(lang, k)}
             for k in tpl["councilorTypes"] if k != "Alien"]
    return {"traits": traits, "missions": by_name(missions), "attributes": attrs,
            "types": by_name(types), "presets": presets(lang), "ageRange": [AGE_MIN, AGE_MAX]}


def _test(c, token, thresholds, new_only):
    kind, ident = token.split(":", 1)
    if kind == "trait":
        return any(t["id"] == ident for t in c.get("traits") or [])
    if kind == "mission":
        m = next((m for m in c.get("missionList") or [] if m["id"] == ident), None)
        return bool(m) and (m.get("new") or not new_only)
    v = (c.get("attributes") or {}).get(ident)
    if v is None:
        return False
    return v >= thresholds["high"] if kind == "high" else v <= thresholds["low"]


def match(c, p, thresholds):
    """Le condizioni soddisfatte (da mostrare nell'allerta), o None se il
    candidato non corrisponde al profilo."""
    if not p.get("all") and not p.get("any"):
        return None
    # fascia d'eta': chi non ha una data di nascita non si esclude
    age = c.get("age")
    lo, hi = p.get("ageMin"), p.get("ageMax")
    if age is not None and ((lo is not None and age < lo) or (hi is not None and age > hi)):
        return None
    new_only = p.get("newMissionsOnly")
    met_all = [x for x in p["all"] if _test(c, x, thresholds, new_only)]
    if len(met_all) < len(p["all"]):
        return None
    met_any = [x for x in p["any"] if _test(c, x, thresholds, new_only)]
    if p["any"] and not met_any:
        return None
    # "non ha": la missione conta se c'e', che il consiglio la abbia o no
    if any(_test(c, x, thresholds, False) for x in p["none"]):
        return None
    with_age = ["age"] if age is not None and (lo is not None or hi is not None) else []
    return met_all + met_any + with_age


def matches(snap, profiles, thresholds):
    """{id profilo: [(candidato, condizioni soddisfatte)]}, solo profili attivi."""
    out = {}
    for p in profiles:
        if not p.get("enabled"):
            continue
        hits = [(c, m) for c in (snap or {}).get("recruits") or []
                if (m := match(c, p, thresholds)) is not None]
        if hits:
            out[p["id"]] = hits
    return out


# -- profili delle org ------------------------------------------------------
# Le stesse liste dei candidati, su cio' che l'org da': attributi, bonus alle
# priorita' nazionali e allo spazio (estrazione compresa), ricerca per
# categoria, rendite, missioni. Una condizione vale se il valore e' > 0.

def _org_ranges(raw, tokens):
    """Solo i limiti delle condizioni presenti (non le missioni), numeri veri."""
    out = {}
    for tok in tokens:
        if tok.startswith("mission:"):
            continue
        r = (raw or {}).get(tok) if isinstance(raw, dict) else None
        if not isinstance(r, dict):
            continue
        lim = {}
        for k in ("min", "max"):
            try:
                if r.get(k) not in (None, ""):
                    lim[k] = float(r[k])
            except (TypeError, ValueError):
                pass
        if lim:
            out[tok] = lim
    return out


# campi del template delle org per ogni condizione: il valore di un'org e' fra
# base e base + rand (verificato su 2754 org di quattro salvataggi: 8448 valori,
# nessuno fuori). I posti progetto li da' la dimensione (1-3 nei salvataggi).
_ORG_FIELDS = {"attr": {a: a[0].lower() + a[1:] for a in ATTRS},
               "inc": {"money": "incomeMoney", "influence": "incomeInfluence", "ops": "incomeOps",
                       "research": "incomeResearch", "boost": "incomeBoost",
                       "missionControl": "incomeMissionControl"}}


def org_value_ranges():
    """{condizione: [min, max]} che un'org puo' avere, dalle org casuali e da
    quelle predefinite del gioco, nelle unita' mostrate."""
    from .council import ORG_BONUS_FIELDS
    orgs = gamedata.templates()["orgs"].values()
    cap = lambda s: s[0].upper() + s[1:]

    def span(field, scale=1):
        vals = [(t.get(field) or 0, (t.get(field) or 0) + (t.get("rand" + cap(field)) or 0))
                for t in orgs if t.get(field) and (t.get("chance" + cap(field)) is None
                                                   or t.get("chance" + cap(field)) > 0)]
        if not vals:
            return None
        return [round(min(a for a, _ in vals) * scale, 1), round(max(b for _, b in vals) * scale, 1)]

    out = {}
    for a, f in _ORG_FIELDS["attr"].items():
        out["attr:" + a] = span(f)
    for f in ORG_BONUS_FIELDS:
        out["prio:" + f] = span(f, 100)
    for k, f in _ORG_FIELDS["inc"].items():
        out["inc:" + k] = span(f)
    out["inc:projects"] = [1, 3]
    sci = [b["bonus"] for t in orgs for b in t.get("techBonuses") or [] if b.get("bonus")]
    cats = {b["category"] for t in orgs for b in t.get("techBonuses") or [] if b.get("category")}
    for c in cats:
        vs = [b["bonus"] for t in orgs for b in t.get("techBonuses") or [] if b.get("category") == c and b.get("bonus")]
        out["sci:" + c] = [round(min(vs) * 100, 1), round(max(vs) * 100, 1)]
    return {k: v for k, v in out.items() if v}


def org_options(lang):
    """Cosa si puo' scegliere per le org, coi nomi del gioco dove ci sono."""
    from .council import ORG_BONUS_FIELDS
    prio = []
    for field, key in ORG_BONUS_FIELDS.items():
        # estrazione e programmi spaziali non hanno una priorita' col loro nome:
        # l'etichetta la mette l'interfaccia
        prio.append({"id": field, "name": gamedata.priority_name(lang, key) if key else None,
                     "icon": gamedata.PRIORITIES.get(key, (None, None))[1] if key else None})
    cats = sorted({b["category"] for o in gamedata.templates()["orgs"].values()
                   for b in o.get("techBonuses") or [] if b.get("category")})
    sci = [{"id": c, "name": gamedata.strings(lang).get("UI.Science.Category.%s" % c, c)} for c in cats]
    inc = [{"id": k, "name": gamedata.resource_name(lang, {
        "money": "Money", "influence": "Influence", "ops": "Operations", "research": "Research",
        "boost": "Boost", "missionControl": "MissionControl", "projects": "Projects"}[k])}
        for k in ORG_INCOME]
    missions = sorted(({"id": m, "name": gamedata.mission_name(lang, m),
                        "attribute": gamedata.mission_attribute(m)}
                       for m in gamedata.player_missions()), key=lambda x: x["name"].lower())
    attrs = [{"id": a, "name": gamedata.resource_name(lang, a)} for a in ATTRS]
    return {"attributes": attrs, "priorities": prio, "science": sci, "income": inc,
            "ranges": org_value_ranges(),
            "missions": missions}


def _org_value(o, token):
    kind, ident = token.split(":", 1)
    if kind == "attr":
        return (o.get("attributes") or {}).get(ident) or 0
    if kind == "prio":
        return (o.get("bonuses") or {}).get(ident) or 0
    if kind == "sci":
        return (o.get("techBonuses") or {}).get(ident) or 0
    if kind == "inc":
        return o.get("projectSlots") or 0 if ident == "projects" else (o.get("income") or {}).get(ident) or 0
    return 1 if ident in (o.get("missionsGranted") or []) else 0


def _shown(o, token):
    """Il valore di una condizione nelle unita' mostrate (priorita' e ricerca in %)."""
    v = _org_value(o, token)
    return v * 100 if token.split(":", 1)[0] in ("prio", "sci") else v


def org_match(o, p):
    """Le condizioni soddisfatte, o None se l'org non corrisponde al profilo.
    Senza limiti una condizione vale se l'org da' quella cosa (> 0); coi
    limiti, se il valore sta fra minimo e massimo (0 se non la da')."""
    if not p.get("all") and not p.get("any"):
        return None
    if p.get("affordableOnly") and not o.get("affordable"):
        return None
    if p.get("holdableOnly") and not o.get("eligible"):
        return None
    if p.get("tiers") and o.get("tier") not in p["tiers"]:
        return None
    ranges = p.get("ranges") or {}

    def has(x):
        r = ranges.get(x)
        v = _shown(o, x)
        if not r:
            return v > 0
        return (r.get("min") is None or v >= r["min"] - 1e-9) and (r.get("max") is None or v <= r["max"] + 1e-9)
    if not all(has(x) for x in p["all"]):
        return None
    met_any = [x for x in p["any"] if has(x)]
    if p["any"] and not met_any:
        return None
    if any(has(x) for x in p["none"]):
        return None
    return list(p["all"]) + met_any


def org_matches(snap, profiles):
    """{id profilo: [(org, condizioni soddisfatte)]}, solo profili attivi."""
    out = {}
    for p in profiles:
        if not p.get("enabled"):
            continue
        hits = [(o, m) for o in (snap or {}).get("orgMarket") or []
                if (m := org_match(o, p)) is not None]
        if hits:
            out[p["id"]] = hits
    return out


def org_label(token, lang, o=None):
    """Nome leggibile di una condizione, col valore dell'org se c'e'."""
    kind, ident = token.split(":", 1)
    opts = org_options(lang)
    if kind == "mission":
        return gamedata.mission_name(lang, ident)
    pool = {"attr": opts["attributes"], "prio": opts["priorities"], "sci": opts["science"],
            "inc": opts["income"]}[kind]
    name = next((x["name"] for x in pool if x["id"] == ident), None) or {
        "miningBonus": texts_t("org.mining", lang), "spaceflightBonus": texts_t("org.spaceflight", lang),
    }.get(ident, ident)
    if o is None:
        return name
    v = _org_value(o, token)
    if kind in ("prio", "sci"):
        return "%s +%g%%" % (name, round(v * 100, 1))
    return "%s %+g" % (name, v)


def texts_t(key, lang):
    from .texts import t
    return t(key, lang)
