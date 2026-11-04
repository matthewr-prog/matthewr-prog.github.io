# CamCast v1.1.0
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

v1.1.0 sources: Caltrans CWWP2, TfL JamCams (api.tfl.gov.uk/Place/Type/JamCam), Fintraffic weathercam (tie.digitraffic.fi/api/weathercam/v1/stations, CC BY 4.0), Hong Kong TD (static.data.gov.hk Traffic_Camera_Locations_En.xml), NZTA (trafficnz.info/service/traffic/rest/4/cameras/all), NOAA GOES, NASA. Each camera also has `country` and `continent`; optional `clipUrl` (mp4) shows a 'Play latest clip' button.
