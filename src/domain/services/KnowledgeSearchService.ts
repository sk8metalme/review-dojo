import { KnowledgeQuery } from '../value-objects/KnowledgeQuery.js';
import { KnowledgeItem } from '../entities/KnowledgeItem.js';
import { Category } from '../value-objects/Category.js';
import { Language } from '../value-objects/Language.js';

/**
 * 検索結果アイテム
 * カテゴリと言語の情報を含む
 */
export interface SearchResultItem {
  category: string;
  language: string;
  item: KnowledgeItem;
}

/**
 * 知見検索サービス
 * Domain層の検索ロジックを担当
 */
export class KnowledgeSearchService {
  /**
   * 知見を検索してフィルタリング
   */
  search(
    allKnowledge: Map<string, Map<string, KnowledgeItem[]>>,
    query: KnowledgeQuery
  ): SearchResultItem[] {
    const results: SearchResultItem[] = [];

    // カテゴリとアイテムの収集
    for (const [categoryStr, languageMap] of allKnowledge) {
      // カテゴリフィルタ
      if (query.hasCategoryFilter() && categoryStr !== query.getCategory()) {
        continue;
      }

      for (const [languageStr, items] of languageMap) {
        // 言語フィルタ
        if (query.hasLanguageFilter() && languageStr !== query.getLanguage()) {
          continue;
        }

        for (const item of items) {
          // 重要度フィルタ
          if (query.hasSeverityFilter() &&
              item.getSeverity().getValue() !== query.getSeverity()) {
            continue;
          }

          // ファイルパスフィルタ（部分一致）
          if (query.hasFilePathFilter()) {
            const filePath = query.getFilePath()!;
            if (!item.getTargetFile().includes(filePath)) {
              continue;
            }
          }

          // テキスト検索（タイトルと概要で部分一致）
          if (query.hasQueryText()) {
            const queryText = query.getQueryText()!.toLowerCase();
            const title = item.getTitle().toLowerCase();
            const summary = item.getSummary().toLowerCase();

            if (!title.includes(queryText) && !summary.includes(queryText)) {
              continue;
            }
          }

          results.push({
            category: categoryStr,
            language: languageStr,
            item
          });
        }
      }
    }

    // 発生回数でソート（降順）、次に重要度でソート
    results.sort((a, b) => {
      // 発生回数の多い順
      const occurrenceDiff = b.item.getOccurrences() - a.item.getOccurrences();
      if (occurrenceDiff !== 0) {
        return occurrenceDiff;
      }

      // 重要度順（critical > warning > info）
      const severityOrder: Record<string, number> = {
        critical: 3,
        warning: 2,
        info: 1
      };
      const aSeverity = severityOrder[a.item.getSeverity().getValue()] || 0;
      const bSeverity = severityOrder[b.item.getSeverity().getValue()] || 0;
      return bSeverity - aSeverity;
    });

    // 最大結果数で制限
    return results.slice(0, query.getMaxResults());
  }

  /**
   * カテゴリ一覧を取得（知見数を含む）
   */
  listCategories(
    allKnowledge: Map<string, Map<string, KnowledgeItem[]>>
  ): Array<{ name: string; knowledgeCount: number }> {
    const categoryCounts = new Map<string, number>();

    for (const [categoryStr, languageMap] of allKnowledge) {
      let count = 0;
      for (const items of languageMap.values()) {
        count += items.length;
      }
      categoryCounts.set(categoryStr, count);
    }

    return Array.from(categoryCounts.entries())
      .map(([name, knowledgeCount]) => ({ name, knowledgeCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * 言語一覧を取得（知見数を含む）
   */
  listLanguages(
    allKnowledge: Map<string, Map<string, KnowledgeItem[]>>
  ): Array<{ name: string; knowledgeCount: number }> {
    const languageCounts = new Map<string, number>();

    for (const languageMap of allKnowledge.values()) {
      for (const [languageStr, items] of languageMap) {
        const current = languageCounts.get(languageStr) || 0;
        languageCounts.set(languageStr, current + items.length);
      }
    }

    return Array.from(languageCounts.entries())
      .map(([name, knowledgeCount]) => ({ name, knowledgeCount }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * IDから知見を検索
   * ID形式: `{category}/{language}/{titleHash}`
   */
  findById(
    allKnowledge: Map<string, Map<string, KnowledgeItem[]>>,
    id: string
  ): SearchResultItem | null {
    // 入力検証: IDが文字列であることを確認
    if (!id || typeof id !== 'string') {
      return null;
    }

    // ID形式の検証: 正確に2つのスラッシュを含むことを確認
    const idPattern = /^([^/]+)\/([^/]+)\/([^/]+)$/;
    const match = id.trim().match(idPattern);

    if (!match) {
      return null;
    }

    const [, category, language, titleHash] = match;

    // カテゴリとタイトルハッシュの検証
    if (!category.trim() || !language.trim() || !titleHash.trim()) {
      return null;
    }

    // カテゴリの検証: 有効なカテゴリかチェック
    try {
      Category.fromString(category.trim());
    } catch (error) {
      return null;
    }

    // 言語の検証: 有効な言語かチェック
    try {
      Language.fromString(language.trim());
    } catch (error) {
      return null;
    }

    const languageMap = allKnowledge.get(category.trim());
    if (!languageMap) {
      return null;
    }

    const items = languageMap.get(language.trim());
    if (!items) {
      return null;
    }

    // タイトルのハッシュで検索
    const item = items.find(item =>
      this.hashTitle(item.getTitle()) === titleHash.trim()
    );

    if (!item) {
      return null;
    }

    return { category: category.trim(), language: language.trim(), item };
  }

  /**
   * 知見のIDを生成
   * ID形式: `{category}/{language}/{titleHash}`
   */
  generateId(category: string, language: string, item: KnowledgeItem): string {
    const titleHash = this.hashTitle(item.getTitle());
    return `${category}/${language}/${titleHash}`;
  }

  /**
   * タイトルからハッシュを生成（簡易実装）
   * 本番環境ではより堅牢なハッシュ関数を使用すべき
   */
  private hashTitle(title: string): string {
    // 簡易ハッシュ: タイトルを小文字化してスペースをハイフンに置換
    return title.toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .substring(0, 50);
  }
}
