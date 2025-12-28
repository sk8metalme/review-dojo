# MCP Server 仕様書（Phase 2）

## 概要

review-dojoのMCPサーバーは、蓄積されたPRレビュー知見をClaude Codeから参照・活用するためのインターフェースを提供します。

## サーバー情報

- **サーバー名**: `review-dojo`
- **バージョン**: `2.0.0`
- **トランスポート**: stdio
- **エントリーポイント**: `dist/interfaces/mcp/McpServer.js`

## 提供ツール

### 1. search_knowledge

蓄積された知見を検索します。

**入力パラメータ:**

```typescript
{
  query?: string;        // 検索クエリ（タイトル、概要を対象）
  category?: string;     // カテゴリでフィルタ（security, performance, etc.）
  language?: string;     // 言語でフィルタ（java, nodejs, etc.）
  severity?: string;     // 重要度でフィルタ（critical, warning, info）
  filePath?: string;     // ファイルパスの部分一致でフィルタ
  maxResults?: number;   // 最大結果数（デフォルト: 10）
}
```

**出力形式:**

```typescript
{
  totalCount: number;
  results: Array<{
    id: string;                    // 一意ID（category/language/title のハッシュ）
    category: string;
    language: string;
    severity: string;
    title: string;
    summary: string;
    occurrences: number;
    filePathExample?: string;
    prReferences: string[];        // 最初の3件のみ
  }>;
}
```

### 2. get_knowledge_detail

特定の知見の詳細情報を取得します。

**入力パラメータ:**

```typescript
{
  id: string;              // 知見のID
}
```

**出力形式:**

```typescript
{
  category: string;
  language: string;
  severity: string;
  title: string;
  summary: string;
  recommendation: string;
  occurrences: number;
  codeExample?: {
    bad: string;
    good: string;
  };
  filePathExample?: string;
  prReferences: string[];
  originalComment?: string;
}
```

### 3. generate_pr_checklist

現在のコンテキスト（ファイルパス、言語）から関連する知見をチェックリスト形式で生成します。

**入力パラメータ:**

```typescript
{
  filePaths: string[];     // 変更対象のファイルパス一覧
  languages?: string[];    // 言語（自動推定も可能）
  severityFilter?: string; // 重要度フィルタ（デフォルト: critical, warning）
}
```

**出力形式:**

```typescript
{
  checklist: Array<{
    category: string;
    severity: string;
    title: string;
    checkItem: string;     // チェック項目（「〜を確認しましたか？」形式）
    knowledgeId: string;   // 詳細取得用のID
  }>;
  summary: string;         // チェックリストのサマリー
}
```

### 4. list_categories

利用可能なカテゴリ一覧を取得します。

**入力パラメータ:** なし

**出力形式:**

```typescript
{
  categories: Array<{
    name: string;          // カテゴリ名（security, performance, etc.）
    description: string;   // カテゴリの説明
    knowledgeCount: number; // 登録されている知見の数
  }>;
}
```

### 5. list_languages

利用可能な言語一覧を取得します。

**入力パラメータ:** なし

**出力形式:**

```typescript
{
  languages: Array<{
    name: string;          // 言語名（java, nodejs, etc.）
    knowledgeCount: number; // 登録されている知見の数
  }>;
}
```

## アーキテクチャ設計

### レイヤー配置

```
src/
├── interfaces/
│   └── mcp/
│       ├── McpServer.ts           # MCPサーバーエントリーポイント
│       └── tools/
│           ├── SearchKnowledgeTool.ts
│           ├── GetKnowledgeDetailTool.ts
│           ├── GeneratePRChecklistTool.ts
│           ├── ListCategoriesTool.ts
│           └── ListLanguagesTool.ts
├── application/
│   └── use-cases/
│       ├── SearchKnowledgeUseCase.ts      # 新規
│       ├── GetKnowledgeDetailUseCase.ts   # 新規
│       ├── GeneratePRChecklistUseCase.ts  # 新規
│       └── ListKnowledgeMetadataUseCase.ts # 新規
├── domain/
│   ├── services/
│   │   └── KnowledgeSearchService.ts      # 新規（検索ロジック）
│   └── value-objects/
│       └── KnowledgeQuery.ts              # 新規（検索条件）
└── infrastructure/
    └── repositories/
        └── FileSystemKnowledgeRepository.ts # 既存を拡張
```

### 依存関係

- **McpServer** → Application Layer（Use Cases）
- **Use Cases** → Domain Services, Repository
- **Domain Services** → Value Objects, Entities
- **Repository** → ファイルシステム

## 実装方針

### 1. Domain層の拡張

- **KnowledgeSearchService**: 知見の検索・フィルタリングロジック
- **KnowledgeQuery**: 検索条件を表すValue Object

### 2. Application層の新規Use Cases

- **SearchKnowledgeUseCase**: 知見検索のオーケストレーション
- **GetKnowledgeDetailUseCase**: 知見詳細取得
- **GeneratePRChecklistUseCase**: チェックリスト生成
- **ListKnowledgeMetadataUseCase**: メタデータ一覧取得

### 3. Infrastructure層の拡張

- **FileSystemKnowledgeRepository**:
  - 既存: save, load, archive
  - 新規: search, listCategories, listLanguages

### 4. Interfaces層の新規実装

- **McpServer**: MCPサーバーの起動・ツール登録
- **Tools**: 各ツールの実装（Use Caseを呼び出し）

## 使用例

