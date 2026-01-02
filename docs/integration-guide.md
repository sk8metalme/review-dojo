# review-dojo 統合ガイド

このガイドでは、review-dojoを自組織のGitHub環境に完全統合する手順を説明します。

## 概要

### このガイドでできること
- 自組織のknowledge-repoセットアップ
- GitHub Secretsの設定
- 各リポジトリへのワークフロー配置
- MCPサーバーの導入
- CI/CD統合の設定

### 所要時間
- Phase 1（知見収集システム）: 30-45分
- Phase 2（MCPサーバー）: 10-15分
- Phase 3（CI/CD連携）: 15-20分

### 前提条件
- GitHub Organization アカウント（または個人アカウント）
- Organization の Admin 権限
- Node.js 20以上
- Anthropic API Key（Claude Code利用時）
- 基本的なGitHub Actionsの知識

---

## 事前準備: 環境変数の設定

ドキュメント内のコマンドで使用するため、以下の環境変数を設定してください：

```bash
# 知見リポジトリのローカルパス
export KNOWLEDGE_REPO=/path/to/your-knowledge-repo

# review-dojo-mcp のローカルパス
export REVIEW_DOJO_MCP=/path/to/review-dojo-mcp

# Organization名（個人利用の場合はユーザー名）
export YOUR_ORG=your-organization

# 知見リポジトリ名
export YOUR_KNOWLEDGE_REPO_NAME=your-knowledge-repo-name
```

---

## Phase 1: 知見収集システムの導入

### 1.1 知見リポジトリを作成

空のリポジトリを作成し、カテゴリディレクトリのみ初期化します：

```bash
# 新規リポジトリを作成（GitHub UI または gh CLI）
gh repo create $YOUR_ORG/$YOUR_KNOWLEDGE_REPO_NAME --public

# クローンとディレクトリ作成
git clone https://github.com/$YOUR_ORG/$YOUR_KNOWLEDGE_REPO_NAME.git
cd $YOUR_KNOWLEDGE_REPO_NAME

# カテゴリディレクトリを作成
mkdir -p security performance readability design testing error-handling other archive

# 各ディレクトリに.gitkeepを作成（空ディレクトリをGitで管理するため）
touch security/.gitkeep performance/.gitkeep readability/.gitkeep design/.gitkeep \
      testing/.gitkeep error-handling/.gitkeep other/.gitkeep archive/.gitkeep

# 初期化
git add .
git commit -m "chore: Initialize knowledge repository structure"
git push origin main
```

### 1.2 知見リポジトリに収集ワークフローを配置

knowledge-repo（知見リポジトリ）で以下のワークフローファイルを作成します。

```bash
cd $KNOWLEDGE_REPO
mkdir -p .github/workflows
```

`.github/workflows/collect-review-knowledge.yml` を作成：

```yaml
name: Collect Review Knowledge

on:
  repository_dispatch:
    types: [pr-merged]
  workflow_dispatch:
    inputs:
      pr_url:
        description: 'PR URL to analyze'
        required: true
      repo_owner:
        description: 'Repository owner'
        required: true
      repo_name:
        description: 'Repository name'
        required: true
      pr_number:
        description: 'PR number'
        required: true

concurrency:
  group: knowledge-collection
  cancel-in-progress: false

jobs:
  collect-knowledge:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout knowledge repository
        uses: actions/checkout@v4
        with:
          token: ${{ secrets.ORG_GITHUB_TOKEN }}
          fetch-depth: 0

      - name: Extract PR information
        id: pr-info
        run: |
          if [ "${{ github.event_name }}" == "repository_dispatch" ]; then
            echo "PR_URL=${{ github.event.client_payload.pr_url }}" >> $GITHUB_OUTPUT
            echo "REPO_OWNER=${{ github.event.client_payload.repo_owner }}" >> $GITHUB_OUTPUT
            echo "REPO_NAME=${{ github.event.client_payload.repo_name }}" >> $GITHUB_OUTPUT
            echo "PR_NUMBER=${{ github.event.client_payload.pr_number }}" >> $GITHUB_OUTPUT
          else
            echo "PR_URL=${{ github.event.inputs.pr_url }}" >> $GITHUB_OUTPUT
            echo "REPO_OWNER=${{ github.event.inputs.repo_owner }}" >> $GITHUB_OUTPUT
            echo "REPO_NAME=${{ github.event.inputs.repo_name }}" >> $GITHUB_OUTPUT
            echo "PR_NUMBER=${{ github.event.inputs.pr_number }}" >> $GITHUB_OUTPUT
          fi

      - name: Collect knowledge
        uses: sk8metalme/review-dojo-action@main
        id: collect
        with:
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
          github-token: ${{ secrets.ORG_GITHUB_TOKEN }}
          pr-url: ${{ steps.pr-info.outputs.PR_URL }}
          repo-owner: ${{ steps.pr-info.outputs.REPO_OWNER }}
          repo-name: ${{ steps.pr-info.outputs.REPO_NAME }}
          pr-number: ${{ steps.pr-info.outputs.PR_NUMBER }}

      - name: Commit and push changes
        if: steps.collect.outputs.knowledge-collected == 'true'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add -A
          if git diff --staged --quiet; then
            echo "No changes to commit"
            exit 0
          fi
          git commit -m "Add knowledge from ${{ steps.pr-info.outputs.PR_URL }}"
          git push
```

