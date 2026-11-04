# CamCast v1.3.0
Static PWA: map + list of public, intentionally shared camera feeds. No Flock/ALPR, private, or login feeds.
Deploy: copy this folder to `camcast/` in the GitHub Pages repo → https://matthewr-prog.github.io/camcast/
Local test: `python3 -m http.server` in this folder, open http://localhost:8000

## Adding a camera
Append an object to `data/cameras.json`:
```json
{"id":"unique-id","name":"I-80 Donner Summit","category":"Traffic|Weather|City|Airport|Satellite",
 "lat":39.3,"lon":-120.3,"region":"Truckee, CA",
 "streamUrl":"https://…","streamType":"hls|iframe|image-refresh|youtube",
 "snapshotUrl":"optional thumbnail jpg","attribution":"Publisher name","tags":["I-80"],
 "playbackNote":"optional","archiveFrames":["optional older jpgs, oldest first"],"archiveUrl":"optional link"}
```
- HLS must send `Access-Control-Allow-Origin` (hls.js) – check with `curl -I -H 'Origin: https://matthewr-prog.github.io' URL`.
- YouTube: use `https://www.youtube.com/embed/VIDEO_ID?x=1` or `embed/live_stream?channel=ID`.
- Verify the URL returns 200 with curl, then bump `V` in `sw.js` so phones fetch the new list.
Sources: Caltrans CWWP2 CCTV JSON (`https://cwwp2.dot.ca.gov/data/dN/cctv/cctvStatusDNN.json`), NOAA STAR GOES `latest.jpg`, NASA YouTube.

v1.3.0 sources: Caltrans CWWP2, TfL JamCams (api.tfl.gov.uk/Place/Type/JamCam), Fintraffic weathercam (tie.digitraffic.fi/api/weathercam/v1/stations, CC BY 4.0), Hong Kong TD (static.data.gov.hk Traffic_Camera_Locations_En.xml), NZTA (trafficnz.info/service/traffic/rest/4/cameras/all), NOAA GOES, NASA. Each camera also has `country` and `continent`; optional `clipUrl` (mp4) shows a 'Play latest clip' button.

v1.3.0: +168 YouTube 24/7 live cams (verified isLiveNow + playableInEmbed, embedded via youtube-nocookie), +109 Caltrans HLS video cams (CORS ok), +35 PennDOT 511PA snapshots (Erie & Pittsburgh). `live:true` marks video cams; 'Live video' chip filters them. Map tiles: CARTO Voyager. YouTube streams can end; re-verify with oembed + watch page `"isLiveNow":true`.

v1.3.0: YouTube embeds now use www.youtube.com/embed with origin + strict-origin-when-cross-origin referrer (fixes error 151/153), IFrame API onError fallback and an 'Open in YouTube' button (`openUrl`). Erie area: `county` field ('Erie County, PA', 'Crawford County, PA', 'Chautauqua County, NY'); '📍 Erie area' chip filters cams with a county.

## v1.4.0
- +7 Erie News Now (WICU/WSEE) Skyview live cams via ipcamlive (City of Erie, Bayfront/Dobbins Landing, Millcreek Mall, Presque Isle from Waldameer, Corry, Meadville, Warren) — frameable live player + fresh snapshot thumbnails.
- +1 link-type entry: YourErie/WJET Erie Bayfront WxCAM (site blocks automated access; opens on owner's site).
- New `link` stream type and generic "Open site" button.

## v1.5.0
- +2 WeatherMet live cams (Erie International Airport, Conneaut Lake) as framed players.
- +1 Erie Yacht Club North Basin live cam (ipcamlive, framed, fresh snapshot thumbnail).
- +3 link-only public Nest cams (Warner Theatre, Erie Insurance Arena, UPMC Park); owner sets X-Frame-Options.
- Airport: +27 verified live, embeddable YouTube airport cams (LAX x3, MDW, DFW, ATL, LAS x2, MIA x2, LGA, RNO, LHR x3, LBA, FRA, ZRH, ACE x2, SXM x2, HND x3, NRT x2, HKG). The 8 Caltrans "Airport" cams are now Traffic ("near LAX/BUR"). Removed the 3D tracker and replay entries.
- New Park and Harbor chips. Park: Presque Isle (from Waldameer), Niagara Falls, Chautauqua Lake (We Wan Chu), Brooks Falls (Katmai).

## v1.6.0
- Digital pan & zoom on every cam (not real PTZ). Pinch or wheel to zoom (1-5x), drag to pan (clamped to edges), double-tap or double-click to reset. A toolbar under the video has ➕ ➖ ⬆️ ⬇️ ⬅️ ➡️ Reset and "✋ Pan/Zoom". On video and embedded players, the gesture layer is only active while zoomed or in Pan/Zoom mode, so player controls still work.
- Angle switcher: cams within about 300 m that share a name word (or about 1 km with 2 shared words, or the same pin) are grouped at load. The viewer shows "Angles: 1 2 3" buttons.

## v1.7.0
- YouTube safety net. On error 150-153 the player retries once on youtube-nocookie.com. It also sends widget_referrer. If it still fails, it switches to the next angle in the group, or shows "Owner blocks playback in other apps" with a big Open in YouTube button. A failed video ID is saved in localStorage (`camcast_badyt`) and hidden on that device from then on.
- Polar chip (🧊, lat >= 66.56 or <= -60). Adds 51 Fintraffic Lapland road weather cams north of the Arctic Circle.
