# トラブルシューティング

このガイドでは、review-dojo使用時によくある問題と解決方法を説明します。

## 診断フローチャート

```text
問題発生
├── 知見が収集されない → [収集系トラブル](#収集系トラブル)
├── PRコメントが投稿されない → [CI/CD系トラブル](#cicd系トラブル)
├── MCPサーバーが動かない → [MCP系トラブル](#mcp系トラブル)
├── ビルド・テストが失敗する → [ビルド系トラブル](#ビルド系トラブル)
└── その他 → [一般的な問題](#一般的な問題)
```

---

## 収集系トラブル

### 症状: PRマージしても知見が収集されない

#### チェック1: ワークフローが起動しているか

**確認方法**:
```bash
# 対象リポジトリで
gh run list --workflow=trigger-knowledge-collection.yml --limit 5
```

**期待される出力**:
```text
✓ Trigger Knowledge Collection    main  PR #123  success
```

**出力がない場合**:
- ワークフローファイルが正しく配置されているか確認
```bash
cat .github/workflows/trigger-knowledge-collection.yml
```
- ワークフローの構文エラーがないか確認
```bash
# GitHub Actions タブでエラーを確認
```

#### チェック2: repository_dispatch が送信されているか

**確認方法**:
```bash
# trigger-knowledge-collection.yml のログを確認
gh run view <run-id> --log
```

**期待される出力**:
```text
Run peter-evans/repository-dispatch@v4
✓ Dispatched knowledge collection for PR #123
```

**エラーパターン1**: `Resource not accessible by integration`
- **原因**: `ORG_GITHUB_TOKEN` の権限不足
- **解決策**: Personal Access Tokenの権限を確認
  - `repo` スコープが有効か
  - Organization Secretsに正しく設定されているか

**エラーパターン2**: `Bad credentials`
- **原因**: トークンの有効期限切れ
- **解決策**: 新しいPersonal Access Tokenを作成し、Secretsを更新

#### チェック3: knowledge-repo のワークフローが起動しているか

**確認方法**:
```bash
# knowledge-repo で
cd /path/to/knowledge-repo
gh run list --workflow=collect-review-knowledge.yml --limit 5
```

**期待される出力**:
```text
✓ Collect Review Knowledge    main  repository_dispatch  success
```

**出力がない場合**:
- `collect-review-knowledge.yml` が存在するか確認
- `repository_dispatch` イベントのトリガー設定を確認
```yaml
on:
  repository_dispatch:
    types: [pr-merged]  # ← この設定が必要
```

#### チェック4: Secret が正しく設定されているか

**確認方法**:
```bash
# Organization Settings → Secrets and variables → Actions
# 以下のSecretsが存在することを確認:
# - ANTHROPIC_API_KEY
# - ORG_GITHUB_TOKEN
```

**よくあるミス**:
- Token の有効期限切れ
- 権限スコープ不足
- Secret名のタイポ（`GITHUB_ORG_TOKEN` ではなく `ORG_GITHUB_TOKEN`）
- Repository accessが適切に設定されていない
- knowledge-repoへの書き込み権限が不足

**解決策**:
1. Personal Access Tokenを再作成
2. 必要な権限を確認:
   - `ORG_GITHUB_TOKEN`（**全Organization内リポジトリに適用**）:
     - `Pull requests`: **Read and write**（コメント投稿に必要）
     - `Contents`: **Read and write**
     - `Actions`: Read and write
     - `Workflows`: Read and write
   - ⚠️ 注意: Fine-grained PATで「All repositories」を選択すると、全リポジトリに同じ権限が適用されます
3. Organization Secretsを更新

#### チェック5: Claude API が正常に動作しているか

**確認方法**:
```bash
# collect-review-knowledge.yml のログで以下を確認
gh run view <run-id> --log | grep -i "claude\|anthropic"
```

**エラーパターン1**: `Invalid API key`
- **原因**: `ANTHROPIC_API_KEY` が無効または期限切れ
- **解決策**: Anthropic Console で新しいAPI Keyを作成し、Secretsを更新

**エラーパターン2**: `Rate limit exceeded`
- **原因**: API使用量制限に達した
- **解決策**:
  - API使用量を確認（Anthropic Console）
  - プランをアップグレード
  - 収集頻度を調整

### 症状: 「Private repository detected」で収集がスキップされる

**ログ例**:
```text
Private repository detected, skipping knowledge collection
```

