/* HuntCast — species profiles.
 *
 * Every number below is an editable, hand-tuned heuristic drawn from widely
 * repeated hunting wisdom and general wildlife-biology patterns. They are NOT
 * fitted to GPS-collar data and they are NOT guarantees.
 *
 * Fields
 *   tod       {dawn, day, dusk, night}  0..1 how active the animal typically is in each part of the day
 *   dawnShift minutes after sunrise where the morning peak sits  (default -10 = just before sunrise)
 *   duskShift minutes after sunset  where the evening peak sits  (default -15 = last light before sunset)
 *   temp      {lo, hi, coldBias}  comfortable air-temp band in °F. coldBias 0..1: how much a colder-than-normal day helps
 *   wind      {lo, hi, max}  mph. Ideal band lo..hi, activity/hunter comfort collapses toward `max`
 *   heat      °F above which daytime activity shifts toward night / shade
 *   coldDay   0..1 how strongly very cold weather pushes feeding into midday
 *   rainLight signal (-1..1) for light rain / drizzle;  wetLove 0..1 how little heavy weather bothers it
 *   cloudDir  +1 overcast helps (daytime movement), -1 sun helps, 0 neutral
 *   w         weights of each factor (points of multiplier per +1 signal), see model.js
 *   night     true = commonly hunted / active at night (where legal)
 *   season    fn(ctx) -> {s: -1..1, label, dayBoost 0..1}  seasonal behaviour (rut, migration, denning ...)
 */
