# PR Review Knowledge System

GitHub PRのレビューコメントから有益な指摘を自動収集・蓄積し、実装時に活用できる仕組み。

## 概要

- **目的**: PRレビューで得られた知見をチームで共有し、同じミスの再発を防止
- **現在の状態**: Phase 1 (MVP) 実装完了
- **対象**: GitHub Organization内のpublicリポジトリ

## Phase 1: MVP（収集 + 手動参照）

### 機能

- ✅ PRマージ時の自動収集
- ✅ Claude Code によるAI分析・抽出
- ✅ Markdown形式での知見蓄積
- ✅ 類似知見のマージ・カウント（タイトル一致）
- ✅ 機密情報の自動マスク
- ✅ 100件/ファイル上限でアーカイブ

### システム構成

```
┌─────────────────────────────────────────┐
│         各リポジトリ                     │
│  ┌────────────────────────────────┐     │
│  │ PR マージ                       │     │
│  └────────┬───────────────────────┘     │
│           │                              │
│           │ repository_dispatch          │
│           ▼                              │
└───────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────┐
│      review-dojo (knowledge-repo)       │
│  ┌────────────────────────────────┐     │
│  │ 1. PRコメント取得               │     │
│  │ 2. Claude Code で分析           │     │
│  │ 3. 知見抽出・分類               │     │
│  │ 4. Markdown更新                 │     │
│  └────────────────────────────────┘     │
│                                          │
│  security/java.md                        │
│  performance/nodejs.md                   │
│  ...                                     │
└─────────────────────────────────────────┘
```

## セットアップ

### 1. 必要な環境

- Node.js 20+
- GitHub Organization アカウント
- Anthropic API Key

### 2. このリポジトリのセットアップ

```bash
# 依存関係のインストール
npm install

# テスト実行
npm test
```

### 3. GitHub Secrets の設定

Organization レベルで以下のSecretsを設定：

| Secret名 | 用途 |
|----------|------|
| `ANTHROPIC_API_KEY` | Claude API 呼び出し |
| `ORG_GITHUB_TOKEN` | org内リポジトリのPR情報取得 |
| `KNOWLEDGE_REPO_TOKEN` | knowledge-repoへのpush |

### 4. 各リポジトリへのワークフロー配置

収集対象の各リポジトリに `.github/workflows/trigger-knowledge-collection.yml` を配置：

```yaml
# .github/workflows/trigger-knowledge-collection.yml をコピー
# YOUR_ORG/review-dojo の部分を実際のリポジトリ名に変更
```

## 使い方

### 自動収集（通常運用）

1. 各リポジトリでPRをマージ
2. 自動的にknowledge-repoへ通知
3. Claude Codeが分析して知見を抽出
4. カテゴリ・言語別のMarkdownファイルに保存

### 手動実行

特定のPRを分析したい場合：

```bash
# GitHub Actionsから手動実行
# Actions > Collect Review Knowledge > Run workflow
# PR URLなどを入力
```

## ディレクトリ構造

```
review-dojo/
├── .github/workflows/
│   ├── collect-review-knowledge.yml    # メイン収集ワークフロー
│   └── trigger-knowledge-collection.yml # 各リポジトリ配置用
├── scripts/
│   └── collect-knowledge.md            # Claude Code用プロンプト
├── src/                # TypeScript ソースコード（オニオンアーキテクチャ）
│   ├── domain/         # ドメイン層（ビジネスロジック）
│   ├── application/    # アプリケーション層（ユースケース）
│   ├── infrastructure/ # インフラ層（ファイルI/O、シリアライズ）
│   └── interfaces/     # インターフェース層（CLI）
├── dist/               # ビルド出力（src/のコンパイル結果）
├── tests/              # テストコード
│   ├── domain/         # ドメイン層のテスト
│   ├── infrastructure/ # インフラ層のテスト
│   └── architecture/   # アーキテクチャテスト（ts-arch）
├── security/           # セキュリティ関連知見
├── performance/        # パフォーマンス関連知見
├── readability/        # 可読性・命名関連知見
├── design/             # 設計・アーキテクチャ関連知見
├── testing/            # テスト関連知見
├── error-handling/     # エラーハンドリング関連知見
├── other/              # その他
└── archive/            # アーカイブ（100件超過時）
```

