# PR Review Knowledge System

GitHub PRのレビューコメントから有益な指摘を自動収集・蓄積し、実装時に活用できる仕組み。

## ドキュメント

- **[クイックスタート](QUICKSTART.md)** - 5分で試す（初めての方はこちら）
- **[統合ガイド](docs/integration-guide.md)** - 自組織への本番導入手順
- **[トラブルシューティング](docs/troubleshooting.md)** - よくある問題と解決方法
- **[MCP技術仕様](docs/mcp-server-spec.md)** - MCPサーバーの詳細仕様

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

### クイックスタート（ローカルで試す）

```bash
# 依存関係のインストール
npm install

# ビルド
npm run build

# テスト実行
npm test
```

詳細は **[クイックスタート](QUICKSTART.md)** を参照してください。

### 本番導入（自組織への統合）

自組織のGitHub環境にreview-dojoを導入する場合は、**[統合ガイド](docs/integration-guide.md)** を参照してください。

統合ガイドには以下の内容が含まれています：
- GitHub Secretsの詳細設定手順
- 各リポジトリへのワークフロー配置方法
- MCPサーバーのセットアップ
- CI/CD統合の設定
- トラブルシューティング

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
├── src/                # TypeScript ソースコード（オニオンアーキテクチャ）
│   ├── domain/         # ドメイン層（ビジネスロジック）
│   ├── application/    # アプリケーション層（ユースケース）
│   ├── infrastructure/ # インフラ層（ファイルI/O、シリアライズ）
│   └── interfaces/     # インターフェース層（CLI、MCP Server）
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

## アーキテクチャ

### オニオンアーキテクチャ

本システムはTypeScriptで実装され、オニオンアーキテクチャ（4層）を採用しています。

```text
┌─────────────────────────────────────────┐
│     Interfaces Layer                    │  ← エントリーポイント
│  - McpServer.ts (MCP Server)            │
│  - CheckKnowledgeCli.ts (CI/CD)         │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│     Application Layer                   │  ← ユースケース
│  - SearchKnowledgeUseCase               │
│  - GetKnowledgeDetailUseCase            │
│  - GeneratePRChecklistUseCase           │
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
│  - GitHubKnowledgeRepository (optional) │
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
- **SearchKnowledgeUseCase**: 知見検索ユースケース
- **GetKnowledgeDetailUseCase**: 知見詳細取得ユースケース
- **GeneratePRChecklistUseCase**: PRチェックリスト生成ユースケース
- **Ports**: IKnowledgeRepository, IMarkdownSerializer（依存性逆転）

#### Infrastructure Layer（インフラ層）
- **FileSystemKnowledgeRepository** (デフォルト): ローカルファイルシステムベースの知見リポジトリ実装
- **GitHubKnowledgeRepository** (オプション): GitHubリポジトリベースの知見リポジトリ実装（`REVIEW_DOJO_GITHUB_REPO`環境変数設定時に使用）
- **MarkdownSerializer**: Markdown形式のシリアライズ/デシリアライズ

#### Interfaces Layer（インターフェース層）
- **McpServer**: MCP Serverエントリーポイント（Claude Code連携）
- **CheckKnowledgeCli**: CI/CD チェックコマンド

> **Note**: 知見の適用（apply）機能は [review-dojo-action](https://github.com/sk8metalme/review-dojo-action) に移管されました

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
- [x] Phase 3: CI/CD連携
  - [x] GitHub Actions ワークフロー
  - [x] Screwdriver CI/CD 設定
  - [x] PR自動コメント機能

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

3. **知見アクセスモード（新機能）**

   review-dojoはハイブリッドアクセスをサポートしています：

   | モード | 環境変数 | 用途 |
   |--------|---------|------|
   | リモート | `REVIEW_DOJO_GITHUB_REPO` | GitHub経由で知見取得（常に最新） |
   | ローカル | `REVIEW_DOJO_KNOWLEDGE_DIR` | ローカル知見ディレクトリ参照 |

   **リモートモード例**:
   ```json
   {
     "mcpServers": {
       "review-dojo": {
         "command": "node",
         "args": ["/path/to/review-dojo/dist/interfaces/mcp/McpServer.js"],
         "env": {
           "REVIEW_DOJO_GITHUB_REPO": "your-org/knowledge-repo"
         }
       }
     }
   }
   ```

   詳細は [QUICKSTART.md](QUICKSTART.md) および [統合ガイド](docs/integration-guide.md) を参照してください。

4. **MCP管理コマンド**

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

## Phase 3: CI/CD連携

### 概要

PR作成時・プッシュ時に、変更ファイルを自動的にチェックし、関連する知見をPRコメントとして投稿します。

**対応CI/CD:**
- GitHub Actions
- Screwdriver CI/CD

### GitHub Actions セットアップ

#### 1. ソースリポジトリにワークフローを追加

`.github/workflows/check-knowledge.yml` を作成:

```yaml
name: Check Review Knowledge

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  check-knowledge:
    uses: YOUR_ORG/YOUR_KNOWLEDGE_REPO/.github/workflows/check-knowledge.yml@main
    with:
      knowledge_repo: 'YOUR_ORG/YOUR_KNOWLEDGE_REPO'
      knowledge_branch: 'main'
    secrets:
      KNOWLEDGE_REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**カスタマイズ箇所**:
