#!/usr/bin/env node

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';

/**
 * 機密情報マスク用の正規表現パターン
 * 注意: より具体的なパターンを先に配置（優先順位）
 */
const SENSITIVE_PATTERNS = [
  { name: 'Private Key', pattern: /(-----BEGIN[A-Z ]+PRIVATE KEY-----[\s\S]+?-----END[A-Z ]+PRIVATE KEY-----)/g, replacement: '***PRIVATE_KEY***' },
  { name: 'JWT Token', pattern: /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/g, replacement: '***JWT_TOKEN***' },
  { name: 'GitHub Token', pattern: /(gh[pousr]_[a-zA-Z0-9]{36,})/g, replacement: '***GITHUB_TOKEN***' },
  { name: 'AWS Key', pattern: /AKIA[0-9A-Z]{16}/g, replacement: '***AWS_KEY***' },
  { name: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9._-]+/g, replacement: 'Bearer ***TOKEN***' },
  { name: 'Password', pattern: /password\s*[:=]\s*\S+/gi, replacement: 'password: ***' },
  { name: 'API Key', pattern: /[a-zA-Z0-9_-]{20,100}/g, replacement: '***REDACTED***' }
];

/**
 * 入力サイズ制限
 */
const MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_KNOWLEDGE_ITEMS = 1000;

/**
 * アーカイブ設定
 */
const KNOWLEDGE_LIMIT = 100;
const ARCHIVE_SIZE_LIMIT = 10000; // アーカイブファイルの最大項目数

/**
 * パス検証: パストラバーサル攻撃を防止
 */
function sanitizePath(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Invalid path component: must be a non-empty string');
  }

  // 元の入力をチェック: 危険な文字が含まれている場合は即座に拒否
  if (input.includes('..') || input.includes('/') || input.includes('\\')) {
    throw new Error(`Invalid path component: ${input}`);
  }

  // ホワイトリスト検証: 英数字、ハイフン、アンダースコア、ドットのみ許可
  if (!/^[a-zA-Z0-9_.-]+$/.test(input)) {
    throw new Error(`Invalid path component: ${input}`);
  }

  // 長さ制限
  if (input.length > 100) {
    throw new Error(`Path component too long: ${input}`);
  }

  // パスの先頭が`.`で始まる場合は拒否（隠しファイル/相対パス）
  if (input.startsWith('.')) {
    throw new Error(`Invalid path component: ${input}`);
  }

  return input;
}

/**
 * 機密情報をマスクする
 */
function maskSensitiveInfo(text) {
  let masked = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    masked = masked.replace(pattern, replacement);
  }
  return masked;
}

/**
 * Markdownファイルから既存の知見を抽出（正規表現ベース）
 */
