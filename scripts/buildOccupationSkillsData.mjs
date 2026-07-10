import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_INPUT = path.resolve(
  '..',
  'Coding',
  'Portfolio',
  'Metiers',
  'data',
  'outputs',
  'bts_pcs_rome_competences_savoirs_exact.csv'
);
const DEFAULT_OUTPUT = path.resolve('public/data/occupation-space/skills_by_pcs.json');

function parseCsv(text) {
  const records = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"') {
      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
      continue;
    }

    if ((character === '\n' || character === '\r') && !inQuotes) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        records.push(row);
      }
      row = [];
      cell = '';
      continue;
    }

    cell += character;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((value) => value.length > 0)) {
      records.push(row);
    }
  }

  return records;
}

export function parseCsvRecords(text) {
  const rows = parseCsv(text);
  const header = rows.shift() ?? [];

  return rows.map((row) =>
    Object.fromEntries(header.map((column, index) => [column, row[index] ?? '']))
  );
}

function splitList(value) {
  return [...new Set(
    String(value ?? '')
      .split(' | ')
      .map((item) => item.trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b, 'fr'));
}

function booleanValue(value) {
  return ['true', '1', 'yes'].includes(String(value ?? '').trim().toLowerCase());
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'fr'));
}

function addToSet(target, values) {
  for (const value of values) {
    target.add(value);
  }
}

function compactRomeLink(row, competences, savoirs) {
  return {
    code_rome: row.code_rome,
    libelle_rome: row.libelle_rome,
    competences,
    savoirs,
    source_pcs2020_labels: splitList(row.source_pcs2020_labels),
    pcs2020_codes: splitList(row.pcs2020_codes),
    pcs2003_codes: splitList(row.pcs2003_codes),
    fap_codes: splitList(row.fap_codes),
    fap_labels: splitList(row.fap_labels),
    n_exact_paths: Number(row.n_exact_paths) || 0,
    n_source_pcs2020_labels: Number(row.n_source_pcs2020_labels) || 0
  };
}

export function buildSkillsByPcs(records) {
  const profiles = new Map();

  for (const row of records) {
    const pcsCode = String(row.pcs_code ?? '').trim();
    const codeRome = String(row.code_rome ?? '').trim();

    if (!pcsCode || !codeRome) {
      continue;
    }

    const competences = splitList(row.competences);
    const savoirs = splitList(row.savoirs);
    const profile = profiles.get(pcsCode) ?? {
      pcs_code: pcsCode,
      pcs_label: row.pcs_label || pcsCode,
      bridge_method: row.bridge_method || '',
      bridge_is_conservative: booleanValue(row.bridge_is_conservative),
      competences: new Set(),
      savoirs: new Set(),
      rome_links: []
    };

    addToSet(profile.competences, competences);
    addToSet(profile.savoirs, savoirs);
    profile.rome_links.push(compactRomeLink(row, competences, savoirs));
    profiles.set(pcsCode, profile);
  }

  return Object.fromEntries(
    [...profiles.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([pcsCode, profile]) => {
        const competences = uniqueSorted([...profile.competences]);
        const savoirs = uniqueSorted([...profile.savoirs]);
        const romeLinks = profile.rome_links.sort((left, right) =>
          left.code_rome.localeCompare(right.code_rome)
        );

        return [
          pcsCode,
          {
            pcs_code: profile.pcs_code,
            pcs_label: profile.pcs_label,
            bridge_method: profile.bridge_method,
            bridge_is_conservative: profile.bridge_is_conservative,
            rome_count: romeLinks.length,
            competence_count: competences.length,
            savoir_count: savoirs.length,
            competences,
            savoirs,
            rome_links: romeLinks
          }
        ];
      })
  );
}

export async function buildOccupationSkillsData({
  inputPath = DEFAULT_INPUT,
  outputPath = DEFAULT_OUTPUT
} = {}) {
  const text = await readFile(inputPath, 'utf8');
  const profiles = buildSkillsByPcs(parseCsvRecords(text));
  const metadata = {
    created_by: 'scripts/buildOccupationSkillsData.mjs',
    source_file: path.relative(process.cwd(), inputPath).replaceAll('\\', '/'),
    bridge_scope: 'Conservative exact BTS PCS-ROME links only',
    profile_count: Object.keys(profiles).length
  };
  const payload = { metadata, profiles };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(payload));

  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  buildOccupationSkillsData()
    .then(({ metadata }) => {
      console.log(`Wrote ${metadata.profile_count} PCS skill profiles.`);
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