ワークフローをリモートにプッシュ：

```bash
git add .github/workflows/collect-review-knowledge.yml
git commit -m "feat: Add review knowledge collection workflow"
git push origin main
```

---

### 1.3 GitHub Secrets の設定

#### 1.3.1 必要なSecrets一覧

| Secret名 | スコープ | 用途 | 必要な権限 |
|----------|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Organization | Claude API呼び出し | N/A |
| `ORG_GITHUB_TOKEN` | Organization | org内リポジトリのPR情報取得とknowledge-repoへのpush | 下記参照 |

#### 1.3.2 Personal Access Token (PAT) の作成手順

**ORG_GITHUB_TOKEN の作成**:

1. [GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new) (推奨)
2. 「Generate new token」をクリック
3. 以下を設定:
   - **Token name**: `review-dojo-org-token`
   - **Expiration**: 90 days（定期的な更新を推奨）
   - **Resource owner**: Your Organization
   - **Repository access**: **All repositories**
   - **Permissions**（全リポジトリに適用されます）:
     - Repository permissions:
       - `Pull requests`: **Read and write**（PR情報の取得とコメント投稿に必要）
       - `Contents`: **Read and write**（PR内容の取得とknowledge-repoへのpushに必要）
       - `Actions`: Read and write（repository_dispatch イベントのトリガーに必要）
       - `Workflows`: Read and write（ワークフローファイルの更新に必要）
       - `Metadata`: Read-only（自動付与）
     - Organization permissions:
       - `Members`: Read-only
4. 「Generate token」をクリック
5. トークンをコピー（一度しか表示されません）

