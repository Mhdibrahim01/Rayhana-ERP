'use strict';

const fs = require('fs');
const path = require('path');
const espree = require('espree');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDED_DIRS = new Set(['.git', '.test-output', 'dist', 'node_modules', 'scratch']);

function walkFiles(root = ROOT, extension = null) {
  const files = [];
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name)) visit(path.join(directory, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;
      if (extension && path.extname(entry.name).toLowerCase() !== extension) continue;
      files.push(path.join(directory, entry.name));
    }
  }
  visit(root);
  return files.sort();
}

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join('/');
}

function parseJavaScript(source) {
  return espree.parse(source, {
    ecmaVersion: 'latest',
    sourceType: 'script',
    allowReturnOutsideFunction: true,
    loc: true,
    comment: true
  });
}

function visitAst(node, callback, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (typeof node.type === 'string') callback(node, parent);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) {
      for (const child of value) visitAst(child, callback, node);
    } else if (value && typeof value === 'object' && typeof value.type === 'string') {
      visitAst(value, callback, node);
    }
  }
}

function functionNameFromAssignment(node) {
  if (!node || node.type !== 'AssignmentExpression') return null;
  const left = node.left;
  if (left.type === 'Identifier') return left.name;
  if (left.type === 'MemberExpression' && !left.computed && left.property.type === 'Identifier') {
    return left.property.name;
  }
  return null;
}

function inferredFunctionName(node, parent) {
  if (node.id && node.id.name) return node.id.name;
  if (!parent) return null;
  if (parent.type === 'VariableDeclarator' && parent.id.type === 'Identifier') return parent.id.name;
  if (parent.type === 'AssignmentExpression') return functionNameFromAssignment(parent);
  if (parent.type === 'Property' && !parent.computed) {
    return parent.key.type === 'Identifier' ? parent.key.name : String(parent.key.value || '');
  }
  if (parent.type === 'MethodDefinition' && !parent.computed) {
    return parent.key.type === 'Identifier' ? parent.key.name : String(parent.key.value || '');
  }
  return null;
}

function countNamedFunctions(ast) {
  let count = 0;
  visitAst(ast, (node, parent) => {
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression') {
      if (inferredFunctionName(node, parent)) count++;
    }
  });
  return count;
}

function topLevelFunctionDefinitions(ast) {
  const definitions = [];
  const statements = [...(ast.body || [])];
  for (const statement of ast.body || []) {
    const expression = statement.type === 'ExpressionStatement' ? statement.expression : null;
    const callee = expression && expression.type === 'CallExpression' ? expression.callee : null;
    if (callee && ['FunctionExpression', 'ArrowFunctionExpression'].includes(callee.type) && callee.body.type === 'BlockStatement') {
      statements.push(...callee.body.body);
    }
  }
  for (const statement of statements) {
    if (statement.type === 'FunctionDeclaration' && statement.id) {
      definitions.push({ name: statement.id.name, line: statement.loc.start.line });
    }
    if (statement.type === 'VariableDeclaration') {
      for (const declaration of statement.declarations) {
        if (declaration.id.type === 'Identifier' && declaration.init &&
            ['FunctionExpression', 'ArrowFunctionExpression'].includes(declaration.init.type)) {
          definitions.push({ name: declaration.id.name, line: declaration.loc.start.line });
        }
      }
    }
    if (statement.type === 'ExpressionStatement' && statement.expression.type === 'AssignmentExpression') {
      const assignment = statement.expression;
      const isWindowGlobal = assignment.left.type === 'MemberExpression' &&
        assignment.left.object.type === 'Identifier' && assignment.left.object.name === 'window';
      const name = isWindowGlobal ? functionNameFromAssignment(assignment) : null;
      if (name && ['FunctionExpression', 'ArrowFunctionExpression'].includes(assignment.right.type)) {
        definitions.push({ name, line: statement.loc.start.line });
      }
    }
  }
  visitAst(ast, node => {
    if (node.type !== 'AssignmentExpression' || node.left.type !== 'MemberExpression') return;
    if (node.left.object.type !== 'Identifier' || node.left.object.name !== 'window') return;
    if (!['FunctionExpression', 'ArrowFunctionExpression'].includes(node.right.type)) return;
    const name = functionNameFromAssignment(node);
    if (name) definitions.push({ name, line: node.loc.start.line });
  });
  const seen = new Set();
  return definitions.filter(definition => {
    const key = `${definition.name}:${definition.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function inlineEventAttributes(source) {
  const attributes = [];
  const attributePattern = /\bon[a-z][a-z0-9_-]*\s*=\s*(["'])([\s\S]*?)\1/gi;
  let match;
  while ((match = attributePattern.exec(source))) {
    attributes.push({ name: match[0].slice(0, match[0].indexOf('=' )).trim().toLowerCase(), body: match[2] });
  }
  return attributes;
}

function templateEventAttributes(source, filename) {
  const ast = parseJavaScript(source, filename);
  const attributes = [];
  visitAst(ast, node => {
    if (node.type !== 'TemplateLiteral') return;
    let templateText = '';
    node.quasis.forEach((quasi, index) => {
      templateText += quasi.value.raw;
      if (index < node.expressions.length) templateText += '0';
    });
    attributes.push(...inlineEventAttributes(templateText));
  });
  return attributes;
}

function inlineHandlerCalls(attributes) {
  const calls = [];
  for (const attribute of attributes) {
    const source = attribute.body.replace(/\$\{[\s\S]*?\}/g, '0');
    let ast;
    try {
      ast = parseJavaScript(source);
    } catch (_) {
      // The guard only resolves simple inline global calls; unsupported snippets are
      // left for the renderer's runtime smoke coverage rather than guessed at here.
      continue;
    }
    visitAst(ast, node => {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
        calls.push({ name: node.callee.name, attribute });
      }
    });
  }
  return calls;
}

function appJavaScriptFiles() {
  return walkFiles(ROOT, '.js').filter(file => {
    const rel = relative(file);
    return !rel.startsWith('scripts/') && !rel.startsWith('tests/') && rel !== 'eslint.config.js';
  });
}

function appHtmlFiles() {
  return walkFiles(ROOT, '.html').filter(file => ['dashboard.html', 'index.html', 'login.html'].includes(relative(file)));
}

module.exports = {
  ROOT,
  appHtmlFiles,
  EXCLUDED_DIRS,
  appJavaScriptFiles,
  countNamedFunctions,
  inlineEventAttributes,
  inlineHandlerCalls,
  parseJavaScript,
  relative,
  templateEventAttributes,
  topLevelFunctionDefinitions,
  visitAst,
  walkFiles
};
