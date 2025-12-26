#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { ApplyKnowledgeCli } from './interfaces/cli/ApplyKnowledgeCli.js';

/**
 * メインエントリーポイント
 */
async function main() {
  const cli = new ApplyKnowledgeCli();
  const args = process.argv.slice(2);
  await cli.run(args);
}

// スクリプトとして実行された場合
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
