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
│   ├── collect-knowledge.md            # Claude Code用プロンプト
│   └── apply-knowledge.js              # 知見適用スクリプト
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

### テスト

```bash
# 単体テスト実行
npm test

# カバレッジ確認
npm run test:coverage

# UI モード
npm run test:ui
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

# 知見を適用
node scripts/apply-knowledge.js sample-knowledge.json

# 結果確認
cat security/java.md
```

## ロードマップ

- [x] Phase 1: MVP（収集 + 手動参照）
- [ ] Phase 2: 自動提案
  - MCPサーバー構築
  - Claude Code / VSCode からの参照
  - PR作成時のチェックリスト提示
- [ ] Phase 3: CI/CD連携
  - Screwdriver CI/CD との統合
  - 自動チェック・警告

## ライセンス

MIT

## 参考

詳細な設計書は [plan.md](./plan.md) を参照してください。

## Knowledge Collection Test

このセクションは知見収集ワークフローのテスト用に追加されました。

### Test 2
package-lock.json追加後の再テスト
# Test PR 7
