import { describe, it, expect, beforeEach } from 'vitest';
import { GeneratePRChecklistUseCase } from '../../src/application/use-cases/GeneratePRChecklistUseCase.js';
import { FileSystemKnowledgeRepository } from '../../src/infrastructure/repositories/FileSystemKnowledgeRepository.js';
import { MarkdownSerializer } from '../../src/infrastructure/serializers/MarkdownSerializer.js';
import { KnowledgeSearchService } from '../../src/domain/services/KnowledgeSearchService.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const baseDir = join(__dirname, '../../');

describe('GeneratePRChecklistUseCase', () => {
  let useCase: GeneratePRChecklistUseCase;

  beforeEach(() => {
    const serializer = new MarkdownSerializer();
    const repository = new FileSystemKnowledgeRepository(baseDir, serializer);
    const searchService = new KnowledgeSearchService();
    useCase = new GeneratePRChecklistUseCase(repository, searchService);
  });

  it('should generate checklist for Java files', async () => {
    const result = await useCase.execute({
      filePaths: ['src/main/java/UserDao.java', 'src/main/java/UserService.java']
    });

    expect(result.checklist).toBeDefined();
    expect(result.checklist.length).toBeGreaterThan(0);
    expect(result.summary).toContain('java');
  });

  it('should generate checklist for NodeJS files', async () => {
    const result = await useCase.execute({
      filePaths: ['src/services/UserService.js', 'src/controllers/UserController.js']
    });

    expect(result.checklist).toBeDefined();
    expect(result.checklist.length).toBeGreaterThan(0);
    expect(result.summary).toContain('nodejs');
  });

  it('should detect languages from file extensions', async () => {
    const result = await useCase.execute({
      filePaths: ['UserDao.java', 'UserService.js', 'config.py']
    });

    expect(result.summary).toBeTruthy();
    expect(result.checklist.length).toBeGreaterThan(0);
  });

  it('should generate check items in question format', async () => {
    const result = await useCase.execute({
      filePaths: ['UserDao.java']
    });

    expect(result.checklist.every(item =>
      item.checkItem.endsWith('か？') || item.checkItem.endsWith('?')
    )).toBe(true);
  });

  it('should sort by severity (critical first)', async () => {
    const result = await useCase.execute({
      filePaths: ['UserDao.java']
    });

    const severities = result.checklist.map(item => item.severity);
    const criticalIndex = severities.indexOf('critical');
    const warningIndex = severities.indexOf('warning');
    const infoIndex = severities.indexOf('info');

    // criticalがある場合、warningやinfoより前に来る
    if (criticalIndex >= 0 && warningIndex >= 0) {
      expect(criticalIndex).toBeLessThan(warningIndex);
    }
    if (criticalIndex >= 0 && infoIndex >= 0) {
      expect(criticalIndex).toBeLessThan(infoIndex);
    }
  });
});