## 知見のフォーマット

```markdown
## SQLインジェクション対策

- **重要度**: critical
- **発生回数**: 3
- **概要**: PreparedStatementを使用せず文字列結合でSQLを組み立てている
- **推奨対応**: 必ずPreparedStatementまたはORMのパラメータバインディングを使用する
- **コード例**:
  ```java
  // NG
  String sql = "SELECT * FROM users WHERE id = " + userId;
  ```
  ```java
  // OK
  PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
  ```
- **対象ファイル例**: `src/main/java/UserDao.java`
- **参照PR**:
  - https://github.com/org/repo/pull/123
  - https://github.com/org/repo/pull/456

---
```

## 開発

### ビルド

```bash
# TypeScriptをビルド
npm run build

# 開発時の自動ビルド（ウォッチモード）
npm run build -- --watch
```

### テスト

```bash
# 単体テスト実行
npm test

# カバレッジ確認
npm run test:coverage

# UI モード
npm run test:ui

# アーキテクチャテスト（ts-arch）
# オニオンアーキテクチャの依存関係ルールを検証
npm test tests/architecture
```

### ローカルでの動作確認

```bash
# サンプルJSONを作成
cat > sample-knowledge.json << 'EOF'
{
  "knowledge_items": [
    {
      "category": "security",
      "language": "java",
      "severity": "critical",
      "title": "SQLインジェクション対策",
      "summary": "PreparedStatementを使用していない",
      "recommendation": "PreparedStatementを使用する",
      "file_path": "UserDao.java",
      "pr_url": "https://github.com/org/repo/pull/1"
    }
  ]
}
EOF

# ビルド
npm run build

# 知見を適用
node dist/index.js sample-knowledge.json

# 結果確認
cat security/java.md
```

## アーキテクチャ

### オニオンアーキテクチャ

本システムはTypeScriptで実装され、オニオンアーキテクチャ（4層）を採用しています。

```text
┌─────────────────────────────────────────┐
│     Interfaces Layer (CLI)              │  ← エントリーポイント
│  - ApplyKnowledgeCli.ts                 │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│     Application Layer                   │  ← ユースケース
│  - ApplyKnowledgeUseCase                │
│  - KnowledgeArchivedHandler             │
│  - Ports (Interfaces)                   │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│     Domain Layer (依存なし)              │  ← ビジネスロジック
│  - Aggregates: KnowledgeFile            │
│  - Entities: KnowledgeItem              │
│  - Value Objects: Category, Language... │
│  - Domain Services: SensitiveInfoMasker │
│  - Domain Events                        │
└─────────────────────────────────────────┘
             ▲
┌────────────┴────────────────────────────┐
│     Infrastructure Layer                │  ← 外部連携
│  - FileSystemKnowledgeRepository        │
│  - MarkdownSerializer                   │
└─────────────────────────────────────────┘
```

### 主要コンポーネント

#### Domain Layer（ドメイン層）
- **KnowledgeFile** (Aggregate Root): 知見ファイルの集約ルート。100件制限の管理を担当
- **KnowledgeItem** (Entity): 個別の知見。マージ・発生回数の管理
- **Value Objects**: Category, Language, Severity, PathComponent, CodeExample, PRReference
- **Domain Services**: SensitiveInfoMasker（機密情報マスク）、IKnowledgeMatcher（類似判定）
- **Domain Events**: KnowledgeAdded, KnowledgeMerged, KnowledgeArchived

#### Application Layer（アプリケーション層）
- **ApplyKnowledgeUseCase**: メインユースケース（知見の適用）
- **KnowledgeArchivedHandler**: アーカイブイベントハンドラー
- **Ports**: IKnowledgeRepository, IMarkdownSerializer（依存性逆転）

#### Infrastructure Layer（インフラ層）
- **FileSystemKnowledgeRepository**: ファイルシステムベースのリポジトリ実装
- **MarkdownSerializer**: Markdown形式のシリアライズ/デシリアライズ

#### Interfaces Layer（インターフェース層）
- **ApplyKnowledgeCli**: CLIエントリーポイント

