#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { CheckKnowledgeCli } from './interfaces/cli/CheckKnowledgeCli.js';

/**
 * メインエントリーポイント
 * MCP Server と check コマンドのみを提供
 */
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  // サブコマンドルーティング
  switch (command) {
    case 'check': {
      // CI/CD用の知見チェック
      const checkCli = new CheckKnowledgeCli();
      await checkCli.run(args.slice(1));
      break;
    }

    default: {
      console.error('Unknown command:', command);
      console.error('Usage: node dist/index.js check [options]');
      console.error('');
      console.error('For apply functionality, use review-dojo-action:');
      console.error('  https://github.com/sk8metalme/review-dojo-action');
      process.exit(1);
      break;
    }
  }
}

// スクリプトとして実行された場合
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