**重要な注意事項**:
- Fine-grained PATで「All repositories」を選択すると、**全てのリポジトリに同じ権限セットが適用されます**
- つまり、Organization内の全リポジトリに`Contents: Read and write`権限が付与されます
- **セキュリティトレードオフ**:
  - ✅ メリット: シンプルな設定、1つのトークンのみで管理が容易
  - ⚠️ デメリット: 全リポジトリに書き込み権限が付与される
  - 💡 推奨: Organizationレベルで[ブランチ保護ルール](https://docs.github.com/ja/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches)を設定し、mainブランチへの直接pushを防止してください
- より厳格なセキュリティが必要な場合は、読み取り専用トークンと書き込み専用トークンを分けて管理することを検討してください

**セキュリティのベストプラクティス**:
- トークンは最小限の権限のみ付与
- 有効期限を設定（90日を推奨）
- 定期的にローテーション
- 使用しなくなったトークンは即座に削除

#### 1.3.3 Secrets への登録手順

`scripts/distribute-workflow.sh` を使用して対話型でSecretsを設定できます。

**Organization を使用している場合**:
```bash
cd $REVIEW_DOJO_MCP
./scripts/distribute-workflow.sh --setup-secrets --org-secrets $YOUR_ORG
```

**個人利用の場合**:
```bash
cd $REVIEW_DOJO_MCP
./scripts/distribute-workflow.sh --setup-secrets YOUR_USERNAME
```

**実行例**:
```bash
$ ./scripts/distribute-workflow.sh --setup-secrets --org-secrets my-org
=========================================
Setup Secrets
=========================================
Account Type: org (my-org)
Mode: Organization Secrets

Enter secrets (input will be hidden):
  ANTHROPIC_API_KEY: ********
  ORG_GITHUB_TOKEN: ********

Setting secrets...
  ANTHROPIC_API_KEY      → my-org (repos: review-dojo-knowledge) ... [OK]
  ORG_GITHUB_TOKEN       → my-org (visibility: all) ... [OK]

Total: 2 configured, 0 failed

Proceed to distribute workflows? [y/N]:
```

**オプション**:
- `--dry-run`: 実際には設定せず、対象リポジトリを表示
- `--knowledge-repo <name>`: knowledge-repoの名前を指定（デフォルト: review-dojo-knowledge）

#### 1.3.4 Secrets の動作確認

```bash
# knowledge-repo のリポジトリで
# GitHub Actions のワークフローを手動実行してSecretsが正しく設定されているか確認
gh workflow run collect-review-knowledge.yml \
  --field pr_url=https://github.com/$YOUR_ORG/test-repo/pull/1
```

---

### 1.4 各リポジトリへのワークフロー配置

知見を収集したい各リポジトリに、トリガーワークフローを配置します。

#### 1.4.1 スクリプトで自動配布（推奨）

`scripts/distribute-workflow.sh` を使用して、Organization配下の全リポジトリに一括配布できます。

**基本的な使い方**:
```bash
cd $REVIEW_DOJO_MCP
./scripts/distribute-workflow.sh $YOUR_ORG
```

**dry-runで確認**:
```bash
./scripts/distribute-workflow.sh --dry-run $YOUR_ORG
```

**特定のリポジトリのみ配布**:
```bash
./scripts/distribute-workflow.sh --repos "repo1,repo2,repo3" $YOUR_ORG
```

**除外リポジトリを指定**:
```bash
./scripts/distribute-workflow.sh --exclude "private-repo,test-repo" $YOUR_ORG
```

**Secrets設定とワークフロー配布を一度に実行**:
```bash
./scripts/distribute-workflow.sh --setup-secrets --org-secrets $YOUR_ORG
# Secrets設定後、「ワークフロー配布に進みますか？」と確認される
```

**knowledge-repoへのワークフロー配布**:
```bash
# knowledge-repo に collect-review-knowledge.yml を配布
./scripts/distribute-workflow.sh --setup-knowledge-repo $YOUR_ORG

# knowledge-repo名をカスタマイズする場合
./scripts/distribute-workflow.sh --setup-knowledge-repo --knowledge-repo my-knowledge-repo $YOUR_ORG
```

**実行結果**:
- 各リポジトリに新しいブランチ (`add-knowledge-trigger`) を作成
- ワークフローファイルを追加
- PRを自動作成（mainブランチへの直接pushはしない）

**利用可能なオプション**:

| オプション | 説明 |
|-----------|------|
| `--dry-run` | 実際には変更せず、対象リポジトリを表示 |
| `--repos <list>` | 特定のリポジトリのみを対象（カンマ区切り） |
| `--exclude <list>` | 除外するリポジトリ（カンマ区切り） |
| `--branch <name>` | 作成するブランチ名（デフォルト: add-knowledge-trigger） |
| `--force-delete` | 既存ブランチを確認なしで削除 |
| `--delay <seconds>` | 各リポジトリ処理後の待機時間（デフォルト: 2秒） |
| `--no-delay` | 待機時間なし（高速モード） |
| `--setup-knowledge-repo` | knowledge-repoへcollect-review-knowledge.ymlを配布 |
| `--knowledge-repo <name>` | knowledge-repoの名前を指定（デフォルト: review-dojo-knowledge） |

**注意事項**:
- スクリプトはmainブランチに直接pushせず、PRを作成します
- 既に `trigger-knowledge-collection.yml` が存在するリポジトリはスキップされます
- `review-dojo-knowledge` リポジトリは自動除外されます

#### 1.4.2 カスタマイズ箇所

`trigger-knowledge-collection.yml` の **21行目** を編集:

**変更前**:
```yaml
repository: sk8metalme/review-dojo-knowledge
```

**変更後**:
```yaml
repository: YOUR_ORG/YOUR_KNOWLEDGE_REPO
```

**例**:
```yaml
# acme 組織の場合
repository: acme/review-knowledge

# 個人アカウントの場合
repository: john-doe/my-review-knowledge
```

**完全な変更例**:
```yaml
name: Trigger Knowledge Collection

on:
  pull_request:
    types: [closed]

jobs:
  notify-knowledge-repo:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest

    steps:
      - name: Send repository dispatch to knowledge-repo
        env:
          PR_TITLE: ${{ github.event.pull_request.title }}
          MERGED_BY: ${{ github.event.pull_request.merged_by.login }}
        uses: peter-evans/repository-dispatch@v4
        with:
          token: ${{ secrets.ORG_GITHUB_TOKEN }}
          repository: acme/review-knowledge  # ← ここを変更
          event-type: pr-merged
          client-payload: |
            {
              "pr_url": "${{ github.event.pull_request.html_url }}",
              "repo_owner": "${{ github.repository_owner }}",
              "repo_name": "${{ github.event.repository.name }}",
              "pr_number": "${{ github.event.pull_request.number }}",
              "pr_title": ${{ toJSON(env.PR_TITLE) }},
              "merged_by": ${{ toJSON(env.MERGED_BY) }},
              "merged_at": "${{ github.event.pull_request.merged_at }}"
            }
```

#### 1.4.3 GitHub Actions 権限設定

対象リポジトリで以下の権限を設定:

`scripts/distribute-workflow.sh` を使用して自動設定できます。

```bash
# Organization でリポジトリ単位設定
./scripts/distribute-workflow.sh --setup-permissions $YOUR_ORG

# Organization で Org レベル設定（一括）
./scripts/distribute-workflow.sh --setup-permissions --org-permissions $YOUR_ORG

# 個人リポジトリで設定
./scripts/distribute-workflow.sh --setup-permissions YOUR_USERNAME

# dry-run で事前確認
./scripts/distribute-workflow.sh --setup-permissions --dry-run $YOUR_ORG

# Secretsと権限を一緒に設定
./scripts/distribute-workflow.sh --setup-secrets --setup-permissions \
  --org-secrets --org-permissions $YOUR_ORG
```

**Organization と個人利用の違い:**

| 項目 | Organization | 個人 |
|------|-------------|------|
| Org レベル設定 | 可能（`--org-permissions`） | 不可 |
| リポジトリ単位設定 | 可能 | 可能 |
| 必要スコープ (Org) | `admin:org` | - |
| 必要スコープ (Repo) | `repo` | `repo` |

---

### 1.5 動作確認

#### 1.5.1 テストPRの作成・マージ

1. 対象リポジトリでテスト用ブランチを作成
```bash
git checkout -b test/review-dojo-integration
echo "// Test file" > test.java
git add test.java
git commit -m "test: review-dojo integration"
git push origin test/review-dojo-integration
```

2. PRを作成
```bash
gh pr create --title "test: review-dojo integration" --body "Testing knowledge collection"
```

3. レビューコメントを追加（オプション）
```bash
gh pr comment --body "SQLインジェクション対策が必要です"
```

4. PRをマージ
```bash
gh pr merge --squash
```

#### 1.5.2 ワークフロー実行ログの確認

**トリガーワークフローの確認** (対象リポジトリ):
```bash
gh run list --workflow=trigger-knowledge-collection.yml
gh run view <run-id> --log
```

ログに以下が表示されていればOK:
```text
Dispatched knowledge collection for PR #X
```

**収集ワークフローの確認** (knowledge-repo):
```bash
cd $KNOWLEDGE_REPO
gh run list --workflow=collect-review-knowledge.yml
gh run view <run-id> --log
```

成功時のログ例:
```text
✓ Checkout knowledge repository
✓ Extract knowledge with Claude Code
✓ Apply knowledge to markdown files
✓ Commit and push changes
```

#### 1.5.3 知見ファイルの確認

knowledge-repo で知見が追加されているか確認:

```bash
cd $KNOWLEDGE_REPO
git pull origin main

# カテゴリ別ディレクトリを確認
ls -la security/ performance/ design/

# 知見ファイルの内容を確認
cat security/java.md
```

知見が追加されていれば、Phase 1 の導入完了です！

---

## Phase 2: MCPサーバーの導入

> **重要**: MCPサーバーは `review-dojo-mcp` リポジトリに含まれています。Phase 1で作成した `knowledge-repo` はmarkdownファイルのみで、MCPサーバーのコードは含まれていません。

### 2.1 review-dojo-mcp のクローンとビルド

#### 2.1.1 リポジトリのクローン

```bash
# 適切な場所にクローン（例: ~/projects/）
cd ~/projects
git clone https://github.com/sk8metalme/review-dojo-mcp.git
cd review-dojo-mcp
```

#### 2.1.2 ビルド

```bash
npm install
npm run build
```

#### 2.1.3 MCPサーバーの動作確認

```bash
# MCPサーバーが正常に起動するか確認
node dist/interfaces/mcp/McpServer.js --help 2>&1 | head -20
```

ビルド成功後、`dist/` ディレクトリにMCPサーバーのコードが生成されます。

### 2.2 Claude Code / VSCode 設定

#### 2.2.1 ユーザースコープ設定（推奨）

Claude Code を使用している場合、CLIで設定:

```bash
# 対話形式
claude mcp add

# 以下の情報を入力:
# - Server name: review-dojo
# - Transport: stdio
# - Command: node
# - Args: /absolute/path/to/review-dojo-mcp/dist/interfaces/mcp/McpServer.js
# - Scope: user (全プロジェクトで利用可能)
```

**または、ワンライナー**:
```bash
claude mcp add --transport stdio review-dojo --scope user \
  -- node /absolute/path/to/review-dojo-mcp/dist/interfaces/mcp/McpServer.js
```

**例** (絶対パスで指定):
```bash
claude mcp add --transport stdio review-dojo --scope user \
  -- node /Users/yourname/projects/review-dojo-mcp/dist/interfaces/mcp/McpServer.js
```

#### 2.2.2 手動設定

`~/.claude.json` に以下を追加:

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/absolute/path/to/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_GITHUB_REPO": "YOUR_ORG/YOUR_KNOWLEDGE_REPO"
      }
    }
  }
}
```

**重要**:
- パスは**絶対パス**で指定してください
- `REVIEW_DOJO_GITHUB_REPO` 環境変数で、Phase 1で作成したknowledge-repoを指定します

#### 2.2.3 設定の確認

```bash
# サーバー一覧を確認
claude mcp list

