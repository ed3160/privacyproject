# DATA.md: how the data behind "Following Millie" was made

**Short version:** Millie, her runs, her heart rate, her profiles, her followers and the 300 "other runners" are all invented.
The only real-world inputs are **street and park-path geometry from OpenStreetMap** and **ground elevation from the USGS**.
No Strava API, no scraping, no real person's data.

Everything in `public/data/` is produced by one script, `scripts/generate-data.mjs`, with a fixed random seed (`20251116`).

```bash
npm run data           # offline: reads data-cache/, writes public/data/
npm run data:refresh   # re-downloads routing + elevation into data-cache/, then regenerates
```

**Reproducibility check (done 2026-11-16):** we ran the generator twice from the committed cache and diffed `public/data/`. The two outputs were byte-identical.

---

## What's real and what's invented

| Real (with source) | Invented |
|---|---|
| Street and park-path geometry: OpenStreetMap, via the keyless FOSSGIS OSRM foot router (`routing.openstreetmap.de`). © OpenStreetMap contributors, ODbL. | Millie, her name, school details, bio, followers and professional profile |
| Elevation along each route: USGS 3DEP/NED 10 m, via the keyless OpenTopoData API (`api.opentopodata.org/v1/ned10m`) | Every timestamp, pace, heart-rate value and split |
| Strava's default settings, as described on Strava Support pages (checked 2026-11-16, see below) | GPS "jitter" on start/end points |
| | The 300 other runners and how often they run |
| | The sparse "remote site" (not a real place; it has no coordinates) |

Raw API responses are cached in `data-cache/` (≈4 MB) and committed, so the generator runs offline and gives the same output every time.
We originally planned to use Open-Meteo for elevation, but it refused connections from our build machine, so we used OpenTopoData (USGS NED 10 m) instead. It's arguably better for a 10-block-scale story.

---

## Files

### `routes.geojson` and `millie-run.gpx` (routes)

Three routes, all starting and ending on the **Broadway sidewalk at the Barnard campus block (~W 117th St)**. They never start at a residential building.

| Route | Name | Distance | Elevation gain | Used for |
|---|---|---|---|---|
| A | Weekday loop: W 116th St → Riverside Park (lower and upper paths) → W 122nd St → Amsterdam Ave → Morningside Park → Cathedral Pkwy → W 114th St → Broadway | 4.83 km | 94 m | Tue/Thu mornings (70%), some Sundays |
| B | Sunday long run: out-and-back south through Riverside Park to ~W 75th St | 7.84 km | 86 m | Sundays (85%) |
| C | Short Morningside loop: W 112th St → Cathedral Pkwy → Morningside Park → 116th St stairs → Morningside Dr → W 120th St | 3.03 km | 41 m | Tue/Thu mornings (30%) |

How we built them:
1. **Hand-placed waypoints** at real intersections and park paths (`scripts/lib/waypoints.mjs`, each one commented).
2. **Routing:** each waypoint list was routed with an OpenStreetMap foot router, so the line follows real sidewalks, park paths and stairs instead of cutting through buildings. This is the same idea as drawing the route in gpx.studio, which also snaps to OSM.
3. **Spur removal:** short out-and-back stubs (≤ 80 m) created where a waypoint sat just off the path were removed automatically.
4. **Resampling** to one point every 7.5 m.
5. **Elevation:** sampled every ~25 m from USGS NED 10 m, interpolated to every point, and smoothed over 5 points.
6. **Visual check:** we rendered all three routes over the basemap and checked that they follow streets and paths. The target lengths were ~5, ~8 and ~3.5 km. A and B are close; C came out at 3.0 km, which we kept rather than add an artificial detour.

`routes.geojson` holds the overview geometry, simplified (~2 m tolerance) to keep it small.
`millie-run.gpx` is the **hero run** (route A, Thu Nov 12 2026, 7:04 a.m.) at full resolution: 654 points with elevation, timestamps and heart rate (Garmin TrackPointExtension). Its metadata states that it is simulated.

### `hero-run.json` (the run on the map)

The same hero run as columns (`lon`, `lat`, `ele_m`, `dist_m`, `time_s`, `hr_bpm`). It drives the moving dot and the live readout.
- **Pace model:** a base pace (5:50 /km) scaled by terrain. Uphill segments are slower (×(1 + 3.3 × grade), capped at ×2.2 for stairs), downhill slightly faster (min ×0.92), with smooth random variation of about ±1–2%.
- **Heart-rate model:** starts near 100 bpm and moves toward a target with a ~22 s lag. The target is 147 bpm, plus a term for recent climbing, plus a slow upward drift of 0.12 bpm per minute, plus noise. Result: average 154 bpm, peak 181 bpm about 1.2 km in, on the climb out of Riverside Park.