### Claude Code設定

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/path/to/review-dojo/dist/interfaces/mcp/McpServer.js"]
    }
  }
}
```

### 使用シナリオ

#### シナリオ1: 実装中の自動提案

```
ユーザー: UserDao.javaでSQL文を実装中
Claude Code: review-dojo MCPサーバーに問い合わせ
  → search_knowledge({ language: "java", filePath: "UserDao.java" })
  → セキュリティ関連の知見を発見
  → ユーザーに「SQLインジェクション対策のためPreparedStatementを使用してください」と提案
```

#### シナリオ2: PR作成時のチェックリスト

```
ユーザー: PR作成時
Claude Code: 変更ファイル一覧を取得
  → generate_pr_checklist({ filePaths: ["UserDao.java", "UserService.java"] })
  → チェックリスト生成
  → PR説明欄に「セキュリティチェック」「パフォーマンスチェック」を自動挿入
```

---

## クエリ・プロンプト集

### 基本的な検索パターン

MCPサーバーが提供する`search_knowledge`ツールの実践的な使用例です。

```typescript
// 1. カテゴリでフィルタ
search_knowledge({ category: "security" })
// セキュリティ関連の知見すべてを取得

// 2. 言語でフィルタ
search_knowledge({ language: "java" })
// Java関連の知見すべてを取得

// 3. 重要度でフィルタ
search_knowledge({ severity: "critical" })
// critical重要度の知見のみ

// 4. ファイルパスで検索
search_knowledge({ filePath: "Controller.java" })
// ファイル名に"Controller.java"を含む知見を検索

// 5. キーワード検索
search_knowledge({ query: "SQL" })
// タイトルまたは概要に"SQL"を含む知見を検索

// 6. 複合条件（セキュリティ + Java + critical）
search_knowledge({
  category: "security",
  language: "java",
  severity: "critical"
})
// JavaのセキュリティでCriticalな知見のみ

// 7. 結果数制限
search_knowledge({ maxResults: 5 })
// 上位5件のみ取得

// 8. ファイルパス + 重要度
search_knowledge({
  filePath: "Service.java",
  severity: "warning"
})
// Serviceファイルに関するwarning重要度の知見

// 9. キーワード + カテゴリ
search_knowledge({
  query: "認証",
  category: "security"
})
// セキュリティカテゴリで「認証」に関する知見

// 10. 全件取得（上位10件）
search_knowledge({})
// フィルタなしで上位10件を取得
```

### 複数ツールを組み合わせたワークフロー

実践的なワークフローでは、複数のツールを組み合わせて使用します。

#### ワークフロー1: PR作成時の完全チェック

```typescript
// Step 1: 変更ファイルからチェックリスト生成
const checklist = generate_pr_checklist({
  filePaths: [
    "src/auth/LoginService.java",
    "src/api/UserController.java"
  ]
});

// 結果例:
// {
//   checklist: [
//     {
//       category: "security",
//       severity: "critical",
//       title: "SQLインジェクション対策",
//       checkItem: "SQLインジェクション対策を実施しましたか？",
//       knowledgeId: "security/java/sqlインジェクション対策"
//     },
//     ...
//   ],
//   summary: "対象言語: java | チェック項目数: 5件 | 重要: 2件 | 警告: 3件"
// }

// Step 2: critical項目の詳細を取得
for (const item of checklist.filter(i => i.severity === "critical")) {
  const detail = get_knowledge_detail({ id: item.knowledgeId });
  // コード例や推奨対応を参照して実装を確認
}
```

#### ワークフロー2: 新機能開発前の事前調査

```typescript
// Step 1: 関連カテゴリの知見数を確認
const categories = list_categories();
const securityCount = categories.find(c => c.name === "security")?.knowledgeCount;

console.log(`セキュリティ関連の知見: ${securityCount}件`);

// Step 2: 重要な知見を取得
if (securityCount > 0) {
  const knowledge = search_knowledge({
    category: "security",
    language: "java",
    severity: "critical"
  });

  // 各知見をレビュー
  for (const item of knowledge.results) {
    console.log(`[${item.severity}] ${item.title}`);
    console.log(`  発生回数: ${item.occurrences}回`);
    console.log(`  概要: ${item.summary}`);
  }
}
```

---

## テスト戦略

### 単体テスト

- Domain層: KnowledgeSearchService のロジックテスト
- Application層: 各Use Caseのテスト（モックRepository使用）
- Infrastructure層: FileSystemKnowledgeRepository の検索機能テスト

### 統合テスト

- MCPサーバー全体のエンドツーエンドテスト
- サンプルデータを使用した実際のツール呼び出し

### テストツール

- Vitest: 既存のテストフレームワーク
- ts-arch: アーキテクチャテスト（既存）

## セキュリティ

- **入力検証**: すべてのツール入力をZodで検証
- **機密情報**: マスク済みデータのみを返却（既存のSensitiveInfoMaskerを活用）
- **ファイルアクセス**: review-dojoディレクトリ内のみに制限

## パフォーマンス

- **初回起動**: 知見ファイルのインデックス作成（メモリキャッシュ）
- **検索**: インデックスベースの高速検索
- **更新検知**: ファイル変更時にインデックス再構築

## 今後の拡張

- リソース（Resources）の提供: `knowledge://security/java` のようなURIスキーム
- プロンプト（Prompts）の提供: PR作成用テンプレート
- サンプリング（Sampling）: AI分析の実行
