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

const KNOWN_DUPLICATES = [
  { name: 'getLocalDateString', scope: 'main-process', files: ['backupScheduler.js', 'db/connection.js', 'main.js'] },
  { name: 'init', scope: 'documented-cross-scope', files: ['dashboard.js', 'db/connection.js'] },
  { name: 'showToast', scope: 'documented-cross-page', files: ['dashboard.js', 'renderer.js'] }
];

function scriptsLoadedByHtml(files) {
  const appFiles = new Set(files.map(file => path.resolve(file)));
  const groups = [];
  for (const htmlFile of appHtmlFiles()) {
    const html = fs.readFileSync(htmlFile, 'utf8');
    const loaded = new Set();
    for (const match of html.matchAll(/<script\b([^>]*)>/gi)) {
      const src = match[1].match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2];
      if (!src || /^(?:[a-z]+:)?\/\//i.test(src) || src.startsWith('data:')) continue;
      const scriptPath = path.resolve(path.dirname(htmlFile), decodeURIComponent(src.split(/[?#]/, 1)[0]));
      if (appFiles.has(scriptPath)) loaded.add(scriptPath);
    }
    groups.push({ scope: `html:${relative(htmlFile)}`, files: [...loaded] });
  }
  return groups;
}

function mainProcessFiles(files) {
  return files.filter(file => {
    const rel = relative(file);
    return rel === 'main.js' || rel === 'preload.js' || rel === 'backupScheduler.js' ||
      rel === 'db.js' || rel.startsWith('db/') || rel.startsWith('ipc/');
  });
}

function isThinDelegatingWrapper(node) {
  if (!node || !node.loc || node.loc.end.line - node.loc.start.line + 1 > 3) return false;
  let expression = null;
  if (node.body?.type === 'BlockStatement' && node.body.body.length === 1) {
    const statement = node.body.body[0];
    if (statement.type === 'ReturnStatement') expression = statement.argument;
    else if (statement.type === 'ExpressionStatement') expression = statement.expression;
  } else if (node.body?.type === 'CallExpression') {
    expression = node.body;
  }
  return expression?.type === 'CallExpression' &&
    (expression.callee.type === 'Identifier' || expression.callee.type === 'MemberExpression');
}

function collectTopLevelFunctionDuplicates(files) {
  const groups = [...scriptsLoadedByHtml(files), { scope: 'main-process', files: mainProcessFiles(files) }];
  const duplicates = [];
  for (const group of groups) {
    const definitionsByName = new Map();
    for (const file of group.files) {
      const ast = parseJavaScript(fs.readFileSync(file, 'utf8'), relative(file));
      for (const definition of topLevelFunctionDefinitions(ast)) {
        if (isThinDelegatingWrapper(definition.node)) continue;
        const entries = definitionsByName.get(definition.name) || [];
        entries.push(relative(file));
        definitionsByName.set(definition.name, entries);
      }
    }
    for (const [name, locations] of definitionsByName) {
      const uniqueFiles = [...new Set(locations)].sort();
      if (uniqueFiles.length > 1) duplicates.push({ name, scope: group.scope, files: uniqueFiles });
    }
  }
  return duplicates.sort((a, b) => a.scope.localeCompare(b.scope) || a.name.localeCompare(b.name));
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
  const knownMainProcess = KNOWN_DUPLICATES.find(item => item.name === 'getLocalDateString' && item.scope === 'main-process');
  const unexpectedDuplicates = duplicates.filter(item =>
    !(item.scope === knownMainProcess.scope && item.name === knownMainProcess.name &&
      JSON.stringify(item.files) === JSON.stringify(knownMainProcess.files))
  );
  if (unexpectedDuplicates.length) {
    failures.push(`Duplicate real-body functions within one renderer page or main-process scope:\n${unexpectedDuplicates.map(item => `  - ${item.name} (${item.scope}): ${item.files.join(', ')}`).join('\n')}`);
  }
  console.log('Known duplicate definitions:');
  for (const item of KNOWN_DUPLICATES) {
    console.log(`  - ${item.name} [${item.scope}]: ${item.files.join(', ')}`);
  }
  console.log(`Duplicate scan: ${duplicates.length} in-scope duplicate group(s); thin delegating wrappers (3 lines or fewer) ignored.`);
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
