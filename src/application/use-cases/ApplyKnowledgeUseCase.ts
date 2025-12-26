import { KnowledgeFile } from '../../domain/aggregates/KnowledgeFile.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';
import { IKnowledgeMatcher } from '../../domain/services/matchers/IKnowledgeMatcher.js';
import { IKnowledgeRepository } from '../ports/IKnowledgeRepository.js';

/**
 * 知見適用ユースケース
 * scripts/apply-knowledge.js の updateKnowledgeFile() から移行
 */
export class ApplyKnowledgeUseCase {
  constructor(
    private readonly repository: IKnowledgeRepository,
    private readonly matcher: IKnowledgeMatcher
  ) {}

  /**
   * 知見を適用
   */
  async execute(input: {
    category: string;
    language: string;
    knowledge_items: Array<{
      title: string;
      severity?: string;
      summary: string;
      recommendation: string;
      code_example?: { bad?: string; good?: string };
      file_path?: string;
      pr_url?: string;
    }>;
  }): Promise<number> {
    const category = Category.fromString(input.category);
    const language = Language.fromString(input.language);

    // 既存知見を読み込み
    const existingItems = await this.repository.findByPath(category, language);

    // KnowledgeFile Aggregateを作成
    const knowledgeFile = KnowledgeFile.create(
      category,
      language,
      [...existingItems],
      this.matcher
    );

    // 新しい知見を追加（マージまたは新規）
    for (const item of input.knowledge_items) {
      knowledgeFile.addKnowledge(item);
    }

    // ドメインイベントを処理
    // Note: KnowledgeArchived, KnowledgeAdded, KnowledgeMerged イベントは
    // 現在はログ記録のみで、将来的にイベントハンドラーで処理する想定
    knowledgeFile.getUncommittedEvents();

    // 知見を保存
    await this.repository.save(category, language, knowledgeFile.getItems());

    knowledgeFile.clearEvents();

    return knowledgeFile.getItemCount();
  }
}
