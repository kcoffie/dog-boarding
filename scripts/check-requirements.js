#!/usr/bin/env node
/* global process */

/**
 * Requirements Coverage Checker
 *
 * Parses REQUIREMENTS.md and test files to verify all requirements have test coverage.
 *
 * Usage: node scripts/check-requirements.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Colors for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

/**
 * Parse requirements from REQUIREMENTS.md
 * @param {string} filePath Path to REQUIREMENTS.md
 * @returns {Array<{id: string, title: string}>} Array of requirement objects
 */
function parseRequirements(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`${colors.yellow}Note: ${filePath} not found, skipping requirements check${colors.reset}`);
    process.exit(0);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const requirements = [];

  // Match ### REQ-XXX: Title
  const reqRegex = /### (REQ-\d+):\s*(.+)/g;
  let match;

  while ((match = reqRegex.exec(content)) !== null) {
    requirements.push({
      id: match[1],
      title: match[2].trim(),
    });
  }

  return requirements;
}

/**
 * Recursively find all test files
 * @param {string} dir Directory to search
 * @param {Array<string>} files Accumulator array
 * @returns {Array<string>} Array of test file paths
 */
function findTestFiles(dir, files = []) {
  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip node_modules
      if (entry.name !== 'node_modules') {
        findTestFiles(fullPath, files);
      }
    } else if (entry.isFile() && /\.test\.(js|jsx|ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Find requirements referenced in test files
 * @param {Array<string>} testFiles Array of test file paths
 * @returns {Map<string, Array<string>>} Map of requirement ID to array of test files
 */
function findTestedRequirements(testFiles) {
  const tested = new Map();

  for (const file of testFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const relativePath = path.relative(process.cwd(), file);

    // Match @requirements REQ-XXX (can have multiple comma-separated)
    const commentRegex = /@requirements\s+(REQ-\d+(?:\s*,\s*REQ-\d+)*)/g;
    let match;

    while ((match = commentRegex.exec(content)) !== null) {
      const reqs = match[1].split(/\s*,\s*/);
      for (const req of reqs) {
        const reqId = req.trim();
        if (!tested.has(reqId)) {
          tested.set(reqId, []);
        }
        if (!tested.get(reqId).includes(relativePath)) {
          tested.get(reqId).push(relativePath);
        }
      }
    }

    // Match describe('REQ-XXX: ...' or describe('REQ-XXX, REQ-YYY: ...'
    const describeRegex = /describe\(['"`](REQ-\d+(?:\s*,\s*REQ-\d+)*)/g;
    while ((match = describeRegex.exec(content)) !== null) {
      const reqs = match[1].split(/\s*,\s*/);
      for (const req of reqs) {
        const reqId = req.trim();
        if (!tested.has(reqId)) {
          tested.set(reqId, []);
        }
        if (!tested.get(reqId).includes(relativePath)) {
          tested.get(reqId).push(relativePath);
        }
      }
    }
  }

  return tested;
}

/**
 * Main function
 */
function main() {
  const requirementsPath = path.join(process.cwd(), 'docs', 'REQUIREMENTS.md');
  const srcDir = path.join(process.cwd(), 'src');
  const e2eDir = path.join(process.cwd(), 'e2e');

  // Parse requirements
  const requirements = parseRequirements(requirementsPath);

  if (requirements.length === 0) {
    console.error(`${colors.red}No requirements found in ${requirementsPath}${colors.reset}`);
    process.exit(1);
  }

  // Find test files
  const testFiles = [
    ...findTestFiles(srcDir),
    ...findTestFiles(e2eDir),
  ];

  // Find tested requirements
  const tested = findTestedRequirements(testFiles);

  // Generate report
  console.log(`\n${colors.bold}${colors.cyan}📋 Requirements Coverage Report${colors.reset}\n`);
  console.log('='.repeat(60));

  let covered = 0;
  let uncovered = 0;
  const uncoveredList = [];

  for (const req of requirements) {
    const testFiles = tested.get(req.id);

    if (testFiles && testFiles.length > 0) {
      console.log(`${colors.green}✅ ${req.id}${colors.reset}: ${req.title}`);
      console.log(`   ${colors.cyan}└─${colors.reset} ${testFiles.join(', ')}`);
      covered++;
    } else {
      console.log(`${colors.red}❌ ${req.id}${colors.reset}: ${req.title}`);
      console.log(`   ${colors.yellow}└─ NO TESTS${colors.reset}`);
      uncovered++;
      uncoveredList.push(req);
    }
  }

  console.log('='.repeat(60));

  const percentage = Math.round((covered / requirements.length) * 100);
  const percentColor = percentage === 100 ? colors.green : percentage >= 80 ? colors.yellow : colors.red;

  console.log(`\n${colors.bold}Summary:${colors.reset}`);
  console.log(`  Total Requirements: ${requirements.length}`);
  console.log(`  ${colors.green}Covered:${colors.reset} ${covered}`);
  console.log(`  ${colors.red}Missing:${colors.reset} ${uncovered}`);
  console.log(`  ${colors.bold}Coverage:${colors.reset} ${percentColor}${percentage}%${colors.reset}`);

  if (uncovered > 0) {
    console.log(`\n${colors.yellow}⚠️  The following requirements need tests:${colors.reset}`);
    for (const req of uncoveredList) {
      console.log(`   - ${req.id}: ${req.title}`);
    }
    console.log('');
    process.exit(1);
  }

  console.log(`\n${colors.green}✅ All requirements have test coverage!${colors.reset}\n`);
}

main();
