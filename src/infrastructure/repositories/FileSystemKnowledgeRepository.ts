import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { KnowledgeItem } from '../../domain/entities/KnowledgeItem.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';
import { IKnowledgeRepository } from '../../application/ports/IKnowledgeRepository.js';
import { IMarkdownSerializer } from '../../application/ports/IMarkdownSerializer.js';

/**
 * ファイルシステムベースのKnowledge Repository実装
 * scripts/apply-knowledge.js の parseKnowledgeFile() とファイルI/O部分から移行
 */
export class FileSystemKnowledgeRepository implements IKnowledgeRepository {
  private static readonly ARCHIVE_SIZE_LIMIT = 10000;

  constructor(
    private readonly baseDir: string,
    private readonly serializer: IMarkdownSerializer
  ) {}

  /**
   * カテゴリ・言語から既存の知見を読み込む
   */
  async findByPath(category: Category, language: Language): Promise<readonly KnowledgeItem[]> {
    const filePath = this.getFilePath(category, language);

    if (!existsSync(filePath)) {
      return [];
    }

    const content = await readFile(filePath, 'utf-8');
    return this.serializer.deserialize(content);
  }

  /**
   * 知見をファイルに保存
   */
  async save(
    category: Category,
    language: Language,
    items: readonly KnowledgeItem[]
  ): Promise<void> {
    const filePath = this.getFilePath(category, language);

    // ディレクトリが存在しない場合は作成
    await mkdir(dirname(filePath), { recursive: true });

    // Markdownに変換
    const content = this.serializer.serialize(category, language, items);

    // ファイルに書き出し
    await writeFile(filePath, content, 'utf-8');
  }

  /**
   * ファイルが存在するか確認
   */
  async exists(category: Category, language: Language): Promise<boolean> {
    const filePath = this.getFilePath(category, language);
    return existsSync(filePath);
  }

  /**
   * アーカイブファイルに保存
   */
  async archive(
    category: Category,
    language: Language,
    items: readonly KnowledgeItem[]
  ): Promise<void> {
    const archivePath = this.getArchivePath(category, language);

    // アーカイブディレクトリを作成
    await mkdir(dirname(archivePath), { recursive: true });

    let archiveContent = '';

    // 既存のアーカイブファイルがあれば読み込み
    if (existsSync(archivePath)) {
      archiveContent = await readFile(archivePath, 'utf-8');

      // アーカイブファイルのサイズ制限チェック
      const existingItems = this.serializer.deserialize(archiveContent);
      if (existingItems.length + items.length > FileSystemKnowledgeRepository.ARCHIVE_SIZE_LIMIT) {
        console.warn(`Archive file too large: ${archivePath}. Rotating...`);
        // 古いアーカイブをローテーション
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const rotatedPath = archivePath.replace('.md', `-${timestamp}.md`);
        await writeFile(rotatedPath, archiveContent, 'utf-8');

        // 新しいアーカイブファイルを開始
        const categoryName = this.capitalize(category.getValue());
        const languageName = this.capitalize(language.getValue());
        archiveContent = `# Archive: ${categoryName} - ${languageName}\n\n`;
      }
    } else {
      const categoryName = this.capitalize(category.getValue());
      const languageName = this.capitalize(language.getValue());
      archiveContent = `# Archive: ${categoryName} - ${languageName}\n\n`;
    }

    // 新しいアイテムを追加
    for (const item of items) {
      archiveContent += this.itemToMarkdown(item);
    }

    await writeFile(archivePath, archiveContent, 'utf-8');
  }

  /**
   * ファイルパスを取得
   */
  private getFilePath(category: Category, language: Language): string {
    return join(this.baseDir, category.getValue(), `${language.getValue()}.md`);
  }

  /**
   * アーカイブパスを取得
   */
  private getArchivePath(category: Category, language: Language): string {
    return join(this.baseDir, 'archive', category.getValue(), `${language.getValue()}.md`);
  }

  /**
   * 個別アイテムをMarkdownに変換（アーカイブ用）
   */
  private itemToMarkdown(item: KnowledgeItem): string {
    const plain = item.toPlainObject();

    let md = `## ${plain.title}\n\n`;
    md += `- **重要度**: ${plain.severity}\n`;
    md += `- **発生回数**: ${plain.occurrences}\n`;
    md += `- **概要**: ${plain.summary}\n`;
    md += `- **推奨対応**: ${plain.recommendation}\n`;

    if (plain.codeExample && (plain.codeExample.bad || plain.codeExample.good)) {
      md += `- **コード例**:\n`;
      if (plain.codeExample.bad) {
        md += `  \`\`\`\n  // NG\n  ${plain.codeExample.bad}\n  \`\`\`\n`;
      }
      if (plain.codeExample.good) {
        md += `  \`\`\`\n  // OK\n  ${plain.codeExample.good}\n  \`\`\`\n`;
      }
    }

    if (plain.targetFile) {
      md += `- **対象ファイル例**: \`${plain.targetFile}\`\n`;
    }

    if (plain.references && plain.references.length > 0) {
      md += `- **参照PR**:\n`;
      plain.references.forEach(ref => {
        md += `  - ${ref}\n`;
      });
    }

    md += `\n---\n`;
    return md;
  }

  /**
   * 文字列の先頭を大文字に
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
