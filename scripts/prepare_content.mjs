import {readFile, writeFile} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const cases = JSON.parse(await readFile(new URL('src/data/cases.json', root)));
const catalog = JSON.parse(await readFile(new URL('qa/video-catalog-manifest.json', root)));
const categories = [
  ['Rigid body', '05_rigid_domino', 95],
  ['Liquid', '02_liquid_milk', 40],
  ['Deformable', '03_deformable_silk', 12],
  ['Wind-driven', '04_wind_driven_flags', 9],
];
const home = {
  failures: cases.filter(c => c.kind === 'Physical failure'),
  domains: categories.map(([label, id, total]) => {
    const cover = cases.find(c => c.id === id);
    if (!cover) throw new Error(`Missing category cover: ${id}`);
    return {label, total, poster: cover.poster, title: cover.title};
  }),
  submissions: catalog.main_roster.map(config => ({
    ...config,
    submitted: catalog.main_matches.filter(m => m.model === config.model && m.harness === config.harness).length,
    total: catalog.task_count,
  })),
};
await writeFile(new URL('src/data/home.json', root), JSON.stringify(home, null, 2) + '\n');
