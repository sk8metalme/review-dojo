#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { existsSync } from 'fs';
import { createRequire } from 'module';

// package.jsonからバージョンを読み込む
const require = createRequire(import.meta.url);
const packageJson = require('../../../package.json');

// Use Cases
import { SearchKnowledgeUseCase } from '../../application/use-cases/SearchKnowledgeUseCase.js';
import { GetKnowledgeDetailUseCase } from '../../application/use-cases/GetKnowledgeDetailUseCase.js';
import { GeneratePRChecklistUseCase } from '../../application/use-cases/GeneratePRChecklistUseCase.js';
import { ListKnowledgeMetadataUseCase } from '../../application/use-cases/ListKnowledgeMetadataUseCase.js';

// Infrastructure
import { FileSystemKnowledgeRepository } from '../../infrastructure/repositories/FileSystemKnowledgeRepository.js';
import { GitHubKnowledgeRepository } from '../../infrastructure/repositories/GitHubKnowledgeRepository.js';
import { MarkdownSerializer } from '../../infrastructure/serializers/MarkdownSerializer.js';
import { IKnowledgeRepository } from '../../application/ports/IKnowledgeRepository.js';

// Domain Services
import { KnowledgeSearchService } from '../../domain/services/KnowledgeSearchService.js';

// Version Check
import { checkForUpdates } from './versionCheck.js';

/**
 * 知見アクセスモード
 */
type KnowledgeMode =
  | { type: 'local'; path: string }
  | { type: 'github'; repo: string; token?: string }
  | { type: 'default'; path: string };

/**
 * 知見アクセスモードを環境変数から解決
 */
function resolveKnowledgeMode(): KnowledgeMode {
  const localDir = process.env.REVIEW_DOJO_KNOWLEDGE_DIR;
  const githubRepo = process.env.REVIEW_DOJO_GITHUB_REPO;
  const githubToken = process.env.GITHUB_TOKEN;

  if (githubRepo) {
    console.error(`[review-dojo] Using GitHub repository: ${githubRepo}`);
    return { type: 'github', repo: githubRepo, token: githubToken };
  }

  if (localDir) {
    const resolvedPath = resolve(localDir);
    if (!existsSync(resolvedPath)) {
      console.error(`[review-dojo] Error: Directory not found: ${resolvedPath}`);
      console.error(`[review-dojo] Please check REVIEW_DOJO_KNOWLEDGE_DIR environment variable`);
      process.exit(1);
    }
    console.error(`[review-dojo] Using local directory: ${resolvedPath}`);
    return { type: 'local', path: resolvedPath };
  }

  // フォールバック: 従来の相対パス
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const path = join(__dirname, '../../..');
  console.error(`[review-dojo] Using default path: ${path}`);
  return { type: 'default', path };
}

/**
 * モードに応じたKnowledgeRepositoryを生成
 */
function createKnowledgeRepository(mode: KnowledgeMode, serializer: MarkdownSerializer): IKnowledgeRepository {
  if (mode.type === 'github') {
    return new GitHubKnowledgeRepository(mode.repo, serializer, mode.token);
  }
  return new FileSystemKnowledgeRepository(mode.path, serializer);
}

/**
 * review-dojo MCP Server
 * Phase 2: 知見検索・提案機能を提供
 */
class ReviewDojoMcpServer {
  private server: Server;
  private searchKnowledgeUseCase: SearchKnowledgeUseCase;
  private getKnowledgeDetailUseCase: GetKnowledgeDetailUseCase;
  private generatePRChecklistUseCase: GeneratePRChecklistUseCase;
  private listKnowledgeMetadataUseCase: ListKnowledgeMetadataUseCase;

