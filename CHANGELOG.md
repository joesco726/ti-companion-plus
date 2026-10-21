# Changelog

TI Companion Plus is a spin-off of [b4p3p's Terra Invicta Companion](https://github.com/b4p3p/terrainvicta-companion).
This file lists what changed since the fork. The fork point is b4p3p's commit `49e7082`
(30 September 2026).

The project rule still holds for every feature below: the companion only reads what the
game already shows you. Where a number is our own calculation, the app says so and shows
the raw values next to it.

## 0.2.0 — 21 October 2026

First public release. Use it at **<https://ti-companion-plus.pages.dev>** in Chrome or
Edge: pick your `My Games` folder and it follows your saves. Nothing to install, and your
saves never leave your PC.

This version also brings in b4p3p's work since the fork (see
[From the original project](#from-the-original-project)).

### Highlights

| Feature | Where to find it |
|---|---|
| **Recruitment profiles**: describe the councilors you want; get an alert when one shows up on the market | Council → Recruitment → Recruit profiles |
| **Org profiles**: alerts only for the organizations you'd actually buy | Organizations → Org profiles |
| **Launch windows and watched bodies**: the Earth launch window for every mining body, and an alert when it opens and a site is free | Space → Mining → Window column, 🔕 button next to a body |
| **Mining areas**: filter sites by the game's own areas (Inner / Middle / Outer Belt, Centaurs…), and see which mission unlocks a site | Space → Mining → Areas checkboxes, Status column |
| **Assault carrier warning**: a critical alert counting down to a visible alien assault carrier's arrival | Overview → Alerts |
| **Mine network**: the "mines used / mines allowed" number the game hides in a tooltip | Space → Mining, first stat; Overview → Alerts |
| **DLC scenarios**: Broken Earth and 2003 games use their own data, so control points and names come out right | everywhere, automatic |

### Council and recruitment

Where: **Council → Recruitment** (the dashed card at the top of the team list) → **Recruit
profiles**.

- **Recruitment profiles.** Each profile combines conditions on traits, missions and high
  or low attributes:
  - pick traits from a tag grid laid out like the official wiki's trait sections, in rows
    (Wealth and Influence, Nation and Personality, Advisor / Space / Minions / Caution /
    XP, Engineering Project and National Priority, then the rest);
  - each tag cycles through "has all", "at least one" and "none of";
  - hover a tag for the game's description of the trait and its effects;
  - optionally count a mission only if your council doesn't already have it;
  - set an age range with a two-handle slider;
  - turn each profile on or off and choose its alert level;
  - the name is optional: without one, the profile is named after its conditions.
- **Shortcuts** on the profile editor:
  - "also needs Quick Learner or Striver", on top of any other condition;
  - "can't run Inspire" and "can lose loyalty" exclude, in one click, the traits that
    can't be removed and block Inspire or bring conditional loyalty losses.
- **Profile sanity checks**, from the game's spawn rules:
  - a warning when no randomly generated councilor can have the combination, naming the
    smallest pair that can't go together;
  - a warning for rare combinations, with the chance per councilor type;
  - a note when only one of the game's preset councilors fits, and whether they can
    appear for your faction.
- Only traits a candidate can actually spawn with are offered; XP ranks and event traits
  are left out.

### Organizations

Where: the new **Organizations** tab, between Council and Missions. It holds the org
market and the org profiles.

- **Org profiles.** Alerts only for the orgs you want:
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
- **Watched bodies.** A 🔕 → 🔔 → 🔔🚀 button next to each body's name, and a single
  −50…+50% band slider (default −10…+10). A watched body alerts when its window is in
  the band and it has a free site. With 🚀 it also needs your boost to cover an Outpost
  Core.
- **Outpost Core boost cost from Earth**, shown per body. It uses the game's formula:
  Hohmann delta-v from low Earth orbit plus landing at the site, and your rockets'
  exhaust velocity. It matches the game (41 Daphne: 10.1). The window doesn't change it;
  the penalty only lengthens the trip.
- **Areas.** Checkboxes above the sites table with the areas of the game's Intel screen
  Location filter: Mercury, Luna, Inner System Asteroids, Mars, Inner / Middle / Outer
  Belt, Jupiter, Saturn, Centaurs, Uranus, Neptune, Kuiper Belt Objects. As in the game,
  a planet includes its moons. Each shows how many sites it has; the choice is remembered.
- **What unlocks a site.** Under "unreachable" in the Status column, the tech that opens
  the body for exploration (e.g. "Mission to Jupiter"), in the game's words. Typing a
  tech name in the search box lists the sites it opens. Areas and unlocks don't line up
  one to one: Mission to Mars also opens Eros, Cruithne and the other Earth
  Lagrange-point asteroids.
- **Stars on prospected sites.** ★ next to a site's class resources (e.g. water +
  volatiles for a Common Carbonaceous) when their true sum beats the top of the range
  the game showed for that class on that body before the probe.
- **Mine network stat**, "17/24": active mines against how many the network supports
  without extra mission control. Neutral below the cap, green at it, amber 1–4 over,
  red 5+ over.

### Alerts

Where: **Overview → Alerts**.

- **Assault carrier inbound** (critical).
  - **Trigger:** a visible alien fleet carrying an assault carrier is on its way to
    Earth orbit.
  - **Title** escalates as it gets closer: `PRIORITY` (180–101 days) → `IMMEDIATE`
    (100–21) → `FLASH` (≤20), e.g. "PRIORITY — Alien assault carrier inbound: Victor-7,
    T-140 days".
  - **No spoilers:** the wording only repeats what the game's own notification says.
  - **Faction motto** at the end of the line, from the first carrier on:
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

- **Options to hide noise**, as checkboxes in the panel headers:
  - Alerts → "all affordable orgs": the alert for every organization you can afford.
    It switches off by itself when you enable an org profile, until you set it.
  - Known alien sites → "last year only": older sites are only counted.
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

### From the original project

b4p3p's work since the fork, merged in:

- **YASS** (Nations → YASS): spreadsheet-style calculators for a nation: projection,
  Economy, Split, Advise, Mission control, Miltech.
- **Mining value weights** (Space → Mining → "Value"): market prices, your own weight
  per resource, or all set to 1.
- **Alien sites and habitats at end game**: sorting (date, name, nation) and an "All" button.
- Advise uses Administration capped at 25, as the game does.
- Regression tests for the core and the YASS calculators.

### Fixes

- **New campaign in a big save folder:** the research comparison no longer opens every
  save in the folder, so the first load after starting a new game is quick even with
  hundreds of old saves.
- **Game date:** read from the save's calendar fields, not the Windows date string. US
  date formats had swapped month and day, which broke history order, "days ago" and goal
  deadlines.
- **Alert language:** opening the page or switching language could return alerts in the
  other language. Requests are now handled one at a time.
- **Steam libraries on other drives** (e.g. `D:\SteamLibrary`) are found automatically.
- **Negative org incomes** show as "-2.0" in red instead of "+-2.0".
- **Import** (History → Companion data) also brings watched bodies, display options and profile
  thresholds, when the destination doesn't have its own yet, and says how many profiles
  and settings came in.

### Project

- **Hosted site** at <https://ti-companion-plus.pages.dev>, with the game-data extract
  served alongside it, so players only pick their saves folder.
- No visitor counting: the original's anonymous counter is switched off in this build.
- [INSTALL.md](INSTALL.md): running it locally, updating, and publishing your own copy
  (`deploy.ps1`).
- It's a separate project: new name, credits to the original, no donation links, its
  own data folder (`~/.ti-companion-plus/`) and ports (8733 / 3033).
- The project notes (`CLAUDE.md`) record every game rule used, read from the game's
  templates and code and checked against real saves.

### Upgrading from 0.1.0

- **On the site:** nothing to do. To bring your profiles and settings from a local copy,
  export them there (History → Companion data) and import the file on the site.
- **Local copy:** `git pull`, then `pip install -e .` and `npm install` in `tiweb`. The
  local app reads your game install directly and needs nothing else.

## 0.1.0 — 30 September 2026

The fork point: b4p3p's Terra Invicta Companion at commit `49e7082`.