# review-dojo の詳細を確認
claude mcp get review-dojo
```

出力例:
```text
Name: review-dojo
Transport: stdio
Command: node
Args: ["/Users/you/projects/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"]
Scope: user
```

#### 2.2.4 Claude Code / VSCode の再起動

設定を反映するため、Claude Code / VSCode を再起動してください。

### 2.3 知見アクセスモードの設定

MCPサーバーが Phase 1 で作成した knowledge-repo の知見を参照するように設定します。

#### 2.3.1 アクセスモードの種類

review-dojo-mcp は複数の知見アクセスモードをサポートしています：

| モード | 環境変数 | 用途 | 推奨度 |
|--------|---------|------|--------|
| **リモートモード** | `REVIEW_DOJO_GITHUB_REPO` | GitHub経由で知見を取得 | ⭐ 推奨 |
| **ローカルモード** | `REVIEW_DOJO_KNOWLEDGE_DIR` | ローカルの知見ディレクトリを参照 | オフライン時 |
| **デフォルトモード** | 設定なし | review-dojo-mcp リポジトリ自体のサンプル知見を参照 | テスト用 |

#### 2.3.2 環境変数一覧

| 環境変数 | 説明 | 例 |
|---------|------|-----|
| `REVIEW_DOJO_GITHUB_REPO` | GitHub知見リポジトリ | `acme/review-knowledge` |
| `REVIEW_DOJO_KNOWLEDGE_DIR` | ローカル知見ディレクトリ | `/home/user/knowledge` |
| `GITHUB_TOKEN` | プライベートリポジトリ用トークン | `ghp_xxxx` |

**優先順位**: `REVIEW_DOJO_GITHUB_REPO` → `REVIEW_DOJO_KNOWLEDGE_DIR` → デフォルト

#### 2.3.3 リモートモード設定（推奨）

Phase 1で作成した knowledge-repo をGitHub経由で参照します。

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/absolute/path/to/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_GITHUB_REPO": "YOUR_ORG/YOUR_KNOWLEDGE_REPO"
      }
    }
  }
}
```

