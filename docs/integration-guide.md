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

## Phase 1: 知見収集システムの導入

### 導入方法の選択

review-dojoの知見収集システムには2つの導入方法があります：

| 方法 | 概要 | メリット | デメリット |
|------|------|---------|-----------|
| **GitHub Action** (推奨) | review-dojo-actionを使用 | ・知見データのみ管理<br>・ビルド不要<br>・高速実行 | ・v1.0.0以降が必要 |
| **フォーク方式** (非推奨・レガシー) | review-dojoを丸ごとフォーク | ・（apply機能は削除されました）<br>・MCP/check機能のみ | ・ビルドが必要<br>・ソースコード含む |

**推奨**: 新規導入の場合は **GitHub Action方式** をご利用ください。

> **Note**: review-dojoのapply機能はv2.3.0で[review-dojo-action](https://github.com/sk8metalme/review-dojo-action)に移管されました。フォーク方式はMCP ServerとCI/CDチェック機能のみを提供します。

#### GitHub Action方式のセットアップ

**1. 知見リポジトリを作成**

空のリポジトリを作成し、カテゴリディレクトリのみ初期化します：

```bash
# 新規リポジトリを作成（GitHub UI または gh CLI）
gh repo create YOUR_ORG/YOUR_KNOWLEDGE_REPO --public

# クローンとディレクトリ作成
git clone https://github.com/YOUR_ORG/YOUR_KNOWLEDGE_REPO.git
cd YOUR_KNOWLEDGE_REPO

# カテゴリディレクトリを作成
mkdir -p security performance readability design testing error-handling other archive

# 初期化
git add .
git commit -m "chore: Initialize knowledge repository structure"
git push origin main
```

**2. 知見収集ワークフローを配置**

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
          token: ${{ secrets.KNOWLEDGE_REPO_TOKEN || secrets.GITHUB_TOKEN }}
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
        uses: sk8metalme/review-dojo-action@v1
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

**3. GitHub Secretsの設定**

[1.2 GitHub Secrets の設定](#12-github-secrets-の設定) に進んでください。

**4. 各リポジトリへのトリガー配置**

[1.3 各リポジトリへのワークフロー配置](#13-各リポジトリへのワークフロー配置) に進んでください。

**メリット**:
- 知見データ（markdownファイル）のみを管理
- `npm install`, `npm run build` が不要
- ワークフロー実行時間が短縮（約30秒削減）
- ソースコード管理不要

**次のセクションへ**: GitHub Action方式を選択した場合、[1.2 GitHub Secrets の設定](#12-github-secrets-の設定) に進んでください。

---

### 1.1 knowledge-repo のフォーク・セットアップ（フォーク方式）

> **注意**: この方式は既存ユーザー向けです。新規導入の場合は上記の「GitHub Action方式」を推奨します。

#### 1.1.1 リポジトリのフォークまたはクローン

review-dojoリポジトリをフォークまたはクローンして、自組織の知見リポジトリとして使用します。

##### 方法A: GitHub UIでフォーク（推奨）
1. [review-dojoリポジトリ](https://github.com/sk8metalme/review-dojo) にアクセス
2. 「Fork」ボタンをクリック
3. Organization を選択
4. リポジトリ名を決定（例: `review-dojo`, `review-knowledge`, `pr-knowledge`）

##### 方法B: クローンして新規リポジトリ作成
```bash
# クローン
git clone https://github.com/sk8metalme/review-dojo.git
cd review-dojo

# リモートURLを変更
git remote set-url origin https://github.com/YOUR_ORG/YOUR_KNOWLEDGE_REPO.git
git push -u origin main
```

#### 1.1.2 リポジトリ名の決定

以下のような命名規則を推奨します：
- `{org-name}-review-knowledge`
- `{org-name}-review-dojo`
- `pr-knowledge`（シンプル）

**例**:
- `acme-review-knowledge`
- `engineering-pr-knowledge`

#### 1.1.3 セットアップ

```bash
cd your-knowledge-repo
npm install
npm run build
npm test  # すべてのテストがパスすることを確認
```

---

### 1.2 GitHub Secrets の設定

#### 1.2.1 必要なSecrets一覧

| Secret名 | スコープ | 用途 | 必要な権限 |
|----------|----------|------|-----------|
| `ANTHROPIC_API_KEY` | Organization | Claude API呼び出し | N/A |
| `ORG_GITHUB_TOKEN` | Organization | org内リポジトリのPR情報取得 | `repo`, `read:org` |
| `KNOWLEDGE_REPO_TOKEN` | Organization | knowledge-repoへのpush | `repo` (Contents: Write) |

#### 1.2.2 Personal Access Token (PAT) の作成手順

**ORG_GITHUB_TOKEN の作成**:

1. GitHub Settings → Developer settings → Personal access tokens → **Fine-grained tokens** (推奨)
2. 「Generate new token」をクリック
3. 以下を設定:
   - **Token name**: `review-dojo-org-github-token`
   - **Expiration**: 90 days（定期的な更新を推奨）
   - **Resource owner**: Your Organization
   - **Repository access**: All repositories（または対象リポジトリのみ）
   - **Permissions**:
     - Repository permissions:
       - `Contents`: Read-only
       - `Pull requests`: Read-only
       - `Metadata`: Read-only（自動付与）
     - Organization permissions:
       - `Members`: Read-only
4. 「Generate token」をクリック
5. トークンをコピー（一度しか表示されません）

**KNOWLEDGE_REPO_TOKEN の作成**:

1. 同様の手順で新しいトークンを作成
2. 以下を設定:
   - **Token name**: `review-dojo-knowledge-repo-token`
   - **Repository access**: Only select repositories → `your-knowledge-repo` を選択
   - **Permissions**:
     - Repository permissions:
       - `Contents`: Read and write
       - `Workflows`: Read and write
       - `Metadata`: Read-only（自動付与）
3. 「Generate token」をクリック

**セキュリティのベストプラクティス**:
- トークンは最小限の権限のみ付与
- 有効期限を設定（90日を推奨）
- 定期的にローテーション
- 使用しなくなったトークンは即座に削除

#### 1.2.3 Organization Secrets への登録手順

1. Organization Settings → Secrets and variables → Actions
2. 「New organization secret」をクリック
3. 各Secretを追加:

**ANTHROPIC_API_KEY**:
```text
Name: ANTHROPIC_API_KEY
Secret: sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxx
Repository access: All repositories (または Selected repositories)
```

**ORG_GITHUB_TOKEN**:
```text
Name: ORG_GITHUB_TOKEN
Secret: （作成したPATを貼り付け）
Repository access: All repositories
```

**KNOWLEDGE_REPO_TOKEN**:
```text
Name: KNOWLEDGE_REPO_TOKEN
Secret: （作成したPATを貼り付け）
Repository access: All repositories
```

#### 1.2.4 Secrets の動作確認

```bash
# knowledge-repo のリポジトリで
# GitHub Actions のワークフローを手動実行してSecretsが正しく設定されているか確認
gh workflow run collect-review-knowledge.yml \
  --field pr_url=https://github.com/YOUR_ORG/test-repo/pull/1
```

---

### 1.3 各リポジトリへのワークフロー配置

#### 1.3.1 trigger-knowledge-collection.yml のコピー

知見を収集したい各リポジトリに、トリガーワークフローを配置します。

**ステップ**:
1. 対象リポジトリのローカルクローンを作成
2. `.github/workflows/` ディレクトリを作成（存在しない場合）
3. `trigger-knowledge-collection.yml` をコピー

```bash
# knowledge-repo から対象リポジトリへコピー
cd /path/to/target-repo
mkdir -p .github/workflows
cp /path/to/knowledge-repo/.github/workflows/trigger-knowledge-collection.yml \
   .github/workflows/
```

#### 1.3.2 カスタマイズ箇所

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
        uses: peter-evans/repository-dispatch@v2
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
              "pr_title": "${{ github.event.pull_request.title }}",
              "merged_by": "${{ github.event.pull_request.merged_by.login }}",
              "merged_at": "${{ github.event.pull_request.merged_at }}"
            }
```

#### 1.3.3 GitHub Actions 権限設定

対象リポジトリで以下の権限を設定:

1. Settings → Actions → General → Workflow permissions
2. 以下を選択:
   - ✅ **Read and write permissions**
   - ✅ **Allow GitHub Actions to create and approve pull requests**

これにより、ワークフローが `repository_dispatch` イベントを送信できるようになります。

#### 1.3.4 変更をコミット・プッシュ

```bash
git add .github/workflows/trigger-knowledge-collection.yml
git commit -m "feat: Add review-dojo knowledge collection trigger"
git push origin main
```

---

### 1.4 動作確認

#### 1.4.1 テストPRの作成・マージ

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

#### 1.4.2 ワークフロー実行ログの確認

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
cd /path/to/knowledge-repo
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

#### 1.4.3 知見ファイルの確認

knowledge-repo で知見が追加されているか確認:

```bash
cd /path/to/knowledge-repo
git pull origin main

# カテゴリ別ディレクトリを確認
ls -la security/ performance/ design/

# 知見ファイルの内容を確認
cat security/java.md
```

知見が追加されていれば、Phase 1 の導入完了です！

---

## Phase 2: MCPサーバーの導入

### 2.1 ビルドとセットアップ

#### 2.1.1 knowledge-repo のビルド

```bash
cd /path/to/knowledge-repo
npm install
npm run build
```

#### 2.1.2 MCPサーバーの動作確認

```bash
# MCPサーバーが正常に起動するか確認
node dist/interfaces/mcp/McpServer.js --help 2>&1 | head -20
```

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
# - Args: /absolute/path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js
# - Scope: user (全プロジェクトで利用可能)
```

**または、ワンライナー**:
```bash
claude mcp add --transport stdio review-dojo --scope user \
  -- node /absolute/path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js
```

#### 2.2.2 手動設定

`~/.claude.json` に以下を追加:

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/absolute/path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js"],
      "env": {}
    }
  }
}
```

**注意**: パスは絶対パスで指定してください。

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
Args: ["/Users/you/knowledge-repo/dist/interfaces/mcp/McpServer.js"]
Scope: user
```

#### 2.2.4 Claude Code / VSCode の再起動

設定を反映するため、Claude Code / VSCode を再起動してください。

### 2.3 知見アクセスモードの設定

#### 2.3.1 アクセスモードの種類

review-dojoは複数の知見アクセスモードをサポートしています：

| モード | 環境変数 | 用途 |
|--------|---------|------|
| **リモートモード** | `REVIEW_DOJO_GITHUB_REPO` | GitHub経由で知見を取得 |
| **ローカルモード** | `REVIEW_DOJO_KNOWLEDGE_DIR` | ローカルの知見ディレクトリを参照 |
| **デフォルトモード** | 設定なし | review-dojoリポジトリ自体の知見を参照 |

#### 2.3.2 環境変数一覧

| 環境変数 | 説明 | 例 |
|---------|------|-----|
| `REVIEW_DOJO_GITHUB_REPO` | GitHub知見リポジトリ | `acme/review-knowledge` |
| `REVIEW_DOJO_KNOWLEDGE_DIR` | ローカル知見ディレクトリ | `/home/user/knowledge` |
| `GITHUB_TOKEN` | プライベートリポジトリ用トークン | `ghp_xxxx` |

**優先順位**: `REVIEW_DOJO_GITHUB_REPO` → `REVIEW_DOJO_KNOWLEDGE_DIR` → デフォルト

#### 2.3.3 リモートモード設定（推奨）

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

**メリット**: 知見リポジトリのクローン不要、常に最新

**デメリット**: ネットワーク必須、API制限（5000回/時間）

#### 2.3.4 ローカルモード設定

```json
{
  "mcpServers": {
    "review-dojo": {
      "command": "node",
      "args": ["/path/to/review-dojo/dist/interfaces/mcp/McpServer.js"],
      "env": {
        "REVIEW_DOJO_KNOWLEDGE_DIR": "/Users/you/knowledge-repo"
      }
    }
  }
}
```

**メリット**: オフライン動作、API制限なし、高速

**デメリット**: 知見更新に `git pull` が必要

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
| `list_categories` | カテゴリ一覧を取得 | "どんなカテゴリがある？" |
| `list_languages` | 言語一覧を取得 | "対応している言語は？" |
| `suggest_for_file` | ファイルに関連する知見を提案 | "UserDao.javaに関連する知見は？" |

#### 2.3.3 検索クエリの例

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

### 2.4 チームメンバーへの展開方法

#### 2.4.1 ドキュメントの作成

チーム向けのセットアップガイドを作成:

```markdown
# review-dojo MCPサーバー セットアップ

## 前提条件
- Claude Code または VSCode with Claude拡張機能
- Node.js 20以上

## セットアップ手順

1. knowledge-repoをクローン
   \`\`\`bash
   git clone https://github.com/YOUR_ORG/YOUR_KNOWLEDGE_REPO.git
   cd YOUR_KNOWLEDGE_REPO
   npm install
   npm run build
   \`\`\`

2. MCPサーバーを設定
   \`\`\`bash
   claude mcp add --transport stdio review-dojo --scope user \\
     -- node $(pwd)/dist/interfaces/mcp/McpServer.js
   \`\`\`

3. Claude Code を再起動

4. 動作確認
   Claude Code で「Javaのセキュリティに関する知見を検索して」と質問
```

#### 2.4.2 自動セットアップスクリプト（オプション）

`scripts/setup-mcp.sh` を作成:

```bash
#!/bin/bash
set -e

echo "review-dojo MCPサーバーをセットアップします..."

# ビルド
npm install
npm run build

# MCP設定
REPO_PATH=$(pwd)
claude mcp add --transport stdio review-dojo --scope user \
  -- node "$REPO_PATH/dist/interfaces/mcp/McpServer.js"

echo "✅ セットアップ完了！Claude Codeを再起動してください。"
```

チームメンバーは以下を実行するだけ:
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
      KNOWLEDGE_REPO_TOKEN: ${{ secrets.GITHUB_TOKEN }}
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
      KNOWLEDGE_REPO_TOKEN: ${{ secrets.ORG_GITHUB_TOKEN }}
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

          gh pr comment $SD_PULL_REQUEST --body-file ../checklist.md

    secrets:
      - GITHUB_TOKEN
```

#### 3.2.2 必要な環境変数

Screwdriver の Settings → Secrets で設定:

| Secret | 説明 |
|--------|------|
| `GITHUB_TOKEN` | GitHub APIアクセス用トークン（repo, read:org権限） |

---

## セキュリティ考慮事項

### Token のスコープ最小化

| Token | 最小権限 |
|-------|---------|
| `ORG_GITHUB_TOKEN` | `repo`（read-only）, `read:org` |
| `KNOWLEDGE_REPO_TOKEN` | `repo`（write to knowledge-repo only） |
| `ANTHROPIC_API_KEY` | 必要に応じてAPI使用量制限を設定 |

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
- [ ] knowledge-repo をフォーク・セットアップ
- [ ] GitHub Secrets を設定（ANTHROPIC_API_KEY, ORG_GITHUB_TOKEN, KNOWLEDGE_REPO_TOKEN）
- [ ] 対象リポジトリに trigger-knowledge-collection.yml を配置
- [ ] trigger-knowledge-collection.yml の21行目を自組織に変更
- [ ] GitHub Actions 権限を設定（Read and write permissions）
- [ ] テストPRで動作確認
- [ ] knowledge-repo に知見が追加されることを確認

### Phase 2: MCPサーバー
- [ ] knowledge-repo をビルド（npm run build）
- [ ] MCPサーバーを設定（claude mcp add）
- [ ] Claude Code / VSCode を再起動
- [ ] 知見検索が動作することを確認
- [ ] チーム向けセットアップガイドを作成

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

- [GitHub Issues](https://github.com/sk8metalme/review-dojo/issues)
- [README.md](../README.md)（詳細な機能説明）