(function (HC) {
  'use strict';
  const U = HC.Util;
  const gaussDay = (doy, peak, sigma) => U.gauss(U.ddays(doy, peak), sigma);
  const D = U.doyOf;

  function deerRut(peakMD, sigma, latShift) {
    return (c) => {
      const peak = D(peakMD[0], peakMD[1]) + (latShift ? Math.max(0, 38 - c.lat) * 3.5 : 0);
      const dd = U.ddays(c.doy, peak);
      const r = U.gauss(dd, sigma);
      let label = '';
      if (dd >= -20 && dd < -6) label = 'pre-rut: bucks scraping & cruising';
      else if (dd >= -6 && dd <= 8) label = 'peak rut: bucks chasing, daytime movement';
      else if (dd > 8 && dd <= 25) label = 'post-rut: bucks recovering';
      return { s: 0.95 * r - 0.1, label, dayBoost: r };
    };
  }

  const L = [
    {
      id: 'whitetail', name: 'Whitetail Deer', emoji: '🦌', group: 'Big game',
      tod: { dawn: .95, day: .30, dusk: .95, night: .30 }, dayBoostMax: .45,
      temp: { lo: 25, hi: 55, coldBias: 1 }, wind: { lo: 2, hi: 10, max: 20 }, heat: 75, coldDay: .3, rainLight: .1, wetLove: .1, cloudDir: 1,
      w: { press: .18, temp: .20, wind: .14, precip: .10, cloud: .05, front: .10, sol: .08, moonL: .08, moonD: .08, vis: .05, season: .25 },
      season: deerRut([11, 12], 10, true),
      tip: 'Hunt travel routes between bedding and food at first/last light; rut peak pushes bucks to move all day.'
    },
    {
      id: 'muledeer', name: 'Mule Deer', emoji: '🦌', group: 'Big game',
      tod: { dawn: .95, day: .30, dusk: .95, night: .30 }, dayBoostMax: .40,
      temp: { lo: 20, hi: 55, coldBias: 1 }, wind: { lo: 2, hi: 10, max: 22 }, heat: 75, coldDay: .3, rainLight: .1, wetLove: .1, cloudDir: 1,
      w: { press: .16, temp: .20, wind: .14, precip: .10, cloud: .05, front: .10, sol: .08, moonL: .06, moonD: .06, vis: .04, season: .22 },
      season: deerRut([11, 20], 10, false),
      tip: 'Glass open slopes at dawn and dusk; storms and cold snaps in November trigger movement.'
    },
    {
      id: 'elk', name: 'Elk', emoji: '🫎', group: 'Big game',
      tod: { dawn: .95, day: .35, dusk: .95, night: .40 }, dayBoostMax: .35,
      temp: { lo: 15, hi: 55, coldBias: 1 }, wind: { lo: 2, hi: 10, max: 20 }, heat: 70, coldDay: .25, rainLight: .1, wetLove: .15, cloudDir: 1,
      w: { press: .14, temp: .20, wind: .14, precip: .08, cloud: .05, front: .08, sol: .08, moonL: .05, moonD: .05, vis: .04, season: .30 },
      season: (c) => {
        const dd = U.ddays(c.doy, D(9, 22)), r = U.gauss(dd, 12);
        return { s: 0.95 * r - 0.1, label: (dd > -18 && dd < 14) ? 'rut: bulls bugling & herding cows' : '', dayBoost: r };
      },
      tip: 'During the September rut bulls respond to calls at dawn/dusk; wallows and water hold elk in hot weather.'
    },
    {
      id: 'moose', name: 'Moose', emoji: '🫎', group: 'Big game',
      tod: { dawn: .90, day: .40, dusk: .90, night: .40 }, dayBoostMax: .30,
      temp: { lo: -10, hi: 45, coldBias: 1 }, wind: { lo: 0, hi: 10, max: 20 }, heat: 60, coldDay: .1, rainLight: .1, wetLove: .3, cloudDir: 1,
      w: { press: .10, temp: .22, wind: .12, precip: .06, cloud: .05, front: .06, sol: .06, moonL: .04, moonD: .04, vis: .04, season: .30 },
      season: (c) => {
        const dd = U.ddays(c.doy, D(10, 1)), r = U.gauss(dd, 10);
        return { s: 0.95 * r - 0.1, label: (dd > -12 && dd < 12) ? 'rut: bulls moving and responding to calls' : '', dayBoost: r };
      },
      tip: 'Moose overheat above ~60°F; cool mornings and the late-September rut are prime.'
    },
    {
      id: 'pronghorn', name: 'Pronghorn', emoji: '🦌', group: 'Big game',
      tod: { dawn: .80, day: .70, dusk: .85, night: .10 }, dayBoostMax: .15,
      temp: { lo: 30, hi: 80, coldBias: 0 }, wind: { lo: 0, hi: 12, max: 25 }, heat: 92, coldDay: .1, rainLight: 0, wetLove: .1, cloudDir: 0,
      w: { press: .08, temp: .12, wind: .18, precip: .10, cloud: 0, front: .06, sol: .05, moonL: 0, moonD: 0, vis: .03, season: .25 },
      season: (c) => {
        const dd = U.ddays(c.doy, D(9, 20)), r = U.gauss(dd, 10);
        return { s: 0.9 * r - 0.1, label: (dd > -12 && dd < 14) ? 'rut: bucks defending harems' : '', dayBoost: r };
      },
      tip: 'Diurnal and sight-driven: they feed all day and hunker down out of strong wind.'
    },
    {
      id: 'bear', name: 'Black Bear', emoji: '🐻', group: 'Big game',
      tod: { dawn: .70, day: .50, dusk: .95, night: .35 }, dayBoostMax: .15,
      temp: { lo: 35, hi: 70, coldBias: .3 }, wind: { lo: 0, hi: 10, max: 20 }, heat: 75, coldDay: .1, rainLight: .1, wetLove: .2, cloudDir: 1,
      w: { press: .14, temp: .16, wind: .12, precip: .08, cloud: .06, front: .06, sol: .08, moonL: 0, moonD: .05, vis: .04, season: .35 },
      season: (c) => {
        const d = c.doy, north = c.lat >= 35;
        if (d >= D(9, 1) && d < D(11, 10)) return { s: .75, label: 'fall feeding frenzy (hyperphagia)', dayBoost: .5 };
        if (d >= D(11, 10) || d < D(3, 15)) return { s: north ? -1 : -.25, label: north ? 'denning season: little activity' : 'winter lull', dayBoost: 0 };
        if (d >= D(3, 15) && d < D(4, 20)) return { s: -.1, label: 'spring emergence', dayBoost: 0 };
        if (d >= D(4, 20) && d < D(6, 30)) return { s: .3, label: 'spring green-up feeding', dayBoost: .1 };
        return { s: .1, label: '', dayBoost: 0 };
      },
      tip: 'Hunt food sources (oak mast, berries, bait where legal); dusk is the classic window. Heat pushes them to water and night.'
    },
    {
      id: 'turkey', name: 'Wild Turkey', emoji: '🦃', group: 'Birds',
      tod: { dawn: 1.0, day: .50, dusk: .40, night: 0 }, dawnShift: 30, duskShift: -30, dayBoostMax: 0,
      temp: { lo: 40, hi: 75, coldBias: 0 }, wind: { lo: 0, hi: 8, max: 16 }, heat: 85, coldDay: .2, rainLight: -.1, wetLove: .1, cloudDir: 0,
      w: { press: .12, temp: .14, wind: .24, precip: .12, cloud: 0, front: .04, sol: .05, moonL: 0, moonD: 0, vis: .06, season: .25 },
      season: (c) => {
        const peak = D(4, 22) - Math.max(0, 38 - c.lat) * 3, dd = U.ddays(c.doy, peak), sp = U.gauss(dd, 18);
        const d = c.doy;
        if (sp > .35) return { s: .9 * sp, label: 'spring breeding season: gobbling & strutting', dayBoost: sp * .3 };
        if (d >= D(10, 1) && d < D(11, 20)) return { s: .15, label: 'fall flocks feeding', dayBoost: .1 };
        if (d >= D(6, 1) && d < D(9, 1)) return { s: -.4, label: 'summer: hens nesting, broods', dayBoost: 0 };
        return { s: -.2, label: '', dayBoost: 0 };
      },
      tip: 'Roosted at night: flydown ~30 min after sunrise, strong gobbling in calm weather, second window late morning. Wind above ~15 mph shuts them down.'
    },
    {
      id: 'hog', name: 'Wild Hog / Boar', emoji: '🐗', group: 'Big game',
      tod: { dawn: .60, day: .15, dusk: .70, night: 1.0 }, dayBoostMax: 0,
      temp: { lo: 40, hi: 78, coldBias: 0 }, wind: { lo: 0, hi: 12, max: 22 }, heat: 78, coldDay: .5, rainLight: .1, wetLove: .3, cloudDir: 1, night: true,
      w: { press: .12, temp: .18, wind: .10, precip: .08, cloud: .04, front: .05, sol: .08, moonL: .05, moonD: .10, vis: .03, season: 0 },
      season: () => ({ s: 0, label: '', dayBoost: 0 }),
      tip: 'Mostly nocturnal in warm weather; cool, overcast days and wallows/feeders produce daytime sightings.'
    },
    {
      id: 'coyote', name: 'Coyote', emoji: '🐺', group: 'Predators',
      tod: { dawn: 1.0, day: .25, dusk: .90, night: .85 }, dayBoostMax: .1,
      temp: { lo: 10, hi: 55, coldBias: .6 }, wind: { lo: 0, hi: 10, max: 20 }, heat: 80, coldDay: .3, rainLight: 0, wetLove: .2, cloudDir: 1, night: true,
      w: { press: .12, temp: .15, wind: .16, precip: .08, cloud: .03, front: .08, sol: .08, moonL: .10, moonD: 0, vis: .03, season: .20 },
      season: (c) => {
        const r = gaussDay(c.doy, D(2, 1), 25);
        if (r > .4) return { s: .8 * r, label: 'breeding season: very vocal & mobile', dayBoost: .2 * r };
        if (c.doy >= D(10, 1) && c.doy < D(12, 1)) return { s: .2, label: 'young coyotes dispersing', dayBoost: 0 };
        return { s: 0, label: '', dayBoost: 0 };
      },
      tip: 'Calls work best at dawn/dusk in calm, cold weather; bright moon keeps them moving at night.'
    },
    {
      id: 'fox', name: 'Fox', emoji: '🦊', group: 'Predators',
      tod: { dawn: .80, day: .15, dusk: .85, night: 1.0 }, dayBoostMax: .05,
      temp: { lo: 5, hi: 55, coldBias: .6 }, wind: { lo: 0, hi: 10, max: 20 }, heat: 80, coldDay: .3, rainLight: -.1, wetLove: .1, cloudDir: 0, night: true,
      w: { press: .10, temp: .14, wind: .16, precip: .10, cloud: .03, front: .06, sol: .06, moonL: .04, moonD: 0, vis: .03, season: .20 },
      season: (c) => {
        const r = gaussDay(c.doy, D(1, 25), 22);
        return r > .4 ? { s: .8 * r, label: 'breeding season: foxes roaming widely', dayBoost: .1 } : { s: 0, label: '', dayBoost: 0 };
      },
      tip: 'Dusk-to-dawn hunters; cold, still, snowy nights are best for calling.'
    },
    {
      id: 'ducks', name: 'Ducks / Waterfowl', emoji: '🦆', group: 'Birds',
      tod: { dawn: 1.0, day: .50, dusk: .85, night: .20 }, dayBoostMax: 0,
      temp: { lo: 15, hi: 45, coldBias: 1 }, wind: { lo: 8, hi: 20, max: 30 }, heat: 80, coldDay: .35, rainLight: .5, wetLove: .8, cloudDir: 1,
      w: { press: .15, temp: .12, wind: .20, precip: .10, cloud: .10, front: .30, sol: .05, moonL: 0, moonD: .08, vis: .08, season: .30 },
      season: (c) => {
        const r = gaussDay(c.doy, D(11, 10), 28);
        const inSeason = (c.doy >= D(9, 15) || c.doy <= D(1, 31));
        return { s: inSeason ? .85 * r : -.6, label: inSeason && r > .5 ? 'peak fall migration' : '', dayBoost: 0 };
      },
      tip: 'First-light flights are the main event. Cold fronts with north/west winds push new birds south; some wind helps decoys work.'
    },
    {
      id: 'geese', name: 'Geese', emoji: '🪿', group: 'Birds',
      tod: { dawn: 1.0, day: .55, dusk: .80, night: .10 }, dayBoostMax: 0,
      temp: { lo: 15, hi: 45, coldBias: 1 }, wind: { lo: 8, hi: 20, max: 30 }, heat: 80, coldDay: .35, rainLight: .4, wetLove: .8, cloudDir: 1,
      w: { press: .14, temp: .12, wind: .18, precip: .08, cloud: .10, front: .25, sol: .05, moonL: 0, moonD: .08, vis: .08, season: .25 },
      season: (c) => {
        const r = gaussDay(c.doy, D(11, 1), 32);
        const inSeason = (c.doy >= D(9, 1) || c.doy <= D(2, 15));
        return { s: inSeason ? .75 * r : -.4, label: inSeason && r > .5 ? 'fall/winter flight season' : '', dayBoost: 0 };
      },
      tip: 'Field-feeding birds fly out at first light and return at midday in cold weather; fronts and overcast keep them moving.'
    },
    {
      id: 'pheasant', name: 'Pheasant', emoji: '🐓', group: 'Birds',
      tod: { dawn: .70, day: .40, dusk: .90, night: 0 }, dayBoostMax: 0,
      temp: { lo: 20, hi: 60, coldBias: .4 }, wind: { lo: 0, hi: 10, max: 18 }, heat: 85, coldDay: .3, rainLight: -.2, wetLove: .1, cloudDir: 0,
      w: { press: .10, temp: .14, wind: .20, precip: .10, cloud: .04, front: .08, sol: .04, moonL: 0, moonD: 0, vis: .08, season: .15 },
      season: (c) => {
        const d = c.doy, s = (d >= D(10, 15) && d <= D(12, 20)) ? .35 : (d >= D(12, 21) || d < D(2, 1)) ? .1 : 0;
        return { s, label: s > .3 ? 'harvested fields: birds concentrated in cover' : '', dayBoost: 0 };
      },
      tip: 'Birds feed in fields at first light and again late afternoon; in wind or snow they hold tight in heavy cover.'
    },
    {
      id: 'rabbit', name: 'Rabbit', emoji: '🐇', group: 'Small game',
      tod: { dawn: .80, day: .30, dusk: 1.0, night: .50 }, dayBoostMax: 0,
      temp: { lo: 20, hi: 65, coldBias: .3 }, wind: { lo: 0, hi: 8, max: 15 }, heat: 85, coldDay: .3, rainLight: -.2, wetLove: .0, cloudDir: 1,
      w: { press: .10, temp: .14, wind: .18, precip: .12, cloud: .05, front: .05, sol: .04, moonL: -.08, moonD: 0, vis: .03, season: .10 },
      season: (c) => ({ s: (c.doy >= D(10, 15) || c.doy <= D(2, 28)) ? .3 : 0, label: '', dayBoost: 0 }),
      tip: 'Late-afternoon sun on brushy south slopes in winter; rabbits hide in rain and strong wind.'
    },
    {
      id: 'squirrel', name: 'Squirrel', emoji: '🐿️', group: 'Small game',
      tod: { dawn: 1.0, day: .65, dusk: .55, night: 0 }, dawnShift: 15, duskShift: -30, dayBoostMax: 0,
      temp: { lo: 30, hi: 75, coldBias: 0 }, wind: { lo: 0, hi: 8, max: 15 }, heat: 88, coldDay: .1, rainLight: -.5, wetLove: .0, cloudDir: -1,
      w: { press: .08, temp: .16, wind: .22, precip: .12, cloud: .04, front: .04, sol: .03, moonL: 0, moonD: 0, vis: .03, season: .25 },
      season: (c) => {
        const d = c.doy;
        if (d >= D(9, 1) && d < D(11, 20)) return { s: .6, label: 'nut-gathering season', dayBoost: 0 };
        if (d >= D(12, 15) || d < D(2, 15)) return { s: -.2, label: '', dayBoost: 0 };
        return { s: .1, label: '', dayBoost: 0 };
      },
      tip: 'Active in the first hours after sunrise on calm, mild days near mast trees; wind and rain keep them in dens.'
    }
  ];
  HC.Species = { list: L, byId: Object.fromEntries(L.map((s) => [s.id, s])) };
})(window.HC = window.HC || {});
