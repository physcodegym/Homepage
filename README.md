# PhysCodeGym project page

The public project website for **PhysCodeGym: Benchmarking Coding Agents for Physically Verifiable 4D Reconstruction**.

**Website:** https://physcodegym.github.io/Homepage/

The page includes the reconstruction overview video, all 156 benchmark tasks, nine leaderboard configurations, and model reconstruction comparisons. The main configurations contain 1,179 available reconstruction videos; 225 task/configuration slots have no submitted video. One additional archived reconstruction is retained.

The six physical failure entries open a focused physical-check view with the finding, original-condition validity, and measurement evidence. Video comparisons remain in the ordinary task gallery. Dialog titles and close controls stay visible while their content scrolls.

## Publishing updates

Changes pushed to `main` are automatically checked, built, and published by [the GitHub Pages workflow](.github/workflows/pages.yml). Deployment progress is shown in the repository's **Actions** tab. GitHub Pages must use **GitHub Actions** as its source in **Settings → Pages**.

The workflow publishes only the generated `dist/` website. Asset paths are relative, so images, data, and videos work under the `/Homepage/` address.

## Local preview

Use Node.js 22.12 or later in a supported release.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/ and keep the terminal running. If port 5173 is already in use, run `npm run dev -- --port 5174`.

On macOS, you can also double-click `打开网站.command`. It supports Node.js installed through nvm and reuses an existing local preview when available. Do not open `index.html` directly: it is the Vite source entry and requires the local server.

```sh
npm run check:gallery
npm run build
npm run preview
```

The production preview opens at http://127.0.0.1:4173/.

## Videos

The overview, posters, and selected showcase videos are included in `public/`. Other reference and reconstruction videos load on demand from the public [PhysCodeGym dataset](https://huggingface.co/datasets/ShaoShuai0605/PhysCodeGym), pinned to commit `d65acd3ccc4a4880034161dfd05281b165a33645`. Those videos require an internet connection.

`npm run check:remote` verifies the referenced public video identities against that dataset revision. It requires Python 3 and internet access. `npm run check:gallery` checks all 156 task mappings, configuration availability, and the six failure-evidence mappings locally.

## Editing

| File or folder | Content |
| --- | --- |
| `index.html` | Page structure and prose |
| `src/main.ts` | Filters, gallery, leaderboard, and dialogs |
| `src/player.ts` | Synchronized video playback |
| `src/evidence.ts` | Focused physical findings, validity, and evidence images |
| `src/style.css`, `src/tokens.css` | Layout and appearance |
| `src/data/content.json` | Authors, affiliations, metrics, and citation |
| `src/data/cases.json`, `public/data/cases.json` | Matching copies of the task and video catalog |
| `src/data/results.json`, `public/data/results.json` | Matching copies of the leaderboard data |
| `public/media/` | Local video, poster, figure, and evidence assets |
| `qa/video-catalog-manifest.json` | Video identities used by the verification commands |

Preserve the task, model, harness, job, trial, and video hash mappings when updating results or evidence. Icon sources and licenses are documented in [public/icons/README.md](public/icons/README.md).
