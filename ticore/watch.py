"""Corpi sorvegliati della scheda Estrazione: avvisano quando conviene lanciare.

Una sola banda per tutti i corpi, sulla linea del tempo della finestra di
lancio: a sinistra dello zero la finestra si avvicina (freccia verde del
gioco), a destra e' passata (freccia rossa). La posizione e' la penalita' del
gioco (transfer.py) con il segno: -0,12 = mancano il 12%, +0,05 = passata da
poco. Il corpo avvisa quando la posizione e' nella banda, ha almeno un sito
libero (per quel che si vede) e, se richiesto, la spinta basta per un Nucleo
avamposto.
"""

DEFAULT_BAND = (-10, 10)            # percento
LIMIT = 50                          # la penalita' va da 0 a 50%


def normalize(data):
    data = data or {}
    try:
        lo, hi = (int(round(float(x))) for x in (data.get("band") or DEFAULT_BAND))
    except (TypeError, ValueError):
        lo, hi = DEFAULT_BAND
    lo, hi = (max(-LIMIT, min(LIMIT, x)) for x in (lo, hi))
    if lo > hi:
        lo, hi = hi, lo
    bodies = {}
    for k, v in (data.get("bodies") or {}).items():
        if isinstance(k, str) and k:
            bodies[k] = {"boost": bool((v or {}).get("boost"))}
    return {"band": [lo, hi], "bodies": bodies}


def position(window):
    """Penalita' col segno: negativa prima della finestra, positiva dopo."""
    if not window:
        return None
    return window["penalty"] * (1 if window["rising"] else -1)


def matches(snap, watch):
    """[(riga del corpo, cosa e' soddisfatto)] dei corpi sorvegliati che
    avvisano ora."""
    watch = normalize(watch)
    lo, hi = (x / 100.0 for x in watch["band"])
    boost = (snap.get("resources") or {}).get("Boost") or 0
    out = []
    for row in snap.get("launch") or []:
        opt = watch["bodies"].get(row["id"])
        if opt is None:
            continue
        pos = position(row.get("window"))
        if pos is None or not (lo - 1e-9 <= pos <= hi + 1e-9) or row.get("free", 0) <= 0:
            continue
        cost = row.get("outpostBoost")
        if opt["boost"] and (cost is None or boost + 1e-9 < cost):
            continue
        out.append((row, {"position": pos, "boost": opt["boost"], "cost": cost, "have": boost}))
    return out