  constructor() {
    // サーバー初期化
    this.server = new Server({
      name: 'review-dojo',
      version: packageJson.version,
    }, {
      capabilities: {
        tools: {},
      },
    });

    // インフラストラクチャの初期化
    const mode = resolveKnowledgeMode();
    const serializer = new MarkdownSerializer();
    const repository = createKnowledgeRepository(mode, serializer);
    const searchService = new KnowledgeSearchService();

    // Use Casesの初期化
    this.searchKnowledgeUseCase = new SearchKnowledgeUseCase(repository, searchService);
    this.getKnowledgeDetailUseCase = new GetKnowledgeDetailUseCase(repository, searchService);
    this.generatePRChecklistUseCase = new GeneratePRChecklistUseCase(repository, searchService);
    this.listKnowledgeMetadataUseCase = new ListKnowledgeMetadataUseCase(repository, searchService);

    // ハンドラーの登録
    this.setupHandlers();

    // エラーハンドリング
    this.server.onerror = (error) => {
      console.error('[MCP Error]', error);
    };

    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * ハンドラーの設定
   */
  private setupHandlers(): void {
    // ツール一覧
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: this.getTools(),
      };
    });

    // ツール実行
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      return await this.handleToolCall(request.params.name, request.params.arguments);
    });
  }

  /**
   * 提供するツール一覧
   */
  private getTools(): Tool[] {
    return [
      {
        name: 'search_knowledge',
        description: '蓄積された知見を検索します。カテゴリ、言語、重要度、ファイルパスなどで絞り込み可能です。',
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: '検索クエリ（タイトル、概要を対象）',
            },
            category: {
              type: 'string',
              description: 'カテゴリでフィルタ（security, performance, readability, design, testing, error-handling, other）',
            },
            language: {
              type: 'string',
              description: '言語でフィルタ（java, nodejs, typescript, python, など）',
            },
            severity: {
              type: 'string',
              description: '重要度でフィルタ（critical, warning, info）',
            },
            filePath: {
              type: 'string',
              description: 'ファイルパスの部分一致でフィルタ',
            },
            maxResults: {
              type: 'number',
              description: '最大結果数（デフォルト: 10）',
            },
          },
        },
      },
      {
        name: 'get_knowledge_detail',
        description: '特定の知見の詳細情報を取得します。',
        inputSchema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: '知見のID（search_knowledgeの結果から取得）',
            },
          },
          required: ['id'],
        },
      },
      {
        name: 'generate_pr_checklist',
        description: '変更ファイルから関連する知見をチェックリスト形式で生成します。',
        inputSchema: {
          type: 'object',
          properties: {
            filePaths: {
              type: 'array',
              items: { type: 'string' },
              description: '変更対象のファイルパス一覧',
            },
            languages: {
              type: 'array',
              items: { type: 'string' },
              description: '言語（省略時は自動推定）',
            },
            severityFilter: {
              type: 'string',
              description: '重要度フィルタ（デフォルト: critical, warning）',
            },
          },
          required: ['filePaths'],
        },
      },
      {
        name: 'list_categories',
        description: '利用可能なカテゴリ一覧を取得します。',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'list_languages',
        description: '利用可能な言語一覧を取得します。',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];
  }

  /**
   * ツール呼び出しハンドラー
   */
  private async handleToolCall(
    name: string,
    args: any
  ): Promise<{ content: Array<{ type: string; text: string }> }> {
    try {
      switch (name) {
        case 'search_knowledge':
          return await this.handleSearchKnowledge(args);
        case 'get_knowledge_detail':
          return await this.handleGetKnowledgeDetail(args);
        case 'generate_pr_checklist':
          return await this.handleGeneratePRChecklist(args);
        case 'list_categories':
          return await this.handleListCategories();
        case 'list_languages':
          return await this.handleListLanguages();
        default:
          throw new Error(`Unknown tool: ${name}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
      };
    }
  }

  /**
   * search_knowledge ツール
   */
  private async handleSearchKnowledge(args: any) {
    const result = await this.searchKnowledgeUseCase.execute({
      query: args.query,
      category: args.category,
      language: args.language,
      severity: args.severity,
      filePath: args.filePath,
      maxResults: args.maxResults,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * get_knowledge_detail ツール
   */
  private async handleGetKnowledgeDetail(args: any) {
    const result = await this.getKnowledgeDetailUseCase.execute(args.id);

    if (!result) {
      return {
        content: [
          {
            type: 'text',
            text: `Knowledge not found: ${args.id}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * generate_pr_checklist ツール
   */
  private async handleGeneratePRChecklist(args: any) {
    // 入力検証: filePathsが配列であることを確認
    if (!Array.isArray(args.filePaths) || args.filePaths.length === 0) {
      throw new Error('filePaths must be a non-empty array of strings');
    }

    // 各要素が文字列であることを確認
    if (!args.filePaths.every((path: any) => typeof path === 'string' && path.trim().length > 0)) {
      throw new Error('All filePaths must be non-empty strings');
    }

    const result = await this.generatePRChecklistUseCase.execute({
      filePaths: args.filePaths,
      languages: args.languages,
      severityFilter: args.severityFilter,
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  /**
   * list_categories ツール
   */
  private async handleListCategories() {
    const categories = await this.listKnowledgeMetadataUseCase.listCategories();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ categories }, null, 2),
        },
      ],
    };
  }

  /**
   * list_languages ツール
   */
  private async handleListLanguages() {
    const languages = await this.listKnowledgeMetadataUseCase.listLanguages();

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ languages }, null, 2),
        },
      ],
    };
  }

  /**
   * サーバー起動
   */
  async start() {
    // バージョンチェック
    const versionInfo = await checkForUpdates();
    if (versionInfo) {
      console.error(`[review-dojo] Starting MCP server v${versionInfo.currentVersion}`);
      if (versionInfo.updateAvailable) {
        console.error(`[review-dojo] ⚠️  New version available: v${versionInfo.latestVersion}`);
        console.error(`[review-dojo] Current: v${versionInfo.currentVersion}`);
        console.error(`[review-dojo] Update: ${versionInfo.updateCommand}`);
      }
    }

    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[review-dojo] MCP Server started');
  }
}

// サーバー起動
const server = new ReviewDojoMcpServer();
server.start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
