# Changelog

TI Companion Plus is a spin-off of [b4p3p's Terra Invicta Companion](https://github.com/b4p3p/terrainvicta-companion).
This file lists what changed since the fork. The fork point is b4p3p's commit `49e7082`
(30 September 2026).

The project rule still holds for every feature below: the companion only reads what the
game already shows you. Where a number is our own calculation, the app says so and shows
the raw values next to it.

## Since the fork

### Highlights

- **Recruitment and org profiles.** Describe the councilors or orgs you want once; the
  companion alerts you when one shows up on the market.
- **Launch windows and watched bodies.** See the Earth launch window for every mining
  body and get an alert when it opens and a site is free.
- **Assault carrier warning.** A critical alert that counts down to the arrival of an
  alien assault carrier you can see, with escalating tags.
- **Mine network.** The "mines used / mines allowed" number the game hides in the
  mission control tooltip, as a stat and an alert.
- **DLC scenarios.** Broken Earth and 2003 games now use their own data, so control
  points and names come out right.

### Council and recruitment

- **Recruitment profiles** (Council → recruits). Each profile combines conditions on
  traits, missions and high or low attributes:
  - pick them from a tag grid organised like the official wiki's trait sections, each
    tag cycling through "has all", "at least one" and "none";
  - optionally count a mission only if your council doesn't already have it;
  - set an age range with a two-handle slider;
  - turn each profile on or off and choose its alert level.
- **Profile sanity checks**, from the game's spawn rules:
  - a warning when no randomly generated councilor can have the combination, naming the
    smallest pair that can't go together;
  - a warning for rare combinations, with the chance per councilor type;
  - a note when only one of the game's preset councilors fits, and whether they can
    appear for your faction.
- Only traits a candidate can actually spawn with are offered; XP ranks and event traits
  are left out.
- The recruitment button sits at the top of the team list, full width.

### Organizations

- **New Organizations tab**, between Council and Missions, holding the org market and
  org profiles.
- **Org profiles.** Alert only for the orgs you want:
  - conditions on attributes, national and space priorities (mining included), research
    categories, incomes and granted missions;
  - optional "at least / at most" limits, with the possible values as hints;
  - size filter in stars (★ ★★ ★★★), shown next to org names too;
  - "can afford" and "someone on the council can hold it" filters.
- **Org bonuses with the game's icons**, in three aligned columns (attributes · bonuses ·
  incomes), on the market and in each councilor's org list.
- The game's own name for the spaceflight bonus ("Boost") is used.

### Space → Mining

- **Launch window column.** The transit penalty from Earth (0–50%) with the game's
  arrow (green ↓ approaching, red ↑ passed), the next window date and the cycle length.
  It's computed exactly as the game does, from the orbits, and checked against the
  in-game Intel screen.
- **Watched bodies.** A 🔕 → 🔔 → 🔔🚀 button per body and a single −50…+50% band slider
  (default −10…+10). A watched body alerts when its window is in the band and it has a
  free site. With 🚀 it also needs your boost to cover an Outpost Core.
- **Outpost Core boost cost from Earth**, shown per body. It uses the game's formula:
  Hohmann delta-v from low Earth orbit plus landing at the site, and your rockets'
  exhaust velocity. It matches the game (41 Daphne: 10.1). The window doesn't change it;
  the penalty only lengthens the trip.
- **Stars on prospected sites.** ★ next to a site's class resources (e.g. water +
  volatiles for a Common Carbonaceous) when their true sum beats the top of the range
  the game showed for that class on that body before the probe.
- **Mine network stat**, "17/24": active mines against how many the network supports
  without extra mission control. Neutral below the cap, green at it, amber 1–4 over,
  red 5+ over.

### Alerts

- **Assault carrier inbound** (critical).
  - **Trigger:** a visible alien fleet carrying an assault carrier is on its way to
    Earth orbit.
  - **Title** escalates as it gets closer: `PRIORITY` (180–101 days) → `IMMEDIATE`
    (100–21) → `FLASH` (≤20), e.g. "PRIORITY — Alien assault carrier inbound: Victor-7,
    T-140 days".
  - **No spoilers:** the wording only repeats what the game's own notification says.
  - **Faction motto** at the end of the line once you've seen a carrier land, or always
    with the **"faction lines"** option, off by default:
    - Humanity First: LEAVE NONE ALIVE
    - Resistance: ENGAGE AND DESTROY
    - Academy: STAND TOGETHER
    - Initiative: SECURE OUR ASSETS
    - Exodus: KEEP MOVING FORWARD
    - Protectorate: PRESERVE THE PEACE
    - Servants: ASCENSION AWAITS
- **Mine network** (info): you can run more mines without extra mission control. It also
  says how many are built but inactive.
- **Low public opinion** in a nation where all control points are yours. It also says
  who leads that nation's opinion, Undecided included.
- **Control point cap**: info when you're up to 25 points over, a warning beyond that.
- **Recruitment, org and watched-body alerts**, from the profiles and watch list above.

### Overview

- Only alien sites discovered in the last year are listed; older ones are counted.
- Control point usage and cap include DLC scenario rules. If the cap uses effects the
  companion can't read, the Overview says so.

### DLC scenarios (Dark Skies: Broken Earth, 2003)

- The save's scenario is detected and its templates and translations are layered over
  the base game's.
  - Control point cost uses the scenario's start-date multiplier (0.7 in Broken Earth),
    and its cap effects are read.
  - On a Broken Earth save the companion now shows 716/701, where the game shows
    722/714. Before this it showed 1022/676.
- Scenario names translate correctly, e.g. "National Reconstruction Council" →
  "Consiglio nazionale per la ricostruzione".
- The web version downloads scenario data only when your save uses a scenario.

### Fixes

- **Game date:** read from the save's calendar fields, not the Windows date string. US
  date formats had swapped month and day, which broke history order, "days ago" and goal
  deadlines.
- **Alert language:** opening the page or switching language could return alerts in the
  other language. Requests are now handled one at a time.
- **Steam libraries on other drives** (e.g. `D:\SteamLibrary`) are found automatically.
- **Negative org incomes** show as "-2.0" in red instead of "+-2.0".

### Project

- It's now a separate project: new name, credits to the original, no donation links, its
  own data folder (`~/.ti-companion-plus/`) and ports (8733 / 3033).
- `UPDATING.txt` is a plain-text cheat sheet for updating, starting and stopping the app.
- The project notes (`CLAUDE.md`) record every game rule used, read from the game's
  templates and code and checked against real saves.

### Upgrading

- After updating, re-run `python -m ticore.bundle` so the web version's game-data
  extract includes the new fields: orbits, body sizes, ship modules and DLC scenarios.
  The local app reads your game install directly and needs nothing extra.
