import { describe, it, expect, beforeEach } from 'vitest';
import { SearchKnowledgeUseCase } from '../../src/application/use-cases/SearchKnowledgeUseCase.js';
import { FileSystemKnowledgeRepository } from '../../src/infrastructure/repositories/FileSystemKnowledgeRepository.js';
import { MarkdownSerializer } from '../../src/infrastructure/serializers/MarkdownSerializer.js';
import { KnowledgeSearchService } from '../../src/domain/services/KnowledgeSearchService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = join(__dirname, '../../');

describe('SearchKnowledgeUseCase', () => {
  let useCase: SearchKnowledgeUseCase;

  beforeEach(() => {
    const serializer = new MarkdownSerializer();
    const repository = new FileSystemKnowledgeRepository(baseDir, serializer);
    const searchService = new KnowledgeSearchService();
    useCase = new SearchKnowledgeUseCase(repository, searchService);
  });

  it('should search knowledge by category', async () => {
    const result = await useCase.execute({
      category: 'security',
      maxResults: 10
    });

    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.results).toBeDefined();
    expect(result.results.every(r => r.category === 'security')).toBe(true);
  });

  it('should search knowledge by language', async () => {
    const result = await useCase.execute({
      language: 'java',
      maxResults: 10
    });

    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.results.every(r => r.language === 'java')).toBe(true);
  });

  it('should search knowledge by severity', async () => {
    const result = await useCase.execute({
      severity: 'critical',
      maxResults: 10
    });

    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.results.every(r => r.severity === 'critical')).toBe(true);
  });

  it('should search knowledge by query text', async () => {
    const result = await useCase.execute({
      query: 'SQL',
      maxResults: 10
    });

    expect(result.totalCount).toBeGreaterThan(0);
    expect(result.results.some(r =>
      r.title.includes('SQL') || r.summary.includes('SQL')
    )).toBe(true);
  });

  it('should return empty result when no match', async () => {
    const result = await useCase.execute({
      query: 'nonexistent-keyword-xyz123',
      maxResults: 10
    });

    expect(result.totalCount).toBe(0);
    expect(result.results).toEqual([]);
  });

  it('should limit results by maxResults', async () => {
    const result = await useCase.execute({
      maxResults: 2
    });

    expect(result.results.length).toBeLessThanOrEqual(2);
  });
});