**設定例**:
```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/Users/yourname/projects/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_GITHUB_REPO": "acme/review-knowledge"
      }
    }
  }
}
```

**メリット**:
- knowledge-repo をローカルにクローンする必要がない
- 常に最新の知見を取得
- チームメンバー全員が同じ設定を使用可能

**デメリット**:
- ネットワーク接続が必要
- GitHub API 制限（5000回/時間、通常は十分）

#### 2.3.4 ローカルモード設定

knowledge-repo をローカルにクローンして参照します。

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/absolute/path/to/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_KNOWLEDGE_DIR": "/absolute/path/to/your-knowledge-repo"
      }
    }
  }
}
```

**設定例**:
```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/Users/yourname/projects/review-dojo-mcp/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_KNOWLEDGE_DIR": "/Users/yourname/projects/acme-review-knowledge"
      }
    }
  }
}
```

**メリット**:
- オフライン動作
- API制限なし
- 高速アクセス

**デメリット**:
- knowledge-repo をローカルにクローンする必要がある
- 知見更新に `git pull` が必要

### 2.4 MCPサーバーの使用

#### 2.4.1 基本的な使用方法

Claude Code で以下のように質問:

```text
Javaのセキュリティに関する知見を検索して
```

Claude Codeが自動的にMCPサーバーの `search_knowledge` ツールを呼び出し、関連知見を提示します。

#### 2.4.2 利用可能なツール

| ツール | 用途 | 例 |
|--------|------|-----|
| `search_knowledge` | 条件で知見を検索 | "SQLに関する知見を探して" |
| `get_knowledge_detail` | 知見の詳細を取得 | "security/java/SQLインジェクション対策の詳細を見せて" |
| `generate_pr_checklist` | 変更ファイルから関連知見をチェックリスト化 | "UserDao.javaの変更に関連するチェックリストを生成" |
| `list_categories` | カテゴリ一覧を取得 | "どんなカテゴリがある？" |
| `list_languages` | 言語一覧を取得 | "対応している言語は？" |

#### 2.4.3 検索クエリの例

```text
# カテゴリで絞り込み
セキュリティカテゴリのJavaに関する知見を全て見せて

