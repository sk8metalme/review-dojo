import { KnowledgeItem } from '../entities/KnowledgeItem.js';
import { Category } from '../value-objects/Category.js';
import { Language } from '../value-objects/Language.js';
import { DomainEvent } from '../events/DomainEvent.js';
import { KnowledgeAddedEvent } from '../events/KnowledgeAddedEvent.js';
import { KnowledgeMergedEvent } from '../events/KnowledgeMergedEvent.js';
import { KnowledgeArchivedEvent } from '../events/KnowledgeArchivedEvent.js';
import { IKnowledgeMatcher, KnowledgeInput } from '../services/matchers/IKnowledgeMatcher.js';

/**
 * KnowledgeFile Aggregate Root
 *
 * カテゴリ・言語ごとの知見ファイルを管理
 * 不変条件: 最大100件まで保持（超過時は自動アーカイブ）
 */
export class KnowledgeFile {
  private static readonly MAX_ITEMS = 100;
  private readonly events: DomainEvent[] = [];

  private constructor(
    private readonly category: Category,
    private readonly language: Language,
    private items: KnowledgeItem[],
    private readonly matcher: IKnowledgeMatcher
  ) {}

  /**
   * ファクトリーメソッド: KnowledgeFileを作成
   */
  static create(
    category: Category,
    language: Language,
    existingItems: KnowledgeItem[],
    matcher: IKnowledgeMatcher
  ): KnowledgeFile {
    return new KnowledgeFile(category, language, [...existingItems], matcher);
  }

  /**
   * 知見を追加（マージ or 新規追加）
   */
  addKnowledge(input: KnowledgeInput): void {
    const similar = this.matcher.findSimilar(input, this.items);

    if (similar) {
      // 既存知見とマージ
      similar.merge({ pr_url: input.pr_url });
      this.events.push(
        new KnowledgeMergedEvent(
          similar.getTitle(),
          similar.getOccurrences()
        )
      );
    } else {
      // 新規知見を追加
      const newItem = KnowledgeItem.create(input);
      this.items.push(newItem);
      this.events.push(
        new KnowledgeAddedEvent(
          newItem.getTitle(),
          newItem.getSeverity().getValue()
        )
      );
    }

    this.enforceLimit();
  }

  /**
   * 不変条件: 100件制限を適用
   * 超過分は発生回数の少ないものからアーカイブ
   */
  private enforceLimit(): void {
    if (this.items.length <= KnowledgeFile.MAX_ITEMS) return;

    // 発生回数でソート（降順）
    this.items.sort((a, b) => b.getOccurrences() - a.getOccurrences());

    // 超過分をアーカイブ対象として取得
    const archivedItems = this.items.slice(KnowledgeFile.MAX_ITEMS);
    const archivedCount = archivedItems.length;

    // アイテムを削除
    this.items.splice(KnowledgeFile.MAX_ITEMS);

    // アーカイブイベントを発行
    this.events.push(
      new KnowledgeArchivedEvent(
        archivedItems,
        archivedCount,
        this.category.getValue(),
        this.language.getValue()
      )
    );
  }

  /**
   * 未コミットのドメインイベントを取得
   */
  getUncommittedEvents(): readonly DomainEvent[] {
    return [...this.events];
  }

  /**
   * イベントをクリア（永続化後に呼ぶ）
   */
  clearEvents(): void {
    this.events.length = 0;
  }

  /**
   * 保持している知見アイテムを取得
   */
  getItems(): readonly KnowledgeItem[] {
    return [...this.items];
  }

  /**
   * カテゴリを取得
   */
  getCategory(): Category {
    return this.category;
  }

  /**
   * 言語を取得
   */
  getLanguage(): Language {
    return this.language;
  }

  /**
   * ファイルパスを取得（category/language.md）
   */
  getFilePath(): string {
    return `${this.category.getValue()}/${this.language.getValue()}.md`;
  }

  /**
   * 知見の数を取得
   */
  getItemCount(): number {
    return this.items.length;
  }
}
