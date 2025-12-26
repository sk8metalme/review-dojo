import { describe, it, expect } from 'vitest';
import {
  maskSensitiveInfo,
  findSimilarKnowledge,
  knowledgeToMarkdown,
  sanitizePath
} from '../scripts/apply-knowledge.js';

describe('maskSensitiveInfo', () => {
  it('should mask API keys', () => {
    const text = 'API key: abc123def456ghi789jklmno';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***REDACTED***');
    expect(masked).not.toContain('abc123def456ghi789jklmno');
  });

  it('should mask AWS keys', () => {
    const text = 'AWS Key: AKIAIOSFODNN7EXAMPLE';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***AWS_KEY***');
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('should mask Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('Bearer ***TOKEN***');
    expect(masked).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('should mask passwords', () => {
    const text = 'password: mySecretPassword123';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('password: ***');
    expect(masked).not.toContain('mySecretPassword123');
  });

  it('should not modify text without sensitive info', () => {
    const text = 'This is a normal comment about code quality';
    const masked = maskSensitiveInfo(text);
    expect(masked).toBe(text);
  });
});

describe('findSimilarKnowledge', () => {
  const existingItems = [
    { title: 'SQLインジェクション対策' },
    { title: 'N+1問題の回避' },
    { title: 'XSS対策' }
  ];

  it('should find exact match (case insensitive)', () => {
    const newItem = { title: 'sqlインジェクション対策' };
    const similar = findSimilarKnowledge(newItem, existingItems);
    expect(similar).toBeDefined();
    expect(similar.title).toBe('SQLインジェクション対策');
  });

  it('should return undefined if no match', () => {
    const newItem = { title: 'CSRF対策' };
    const similar = findSimilarKnowledge(newItem, existingItems);
    expect(similar).toBeUndefined();
  });

  it('should find exact match with different case', () => {
    const newItem = { title: 'XSS対策' };
    const similar = findSimilarKnowledge(newItem, existingItems);
    expect(similar).toBeDefined();
  });
});

describe('knowledgeToMarkdown', () => {
  it('should generate valid markdown for complete knowledge item', () => {
    const item = {
      title: 'SQLインジェクション対策',
      severity: 'critical',
      occurrences: 3,
      summary: 'PreparedStatementを使用していない',
      recommendation: 'PreparedStatementを使用する',
      codeExample: {
        bad: 'String sql = "SELECT * FROM users WHERE id = " + userId;',
        good: 'PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");'
      },
      targetFile: 'src/main/java/UserDao.java',
      references: [
        'https://github.com/org/repo/pull/123',
        'https://github.com/org/repo/pull/456'
      ]
    };

    const md = knowledgeToMarkdown(item);

    expect(md).toContain('## SQLインジェクション対策');
    expect(md).toContain('**重要度**: critical');
    expect(md).toContain('**発生回数**: 3');
    expect(md).toContain('**概要**: PreparedStatementを使用していない');
    expect(md).toContain('**推奨対応**: PreparedStatementを使用する');
    expect(md).toContain('// NG');
    expect(md).toContain('// OK');
    expect(md).toContain('src/main/java/UserDao.java');
    expect(md).toContain('https://github.com/org/repo/pull/123');
    expect(md).toContain('https://github.com/org/repo/pull/456');
    expect(md).toContain('---');
  });

  it('should handle item without code examples', () => {
    const item = {
      title: 'テスト対象',
      severity: 'info',
      occurrences: 1,
      summary: '概要',
      recommendation: '推奨対応',
      codeExample: {},
      targetFile: '',
      references: []
    };

    const md = knowledgeToMarkdown(item);

    expect(md).toContain('## テスト対象');
    expect(md).not.toContain('```');
  });

  it('should handle item with only bad code example', () => {
    const item = {
      title: 'テスト対象',
      severity: 'warning',
      occurrences: 2,
      summary: '概要',
      recommendation: '推奨対応',
      codeExample: {
        bad: 'bad code here'
      },
      targetFile: '',
      references: []
    };

    const md = knowledgeToMarkdown(item);

    expect(md).toContain('// NG');
    expect(md).toContain('bad code here');
    expect(md).not.toContain('// OK');
  });
});

describe('sanitizePath (Security)', () => {
  it('should accept valid path components', () => {
    expect(sanitizePath('security')).toBe('security');
    expect(sanitizePath('nodejs')).toBe('nodejs');
    expect(sanitizePath('test-123')).toBe('test-123');
    expect(sanitizePath('test_file')).toBe('test_file');
  });

  it('should reject path traversal attempts', () => {
    expect(() => sanitizePath('../etc')).toThrow('Invalid path component');
    expect(() => sanitizePath('../../passwd')).toThrow('Invalid path component');
    expect(() => sanitizePath('../../../root')).toThrow('Invalid path component');
  });

  it('should reject absolute paths', () => {
    expect(() => sanitizePath('/etc/passwd')).toThrow('Invalid path component');
    expect(() => sanitizePath('/root/.ssh/id_rsa')).toThrow('Invalid path component');
  });

  it('should reject paths with special characters', () => {
    expect(() => sanitizePath('file;rm -rf /')).toThrow('Invalid path component');
    expect(() => sanitizePath('file && whoami')).toThrow('Invalid path component');
    expect(() => sanitizePath('file | cat /etc/passwd')).toThrow('Invalid path component');
  });

  it('should reject empty or invalid inputs', () => {
    expect(() => sanitizePath('')).toThrow('Invalid path component');
    expect(() => sanitizePath(null)).toThrow('Invalid path component');
    expect(() => sanitizePath(undefined)).toThrow('Invalid path component');
  });

  it('should reject paths that are too long', () => {
    const longPath = 'a'.repeat(101);
    expect(() => sanitizePath(longPath)).toThrow('Path component too long');
  });
});

describe('maskSensitiveInfo (Security - Enhanced)', () => {
  it('should mask GitHub tokens', () => {
    const text = 'GitHub token: ghp_1234567890abcdefghijklmnopqrstuvwxyz';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***GITHUB_TOKEN***');
    expect(masked).not.toContain('ghp_1234567890abcdefghijklmnopqrstuvwxyz');
  });

  it('should mask JWT tokens', () => {
    const text = 'JWT: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***JWT_TOKEN***');
    expect(masked).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  it('should mask private keys', () => {
    const text = 'Private key: -----BEGIN RSA PRIVATE KEY-----\nMIIBogIBAAJBALRQ\n-----END RSA PRIVATE KEY-----';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***PRIVATE_KEY***');
    expect(masked).not.toContain('-----BEGIN RSA PRIVATE KEY-----');
  });

  it('should handle multiple sensitive patterns in one text', () => {
    const text = 'API key: abc123def456ghi789jklmno, password: secret123, GitHub: ghp_1234567890123456789012345678901234567890';
    const masked = maskSensitiveInfo(text);
    expect(masked).toContain('***REDACTED***');
    expect(masked).toContain('password: ***');
    expect(masked).toContain('***GITHUB_TOKEN***');
    expect(masked).not.toContain('abc123def456ghi789jklmno');
    expect(masked).not.toContain('secret123');
    expect(masked).not.toContain('ghp_1234567890123456789012345678901234567890');
  });
});
