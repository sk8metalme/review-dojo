import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
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
      archiveContent += this.serializer.itemToMarkdown(item);
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
   * すべての知見を読み込む（MCP検索用）
   */
  async findAll(): Promise<Map<string, Map<string, KnowledgeItem[]>>> {
    const result = new Map<string, Map<string, KnowledgeItem[]>>();

    // baseDirが存在しない場合は空のMapを返す
    if (!existsSync(this.baseDir)) {
      return result;
    }

    // カテゴリディレクトリを走査
    const entries = await readdir(this.baseDir, { withFileTypes: true });

    for (const entry of entries) {
      // archiveディレクトリはスキップ
      if (!entry.isDirectory() || entry.name === 'archive') {
        continue;
      }

      const categoryName = entry.name;
      const categoryPath = join(this.baseDir, categoryName);

      // カテゴリが有効かチェック
      try {
        const category = Category.fromString(categoryName);
        const languageMap = new Map<string, KnowledgeItem[]>();

        // カテゴリディレクトリ内の.mdファイルを走査
        const categoryEntries = await readdir(categoryPath, { withFileTypes: true });

        for (const file of categoryEntries) {
          if (!file.isFile() || !file.name.endsWith('.md')) {
            continue;
          }

          const languageName = file.name.replace(/\.md$/, '');

          // 言語が有効かチェック
          try {
            const language = Language.fromString(languageName);
            const items = await this.findByPath(category, language);
            languageMap.set(languageName, [...items]);
          } catch (error) {
            console.warn(`Invalid language file: ${file.name}`, error);
          }
        }

        if (languageMap.size > 0) {
          result.set(categoryName, languageMap);
        }
      } catch (error) {
        console.warn(`Invalid category directory: ${categoryName}`, error);
      }
    }

    return result;
  }

  /**
   * 文字列の先頭を大文字に
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
