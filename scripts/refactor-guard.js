'use strict';

const fs = require('fs');
const path = require('path');
const {
  ROOT,
  appHtmlFiles,
  appJavaScriptFiles,
  inlineEventAttributes,
  inlineHandlerCalls,
  parseJavaScript,
  relative,
  templateEventAttributes,
  topLevelFunctionDefinitions,
  visitAst,
  walkFiles
} = require('./static-analysis-utils');

const BUILT_IN_INLINE_CALLS = new Set([
  'alert', 'atob', 'btoa', 'clearInterval', 'clearTimeout', 'confirm', 'decodeURI',
  'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'eval', 'isFinite',
  'isNaN', 'parseFloat', 'parseInt', 'prompt', 'queueMicrotask', 'requestAnimationFrame',
  'setInterval', 'setTimeout', 'switchView'
]);

function getGlobalFunctionNames(files) {
  const names = new Set(BUILT_IN_INLINE_CALLS);
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const ast = parseJavaScript(source, relative(file));
    for (const definition of topLevelFunctionDefinitions(ast)) names.add(definition.name);
    visitAst(ast, node => {
      if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression') return;
      if (node.left.object.type === 'Identifier' && node.left.object.name === 'window' && !node.left.computed && node.left.property.type === 'Identifier') {
        names.add(node.left.property.name);
      }
    });
  }
  return names;
}

function collectTopLevelFunctionDuplicates(files) {
  const locations = new Map();
  for (const file of files) {
    const ast = parseJavaScript(fs.readFileSync(file, 'utf8'), relative(file));
    for (const definition of topLevelFunctionDefinitions(ast)) {
      const existing = locations.get(definition.name) || [];
      existing.push(`${relative(file)}:${definition.line}`);
      locations.set(definition.name, existing);
    }
  }
  return Object.fromEntries([...locations.entries()]
    .map(([name, locationsForName]) => [name, [...new Set(locationsForName.map(location => location.split(':')[0]))].sort()])
    .filter(([, filesForName]) => filesForName.length > 1)
    .sort(([a], [b]) => a.localeCompare(b)));
}

function checkDashboardScriptEntries() {
  const htmlPath = path.join(ROOT, 'dashboard.html');
  const html = fs.readFileSync(htmlPath, 'utf8');
  const scriptTags = [...html.matchAll(/<script\b([^>]*)>/gi)].map(match => match[1]);
  const dashboardIndex = scriptTags.findIndex(attributes => /\bsrc\s*=\s*["'][^"']*dashboard\.js(?:[?#][^"']*)?["']/i.test(attributes));
  const otherModuleIndex = scriptTags.findIndex((attributes, index) => index !== dashboardIndex && /\btype\s*=\s*["']module["']/i.test(attributes));
  return dashboardIndex !== -1 && otherModuleIndex !== -1;
}

function collectHandlers(files) {
  const handlers = [];
  const htmlFiles = appHtmlFiles();
  for (const file of htmlFiles) {
    const source = fs.readFileSync(file, 'utf8');
    handlers.push(...inlineEventAttributes(source).map(attribute => ({ ...attribute, sourceFile: relative(file), sourceKind: 'HTML' })));
  }
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    handlers.push(...templateEventAttributes(source, relative(file)).map(attribute => ({ ...attribute, sourceFile: relative(file), sourceKind: 'JS template' })));
  }
  return handlers;
}

function printLineCounts() {
  console.log('JavaScript line counts:');
  for (const file of walkFiles(ROOT, '.js')) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const lineCount = lines.length - (lines[lines.length - 1] === '' ? 1 : 0);
    console.log(`  ${relative(file)}: ${lineCount}`);
  }
}

function main() {
  const files = appJavaScriptFiles();
  const failures = [];
  const duplicates = collectTopLevelFunctionDuplicates(files);
  const baselinePath = path.join(ROOT, 'tests', 'baseline', 'baseline.json');
  if (!fs.existsSync(baselinePath)) {
    failures.push('Reference baseline is missing. Run "npm run baseline:update" deliberately before the guard.');
  } else {
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    const knownDuplicates = baseline.knownTopLevelFunctionDuplicates || {};
    const newDuplicates = Object.entries(duplicates).filter(([name, locations]) =>
      JSON.stringify(locations) !== JSON.stringify(knownDuplicates[name] || [])
    );
    if (newDuplicates.length) {
      failures.push(`New or changed duplicate top-level function names:\n${newDuplicates.map(([name, locations]) => `  - ${name}: ${locations.join(', ')}`).join('\n')}`);
    }
    if (Object.keys(duplicates).length) {
      console.log(`Existing baseline duplicate(s), unchanged: ${Object.keys(duplicates).join(', ')}`);
    }
  }
  if (checkDashboardScriptEntries()) failures.push('dashboard.html loads dashboard.js and a module script entry at the same time.');

  const globalNames = getGlobalFunctionNames(files);
  const unresolved = [];
  for (const handler of collectHandlers(files)) {
    for (const call of inlineHandlerCalls([handler])) {
      if (!globalNames.has(call.name)) unresolved.push(`${handler.sourceFile}: ${handler.name} calls "${call.name}()"`);
    }
  }
  if (unresolved.length) failures.push(`Inline event handlers call names not found in the global function list:\n${unresolved.map(item => `  - ${item}`).join('\n')}`);

  printLineCounts(files);
  if (failures.length) {
    console.error('\nRefactor guard failed:');
    console.error(failures.join('\n\n'));
    process.exitCode = 1;
    return;
  }
  console.log('\nRefactor guard passed.');
}

main();
