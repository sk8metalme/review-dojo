/**
 * プログラミング言語を表すValue Object
 */
export class Language {
  private static readonly KNOWN_LANGUAGES = [
    'java',
    'javascript',
    'typescript',
    'python',
    'nodejs',
    'go',
    'rust',
    'php',
    'perl',
    'ruby',
    'csharp',
    'cpp',
    'kotlin',
    'swift',
    'other'
  ] as const;

  private constructor(private readonly value: string) {}

  static fromString(value: string): Language {
    if (!value || typeof value !== 'string') {
      throw new Error('Language must be a non-empty string');
    }

    const normalized = value.toLowerCase();

    // 長さ制限
    if (normalized.length > 50) {
      throw new Error(`Language name too long: ${normalized.length} characters (max: 50)`);
    }

    // 英数字、ハイフン、ドット、アンダースコアのみ許可
    if (!/^[a-z0-9._-]+$/.test(normalized)) {
      throw new Error(`Invalid language name: ${value}. Only alphanumeric characters, dots, hyphens, and underscores are allowed`);
    }

    return new Language(normalized);
  }

  getValue(): string {
    return this.value;
  }

  isKnownLanguage(): boolean {
    return Language.KNOWN_LANGUAGES.includes(this.value as any);
  }

  equals(other: Language): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }

  /**
   * ファイル拡張子から言語を推定
   */
  static fromExtension(extension: string): Language {
    const ext = extension.toLowerCase().replace(/^\./, '');

    const extensionMap: Record<string, string> = {
      'java': 'java',
      'js': 'nodejs',
      'jsx': 'nodejs',
      'ts': 'typescript',
      'tsx': 'typescript',
      'py': 'python',
      'go': 'go',
      'rs': 'rust',
      'php': 'php',
      'pl': 'perl',
      'pm': 'perl',
      'rb': 'ruby',
      'cs': 'csharp',
      'cpp': 'cpp',
      'cc': 'cpp',
      'cxx': 'cpp',
      'kt': 'kotlin',
      'kts': 'kotlin',
      'swift': 'swift'
    };

    const language = extensionMap[ext] || 'other';
    return Language.fromString(language);
  }
}
