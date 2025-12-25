import { describe, it, expect } from 'vitest';
import {
  maskSensitiveInfo,
  findSimilarKnowledge,
  knowledgeToMarkdown
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
    // 汎用APIキーパターンでもマッチするため、マスクされていることを確認
    expect(masked).toContain('***REDACTED***');
    expect(masked).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('should mask Bearer tokens', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const masked = maskSensitiveInfo(text);
    // 汎用APIキーパターンでもマッチするため、マスクされていることを確認
    expect(masked).toContain('***REDACTED***');
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
