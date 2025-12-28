/**
 * 知見検索クエリ
 * 検索条件を表すValue Object
 */
export class KnowledgeQuery {
  private constructor(
    private readonly queryText: string | undefined,
    private readonly category: string | undefined,
    private readonly language: string | undefined,
    private readonly severity: string | undefined,
    private readonly filePath: string | undefined,
    private readonly maxResults: number
  ) {}

  /**
   * ファクトリーメソッド: 検索クエリを作成
   */
  static create(params: {
    query?: string;
    category?: string;
    language?: string;
    severity?: string;
    filePath?: string;
    maxResults?: number;
  }): KnowledgeQuery {
    const maxResults = params.maxResults && params.maxResults > 0
      ? params.maxResults
      : 10; // デフォルト10件

    return new KnowledgeQuery(
      params.query?.trim(),
      params.category?.trim(),
      params.language?.trim(),
      params.severity?.trim(),
      params.filePath?.trim(),
      maxResults
    );
  }

  /**
   * 全件検索（フィルタなし）のクエリを作成
   */
  static all(maxResults: number = 100): KnowledgeQuery {
    return new KnowledgeQuery(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      maxResults
    );
  }

  // Getters
  getQueryText(): string | undefined {
    return this.queryText;
  }

  getCategory(): string | undefined {
    return this.category;
  }

  getLanguage(): string | undefined {
    return this.language;
  }

  getSeverity(): string | undefined {
    return this.severity;
  }

  getFilePath(): string | undefined {
    return this.filePath;
  }

  getMaxResults(): number {
    return this.maxResults;
  }

  /**
   * クエリが空かどうか（フィルタ条件が一つもない）
   */
  isEmpty(): boolean {
    return !this.queryText
      && !this.category
      && !this.language
      && !this.severity
      && !this.filePath;
  }

  /**
   * カテゴリフィルタが設定されているか
   */
  hasCategoryFilter(): boolean {
    return !!this.category;
  }

  /**
   * 言語フィルタが設定されているか
   */
  hasLanguageFilter(): boolean {
    return !!this.language;
  }

  /**
   * 重要度フィルタが設定されているか
   */
  hasSeverityFilter(): boolean {
    return !!this.severity;
  }

  /**
   * ファイルパスフィルタが設定されているか
   */
  hasFilePathFilter(): boolean {
    return !!this.filePath;
  }

  /**
   * テキスト検索クエリが設定されているか
   */
  hasQueryText(): boolean {
    return !!this.queryText;
  }
}
