'use strict';

const madge = require('madge');
const { ROOT, appJavaScriptFiles, relative } = require('./static-analysis-utils');

async function main() {
  const files = appJavaScriptFiles().map(relative);
  const graph = await madge(files, { baseDir: ROOT, fileExtensions: ['js'] });
  const cycles = graph.circular();
  if (cycles.length) {
    console.error(`Circular dependencies found (${cycles.length}):`);
    for (const cycle of cycles) console.error(`  - ${cycle.join(' -> ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`No circular dependencies found across ${files.length} application JavaScript files.`);
}

main().catch(error => {
  console.error(`Circular dependency check failed: ${error.message}`);
  process.exitCode = 1;
});
