# HuntCast 🎯 — hourly hunting activity forecast

A free, mobile-first web app (installable PWA) that combines **weather, sun, moon/solunar and season** to score — hour by hour — how likely you are to see a chosen animal at a chosen spot. Inspired by apps like HuntWise, but 100% static: no server, no accounts, no API keys.

> **Estimates, not guarantees.** HuntCast uses well-known hunting rules of thumb; it is not trained on animal GPS data and can't see food, pressure or terrain. Use it to pick promising days/hours, then trust your scouting. Always follow local seasons, bag limits and legal shooting hours.

## Features
- **Map** (Leaflet): OpenStreetMap, Esri satellite, OpenTopoMap; GPS "use my location", tap/drag to set the spot, place search (Nominatim) or paste `lat, lon`, saved favorite spots (localStorage).
- **15 species**: whitetail, mule deer, elk, moose, pronghorn, black bear, wild turkey, wild hog, coyote, fox, ducks, geese, pheasant, rabbit, squirrel.
- **Weather** (Open-Meteo, free/no key): temp, wind speed/direction/gusts, precipitation, cloud, pressure + 3 h/24 h trend, humidity, visibility; 14 days ahead (+2 days back for trends).
- **Astronomy** (SunCalc, computed in the *spot's* time zone): sunrise/sunset, civil twilight, estimated legal shooting light, moonrise/set, phase + illumination, moon overhead/underfoot, solunar majors/minors.
- **Scores**: 0–100 per hour, daily rating (★ + label), best windows, hour-by-hour chart (tap/drag), plain-English "what moves this hour's score" breakdown, all-species ranking for the day.
- **Wind & scent**: compass for the selected hour and a **scent cone** on the map (slider picks the hour).
- **Offline**: app shell, map tiles you've viewed and your last forecast are cached; an "offline — showing saved forecast" banner appears.
- Dark camo theme, 44 px+ touch targets, portrait phone layout (also works on desktop).

## How scores work (summary — full text in the app's **Info → How scores work**, and in `js/model.js`)
`score = 100 × time-of-day × multiplier × 0.55`
- **Time of day** (biggest factor): per-species dawn/day/dusk/night activity, blended smoothly by the sun's position; heat pushes activity to night, hard cold to midday, rut shifts bucks/bulls into daytime.
- **Multiplier** = 1 + Σ(weight × signal) with signals in −1…+1: pressure trend, temperature (absolute band + anomaly vs. 3-yr local normal), wind band, precipitation (bonus right after rain), cloud, front / cold snap, solunar window, moonlight, moon-phase, visibility, season (rut, migration, denning…).
- **Daily rating** = mean of the 4 best eligible hours (legal light by default; "Include night" toggle). Labels: 70+ Excellent · 57+ Very good · 44+ Good · 30+ Fair · else Poor.
- **Best windows** = contiguous hours ≥ 80 % of the day's peak (and ≥ 35).
Species parameters live in `js/species.js` — tweak them freely.

## Run locally
```
cd huntcast
python3 -m http.server 8000      # then open http://localhost:8000
```
(Geolocation and the service worker need `https://` or `localhost`.)

## Host it free on GitHub Pages
1. Create a repo and push the contents of this folder (or unzip `huntcast-site.zip`) to the repo root.
2. Settings → Pages → Deploy from branch → `main` / root.
3. Open `https://<user>.github.io/<repo>/` on your phone → browser menu → **Add to Home screen / Install app**.
All paths are relative, so it works on a sub-path. When you change files, bump `VERSION` in `sw.js` so phones pick up the update.

## Files
```
index.html  manifest.webmanifest  sw.js
css/app.css
js/util.js astro.js weather.js species.js model.js app.js
vendor/  (Leaflet 1.9.4, SunCalc 1.9.0 — bundled for offline use)
icons/
```
URL params for testing: `?lat=42.13&lon=-80.09&sp=elk`.

## Limitations
- Heuristic model, not validated against harvest/sighting data. Region quirks (e.g. local rut dates) are approximated from latitude/day-of-year.
- Needs internet for first forecast load, new map tiles, place search. Public OSM/Nominatim/Esri/OpenTopoMap tile servers have usage policies — fine for personal use; for heavy use switch to your own tile provider.
- Legal shooting light is an estimate (sunrise/sunset ± selectable offset) — check your state's regulations.
- Moon/solunar and sun times are computed locally; they may differ by a few minutes from almanacs.

## Credits
Weather: [Open-Meteo](https://open-meteo.com) (CC-BY 4.0). Maps: © OpenStreetMap contributors, Esri, OpenTopoMap. Search: Nominatim. Libraries: Leaflet (BSD-2), SunCalc (BSD-2).
