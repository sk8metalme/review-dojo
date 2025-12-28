import { IKnowledgeRepository } from '../ports/IKnowledgeRepository.js';
import { KnowledgeSearchService } from '../../domain/services/KnowledgeSearchService.js';

/**
 * 知見詳細DTO
 */
export interface KnowledgeDetailDTO {
  category: string;
  language: string;
  severity: string;
  title: string;
  summary: string;
  recommendation: string;
  occurrences: number;
  codeExample?: {
    bad: string;
    good: string;
  };
  filePathExample: string;
  prReferences: string[];
}

/**
 * 知見詳細取得Use Case
 */
export class GetKnowledgeDetailUseCase {
  constructor(
    private readonly repository: IKnowledgeRepository,
    private readonly searchService: KnowledgeSearchService
  ) {}

  async execute(id: string): Promise<KnowledgeDetailDTO | null> {
    // すべての知見を取得
    const allKnowledge = await this.repository.findAll();

    // IDから検索
    const result = this.searchService.findById(allKnowledge, id);
    if (!result) {
      return null;
    }

    const item = result.item;
    const codeExample = item.getCodeExample();

    return {
      category: result.category,
      language: result.language,
      severity: item.getSeverity().getValue(),
      title: item.getTitle(),
      summary: item.getSummary(),
      recommendation: item.getRecommendation(),
      occurrences: item.getOccurrences(),
      codeExample: codeExample.isEmpty()
        ? undefined
        : {
            bad: codeExample.getBad(),
            good: codeExample.getGood()
          },
      filePathExample: item.getTargetFile(),
      prReferences: item.getReferences().map(ref => ref.getUrl())
    };
  }
}
