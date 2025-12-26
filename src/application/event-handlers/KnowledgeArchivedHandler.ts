import { KnowledgeArchivedEvent } from '../../domain/events/KnowledgeArchivedEvent.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';
import { KnowledgeItem } from '../../domain/entities/KnowledgeItem.js';
import { IKnowledgeRepository } from '../ports/IKnowledgeRepository.js';

/**
 * 知見アーカイブイベントハンドラ
 * scripts/apply-knowledge.js の archiveOldKnowledge() から移行
 */
export class KnowledgeArchivedHandler {
  constructor(private readonly repository: IKnowledgeRepository) {}

  /**
   * アーカイブイベントを処理
   */
  async handle(event: KnowledgeArchivedEvent): Promise<void> {
    const category = Category.fromString(event.category);
    const language = Language.fromString(event.language);

    console.log(
      `Archiving ${event.archivedCount} items for ${category.getValue()}/${language.getValue()}`
    );

    // アーカイブファイルに保存
    await this.repository.archive(category, language, event.archivedItems);

    console.log(`Archived ${event.archivedItems.length} items successfully`);
  }
}
