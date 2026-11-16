# Following Millie

An interactive scrollytelling site about Strava privacy, built for *Privacy in a Networked World* (Columbia University / Barnard College).
It follows a fictional runner, Millie, through one run and a year of activity, and shows what a stranger could piece together from publicly accessible information, paired with the setting that limits each piece.

Everything about Millie and every other person is invented. See [DATA.md](DATA.md) for how the data was simulated and [docs/report.md](docs/report.md) for the project report.

## Stack

Vite + vanilla JS · Scrollama · MapLibre GL JS (OpenFreeMap Positron basemap, keyless) · Turf.js · D3 · static output for Vercel.

## Develop

```bash
npm install
npm run dev          # http://localhost:5173
```

## Data

The generated files in `public/data/` are committed. To regenerate them:

```bash
npm run data           # offline; reads data-cache/, output is byte-identical every run
npm run data:refresh   # re-fetch street routing + elevation into data-cache/ (network)
```

## Build and deploy (Vercel)

```bash
npm run build        # outputs dist/
npm run preview      # check the production build locally
```

**Vercel dashboard:** import the Git repository → Framework preset **Vite** (build command `npm run build`, output directory `dist`) → Deploy. Every push to a branch gets its own preview URL.

**Vercel CLI:**

```bash
npm i -g vercel
vercel               # first run links the project and creates a preview deployment
vercel --prod        # promote to production
```

No `vercel.json` is needed: the site is a single static page.

## Privacy of this site

No analytics, cookies, trackers or form submissions. Fonts are self-hosted. The only third-party requests are basemap tiles from OpenFreeMap (tiles.openfreemap.org).
