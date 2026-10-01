'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  appHtmlFiles,
  appJavaScriptFiles,
  countNamedFunctions,
  inlineEventAttributes,
  parseJavaScript,
  relative,
  templateEventAttributes,
  topLevelFunctionDefinitions
} = require('./static-analysis-utils');

const REFERENCE_PATH = path.join(ROOT, 'tests', 'baseline', 'baseline.json');
const OUTPUT_DIR = path.join(ROOT, '.test-output');
const CURRENT_PATH = path.join(OUTPUT_DIR, 'baseline-current.json');
const DIFF_PATH = path.join(OUTPUT_DIR, 'baseline.diff.txt');

const STATUS_STRINGS = [
  'متاحة', 'مشغولة', 'محجوزة', 'تنظيف', 'مؤكد', 'مكتمل', 'ملغي', 'ملغي جزئي',
  'غير مدفوع', 'مدفوع جزئياً', 'مدفوع بالكامل', 'عقد مفتوح', 'نقداً'
];

function readSourceFiles() {
  const jsFiles = appJavaScriptFiles();
  const htmlFiles = appHtmlFiles();
  return { jsFiles, htmlFiles, allFiles: [...jsFiles, ...htmlFiles] };
}

function countOccurrences(source, value) {
  let count = 0;
  let from = 0;
  while ((from = source.indexOf(value, from)) !== -1) {
    count++;
    from += value.length;
  }
  return count;
}

function collectLocalStorageKeys(files) {
  const keys = new Set();
  const pattern = /(?:window\s*\.\s*)?localStorage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*(['"])(.*?)\1/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    let match;
    while ((match = pattern.exec(source))) keys.add(match[2]);
  }
  return [...keys].sort();
}

function collectIpcChannels(files) {
  const channels = {};
  const pattern = /\b(?:ipcMain|ipcRenderer)\s*\.\s*(?:handle|on|once|invoke|send|sendSync|removeHandler|removeListener)\s*\(\s*(['"])(.*?)\1/g;
  const senderPattern = /\b(?:webContents|sender)\s*\.\s*send\s*\(\s*(['"])(.*?)\1/g;
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    for (const channelPattern of [pattern, senderPattern]) {
      channelPattern.lastIndex = 0;
      let match;
      while ((match = channelPattern.exec(source))) {
        channels[match[2]] = (channels[match[2]] || 0) + 1;
      }
    }
  }
  return Object.fromEntries(Object.entries(channels).sort(([a], [b]) => a.localeCompare(b)));
}

function collectInlineEventCounts(jsFiles, htmlFiles) {
  const counts = {};
  for (const file of htmlFiles) {
    counts[relative(file)] = { htmlAttributes: inlineEventAttributes(fs.readFileSync(file, 'utf8')).length, templateAttributes: 0 };
  }
  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    let templateCount = 0;
    for (const attribute of templateEventAttributes(source, relative(file))) {
      if (/^on[a-z]/i.test(attribute.name)) templateCount++;
    }
    if (templateCount) {
      counts[relative(file)] = counts[relative(file)] || { htmlAttributes: 0, templateAttributes: 0 };
      counts[relative(file)].templateAttributes = templateCount;
    }
  }
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

function getExportedDbFunctions() {
  const db = require(path.join(ROOT, 'db'));
  return Object.entries(db)
    .filter(([, value]) => typeof value === 'function')
    .map(([name]) => name)
    .sort();
}

function collectTopLevelFunctionDuplicates(jsFiles) {
  const occurrences = new Map();
  for (const file of jsFiles) {
    const ast = parseJavaScript(fs.readFileSync(file, 'utf8'), relative(file));
    for (const definition of topLevelFunctionDefinitions(ast)) {
      const locations = occurrences.get(definition.name) || new Set();
      locations.add(relative(file));
      occurrences.set(definition.name, locations);
    }
  }
  return Object.fromEntries([...occurrences.entries()]
    .filter(([, files]) => files.size > 1)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, files]) => [name, [...files].sort()]));
}

function collectBaseline() {
  const { jsFiles, htmlFiles, allFiles } = readSourceFiles();
  const namedFunctionsPerFile = {};
  const inlineApiCallSites = {};
  const statusCounts = Object.fromEntries(STATUS_STRINGS.map(status => [status, 0]));

  for (const file of jsFiles) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parseJavaScript(source, relative(file));
    namedFunctionsPerFile[relative(file)] = countNamedFunctions(ast);
    inlineApiCallSites[relative(file)] = (source.match(/\bwindow\s*\.\s*api\s*\.\s*[$A-Z_a-z][$\w]*\s*\(/g) || []).length;
  }

  for (const file of allFiles) {
    const source = fs.readFileSync(file, 'utf8');
    for (const status of STATUS_STRINGS) statusCounts[status] += countOccurrences(source, status);
  }

  const ipcFiles = [...jsFiles].filter(file => {
    const rel = relative(file);
    return rel === 'preload.js' || rel === 'main.js' || rel.startsWith('ipc/');
  });

  return {
    note: 'Tripwire only: structural counts and names do not prove behavior is unchanged.',
    namedFunctionsPerFile: Object.fromEntries(Object.entries(namedFunctionsPerFile).sort(([a], [b]) => a.localeCompare(b))),
    totalWindowApiCallSites: Object.values(inlineApiCallSites).reduce((sum, count) => sum + count, 0),
    windowApiCallSitesPerFile: Object.fromEntries(Object.entries(inlineApiCallSites).sort(([a], [b]) => a.localeCompare(b))),
    arabicStatusStringCounts: statusCounts,
    localStorageKeys: collectLocalStorageKeys(allFiles),
    ipcChannels: collectIpcChannels(ipcFiles),
    exportedDbFunctions: getExportedDbFunctions(),
    inlineEventAttributeCounts: collectInlineEventCounts(jsFiles, htmlFiles),
    knownTopLevelFunctionDuplicates: collectTopLevelFunctionDuplicates(jsFiles)
  };
}

function flatten(value, prefix = '', result = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value).sort()) flatten(value[key], prefix ? `${prefix}.${key}` : key, result);
  } else {
    result[prefix] = JSON.stringify(value);
  }
  return result;
}

