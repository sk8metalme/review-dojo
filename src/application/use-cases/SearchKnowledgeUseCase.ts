import { IKnowledgeRepository } from '../ports/IKnowledgeRepository.js';
import { KnowledgeSearchService } from '../../domain/services/KnowledgeSearchService.js';
import { KnowledgeQuery } from '../../domain/value-objects/KnowledgeQuery.js';

/**
 * 検索結果DTO
 */
export interface SearchResultDTO {
  id: string;
  category: string;
  language: string;
  severity: string;
  title: string;
  summary: string;
  occurrences: number;
  filePathExample: string;
  prReferences: string[];
}

/**
 * 検索結果レスポンス
 */
export interface SearchKnowledgeResponse {
  totalCount: number;
  results: SearchResultDTO[];
}

/**
 * 知見検索Use Case
 */
export class SearchKnowledgeUseCase {
  constructor(
    private readonly repository: IKnowledgeRepository,
    private readonly searchService: KnowledgeSearchService
  ) {}

  async execute(params: {
    query?: string;
    category?: string;
    language?: string;
    severity?: string;
    filePath?: string;
    maxResults?: number;
  }): Promise<SearchKnowledgeResponse> {
    // クエリオブジェクト作成
    const query = KnowledgeQuery.create(params);

    // すべての知見を取得
    const allKnowledge = await this.repository.findAll();

    // 検索実行
    const searchResults = this.searchService.search(allKnowledge, query);

    // DTOに変換
    const results: SearchResultDTO[] = searchResults.map(result => {
      const id = this.searchService.generateId(
        result.category,
        result.language,
        result.item
      );

      const references = result.item.getReferences();
      const prReferences = references
        .slice(0, 3) // 最初の3件のみ
        .map(ref => ref.getUrl());

      return {
        id,
        category: result.category,
        language: result.language,
        severity: result.item.getSeverity().getValue(),
        title: result.item.getTitle(),
        summary: result.item.getSummary(),
        occurrences: result.item.getOccurrences(),
        filePathExample: result.item.getTargetFile(),
        prReferences
      };
    });

    return {
      totalCount: results.length,
      results
    };
  }
}