# 重要度で絞り込み
criticalレベルのNode.jsの知見を検索

# ファイル名で絞り込み
UserService.tsに関連する知見をリストして

# 複合条件
パフォーマンスに関するcritical〜warningレベルの知見を、Java言語で検索
```

### 2.5 チームメンバーへの展開方法

#### 2.5.1 ドキュメントの作成

チーム向けのセットアップガイドを作成:

```markdown
# review-dojo MCPサーバー セットアップ

## 前提条件
- Claude Code または VSCode with Claude拡張機能
- Node.js 20以上

## セットアップ手順

1. **review-dojo-mcp をクローン**
   \`\`\`bash
   cd ~/projects
   git clone https://github.com/sk8metalme/review-dojo-mcp.git
   cd review-dojo-mcp
   npm install
   npm run build
   \`\`\`

2. **MCPサーバーを設定**
   \`\`\`bash
   # リモートモード（推奨）
   claude mcp add --transport stdio review-dojo --scope user \\
     -- node $(pwd)/dist/interfaces/mcp/McpServer.js

   # 設定ファイルを編集して環境変数を追加
   # ~/.claude.json に以下を追加:
   # "env": {
   #   "REVIEW_DOJO_GITHUB_REPO": "YOUR_ORG/YOUR_KNOWLEDGE_REPO"
   # }
   \`\`\`

3. **Claude Code を再起動**

4. **動作確認**
   Claude Code で「Javaのセキュリティに関する知見を検索して」と質問
```

#### 2.5.2 自動セットアップスクリプト（オプション）

`scripts/setup-mcp.sh` を review-dojo-mcp リポジトリに作成:

