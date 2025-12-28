import { IKnowledgeRepository } from '../ports/IKnowledgeRepository.js';
import { KnowledgeSearchService } from '../../domain/services/KnowledgeSearchService.js';

/**
 * カテゴリ情報DTO
 */
export interface CategoryDTO {
  name: string;
  description: string;
  knowledgeCount: number;
}

/**
 * 言語情報DTO
 */
export interface LanguageDTO {
  name: string;
  knowledgeCount: number;
}

/**
 * 知見メタデータ一覧取得Use Case
 */
export class ListKnowledgeMetadataUseCase {
  constructor(
    private readonly repository: IKnowledgeRepository,
    private readonly searchService: KnowledgeSearchService
  ) {}

  /**
   * カテゴリ一覧を取得
   */
  async listCategories(): Promise<CategoryDTO[]> {
    // すべての知見を取得
    const allKnowledge = await this.repository.findAll();

    // カテゴリ一覧取得
    const categories = this.searchService.listCategories(allKnowledge);

    // 説明を追加
    return categories.map(cat => ({
      name: cat.name,
      description: this.getCategoryDescription(cat.name),
      knowledgeCount: cat.knowledgeCount
    }));
  }

  /**
   * 言語一覧を取得
   */
  async listLanguages(): Promise<LanguageDTO[]> {
    // すべての知見を取得
    const allKnowledge = await this.repository.findAll();

    // 言語一覧取得
    return this.searchService.listLanguages(allKnowledge);
  }

  /**
   * カテゴリの説明を取得
   */
  private getCategoryDescription(categoryName: string): string {
    const descriptions: Record<string, string> = {
      security: 'セキュリティ関連（SQLインジェクション、XSS、認証・認可など）',
      performance: 'パフォーマンス関連（N+1問題、メモリリーク、最適化など）',
      readability: '可読性・命名関連（命名規則、コメント、コード構造など）',
      design: '設計・アーキテクチャ関連（デザインパターン、SOLID原則など）',
      testing: 'テスト関連（テストカバレッジ、テスト設計、モックなど）',
      'error-handling': 'エラーハンドリング関連（例外処理、ログ出力、リトライ処理など）',
      other: 'その他'
    };

    return descriptions[categoryName] || '';
  }
}