### アーキテクチャ検証

依存関係ルールは `ts-arch` で自動検証されます：

```typescript
// Domain層は他のレイヤーに依存しない
// Application層はDomainのみに依存
// Infrastructure層はInterfacesに依存しない
```

テスト実行: `npm test tests/architecture`

## ロードマップ

- [x] Phase 1: MVP（収集 + 手動参照）
  - [x] オニオンアーキテクチャ実装完了
  - [x] TypeScript完全移行
  - [x] アーキテクチャテスト導入（ts-arch）
- [x] Phase 2: 自動提案
  - [x] MCPサーバー構築
  - [x] Claude Code からの参照機能
  - [x] PR作成時のチェックリスト生成
- [ ] Phase 3: CI/CD連携
  - Screwdriver CI/CD との統合
  - 自動チェック・警告

## Phase 2: MCPサーバー機能

### 概要

review-dojoはModel Context Protocol (MCP)サーバーを提供し、Claude Codeから蓄積された知見を直接参照できます。

### セットアップ

1. **ビルド**
   ```bash
   npm run build
   ```

2. **MCPサーバー設定（ユーザースコープ）**

   **設定ファイル**: `~/.claude.json`

   ```json
   {
     "mcpServers": {
       "review-dojo": {
         "command": "node",
         "args": ["/absolute/path/to/review-dojo/dist/interfaces/mcp/McpServer.js"],
         "env": {}
       }
     }
   }
   ```

   **CLIで設定（推奨）:**
   ```bash
   # 対話形式
   claude mcp add

   # または、ワンライナー
   claude mcp add --transport stdio review-dojo --scope user \
     -- node /absolute/path/to/review-dojo/dist/interfaces/mcp/McpServer.js
   ```

   **メリット:**
   - 全プロジェクトで利用可能
   - 個人の設定として永続化
   - 一度設定すればどのディレクトリからでも利用可能

3. **MCP管理コマンド**

   ```bash
   # サーバー一覧
   claude mcp list

   # サーバー詳細
   claude mcp get review-dojo

   # サーバー削除
   claude mcp remove review-dojo

   # Claude Code内で状態確認
   /mcp
   ```

### 提供ツール

#### 1. search_knowledge
蓄積された知見を検索します。

```typescript
search_knowledge({
  query?: "SQL",              // 検索クエリ
  category?: "security",      // カテゴリでフィルタ
  language?: "java",          // 言語でフィルタ
  severity?: "critical",      // 重要度でフィルタ
  filePath?: "UserDao.java",  // ファイルパスで絞り込み
  maxResults?: 10             // 最大結果数
})
```

#### 2. get_knowledge_detail
特定の知見の詳細を取得します。

```typescript
get_knowledge_detail({
  id: "security/java/sqlインジェクション対策"
})
```

#### 3. generate_pr_checklist
変更ファイルから関連する知見をチェックリスト形式で生成します。

```typescript
generate_pr_checklist({
  filePaths: ["src/UserDao.java", "src/UserService.java"],
  languages?: ["java"],       // 省略時は自動推定
  severityFilter?: "critical" // 重要度フィルタ
})
```

#### 4. list_categories
利用可能なカテゴリ一覧を取得します。

```typescript
list_categories()
```

#### 5. list_languages
利用可能な言語一覧を取得します。

```typescript
list_languages()
```

### 使用例

#### シナリオ1: 実装中の自動提案

```
ユーザー: UserDao.javaでSQL文を実装中
Claude Code: review-dojo MCPサーバーに問い合わせ
  → search_knowledge({ language: "java", category: "security" })
  → セキュリティ関連の知見を発見
  → 「SQLインジェクション対策のためPreparedStatementを使用してください」と提案
```

#### シナリオ2: PR作成時のチェックリスト

```
ユーザー: PR作成時
Claude Code: 変更ファイル一覧を取得
  → generate_pr_checklist({ filePaths: ["UserDao.java", "UserService.java"] })
  → チェックリスト生成
  → PR説明欄に「セキュリティチェック」「パフォーマンスチェック」を自動挿入
```

## ライセンス

MIT

## 参考

詳細な設計書は [plan.md](./plan.md) を参照してください。
