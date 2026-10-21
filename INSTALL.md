# Installing and running TI Companion Plus

There are two ways to use the companion. Most players only need the first.

1. **The website**: nothing to install. Open it, pick your saves folder, done.
2. **A local copy**: runs on your PC with a small Python server. Useful if you want to
   change the code, or if your browser can't open a local folder.

Either way the companion only **reads** your saves. It never writes to them and never
sends them anywhere.

---

## 1. The website

Open **<https://ti-companion-plus.pages.dev>** in **Chrome or Edge** on the PC where you
play Terra Invicta.

1. Press **Choose folder** and pick `Documents\My Games\TerraInvicta` (or `My Games`).
   Chrome won't accept the whole `Documents` folder; the companion finds `Saves` by
   itself.
2. When the browser asks for permission, choose **Allow on every visit**. Otherwise it
   asks again each time you close all the site's tabs.
3. Keep the tab open on a second monitor while you play. Every time the game saves
   (autosave included), the page updates by itself.

The first visit downloads about 13 MB (the Python engine that runs in the page). Later
visits load from the browser cache.

**Just looking?** Press **Try the demo** on the home page: it loads a real campaign and
works in any browser.

### Browsers

| Browser | Works? |
|---|---|
| Chrome, Edge (desktop) | yes |
| Brave | after enabling `brave://flags/#file-system-access-api` and restarting |
| Opera, Vivaldi and other Chromium browsers | usually yes |
| Firefox, Safari, any phone or tablet | demo only: they can't open a local folder |

### Your data on the website

History, notes, goals, profiles and settings are kept in your browser's storage for the
site. Clearing the site's data in the browser erases them. To keep a copy, or to move it
to another browser or PC: **History → Companion data → Export**, then **Import** the file
on the other side. Import merges, it never overwrites.

---

## 2. A local copy (Windows)

### Requirements

- Terra Invicta installed (Steam; libraries on other drives are found automatically).
- [Python](https://www.python.org/downloads/) 3.10 or newer: tick **Add Python to PATH**
  in the installer.
- [Node.js](https://nodejs.org/) 20 or newer (the LTS version).
- [Git](https://git-scm.com/download/win).

### Install

Open **Command Prompt** or **PowerShell** and run, one line at a time:

```
cd %USERPROFILE%
git clone https://github.com/joesco726/ti-companion-plus.git
cd ti-companion-plus
pip install -e .
cd tiweb
npm install
cd ..
```

(In PowerShell, write `cd $HOME` instead of `cd %USERPROFILE%`.)

### Start

From the `ti-companion-plus` folder:

```
powershell -ExecutionPolicy Bypass -File start.ps1
```

It starts the server (port 8733) and the interface (port 3033) in two minimised windows
and opens <http://localhost:3033>. The first start, and the first after an update, can
take up to a minute while the interface compiles: if the page says "unable to connect",
wait and press F5.

`-ExecutionPolicy Bypass` lets this one script run without changing Windows' settings.
Options: `-NoBrowser` (don't open the browser), `-NoReload` (don't restart the server
when the code changes).

### Stop

Press **Ctrl+C** in the window where you ran `start.ps1`, then close the two minimised
windows it opened.

### Update

Stop the companion, then from the `ti-companion-plus` folder:

```
git pull
pip install -e .
cd tiweb
npm install
cd ..
```

The last three commands only matter when an update adds a dependency; running them
anyway is harmless. Then start it again.

### If `start.ps1` fails

Run the two parts by hand, each in its own window:

```
cd %USERPROFILE%\ti-companion-plus
python -m uvicorn tiserver.main:app --port 8733
```

```
cd %USERPROFILE%\ti-companion-plus\tiweb
npm run dev
```

Wait for "Ready" in the second window, then open <http://localhost:3033>. If something
still goes wrong, [open an issue](https://github.com/joesco726/ti-companion-plus/issues)
with the last 20 lines of each window.

### Your data on a local copy

History, notes, goals, profiles and settings live in
`%USERPROFILE%\.ti-companion-plus\companion.db`. Updating never touches it. Export and
import work as on the website, so you can move your setup between the two.

### Other systems

The game is Windows-only, but the companion itself runs anywhere Python and Node do.
Without `start.ps1`, use the two commands above. If the companion can't find the game,
set `TI_GAME_DIR` to the Terra Invicta folder.

---

## 3. Publishing your own copy of the site

Only needed if you change the code and want your own website. The site is static files
plus the game-data extract, published on Cloudflare Pages (free).

One-time setup, with a free Cloudflare account:

```
cd tiweb
npx --yes wrangler@4 login
npx --yes wrangler@4 pages project create <your-project-name> --production-branch main
```

Then, each time you want to publish, from the repository folder:

```
powershell -ExecutionPolicy Bypass -File deploy.ps1 -Project <your-project-name>
```

`deploy.ps1` pulls the latest code, builds the site with the game-data extract made from
**your** Terra Invicta install (so it matches your game version) and uploads it. Add
`-DryRun` to build without uploading. The extract is Pavonis Interactive's data: it goes
to the site, never into git.
