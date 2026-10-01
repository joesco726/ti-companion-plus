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
SEVERITIES = ("warning", "info")
KINDS = ("trait", "mission", "high", "low")
_TOKEN = re.compile(r"^(trait|mission|high|low):([A-Za-z0-9_]+)$")


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


def normalize(p, thresholds=None):
    """Il profilo come lo salviamo: campi noti, condizioni valide, niente doppioni."""
    p = p if isinstance(p, dict) else {}

    def tokens(key):
        out = []
        for x in p.get(key) or []:
            if isinstance(x, str) and _TOKEN.match(x) and x not in out:
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
    }


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
    kind, ident = token.split(":", 1)
    if kind == "trait":
        return gamedata.trait_name(lang, ident)
    if kind == "mission":
        return gamedata.mission_name(lang, ident)
    attr = gamedata.resource_name(lang, ident)
    rule = ("≥ %d" % thresholds["high"]) if kind == "high" else ("≤ %d" % thresholds["low"])
    v = ((c or {}).get("attributes") or {}).get(ident)
    return "%s %s (%s)" % (attr, v, rule) if v is not None else "%s %s" % (attr, rule)


def options(lang, used=()):
    """Cosa si puo' scegliere: tratti che un candidato puo' avere (niente aumenti,
    niente gradi da XP o da eventi), missioni, attributi. `used`: tratti gia'
    nei profili salvati, che restano nella lista anche se esclusi."""
    tpl = gamedata.templates()
    traits = [{"id": k, "name": gamedata.trait_name(lang, k)}
              for k in tpl["traits"]
              if k in used or (k != "dummy" and not is_augment(k) and spawnable(k))]
    missions = [{"id": m, "name": gamedata.mission_name(lang, m)}
                for m in gamedata.player_missions()]
    attrs = [{"id": a, "name": gamedata.resource_name(lang, a)} for a in ATTRS]
    by_name = lambda xs: sorted(xs, key=lambda x: x["name"].lower())
    return {"traits": by_name(traits), "missions": by_name(missions), "attributes": attrs}


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
    return met_all + met_any


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