**原因**:
- これは仕様です。デフォルトでprivateリポジトリは収集対象外です
- 機密情報の漏洩を防ぐための安全策

**対処法**:

**方法A**: リポジトリをpublicに変更
```bash
# Settings → Danger Zone → Change repository visibility
```

**方法B**: private対応版にカスタマイズ（自己責任）
1. `collect-review-knowledge.yml` のprivateチェックを無効化
2. 機密情報マスク機能を強化
3. アクセス制御を厳格化

### 症状: 「No resolved threads」でスキップされる

**ログ例**:
```text
No resolved review threads found. Skipping knowledge extraction.
```

**原因**:
- PRにresolvedされたレビューコメントが存在しない
- これは仕様です。resolvedされたコメントのみが知見として収集されます

**対処法**:
1. PRでレビューコメントを追加
2. レビューコメントを「Resolve conversation」でresolveする
3. PRをマージ

**正しいワークフロー**:
```text
1. PR作成
2. レビュアーがコメント追加
3. 修正対応
4. レビュアーまたは作成者が「Resolve conversation」をクリック
5. PRマージ → 知見収集開始
```

### 症状: 知見が重複して追加される

**原因**:
- タイトル一致によるマージが機能していない
- 類似知見の判定ロジックが期待通りに動作していない

**確認方法**:
```bash
# 知見ファイルを確認
cat security/java.md | grep "^## "
```

**対処法**:
1. 手動で重複知見をマージ
```markdown
<!-- 重複した知見を1つにまとめる -->
## SQLインジェクション対策

- **重要度**: critical
- **発生回数**: 5  <!-- カウントを合算 -->
- **参照PR**:
  - https://github.com/org/repo/pull/123
  - https://github.com/org/repo/pull/456  <!-- 追加 -->
```

2. PRを作成して修正をknowledge-repoにコミット

---

## CI/CD系トラブル

### 症状: PRコメントが投稿されない

#### チェック1: ワークフローが実行されているか

**確認方法**:
```bash
# 対象リポジトリで
gh run list --workflow=check-knowledge.yml --limit 5
```

**期待される出力**:
```text
✓ Check Review Knowledge    PR #123  pull_request  success
```

**出力がない場合**:
- `check-knowledge.yml` が正しく配置されているか確認
- PRイベントでトリガーされる設定になっているか確認
```yaml
on:
  pull_request:
    types: [opened, synchronize, reopened]
```

#### チェック2: GITHUB_TOKEN の権限

**確認方法**:
```bash
# Settings → Actions → General → Workflow permissions
```

**必要な設定**:
- ✅ Read and write permissions
- ✅ Allow GitHub Actions to create and approve pull requests

**権限が不足している場合**:
```text
Error: Resource not accessible by integration
```

**解決策**:
1. Settings → Actions → General → Workflow permissions
2. 上記の2つにチェックを入れる
3. 「Save」をクリック

#### チェック3: reusable workflow の参照設定

**確認方法**:
```yaml
# check-knowledge.yml の内容を確認
jobs:
  check-knowledge:
    uses: YOUR_ORG/YOUR_KNOWLEDGE_REPO/.github/workflows/check-knowledge.yml@main
```

**よくあるミス**:
- `YOUR_ORG/YOUR_KNOWLEDGE_REPO` を変更し忘れ
- ブランチ名が間違っている（`@main` vs `@master`）
- knowledge-repoがprivateで、アクセス権限がない

**解決策**:
- 正しいリポジトリ名とブランチに修正
- privateリポジトリの場合、Settings → Actions → General → Access を設定

### 症状: 「knowledge-repo not found」エラー

**エラー例**:
```text
Error: Repository not found: YOUR_ORG/YOUR_KNOWLEDGE_REPO
```

**原因**:
- リポジトリ名が間違っている
- knowledge-repoがprivateで、トークンのアクセス権限がない

**解決策**:
```yaml
# check-knowledge.yml の with: セクションを確認
with:
  knowledge_repo: 'YOUR_ORG/YOUR_KNOWLEDGE_REPO'  # ← 正しいリポジトリ名に修正
  knowledge_branch: 'main'  # ← 正しいブランチ名に修正
```

### 症状: チェックリストが空で投稿される

**コメント例**:
```markdown
## :clipboard: Review Knowledge Checklist

:white_check_mark: No relevant knowledge items found for the changed files.
```

**原因**:
- 変更されたファイルに関連する知見がまだ蓄積されていない
- ファイルの言語・カテゴリが知見と一致していない