### `activities.json` (a year of runs)

141 runs from **Nov 16 2025 to Nov 15 2026**, times in America/New_York with the correct EST/EDT offsets.

| Parameter | Value |
|---|---|
| Tue + Thu mornings | 7:00 ± up to 20 min (normal, sd 10 min, clipped); route A 70% / C 30% |
| Sunday afternoons | 15:00 ± up to 45 min (sd 22 min, clipped); route B 85% / A 15% |
| Random skips | 10% of scheduled runs |
| One-off extra runs | 8% chance on any Wednesday or Saturday outside the gaps → 8 extras, 8 a.m.–7 p.m. |
| Pace | 6:26 /km at the start of the year → 5:56 /km at the end (linear), route adjustment (B +12 s, C −6 s), +6 s in July/Aug heat, ± 7 s noise |
| Heart rate | average ≈ 157 → 149 bpm over the year (fitness), +3 on long runs, +4 in summer, ± 3 noise; max = average + 16–22 |
| Splits | per km, weighted by that km's terrain |
| Start/end jitter | each recorded start and end point is offset by a 2D normal (sd 12 m), rejected beyond 30 m |
| `visible_start_200m` / `visible_end_200m` | where the visible track begins and ends if the first and last 200 m are hidden (200 m along the route, ± a few metres) |

**Built-in gaps** (tagged in `gaps`, so the site can point to them; the site labels any explanation as *Unsupported*):

| id | Dates | What happens |
|---|---|---|
| `winter-break` | Dec 19 2025 – Jan 10 2026 | no runs (23 days with none) |
| `spring-finals` | May 4 – May 14 2026 | sparse: each scheduled run kept with 30% probability (2 runs in 11 days) |
| `summer-gap` | Jul 11 – Jul 25 2026 | no runs, deliberately unexplained (16 days with none) |

Run 1 is tagged `first-upload-unhidden`. Strava says the 200 m default is applied to *future* activities after the first upload, so the first run's endpoints stay visible.

### `profile.json`, `followers.json` and `pro-profile.json` (profiles)

- **Fitness profile** (all defaults): "Millie Bear", Barnard College, hometown Brooklyn NY, short bio, initials avatar ("MB"), profile and activity visibility **Everyone**.
- **Followers:** 10 people, all invented. Eight are friends and family; two are accounts she doesn't recognize (`athlete_80412`, "R. K."). All avatars are initials.
- **Professional profile** (fictional, generic "professional networking" mockup) lists B.A. Cognitive Science, class of 2027, a fictional Brooklyn high school, two internships, skills and a club. It shares two exact fields with the fitness profile, name and college.

### `settings-defaults.json`

The settings panel reads this file. Each option carries its default and what it applies to: activity visibility (Everyone), profile visibility (Everyone), hide start/end (on, 200 m, future only), hide near an address (off, past and future), hide entire map (off, future only), heatmap participation (on), hidden details for heart rate (off) and start time (off).

### `heatmap-dense.geojson` and `heatmap-sparse.geojson` (aggregate heatmaps)

- **Dense (Morningside/Riverside):** 300 fictional runners. Each one is a loop from a random point in the neighborhood through 2–4 waypoints. 45% of waypoints sit near Riverside or Morningside Park; the rest are random within ~650 m. Every loop is routed on real OSM paths. Each track has a `runs` count drawn from a log-normal distribution (median 14, capped at 150), for 6,573 simulated runs in total. Millie's three routes are added with their real counts from `activities.json`. Using real routing means the tracks follow Manhattan's rotated street grid naturally.
  - **Computed result:** 91% of Millie's weekday route lies within 15 m of at least five other runners' tracks.
- **Sparse (fictional remote site):** 20 tracks on a **local metre grid, not geographic coordinates** (`properties.crs = "local-metres"`). The tracks trace a 900 × 600 m rectangular perimeter (8 laps), two internal roads, a loop around one block, an access road and two partial loops. They are rotated 14° and given 1–2 m of smooth wobble, with 15–70 runs each (793 total). It represents no real place.

### `claims.json` (the claims ledger)

22 claims, each with `id`, `section`, `claim`, `level` (observed / inferred / unsupported), `evidence`, `citations`, `mitigatedBy` (setting ids) and `stillLeaks`.
**Every number in an evidence string is computed from the generated data** in the same script. The `evidence` object in the file holds the raw values (e.g. `within60: 141`, `p95_start_m: 27`, `vis_centroid_offset_m: 113`, `am_in_window: 89 of 89`, `pace_first: 6:24` → `pace_last: 6:01`). Current counts: 10 observed, 8 inferred, 4 unsupported.