```bash
#!/bin/bash
set -e

echo "review-dojo MCPサーバーをセットアップします..."

# review-dojo-mcp をビルド
npm install
npm run build

# MCP設定（リモートモード）
REPO_PATH=$(pwd)
claude mcp add --transport stdio review-dojo --scope user \
  -- node "$REPO_PATH/dist/interfaces/mcp/McpServer.js"

echo ""
echo "✅ セットアップ完了！"
echo ""
echo "次のステップ:"
echo "1. ~/.claude.json を編集"
echo "2. review-dojoサーバーの env セクションに以下を追加:"
echo "   \"REVIEW_DOJO_GITHUB_REPO\": \"YOUR_ORG/YOUR_KNOWLEDGE_REPO\""
echo "3. Claude Code を再起動"
```

チームメンバーは review-dojo-mcp リポジトリで以下を実行:
```bash
./scripts/setup-mcp.sh
```

---

## Phase 3: CI/CD連携

### 3.1 GitHub Actions (check-knowledge.yml)

#### 3.1.1 Reusable workflow の使用

対象リポジトリの `.github/workflows/check-knowledge.yml` を作成:

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
      ORG_GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**カスタマイズ箇所**:
- `YOUR_ORG/YOUR_KNOWLEDGE_REPO`: 自組織のknowledge-repoに変更
- `knowledge_branch`: デフォルトブランチが`main`でない場合は変更

#### 3.1.2 プライベートリポジトリからの参照設定

knowledge-repoがprivateリポジトリの場合:

1. Settings → Actions → General → Access
2. 「Accessible from repositories in the 'YOUR_ORG' organization」を選択

または:

```yaml
# 別の方法: secrets.GITHUB_TOKENの代わりにORG_GITHUB_TOKENを使用
jobs:
  check-knowledge:
    uses: YOUR_ORG/YOUR_KNOWLEDGE_REPO/.github/workflows/check-knowledge.yml@main
    with:
      knowledge_repo: 'YOUR_ORG/YOUR_KNOWLEDGE_REPO'
      knowledge_branch: 'main'
    secrets:
      ORG_GITHUB_TOKEN: ${{ secrets.ORG_GITHUB_TOKEN }}
```

#### 3.1.3 動作確認

1. 対象リポジトリでPRを作成
2. GitHub Actions ログを確認
3. PRコメントが投稿されることを確認

PRコメント例:
```markdown
## :clipboard: Review Knowledge Checklist

Based on the changed files, here are relevant review points from past PRs:

### Summary
- **対象言語**: java
- **チェック項目数**: 2件
- **重要**: 1件 | **警告**: 1件

---

### :rotating_light: Critical

#### 1. SQLインジェクション対策
- [ ] PreparedStatementを使用していますか？

<details>
<summary>Details</summary>

- **Category**: security
- **Knowledge ID**: `security/java/sqlインジェクション対策`

</details>
```

### 3.2 Screwdriver CI/CD

#### 3.2.1 screwdriver.yaml の設定

```yaml
shared:
  image: node:20-slim
  environment:
    KNOWLEDGE_REPO: YOUR_ORG/YOUR_KNOWLEDGE_REPO
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
            CHANGED_FILES=$(gh pr view $SD_PULL_REQUEST --json files -q '.files[].path' | tr '\n' ',')
          else
            CHANGED_FILES=$(git diff --name-only HEAD~1 | tr '\n' ',')
          fi

          FILTERED_FILES=$(echo "$CHANGED_FILES" | tr ',' '\n' | \
            grep -E '\.(java|js|ts|jsx|tsx|py|go|php|rb|rs)$' | \
            tr '\n' ',')

          meta set changed_files "$FILTERED_FILES"

      - clone-review-dojo-mcp: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ]; then
            echo "No relevant source files changed."
            exit 0
          fi

          # review-dojo-mcp（MCPサーバー/check機能）をクローン
          git clone --depth 1 https://github.com/sk8metalme/review-dojo-mcp.git mcp-repo
          cd mcp-repo
          npm ci
          npm run build
          cd ..

      - generate-checklist: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ]; then
            exit 0
          fi

          cd mcp-repo
          # 環境変数でknowledge-repoを指定してcheck実行
          REVIEW_DOJO_GITHUB_REPO=$KNOWLEDGE_REPO \
          node dist/index.js check \
            --files "$CHANGED_FILES" \
            --format markdown \
            --include-empty > ../checklist.md

      - post-pr-comment: |
          CHANGED_FILES=$(meta get changed_files)
          if [ -z "$CHANGED_FILES" ] || [ -z "$SD_PULL_REQUEST" ]; then
            exit 0
          fi

          gh pr comment $SD_PULL_REQUEST --body-file ../checklist.md

    secrets:
      - GITHUB_TOKEN
```

