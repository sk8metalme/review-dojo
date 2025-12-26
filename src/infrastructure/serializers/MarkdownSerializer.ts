import { KnowledgeItem } from '../../domain/entities/KnowledgeItem.js';
import { Category } from '../../domain/value-objects/Category.js';
import { Language } from '../../domain/value-objects/Language.js';
import { IMarkdownSerializer } from '../../application/ports/IMarkdownSerializer.js';

/**
 * Markdown Serializer実装
 * scripts/apply-knowledge.js の knowledgeToMarkdown() と parseKnowledgeFile() から移行
 */
export class MarkdownSerializer implements IMarkdownSerializer {
  /**
   * 知見アイテムをMarkdown形式にシリアライズ
   */
  serialize(
    category: Category,
    language: Language,
    items: readonly KnowledgeItem[]
  ): string {
    const categoryName = this.capitalize(category.getValue());
    const languageName = this.capitalize(language.getValue());

    let content = `# ${categoryName} - ${languageName}\n\n`;

    for (const item of items) {
      content += this.itemToMarkdown(item);
    }

    return content;
  }

  /**
   * 個別アイテムをMarkdownに変換
   */
  private itemToMarkdown(item: KnowledgeItem): string {
    const plain = item.toPlainObject();

    let md = `## ${plain.title}\n\n`;
    md += `- **重要度**: ${plain.severity}\n`;
    md += `- **発生回数**: ${plain.occurrences}\n`;
    md += `- **概要**: ${plain.summary}\n`;
    md += `- **推奨対応**: ${plain.recommendation}\n`;

    // コード例
    if (plain.codeExample && (plain.codeExample.bad || plain.codeExample.good)) {
      md += `- **コード例**:\n`;
      if (plain.codeExample.bad) {
        md += `  \`\`\`\n  // NG\n  ${plain.codeExample.bad}\n  \`\`\`\n`;
      }
      if (plain.codeExample.good) {
        md += `  \`\`\`\n  // OK\n  ${plain.codeExample.good}\n  \`\`\`\n`;
      }
    }

    // 対象ファイル
    if (plain.targetFile) {
      md += `- **対象ファイル例**: \`${plain.targetFile}\`\n`;
    }

    // 参照PR
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
   * Markdownテキストから知見アイテムをデシリアライズ
   */
  deserialize(markdown: string): KnowledgeItem[] {
    const knowledgeItems: KnowledgeItem[] = [];

    // ファイルタイトル（# で始まる行）を除去
    const contentWithoutTitle = markdown.replace(/^#\s+.+\n\n?/m, '');

    // ## で始まるセクションで分割
    const sections = contentWithoutTitle.split(/^## /m).filter(s => s.trim());

    for (const section of sections) {
      try {
        const item = this.parseSection(section);
        if (item) {
          knowledgeItems.push(item);
        }
      } catch (error) {
        console.warn('Failed to parse section:', error);
      }
    }

    return knowledgeItems;
  }

  /**
   * セクションをパースしてKnowledgeItemを作成
   */
  private parseSection(section: string): KnowledgeItem | null {
    const lines = section.split('\n');
    const title = lines[0].trim();

    if (!title) return null;

    // 各フィールドを正規表現で抽出
    const severityMatch = section.match(/\*\*重要度\*\*:\s*(.+)/);
    const occurrencesMatch = section.match(/\*\*発生回数\*\*:\s*(\d+)/);
    const summaryMatch = section.match(/\*\*概要\*\*:\s*(.+)/);
    const recommendationMatch = section.match(/\*\*推奨対応\*\*:\s*(.+)/);
    const targetFileMatch = section.match(/\*\*対象ファイル例\*\*:\s*`(.+?)`/);

    // 参照PRを抽出（複数行対応）
    const referencesSection = section.match(/\*\*参照PR\*\*:\s*([\s\S]*?)(?=\n\n|---|\n-\s+\*\*|$)/);
    const references: string[] = [];
    if (referencesSection) {
      const urls = referencesSection[1].match(/https?:\/\/[^\s]+/g);
      if (urls) {
        references.push(...urls);
      }
    }

    // KnowledgeItemを作成
    const item = KnowledgeItem.create({
      title,
      severity: severityMatch ? severityMatch[1].trim() : undefined,
      summary: summaryMatch ? summaryMatch[1].trim() : '',
      recommendation: recommendationMatch ? recommendationMatch[1].trim() : '',
      file_path: targetFileMatch ? targetFileMatch[1].trim() : undefined,
      pr_url: references[0] // 最初のPR URLを使用
    });

    // 参照PRが複数ある場合は追加でマージ
    // 発生回数はcreate時に1なので、残りの参照PRをマージ
    for (let i = 1; i < references.length; i++) {
      item.merge({ pr_url: references[i] });
    }

    return item;
  }

  /**
   * 文字列の先頭を大文字に
   */
  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}