async function parseKnowledgeFile(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  const content = await readFile(filePath, 'utf-8');
  const knowledgeItems = [];

  // ファイルタイトル（# で始まる行）を除去
  const contentWithoutTitle = content.replace(/^#\s+.+\n\n?/m, '');

  // ## で始まるセクションで分割
  const sections = contentWithoutTitle.split(/^## /m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const title = lines[0].trim();

    if (!title) continue;

    const item = {
      title,
      severity: 'info',
      occurrences: 1,
      summary: '',
      recommendation: '',
      codeExample: { bad: '', good: '' },
      targetFile: '',
      references: []
    };

    // 各フィールドを正規表現で抽出
    const severityMatch = section.match(/\*\*重要度\*\*:\s*(.+)/);
    if (severityMatch) {
      item.severity = severityMatch[1].trim();
    }

    const occurrencesMatch = section.match(/\*\*発生回数\*\*:\s*(\d+)/);
    if (occurrencesMatch) {
      item.occurrences = parseInt(occurrencesMatch[1]);
    }

    const summaryMatch = section.match(/\*\*概要\*\*:\s*(.+)/);
    if (summaryMatch) {
      item.summary = summaryMatch[1].trim();
    }

    const recommendationMatch = section.match(/\*\*推奨対応\*\*:\s*(.+)/);
    if (recommendationMatch) {
      item.recommendation = recommendationMatch[1].trim();
    }

    const targetFileMatch = section.match(/\*\*対象ファイル例\*\*:\s*`(.+?)`/);
    if (targetFileMatch) {
      item.targetFile = targetFileMatch[1].trim();
    }

    // 参照PRを抽出（複数行対応）
    const referencesSection = section.match(/\*\*参照PR\*\*:\s*([\s\S]*?)(?=\n\n|---|\n-\s+\*\*|$)/);
    if (referencesSection) {
      const urls = referencesSection[1].match(/https?:\/\/[^\s]+/g);
      if (urls) {
        item.references = urls;
      }
    }

    knowledgeItems.push(item);
  }

  return knowledgeItems;
}

/**
 * 類似知見を判定（Phase 1: タイトル完全一致）
 */
function findSimilarKnowledge(newItem, existingItems) {
  return existingItems.find(item =>
    item.title.toLowerCase() === newItem.title.toLowerCase()
  );
}

/**
 * 知見をMarkdown形式に変換
 */
function knowledgeToMarkdown(item) {
  let md = `## ${item.title}\n\n`;
  md += `- **重要度**: ${item.severity}\n`;
  md += `- **発生回数**: ${item.occurrences}\n`;
  md += `- **概要**: ${item.summary}\n`;
  md += `- **推奨対応**: ${item.recommendation}\n`;

  if (item.codeExample && (item.codeExample.bad || item.codeExample.good)) {
    md += `- **コード例**:\n`;
    if (item.codeExample.bad) {
      md += `  \`\`\`\n  // NG\n  ${item.codeExample.bad}\n  \`\`\`\n`;
    }
    if (item.codeExample.good) {
      md += `  \`\`\`\n  // OK\n  ${item.codeExample.good}\n  \`\`\`\n`;
    }
  }

  if (item.targetFile) {
    md += `- **対象ファイル例**: \`${item.targetFile}\`\n`;
  }

  if (item.references && item.references.length > 0) {
    md += `- **参照PR**:\n`;
    item.references.forEach(ref => {
      md += `  - ${ref}\n`;
    });
  }

  md += `\n---\n`;
  return md;
}

/**
 * 知見ファイルを更新
 */
async function updateKnowledgeFile(filePath, newItems) {
  // 既存の知見を読み込み
  const existingItems = await parseKnowledgeFile(filePath);

  // 新規知見を処理
  for (const newItem of newItems) {
    // 機密情報をマスク
    newItem.summary = maskSensitiveInfo(newItem.summary);
    newItem.recommendation = maskSensitiveInfo(newItem.recommendation);
    if (newItem.original_comment) {
      newItem.original_comment = maskSensitiveInfo(newItem.original_comment);
    }

    // 類似知見を検索
    const similar = findSimilarKnowledge(newItem, existingItems);

    if (similar) {
      // 既存知見を更新
      similar.occurrences += 1;
      if (newItem.pr_url && !similar.references.includes(newItem.pr_url)) {
        similar.references.push(newItem.pr_url);
      }
    } else {
      // 新規知見を追加
      existingItems.push({
        title: newItem.title,
        severity: newItem.severity || 'info',
        occurrences: 1,
        summary: newItem.summary,
        recommendation: newItem.recommendation,
        codeExample: newItem.code_example || { bad: '', good: '' },
        targetFile: newItem.file_path || '',
        references: newItem.pr_url ? [newItem.pr_url] : []
      });
    }
  }

  // 100件を超えた場合の処理
  if (existingItems.length > 100) {
    await archiveOldKnowledge(filePath, existingItems);
    // 発生回数が多い上位100件を保持
    existingItems.sort((a, b) => b.occurrences - a.occurrences);
    existingItems.splice(100);
  }

  // Markdownファイルを生成
  const category = dirname(filePath).split('/').pop();
  const language = filePath.split('/').pop().replace('.md', '');

  let content = `# ${capitalize(category)} - ${capitalize(language)}\n\n`;
  existingItems.forEach(item => {
    content += knowledgeToMarkdown(item);
  });

  // ディレクトリが存在しない場合は作成
  await mkdir(dirname(filePath), { recursive: true });

  // ファイルに書き出し
  await writeFile(filePath, content, 'utf-8');

  return existingItems.length;
}

/**
 * 古い知見をアーカイブ
 */
async function archiveOldKnowledge(filePath, items) {
  // 発生回数が少ない下位の知見をアーカイブ
  items.sort((a, b) => a.occurrences - b.occurrences);
  const toArchive = items.slice(0, items.length - KNOWLEDGE_LIMIT);

  if (toArchive.length === 0) return;

  // archive/category/language.md の形式でパスを生成（パス検証）
  const categoryRaw = dirname(filePath).split('/').pop();
  const languageRaw = filePath.split('/').pop();
  const category = sanitizePath(categoryRaw);
  const language = sanitizePath(languageRaw);
  const archivePath = join(process.cwd(), 'archive', category, language);
  await mkdir(dirname(archivePath), { recursive: true });

  let archiveContent = '';
  if (existsSync(archivePath)) {
    archiveContent = await readFile(archivePath, 'utf-8');

    // アーカイブファイルのサイズ制限チェック
    const existingItems = await parseKnowledgeFile(archivePath);
    if (existingItems.length + toArchive.length > ARCHIVE_SIZE_LIMIT) {
      console.warn(`Archive file too large: ${archivePath}. Rotating...`);
      // 古いアーカイブをローテーション
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const rotatedPath = archivePath.replace('.md', `-${timestamp}.md`);
      await writeFile(rotatedPath, archiveContent, 'utf-8');
      archiveContent = `# Archive: ${capitalize(category)} - ${capitalize(language.replace('.md', ''))}\n\n`;
    }
  } else {
    archiveContent = `# Archive: ${capitalize(category)} - ${capitalize(language.replace('.md', ''))}\n\n`;
  }

  toArchive.forEach(item => {
    archiveContent += knowledgeToMarkdown(item);
  });

  await writeFile(archivePath, archiveContent, 'utf-8');
}

/**
 * 文字列の先頭を大文字に
 */
function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * メイン処理
 */
async function main() {
  try {
    // 標準入力からJSONを読み込み
    const inputPath = process.argv[2];
    if (!inputPath) {
      console.error('Usage: node apply-knowledge.js <knowledge.json>');
      process.exit(1);
    }

    const jsonData = await readFile(inputPath, 'utf-8');

    // 入力サイズ制限チェック
    if (jsonData.length > MAX_INPUT_SIZE) {
      throw new Error(`JSON file too large: ${jsonData.length} bytes (max: ${MAX_INPUT_SIZE})`);
    }

    // JSONパース（エラーハンドリング）
    let data;
    try {
      data = JSON.parse(jsonData);
    } catch (parseError) {
      throw new Error(`Invalid JSON format: ${parseError.message}`);
    }

    // スキーマ検証
    if (!data.knowledge_items || !Array.isArray(data.knowledge_items)) {
      throw new Error('Invalid JSON format: missing knowledge_items array');
    }

    // アイテム数制限チェック
    if (data.knowledge_items.length > MAX_KNOWLEDGE_ITEMS) {
      throw new Error(`Too many knowledge items: ${data.knowledge_items.length} (max: ${MAX_KNOWLEDGE_ITEMS})`);
    }

    console.log(`Processing ${data.knowledge_items.length} knowledge items...`);

    // カテゴリ・言語ごとにグループ化（パス検証）
    const grouped = {};
    for (const item of data.knowledge_items) {
      // 必須フィールド検証
      if (!item.category || !item.language) {
        console.warn('Skipping item: missing category or language');
        continue;
      }

      // パス検証
      try {
        const category = sanitizePath(item.category);
        const language = sanitizePath(item.language);
        const key = `${category}/${language}`;

        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(item);
      } catch (sanitizeError) {
        console.warn(`Skipping item: ${sanitizeError.message}`);
      }
    }

    // 各ファイルを更新（並列処理制限付き）
    let totalUpdated = 0;
    const entries = Object.entries(grouped);
    const concurrencyLimit = 10; // 同時処理数制限

    for (let i = 0; i < entries.length; i += concurrencyLimit) {
      const batch = entries.slice(i, i + concurrencyLimit);
      const results = await Promise.all(
        batch.map(async ([key, items]) => {
          try {
            const filePath = join(process.cwd(), `${key}.md`);
            const count = await updateKnowledgeFile(filePath, items);
            console.log(`Updated ${filePath}: ${count} items`);
            return items.length;
          } catch (fileError) {
            console.error(`Error updating ${key}: ${fileError.message}`);
            return 0;
          }
        })
      );
      totalUpdated += results.reduce((sum, count) => sum + count, 0);
    }

    console.log(`\nSuccessfully processed ${totalUpdated} knowledge items`);

    if (data.skipped_comments && data.skipped_comments.length > 0) {
      console.log(`Skipped ${data.skipped_comments.length} comments`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// スクリプトとして実行された場合
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// テスト用にエクスポート
export {
  maskSensitiveInfo,
  parseKnowledgeFile,
  findSimilarKnowledge,
  knowledgeToMarkdown,
  updateKnowledgeFile,
  sanitizePath
};