**変更点**:
- `clone-knowledge-repo` → `clone-review-dojo-mcp`: review-dojo-mcpリポジトリをクローン
- `generate-checklist`: 環境変数 `REVIEW_DOJO_GITHUB_REPO` でknowledge-repoを指定

#### 3.2.2 必要な環境変数

Screwdriver の Settings → Secrets で設定:

| Secret | 説明 |
|--------|------|
| `GITHUB_TOKEN` | GitHub APIアクセス用トークン（repo, read:org権限） |

---

## セキュリティ考慮事項

### Token のスコープ設定

| Token | 権限 |
|-------|------|
| `ORG_GITHUB_TOKEN` | **全Organization内リポジトリに適用**:<br>`Pull requests`: **Read and write**<br>`Contents`: **Read and write**<br>`Actions`: Read and write<br>`Workflows`: Read and write |
| `ANTHROPIC_API_KEY` | 必要に応じてAPI使用量制限を設定 |

**重要**: Fine-grained PATの「All repositories」モードでは、選択した全リポジトリに同じ権限が適用されます。knowledge-repoのみに書き込み権限を限定することはできません。

**セキュリティ強化の推奨事項**:
- ✅ **ブランチ保護ルール**を全リポジトリに設定してmainブランチへの直接pushを防止
- ✅ **CODEOWNERS**ファイルを設定してコードレビューを必須化
- ✅ トークンの**有効期限を90日以内**に設定し、定期的にローテーション
- ⚠️ より厳格なセキュリティが必要な場合は、2トークン方式（読み取り専用+書き込み専用）の使用を検討

### Private リポジトリの除外設定

collect-review-knowledge.yml はデフォルトでprivateリポジトリをスキップします。

動作確認:
```bash
# ログに以下が表示されることを確認
Private repository detected, skipping knowledge collection
```

### 機密情報のマスク

review-dojoは以下のパターンを自動的にマスク:
- APIキー（20文字以上の英数字）
- AWS認証情報（`AKIA...`）
- Bearer token
- パスワード（`password=...`）

ログで以下のように表示されます:
```text
[MASKED: API_KEY]
```

---

## 導入チェックリスト

### Phase 1: 知見収集
- [ ] knowledge-repo リポジトリを作成（空のリポジトリ + カテゴリディレクトリ）
- [ ] knowledge-repo に collect-review-knowledge.yml を配置
- [ ] GitHub Secrets を設定（ANTHROPIC_API_KEY, ORG_GITHUB_TOKEN）
- [ ] 対象リポジトリに trigger-knowledge-collection.yml を配置
- [ ] trigger-knowledge-collection.yml の repository を自組織に変更
- [ ] GitHub Actions 権限を設定（Read and write permissions）
- [ ] テストPRで動作確認
- [ ] knowledge-repo に知見が追加されることを確認

### Phase 2: MCPサーバー
- [ ] review-dojo-mcp をクローン & ビルド（npm install && npm run build）
- [ ] MCPサーバーを設定（claude mcp add）
- [ ] 環境変数 REVIEW_DOJO_GITHUB_REPO を設定
- [ ] Claude Code / VSCode を再起動
- [ ] 知見検索が動作することを確認
- [ ] チーム向けセットアップガイドを作成（オプション）

### Phase 3: CI/CD連携
- [ ] 対象リポジトリに check-knowledge.yml を配置
- [ ] ワークフローの `YOUR_ORG/YOUR_KNOWLEDGE_REPO` を変更
- [ ] テストPRで動作確認
- [ ] PRコメントが投稿されることを確認
- [ ] （Screwdriver使用時）screwdriver.yaml を設定

---

## トラブルシューティング

問題が発生した場合は、[トラブルシューティングガイド](troubleshooting.md)を参照してください。

## サポート

- [GitHub Issues](https://github.com/sk8metalme/review-dojo-mcp/issues)
- [README.md](../README.md)（詳細な機能説明）
