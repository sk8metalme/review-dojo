import { GeneratePRChecklistUseCase } from '../../application/use-cases/GeneratePRChecklistUseCase.js';
import { FileSystemKnowledgeRepository } from '../../infrastructure/repositories/FileSystemKnowledgeRepository.js';
import { MarkdownSerializer } from '../../infrastructure/serializers/MarkdownSerializer.js';
import { KnowledgeSearchService } from '../../domain/services/KnowledgeSearchService.js';
import { ChecklistMarkdownFormatter } from './ChecklistMarkdownFormatter.js';

/**
 * CLI オプション
 */
export interface CheckKnowledgeOptions {
  filePaths: string[];
  outputFormat: 'markdown' | 'json';
  severityFilter?: string;
  includeEmpty: boolean;
  knowledgeDir: string;
}

/**
 * CLI Entry Point for CI/CD Knowledge Check
 */
export class CheckKnowledgeCli {
  async run(args: string[]): Promise<void> {
    // 引数パース（バリデーションエラーはexit(1)で終了）
    const options = this.parseArgs(args);

    try {
      // 依存関係を構築
      const serializer = new MarkdownSerializer();
      const repository = new FileSystemKnowledgeRepository(
        options.knowledgeDir,
        serializer
      );
      const searchService = new KnowledgeSearchService();
      const useCase = new GeneratePRChecklistUseCase(repository, searchService);

      // ユースケース実行
      const result = await useCase.execute({
        filePaths: options.filePaths,
        severityFilter: options.severityFilter
      });

      // 出力フォーマット
      const output = this.formatOutput(result, options);
      console.log(output);

      // 常に成功（ノンブロッキング）
      process.exit(0);
    } catch (error: any) {
      // エラーが発生しても警告のみ出力し、常に成功ステータスで終了
      console.error('Warning: Knowledge check failed:', error.message);

      // 空の結果を出力
      const formatter = new ChecklistMarkdownFormatter();
      console.log(formatter.format({ checklist: [], summary: '' }));

      process.exit(0); // 常に成功
    }
  }

  /**
   * コマンドライン引数をパース
   */
  private parseArgs(args: string[]): CheckKnowledgeOptions {
    const options: Partial<{
      files: string;
      format: string;
      severity: string;
      includeEmpty: boolean;
      knowledgeDir: string;
    }> = {};

    for (let i = 0; i < args.length; i++) {
      switch (args[i]) {
        case '--files':
        case '-f':
          options.files = args[++i];
          break;
        case '--format':
          options.format = args[++i];
          break;
        case '--severity':
          options.severity = args[++i];
          break;
        case '--include-empty':
          options.includeEmpty = true;
          break;
        case '--knowledge-dir':
          options.knowledgeDir = args[++i];
          break;
        case '--help':
        case '-h':
          this.showHelp();
          process.exit(0);
          break;
      }
    }

    // 必須パラメータチェック
    if (!options.files) {
      console.error('Error: --files is required');
      this.showHelp();
      process.exit(1);
    }

    // フィルタして空文字列を除去
    const filePaths = options.files
      .split(',')
      .map(f => f.trim())
      .filter(f => f.length > 0);

    if (filePaths.length === 0) {
      console.error('Error: No valid file paths provided');
      process.exit(1);
    }

    return {
      filePaths,
      outputFormat: (options.format || 'markdown') as 'markdown' | 'json',
      severityFilter: options.severity,
      includeEmpty: options.includeEmpty ?? true,
      knowledgeDir: options.knowledgeDir || process.cwd()
    };
  }

  /**
   * 結果をフォーマットして出力
   */
  private formatOutput(
    result: any,
    options: CheckKnowledgeOptions
  ): string {
    if (options.outputFormat === 'json') {
      return JSON.stringify(result, null, 2);
    }

    // Markdown形式
    const formatter = new ChecklistMarkdownFormatter();
    return formatter.format(result);
  }

  /**
   * ヘルプを表示
   */
  private showHelp(): void {
    console.log(`
Usage: node dist/index.js check [options]

Options:
  --files, -f <files>        Comma-separated list of file paths (required)
  --format <format>          Output format: markdown (default) or json
  --severity <severities>    Filter by severity: critical,warning,info
  --include-empty            Include output even when no knowledge found (default: true)
  --knowledge-dir <dir>      Knowledge base directory (default: current directory)
  --help, -h                 Show this help message

Examples:
  node dist/index.js check --files "src/UserDao.java,src/Service.ts"
  node dist/index.js check -f "file1.java,file2.ts" --severity "critical,warning"
  node dist/index.js check --files "*.java" --format json
`);
  }
}