**対処法**:
1. knowledge-repoに知見が蓄積されているか確認
```bash
cd /path/to/knowledge-repo
ls -la security/ performance/ design/
```

2. 変更ファイルの拡張子が対象に含まれているか確認
```yaml
# check-knowledge.yml で対象ファイルを確認
files: |
  **/*.java
  **/*.js
  **/*.ts
  # ... 変更ファイルの拡張子が含まれているか？
```

3. 徐々に知見が蓄積されるのを待つ（正常動作）

---

## MCP系トラブル

### 症状: Claude Code で review-dojo ツールが表示されない

#### チェック1: MCPサーバーが設定されているか

**確認方法**:
```bash
claude mcp list
```

**期待される出力**:
```text
Name: review-dojo
Transport: stdio
Command: node
Args: ["/path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js"]
```

**出力がない場合**:
- MCPサーバーを設定
```bash
claude mcp add --transport stdio review-dojo --scope user \
  -- node /path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js
```

#### チェック2: パスが正しいか

**確認方法**:
```bash
# 設定されているパスで実際にファイルが存在するか確認
ls -la /path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js
```

**ファイルが存在しない場合**:
```bash
# ビルドを実行
cd /path/to/knowledge-repo
npm run build

# ファイルが作成されたか確認
ls -la dist/interfaces/mcp/McpServer.js
```

**パスを修正する場合**:
```bash
# 古い設定を削除
claude mcp remove review-dojo

# 正しいパスで再設定
claude mcp add --transport stdio review-dojo --scope user \
  -- node /absolute/path/to/knowledge-repo/dist/interfaces/mcp/McpServer.js
```

#### チェック3: ビルドが完了しているか

**確認方法**:
```bash
cd /path/to/knowledge-repo
npm run build
```

**エラーが出る場合**:
```bash
# クリーンビルド
npm run clean
npm install
npm run build
```

#### チェック4: Claude Code を再起動したか

MCPサーバーの設定変更後は必ず再起動が必要です。

**手順**:
1. Claude Code を完全に終了
2. Claude Code を起動
3. `/mcp` コマンドでサーバー状態を確認

### 症状: 「search_knowledge returned empty」

**コメント例**:
```text
review-dojoで検索しましたが、該当する知見が見つかりませんでした。
```

**原因**:
- knowledge-repoに知見がまだ蓄積されていない
- 検索条件が厳しすぎる

**対処法**:

**1. 知見が蓄積されているか確認**:
```bash
cd /path/to/knowledge-repo
find . -name "*.md" -path "*/security/*" -o -path "*/performance/*"
```

**2. サンプルデータで動作確認**:
```text
# Claude Codeで質問
security/java.md ファイルに何か知見がありますか？
```

**3. より広い条件で検索**:
```text
# 条件を緩める
「Java」に関する知見を全て見せて
```

### 症状: MCPサーバーが起動しない

**エラー例**:
```text
Error: Cannot find module 'zod'
Error: Cannot find module '@modelcontextprotocol/sdk'
```

**原因**:
- 依存関係がインストールされていない
- Node.jsのバージョンが古い

**解決策**:
```bash
# Node.jsバージョン確認
node -v  # 20以上が必要

# 依存関係を再インストール
cd /path/to/knowledge-repo
rm -rf node_modules package-lock.json
npm install
npm run build
```

---

## ビルド系トラブル

### 症状: npm install が失敗する

#### Node.js バージョン確認

**確認方法**:
```bash
node -v
```

**必要なバージョン**: 20以上

**アップグレード方法**:
```bash
# nvm を使用している場合
nvm install 20
nvm use 20

# または、nodenvを使用している場合
nodenv install 20.10.0
nodenv global 20.10.0
```

### 症状: TypeScript ビルドエラー

**エラー例**:
```text
error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

**対処法**:
```bash
# クリーンビルド
npm run clean
rm -rf node_modules package-lock.json
npm install
npm run build
```

### 症状: テストが失敗する

**エラー例**:
```text
FAIL src/domain/entities/KnowledgeItem.test.ts
 ● KnowledgeItem › should create valid knowledge item

   Expected: ...
   Received: ...
```

**確認方法**:
```bash
# すべてのテストを実行
npm test

# 特定のテストファイルのみ実行
npm test KnowledgeItem.test.ts