### `references.json`

The report's reference list (APA strings and URLs), plus five Strava Support articles we used to check defaults (marked `added: true`). We also added a DOI for Boyd & Crawford (2012) and a URL for Franzke et al. (2020); please double-check both.

---

## Checking Strava's current support pages (2026-11-16)

| Claim | Status | Source (quote) |
|---|---|---|
| Activity visibility defaults to Everyone | ✅ confirmed | Privacy defaults page: "Activities: Everyone" |
| Profile visibility defaults to Everyone, and may be indexed by search engines | ✅ confirmed | Privacy defaults page: "Profile: Everyone"; "may be indexed by search engines and consequently appear in search results" |
| The first and last 200 m are hidden by default | ✅ confirmed, with nuance | Map Visibility page: applies to "future activity maps … the next time you open the Strava app" after the first upload |
| The address option applies to past activities; hide start/end and hide entire map are future-only | ✅ confirmed | Map Visibility page: address option "will apply to all past and present activities"; the other two "will only apply to future activities" |
| Activities count toward the Global Heatmap / Metro by default (opt out under Privacy Controls → Product Improvement) | ✅ confirmed | Activity privacy controls page |
| Heatmap excludes activities not set to Everyone and portions hidden by map visibility | ✅ confirmed (new detail) | Heatmap/Metro page |
| Heart rate can be hidden | ✅ confirmed (new detail) | "Hidden Details" → Heart Rate, per activity or as a default for new uploads; not retroactive except via a separate bulk step; Start Time can be hidden too |

## Claims in the report to fix or update

1. **§3.2 data collection.** The report says we examined public Strava profiles, the street-level heatmap and LinkedIn while logged in. The **site** uses none of that: all data is simulated as described above. If you did browse those pages for background, say so explicitly and keep it separate from the site's data.
2. **§3.1 "Route Simulated GPX file – showcased using gpx.studio".** The GPX was not drawn in gpx.studio. It was produced by `scripts/generate-data.mjs` from hand-placed waypoints routed over OpenStreetMap (same principle, different tool). Update the caption.
3. **§3.2 / §4.2 "We simulated the route, the persona, the year of activity history, and the cross-platform profiles".** This is now true; cite DATA.md for the parameters.
4. **§2.1 "hides the first and last 200 meters … by default when a user logs into the app".** More precisely: after the *first* upload, applied to *future* activities the next time the app is opened. The first activity stays unhidden.
5. **§2.1 citation "(Strava, 2026)" for the search-engine quote.** The quote comes from the *privacy defaults* support article (n.d.); the 2026 privacy policy (effective Jan 1 2026) says something similar ("'Everyone' includes … search engine results"). Cite the article you quote.
6. **§3.4.2 and §3.4.5 "Setting activities to Followers limits this visibility".** True, with a gap: while the **profile** is set to Everyone (the default), anyone can follow without approval, so "Followers" doesn't keep strangers out. Approval is required only once the profile is set to Followers. The site says this.
7. **§3.4.5 heart rate.** Add Strava's **Hidden Details → Heart Rate** option. It's the most direct control and the report doesn't mention it.
8. **Strava's own pages disagree** on whether logged-out visitors can see an Everyone profile. The defaults page says "a logged-out version of your profile page will be available to non-members"; the profile controls page says anyone on the web "will see a prompt to log in". The site avoids depending on either.
9. **Address-option radius.** The Map Visibility page mentions "a 1-mile radius" for the address option, but we couldn't confirm the slider range. The site's 400 m circle is labeled *illustrative*.
10. **§3.4.5 "attack while she's winded".** Cut per our ethics rules. The site instead says heart-rate data "shows when and where she's exerting herself hardest."
11. **Not re-checked in this pass** (copied from the report; please verify before the final submission): the Pew percentages, "1 billion activities / 3 trillion points" (Robb, 2017), Meteriz-Yildiran's 59.59–99.80%, Na et al.'s ~95%, Grundy et al.'s 19 of 24 (79%), Postma's ~6,500 users at 200+ sites, and Childs et al.'s density finding.
12. **Heatmap login.** The report says the street-level heatmap needs a free Strava login. We didn't re-check this, and the site doesn't depend on it.

---

## Third-party requests made by the site

- **Basemap tiles:** OpenFreeMap (`tiles.openfreemap.org`, Positron style, keyless), with OSM attribution shown on the map.
- Nothing else: fonts are self-hosted, and there are no analytics, cookies, trackers or form submissions.