function writeCurrent(current) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(CURRENT_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
}

function main() {
  const mode = process.argv[2] || 'check';
  if (!['check', 'update'].includes(mode)) {
    console.error('Usage: node scripts/baseline.js [check|update]');
    process.exitCode = 2;
    return;
  }

  const current = collectBaseline();
  writeCurrent(current);

  if (mode === 'update') {
    fs.mkdirSync(path.dirname(REFERENCE_PATH), { recursive: true });
    fs.writeFileSync(REFERENCE_PATH, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    fs.writeFileSync(DIFF_PATH, 'Baseline reference intentionally updated.\n', 'utf8');
    console.log(`Baseline reference intentionally updated: ${path.relative(ROOT, REFERENCE_PATH)}`);
    console.log(`Current-run output: ${path.relative(ROOT, CURRENT_PATH)}`);
    return;
  }

  if (!fs.existsSync(REFERENCE_PATH)) {
    fs.writeFileSync(DIFF_PATH, `Missing reference baseline: ${path.relative(ROOT, REFERENCE_PATH)}\n`, 'utf8');
    console.error(`Baseline reference is missing. Run "npm run baseline:update" deliberately to create it.`);
    process.exitCode = 1;
    return;
  }

  const reference = JSON.parse(fs.readFileSync(REFERENCE_PATH, 'utf8'));
  const oldFlat = flatten(reference);
  const newFlat = flatten(current);
  const keys = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort();
  const differences = keys.filter(key => oldFlat[key] !== newFlat[key]);
  const diffText = differences.length
    ? differences.map(key => `- ${key}: ${oldFlat[key] ?? '<missing>'}\n+ ${key}: ${newFlat[key] ?? '<missing>'}`).join('\n') + '\n'
    : 'No differences.\n';
  fs.writeFileSync(DIFF_PATH, diffText, 'utf8');

  if (differences.length) {
    console.error(`Baseline mismatch (${differences.length} change(s)).`);
    console.error(`Current-run output: ${path.relative(ROOT, CURRENT_PATH)}`);
    console.error(`Diff: ${path.relative(ROOT, DIFF_PATH)}`);
    console.error('Do not regenerate the reference to make this check pass.');
    process.exitCode = 1;
    return;
  }

  console.log('Baseline check passed. Tripwire only; it does not prove behavior is unchanged.');
  console.log(`Current-run output: ${path.relative(ROOT, CURRENT_PATH)}`);
  console.log(`Diff: ${path.relative(ROOT, DIFF_PATH)}`);
}

main();