- `YOUR_ORG/YOUR_KNOWLEDGE_REPO`: 自組織のknowledge-repoに変更
- `knowledge_branch`: デフォルトブランチが`main`でない場合は変更

#### 2. 動作

1. PRが作成・更新されると自動実行
2. 変更されたソースファイルを検出
3. knowledge-repoから知見を取得
4. 関連する知見をPRコメントとして投稿
5. **ノンブロッキング**: 知見が見つかっても失敗しない

#### 3. PRコメント例

```markdown
## :clipboard: Review Knowledge Checklist

### Summary
- **対象言語**: java, typescript
- **チェック項目数**: 3件
- **重要**: 1件 | **警告**: 2件

---

### :rotating_light: Critical

#### 1. SQLインジェクション対策
- [ ] SQLインジェクション対策を実施しましたか？

<details>
<summary>Details</summary>

- **Category**: security
- **Knowledge ID**: `security/java/sqlインジェクション対策`

</details>
```

### Screwdriver CI/CD セットアップ

#### 1. screwdriver.yaml にジョブを追加

```yaml
shared:
  image: node:20-slim
  environment:
    KNOWLEDGE_REPO: sk8metalme/review-dojo
    KNOWLEDGE_BRANCH: main

jobs:
  check-knowledge:
    requires: [~pr, ~commit]
    annotations:
      screwdriver.cd/ram: MICRO
      screwdriver.cd/cpu: LOW
    steps:
      - install-gh: |
          apt-get update && apt-get install -y gh git

      - get-changed-files: |
          if [ -n "$SD_PULL_REQUEST" ]; then
            # PR mode
            CHANGED_FILES=$(gh pr view $SD_PULL_REQUEST --json files -q '.files[].path' | tr '\n' ',')
          else
            # Push mode
            CHANGED_FILES=$(git diff --name-only HEAD~1 | tr '\n' ',')
          fi

          # Filter source files only
          FILTERED_FILES=$(echo "$CHANGED_FILES" | tr ',' '\n' | \
            grep -E '\.(java|js|ts|jsx|tsx|py|go|php|rb|rs)$' | \
            tr '\n' ',')

          meta set changed_files "$FILTERED_FILES"

      - clone-knowledge-repo: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ]; then
            echo "No relevant source files changed."
            exit 0
          fi

          git clone --depth 1 --branch $KNOWLEDGE_BRANCH \
            https://github.com/$KNOWLEDGE_REPO.git knowledge-repo

      - generate-checklist: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ]; then
            exit 0
          fi

          cd knowledge-repo
          npm ci
          npm run build

          node dist/index.js check \
            --files "$CHANGED_FILES" \
            --format markdown \
            --include-empty > ../checklist.md

      - post-pr-comment: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ] || [ -z "$SD_PULL_REQUEST" ]; then
            exit 0
          fi

          # Post or update PR comment
          gh pr comment $SD_PULL_REQUEST --body-file ../checklist.md

    secrets:
      - GITHUB_TOKEN
```

#### 2. 必要なSecret

| Secret | 説明 |
|--------|------|
| `GITHUB_TOKEN` | GitHub APIアクセス用トークン |

### CLIコマンド（手動実行）

ローカルでチェックリストを生成:

```bash
# ビルド
npm run build

# チェックリスト生成
node dist/index.js check --files "src/UserDao.java,src/Service.ts"

# 重要度フィルタ
node dist/index.js check \
  --files "src/UserDao.java" \
  --severity "critical,warning"

# JSON形式で出力
node dist/index.js check \
  --files "src/UserDao.java" \
  --format json
```

### オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--files, -f` | カンマ区切りのファイルパス（必須） | - |
| `--format` | 出力形式 (markdown \| json) | markdown |
| `--severity` | 重要度フィルタ (critical,warning,info) | すべて |
| `--include-empty` | 知見なしの場合も出力 | true |
| `--knowledge-dir` | 知見ディレクトリ | カレントディレクトリ |
| `--help, -h` | ヘルプ表示 | - |

## ライセンス

MIT

## 参考

詳細な設計書は [plan.md](./plan.md) を参照してください。
