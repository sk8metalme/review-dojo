import { readFile } from 'fs/promises';
import { ApplyKnowledgeUseCase } from '../../application/use-cases/ApplyKnowledgeUseCase.js';
import { FileSystemKnowledgeRepository } from '../../infrastructure/repositories/FileSystemKnowledgeRepository.js';
import { MarkdownSerializer } from '../../infrastructure/serializers/MarkdownSerializer.js';
import { ExactTitleMatcher } from '../../domain/services/matchers/ExactTitleMatcher.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';

/**
 * CLI Entry Point
 * scripts/apply-knowledge.js の main() から移行
 */
export class ApplyKnowledgeCli {
  private static readonly MAX_INPUT_SIZE = 10 * 1024 * 1024; // 10MB
  private static readonly MAX_KNOWLEDGE_ITEMS = 1000;

  async run(args: string[]): Promise<void> {
    try {
      // 引数チェック
      const inputPath = args[0];
      if (!inputPath) {
        console.error('Usage: node dist/index.js <knowledge.json>');
        process.exit(1);
      }

      // JSONファイル読み込み
      const jsonData = await readFile(inputPath, 'utf-8');

      // 入力サイズ制限チェック
      if (jsonData.length > ApplyKnowledgeCli.MAX_INPUT_SIZE) {
        throw new Error(
          `JSON file too large: ${jsonData.length} bytes (max: ${ApplyKnowledgeCli.MAX_INPUT_SIZE})`
        );
      }

      // JSONパース
      let data: any;
      try {
        data = JSON.parse(jsonData);
      } catch (parseError: any) {
        throw new Error(`Invalid JSON format: ${parseError.message}`);
      }

      // スキーマ検証
      if (!data.knowledge_items || !Array.isArray(data.knowledge_items)) {
        throw new Error('Invalid JSON format: missing knowledge_items array');
      }

      // アイテム数制限チェック
      if (data.knowledge_items.length > ApplyKnowledgeCli.MAX_KNOWLEDGE_ITEMS) {
        throw new Error(
          `Too many knowledge items: ${data.knowledge_items.length} (max: ${ApplyKnowledgeCli.MAX_KNOWLEDGE_ITEMS})`
        );
      }

      console.log(`Processing ${data.knowledge_items.length} knowledge items...`);

      // 依存関係を構築
      const serializer = new MarkdownSerializer();
      const repository = new FileSystemKnowledgeRepository(
        process.cwd(),
        serializer
      );
      const matcher = new ExactTitleMatcher();
      const useCase = new ApplyKnowledgeUseCase(repository, matcher);

      // カテゴリ・言語ごとにグループ化
      const grouped = this.groupByCategory(data.knowledge_items);

      // 各ファイルを更新（並列処理制限付き）
      let totalUpdated = 0;
      const entries = Object.entries(grouped);
      const concurrencyLimit = 10;

      for (let i = 0; i < entries.length; i += concurrencyLimit) {
        const batch = entries.slice(i, i + concurrencyLimit);
        const results = await Promise.all(
          batch.map(async ([key, items]) => {
            try {
              const [category, language] = key.split('/');
              const count = await useCase.execute({
                category,
                language,
                knowledge_items: items
              });
              console.log(`Updated ${category}/${language}.md: ${count} items`);
              return items.length;
            } catch (fileError: any) {
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
    } catch (error: any) {
      console.error('Error:', error.message);
      if (error.stack) {
        console.error('Stack trace:', error.stack);
      }
      process.exit(1);
    }
  }

  /**
   * カテゴリ・言語ごとにグループ化（ドメインルール検証付き）
   */
  private groupByCategory(items: any[]): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    for (const item of items) {
      // 必須フィールド検証
      if (!item.category || !item.language) {
        console.warn('Skipping item: missing category or language');
        continue;
      }

      // ドメインルールによる早期検証
      try {
        const category = Category.fromString(item.category);
        const language = Language.fromString(item.language);
        const key = `${category.getValue()}/${language.getValue()}`;

        if (!grouped[key]) {
          grouped[key] = [];
        }
        grouped[key].push(item);
      } catch (validationError: any) {
        console.warn(`Skipping item with invalid category/language: ${validationError.message}`);
      }
    }

    return grouped;
  }
}
