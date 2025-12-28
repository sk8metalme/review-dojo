import { KnowledgeItem } from '../../domain/entities/KnowledgeItem.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';

/**
 * Knowledge Repository Port (インターフェース)
 * Infrastructure層で実装される
 */
export interface IKnowledgeRepository {
  /**
   * ファイルパスから既存の知見を読み込む
   */
  findByPath(category: Category, language: Language): Promise<readonly KnowledgeItem[]>;

  /**
   * 知見をファイルに保存
   */
  save(category: Category, language: Language, items: readonly KnowledgeItem[]): Promise<void>;

  /**
   * ファイルが存在するか確認
   */
  exists(category: Category, language: Language): Promise<boolean>;

  /**
   * アーカイブファイルに保存
   */
  archive(
    category: Category,
    language: Language,
    items: readonly KnowledgeItem[]
  ): Promise<void>;

  /**
   * すべての知見を読み込む（MCP検索用）
   * @returns Map<category, Map<language, KnowledgeItem[]>>
   */
  findAll(): Promise<Map<string, Map<string, KnowledgeItem[]>>>;
}
