#!/usr/bin/env node

import { fileURLToPath } from 'node:url';
import { extname } from 'node:path';
import { ApplyKnowledgeCli } from './interfaces/cli/ApplyKnowledgeCli.js';
import { CheckKnowledgeCli } from './interfaces/cli/CheckKnowledgeCli.js';

/**
 * メインエントリーポイント
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

    case 'apply': {
      // 知見の適用（既存機能）
      const applyCli = new ApplyKnowledgeCli();
      await applyCli.run(args.slice(1));
      break;
    }

    default: {
      // 後方互換性: コマンドなしまたは不明なコマンドの場合は apply として扱う
      // 第1引数がファイルパスの場合（.jsonで終わる）は apply として実行
      const isJsonFile = command && extname(command).toLowerCase() === '.json';
      const isFilePath = command && (
        command.startsWith('/') ||      // POSIX absolute path
        command.startsWith('./') ||     // Relative path (current dir)
        command.startsWith('../') ||    // Relative path (parent dir)
        /^[A-Za-z]:[/\\]/.test(command) // Windows absolute path (C:\, D:\, etc.)
      );

      if (isJsonFile || isFilePath) {
        const applyCliCompat = new ApplyKnowledgeCli();
        await applyCliCompat.run(args);
      } else {
        console.error('Unknown command:', command);
        console.error('Usage: node dist/index.js <check|apply> [options]');
        process.exit(1);
      }
      break;
    }
  }
}

// スクリプトとして実行された場合
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