# カバレッジ付きで実行
npm run test:coverage
```

**よくある原因**:
1. コードの変更でテストが古くなった
2. テストデータの不整合
3. タイムゾーン依存のテスト

**対処法**:
1. テストコードを最新のコードに合わせて更新
2. テストデータを確認・修正
3. 該当するテストをスキップして別途調査

---

## 一般的な問題

### 症状: ワークフローが「Queued」のまま進まない

**原因**:
- GitHub Actionsの同時実行制限
- セルフホステッドランナーの問題

**対処法**:
```bash
# 実行中のワークフローを確認
gh run list --limit 20

# 不要なワークフローをキャンセル
gh run cancel <run-id>
```

### 症状: 知見ファイルのMarkdown形式が壊れている

**症状例**:
- コードブロックが正しく閉じられていない
- 箇条書きのインデントが崩れている

**対処法**:
1. 手動で修正
```bash
# エディタで開いて修正
code security/java.md
```

2. PRを作成してknowledge-repoにコミット
```bash
git add security/java.md
git commit -m "fix: Correct markdown formatting in java security knowledge"
git push origin fix/markdown-formatting
```

### 症状: Git コンフリクトが発生する

**エラー例**:
```text
CONFLICT (content): Merge conflict in security/java.md
```

**原因**:
- 複数のPRが同時にマージされ、同じ知見ファイルを更新した

**対処法**:
1. knowledge-repoをローカルにクローン
```bash
git clone https://github.com/YOUR_ORG/YOUR_KNOWLEDGE_REPO.git
cd YOUR_KNOWLEDGE_REPO
```

2. コンフリクトを解決
```bash
git pull origin main
# コンフリクトを手動で解決
code security/java.md
```

3. 解決後にコミット
```bash
git add security/java.md
git commit -m "fix: Resolve merge conflict in java security knowledge"
git push origin main
```

---

## ログの確認方法

### GitHub Actions ログ

**CLI で確認**:
```bash
# 最新の実行を確認
gh run list --limit 5

# 特定の実行のログを表示
gh run view <run-id> --log

# 失敗したステップのみ表示
gh run view <run-id> --log-failed
```

**Web UI で確認**:
1. リポジトリの「Actions」タブを開く
2. 該当するワークフローをクリック
3. 該当する実行(run)をクリック
4. 各ステップを展開してログを確認

### Claude Code ログ

**MCPサーバーのデバッグ**:
```bash
# MCPサーバーを直接実行してエラーを確認
cd /path/to/knowledge-repo
node dist/interfaces/mcp/McpServer.js 2>&1 | head -100
```

**Claude Code のログ**:
- Claude Code の設定画面で「Show Logs」を確認

---

## サポート

### 問題が解決しない場合

1. **GitHub Issues で検索**
   - [GitHub Issues](https://github.com/sk8metalme/review-dojo-mcp/issues)
   - 同じ問題が報告されていないか確認

2. **新規Issue作成**
   - 「New Issue」をクリック
   - 以下の情報を含める:
     - 問題の症状
     - 再現手順
     - 環境情報（Node.jsバージョン、OSなど）
     - エラーログ
     - 期待される動作

3. **ディスカッション**
   - [ディスカッション](https://github.com/sk8metalme/review-dojo-mcp/discussions)
   - 質問・議論はこちら

### デバッグ情報の収集

Issue作成時に以下のコマンドで情報を収集:

```bash
# 環境情報
node -v
npm -v
git --version

# ビルド情報
npm run build 2>&1 | tail -50

# テスト情報
npm test 2>&1 | tail -100

# MCP設定情報
claude mcp list
claude mcp get review-dojo
```

---

## よくある質問（FAQ）

### Q: Private リポジトリでも使えますか？
A: デフォルトでは対象外ですが、カスタマイズすれば可能です。ただし機密情報の取り扱いには十分注意してください。

### Q: GitHub Actions の使用量が心配です
A: 知見収集は月に数回〜数十回程度。CI/CDチェックはPR毎に1回。無料枠でも十分使用可能です。

### Q: Claude API の料金が心配です
A: 1PR分析で約1,000-5,000トークン（$0.01-0.05程度）。月間100PRでも$5以下です。

### Q: 知見が間違っている場合は？
A: PRを作成してknowledge-repo の該当ファイルを修正してください。

### Q: 知見を削除したい場合は？
A: 同様にPRを作成して該当セクションを削除してください。

### Q: 複数の組織で使えますか？
A: 各組織でknowledge-repoをフォークして独立して運用してください。
