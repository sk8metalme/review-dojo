/**
 * 機密情報マスクサービス
 * scripts/apply-knowledge.js の maskSensitiveInfo() と SENSITIVE_PATTERNS から移行
 */

interface MaskPattern {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export class SensitiveInfoMasker {
  /**
   * 機密情報マスク用の正規表現パターン
   * 注意: より具体的なパターンを先に配置（優先順位）
   */
  private static readonly SENSITIVE_PATTERNS: MaskPattern[] = [
    {
      name: 'Private Key',
      pattern: /(-----BEGIN[A-Z ]+PRIVATE KEY-----[\s\S]+?-----END[A-Z ]+PRIVATE KEY-----)/g,
      replacement: '***PRIVATE_KEY***'
    },
    {
      name: 'JWT Token',
      pattern: /(eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,})/g,
      replacement: '***JWT_TOKEN***'
    },
    {
      name: 'GitHub Token',
      pattern: /(gh[pousr]_[a-zA-Z0-9]{36,})/g,
      replacement: '***GITHUB_TOKEN***'
    },
    {
      name: 'AWS Key',
      pattern: /AKIA[0-9A-Z]{16}/g,
      replacement: '***AWS_KEY***'
    },
    {
      name: 'Bearer Token',
      pattern: /Bearer\s+[a-zA-Z0-9._-]+/g,
      replacement: 'Bearer ***TOKEN***'
    },
    {
      name: 'Password',
      pattern: /password\s*[:=]\s*\S+/gi,
      replacement: 'password: ***'
    },
    {
      name: 'API Key',
      // Match common API key formats with prefixes to avoid false positives
      // Examples: api_key_xxx, apikey=xxx, API-KEY: xxx, API key: xxx
      pattern: /(api[_\s-]?key|secret[_\s-]?key|access[_\s-]?key)\s*[:=]\s*[a-zA-Z0-9_-]{16,}/gi,
      replacement: '$1: ***REDACTED***'
    }
  ];

  /**
   * テキスト内の機密情報をマスクする
   */
  mask(text: string): string {
    if (!text) return text;

    let masked = text;
    for (const { pattern, replacement } of SensitiveInfoMasker.SENSITIVE_PATTERNS) {
      masked = masked.replace(pattern, replacement);
    }
    return masked;
  }

  /**
   * 複数のテキストをまとめてマスク
   */
  maskMultiple(...texts: string[]): string[] {
    return texts.map(text => this.mask(text));
  }
}
