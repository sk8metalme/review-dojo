# PR Review Knowledge System - 要件定義・設計書

## 1. プロジェクト概要

### 1.1 目的

GitHub PRのレビューコメントから有益な指摘を自動収集・蓄積し、実装時に活用できる仕組みを構築する。

### 1.2 背景

- PRレビューで得られた知見が個人の記憶に留まり、チームで共有されていない
- 同じ指摘が繰り返し発生している
- 過去のレビューから学ぶ仕組みがない

### 1.3 期待効果

- レビュー知見のチーム共有による品質向上
- 同一ミスの再発防止
- レビュー工数の削減
- ベストプラクティスの継続的蓄積

---

## 2. 要件定義

### 2.1 機能要件

| ID | 要件 | 優先度 |
|----|------|--------|
| F-001 | PRマージ時にレビューコメントを自動収集する | 必須 |
| F-002 | AIがレビューコメントの有益性を判定する | 必須 |
| F-003 | 有益な知見を言語・カテゴリ別に分類・保存する | 必須 |
| F-004 | 類似の知見をマージし、発生回数をカウントする | 必須 |
| F-005 | 実装時にAIが関連知見を自動提案する | Phase 2 |
| F-006 | PR作成時にチェックリストとして提示する | Phase 2 |
| F-007 | CI/CDパイプラインとの統合 | Phase 3 |

### 2.2 非機能要件

| ID | 要件 | 詳細 |
|----|------|------|
| NF-001 | 可用性 | GitHub Actions の可用性に準拠 |
| NF-002 | スケーラビリティ | org内の全リポジトリに対応 |
| NF-003 | 保守性 | Markdown形式で人間が読み書き可能 |
| NF-004 | セキュリティ | API Key はorg Secrets で管理 |

---

## 3. システム設計

### 3.1 システム構成図

```
┌─────────────────────────────────────────────────────────────────┐
│                        GitHub Organization                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐        │
│  │   Repo A     │   │   Repo B     │   │   Repo C     │        │
│  │              │   │              │   │              │        │
│  │ ┌──────────┐ │   │ ┌──────────┐ │   │ ┌──────────┐ │        │
│  │ │ Trigger  │ │   │ │ Trigger  │ │   │ │ Trigger  │ │        │
│  │ │ Workflow │ │   │ │ Workflow │ │   │ │ Workflow │ │        │
│  │ └────┬─────┘ │   │ └────┬─────┘ │   │ └────┬─────┘ │        │
│  └──────┼───────┘   └──────┼───────┘   └──────┼───────┘        │
│         │                  │                  │                 │
│         └──────────────────┼──────────────────┘                 │
│                            │ repository_dispatch                │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   knowledge-repo                         │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │         collect-review-knowledge.yml             │    │   │
│  │  │                                                  │    │   │
│  │  │  1. Fetch PR comments (GitHub API)               │    │   │
│  │  │  2. Analyze with Claude Code                     │    │   │
│  │  │  3. Extract & classify knowledge                 │    │   │
│  │  │  4. Update markdown files                        │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  │                                                          │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │              Knowledge Storage                   │    │   │
│  │  │                                                  │    │   │
│  │  │  /security/java.md                               │    │   │
│  │  │  /security/nodejs.md                             │    │   │
│  │  │  /performance/java.md                            │    │   │
│  │  │  /design/php.md                                  │    │   │
│  │  │  ...                                             │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 データフロー

```
PR Merged
    │
    ▼
┌─────────────────┐
│ Trigger Workflow│  (各リポジトリ)
│ repository_     │
│ dispatch 送信   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Collect Workflow│  (knowledge-repo)
│ PR情報取得      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Claude Code     │
│ コメント分析    │
│ 知見抽出        │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ review-dojo-    │
│ action          │
│ Markdown更新    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Git Commit      │
│ & Push          │
└─────────────────┘
```

### 3.3 ディレクトリ構成

```
knowledge-repo/
├── .github/
│   └── workflows/
│       ├── collect-review-knowledge.yml  # メイン収集ワークフロー
│       └── trigger-knowledge-collection.yml  # 各リポジトリ配置用
├── scripts/
│   └── collect-knowledge.md  # Claude Code用プロンプト
├── security/           # セキュリティ関連
│   ├── java.md
│   ├── nodejs.md
│   └── ...
├── performance/        # パフォーマンス関連
├── readability/        # 可読性・命名関連
├── design/             # 設計・アーキテクチャ関連
├── testing/            # テスト関連
├── error-handling/     # エラーハンドリング関連
├── other/              # その他
└── README.md
```

---

## 4. 詳細設計

### 4.1 知見データ構造

#### 4.1.1 中間フォーマット（JSON）

Claude Code が出力する中間データ形式：

```json
{
  "knowledge_items": [
    {
      "category": "security",
      "language": "java",
      "severity": "critical",
      "title": "SQLインジェクション対策",
      "summary": "PreparedStatementを使用せず文字列結合でSQLを組み立てている",
      "recommendation": "必ずPreparedStatementまたはORMのパラメータバインディングを使用する",
      "code_example": {
        "bad": "String sql = \"SELECT * FROM users WHERE id = \" + userId;",
        "good": "PreparedStatement ps = conn.prepareStatement(\"SELECT * FROM users WHERE id = ?\");"
      },
      "file_path": "src/main/java/com/example/UserDao.java",
      "pr_url": "https://github.com/org/repo/pull/123",
      "original_comment": "レビュアーの元のコメント"
    }
  ],
  "skipped_comments": [
    {
      "reason": "typo修正のみ",
      "comment_preview": "s/recieve/receive/"
    }
  ]
}
```

#### 4.1.2 保存フォーマット（Markdown）

```markdown
# Security - Java

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
- **対象ファイル例**: `src/main/java/com/example/UserDao.java`
- **参照PR**:
  - https://github.com/org/repo/pull/123
  - https://github.com/org/repo/pull/456
  - https://github.com/org/repo/pull/789

---
```

### 4.2 カテゴリ定義

| カテゴリ | ディレクトリ | 説明 |
|----------|--------------|------|
| セキュリティ | `/security/` | SQLインジェクション、XSS、認証・認可など |
| パフォーマンス | `/performance/` | N+1問題、メモリリーク、最適化など |
| 可読性 | `/readability/` | 命名規則、コメント、コード構造など |
| 設計 | `/design/` | アーキテクチャ、デザインパターン、SOLID原則など |
| テスト | `/testing/` | テストカバレッジ、テスト設計、モックなど |
| エラーハンドリング | `/error-handling/` | 例外処理、ログ出力、リトライ処理など |
| その他 | `/other/` | 上記に分類されないもの |

### 4.3 重要度定義

| 重要度 | 説明 | 例 |
|--------|------|-----|
| critical | セキュリティリスクや重大なバグに直結 | SQLインジェクション、認証バイパス |
| warning | 品質低下やメンテナンス性に影響 | N+1問題、マジックナンバー |
| info | ベストプラクティスの提案 | 命名規則、コメントの改善 |

### 4.4 言語識別

| 拡張子 | 言語識別子 |
|--------|-----------|
| `.java` | java |
| `.php` | php |
| `.js`, `.ts`, `.jsx`, `.tsx` | nodejs |
| `.py` | python |
| `.go` | go |
| `.rb` | ruby |
| `.rs` | rust |
| その他 | 拡張子をそのまま使用 |

### 4.5 類似知見マージ戦略

#### 判定方法
- **AIによる意味的類似度判定**を採用
- 新規知見抽出時に既存知見ファイルを読み込み、Claude APIで類似度を判定
- 類似と判定された場合は既存知見の発生回数をインクリメントし、参照PRを追加

#### 判定プロンプト例
```
既存の知見:
{existing_knowledge}

新規候補:
{new_knowledge}

これらは同一の問題を指摘しているか判定してください。
同一の場合は "MERGE"、異なる場合は "NEW" と回答してください。
```

### 4.6 同時実行制御

#### 戦略
- GitHub Actions の `concurrency` 設定で直列化
- 同一ワークフローの同時実行を禁止

#### 設定例
```yaml
concurrency:
  group: knowledge-collection
  cancel-in-progress: false
```

### 4.7 エラーハンドリング

#### リトライ戦略
- 指数バックオフで最大3回リトライ
- 初回: 即時、2回目: 5秒後、3回目: 15秒後

#### 失敗時の対応
- 通知は行わない（GitHub Actionsのログで確認）
- 失敗したPRの知見は収集されないが、次回以降のPRには影響しない

### 4.8 セキュリティ対策

#### 機密情報フィルタリング
- 正規表現でAPIキー、パスワード等をマスク
- 対象パターン:
  - APIキー: `[a-zA-Z0-9_-]{20,}`
  - AWS: `AKIA[0-9A-Z]{16}`
  - Bearer: `Bearer\s+[a-zA-Z0-9._-]+`
  - パスワード: `password\s*[:=]\s*\S+`

#### 対象リポジトリ
- **publicリポジトリのみ**を収集対象とする
- privateリポジトリのレビューは収集しない

### 4.9 保持上限とアーカイブ

#### 上限
- カテゴリ/言語ごとに**100件/ファイル**

#### アーカイブ
- 100件を超えた場合、発生回数が少なく古い知見を `archive/` に移動
- アーカイブファイル: `archive/{category}/{language}.md`

### 4.10 品質管理

#### 運用
- **定期的な人間レビュー**で品質を担保
- 月次で蓄積された知見を確認・整理

#### レビュー観点
- 誤分類の修正
- 低品質・重複知見の削除
- 表現の統一・改善

### 4.11 技術スタック

| 項目 | 技術 |
|------|------|
| Markdown操作 | remark/unified（AST） |
| AI呼び出し | Claude Code CLI |
| ランタイム | Node.js |

---

## 5. 実装フェーズ

### 5.1 Phase 1: MVP（収集 + 手動参照）

**スコープ:**
- PRマージ時の自動収集
- Claude Code によるAI分析・抽出
- Markdown形式での知見蓄積
- 類似知見のマージ・カウント

**成果物:**
- `collect-review-knowledge.yml`
- `trigger-knowledge-collection.yml`
- `collect-knowledge.md`
- `review-dojo-action` (別リポジトリに移管)

**完了条件:**
- [x] org内リポジトリでPRマージ時に自動収集される
- [x] 知見がカテゴリ・言語別に保存される
- [x] 類似知見がマージされカウントされる

### 5.2 Phase 2: 自動提案

**スコープ:**
- MCP サーバー構築
- Claude Code / VSCode からの参照
- 実装時のコンテキスト自動注入
- PR作成時のチェックリスト提示

**成果物:**
- MCPサーバー実装
- Claude Code / VSCode 連携設定
- 自動提案ロジック

**完了条件:**
- [x] 実装中に関連知見が自動提案される
- [x] PR作成時にチェックリストが表示される

### 5.3 Phase 3: CI/CD連携

**スコープ:**
- Screwdriver CI/CD との統合
- GitHub Actions との統合
- パイプラインへの組み込み
- 自動チェック・PR自動コメント

**成果物:**
- CheckKnowledgeCli (CLI tool)
- ChecklistMarkdownFormatter
- GitHub Actions reusable workflow
- Screwdriver 連携設定ドキュメント

**完了条件:**
- [x] CI/CDパイプラインで知見チェックが実行される
- [x] PR自動コメント機能の実装
- [x] GitHub Actions ワークフロー作成
- [x] Screwdriver設定ドキュメント作成

### 5.4 テスト戦略

#### Phase 1-3 テスト
- **単体テスト**を作成
- 対象:
  - Domain層: エンティティ、値オブジェクト、ドメインサービス
  - Application層: ユースケース
  - Infrastructure層: リポジトリ、シリアライザ
  - Interface層: CLI、MCPサーバー
  - 機密情報マスク処理
  - アーキテクチャテスト (ts-arch)

#### テストフレームワーク
- Jest または Vitest

---

## 6. 運用設計

### 6.1 必要な Secrets

| Secret名 | スコープ | 用途 | 必要な権限 |
|----------|----------|------|-----------|
| `ANTHROPIC_API_KEY` | org | Claude API 呼び出し | N/A |
| `ORG_GITHUB_TOKEN` | org | org内リポジトリのPR情報取得とknowledge-repoへのpush | **全Organization内リポジトリに適用**: Pull requests (Read and Write), Contents (Read and Write), Actions (Read and Write), Workflows (Read and Write)<br>⚠️ Note: Fine-grained PATの「All repositories」モードでは全リポジトリに同じ権限が適用されます |

### 6.2 権限設計

| ロール | 読み取り | 書き込み | 管理 |
|--------|----------|----------|------|
| 全チームメンバー | ✅ | ❌ | ❌ |
| GitHub Actions Bot | ✅ | ✅ | ❌ |
| リポジトリ管理者 | ✅ | ✅ | ✅ |

### 6.3 メンテナンス

- 知見の手動修正・追加はPRで実施
- 誤分類や不要な知見の削除も可能
- 定期的なレビューで品質維持

---

## 7. 決定事項サマリー

| 項目 | 決定内容 |
|------|----------|
| 活用タイミング | 実装中 + PR作成時 |
| 蓄積方法 | 全自動（AI判定） |
| 管理単位 | 言語・フレームワーク単位 |
| 開発環境 | Claude Code / VSCode |
| 収集トリガー | PRマージ時 |
| 参照方法 | AI自動提案（Phase 2） |
| 対象範囲 | GitHub org内のpublicリポジトリのみ |
| 保存先 | 共有リポジトリ |
| 利用者 | チーム共有 |
| 提案タイミング | 編集時・AI質問時・PR作成時（複合） |
| フォーマット | Markdown |
| 分類軸 | カテゴリ + 言語 + 重要度 |
| 収集方式 | GitHub Actions（org レベル） |
| API Key管理 | GitHub Secrets（org レベル） |
| スコープ | 段階的拡張（Phase 1 → 2 → 3） |
| 類似知見マージ | AIによる意味的類似度判定 |
| 同時実行制御 | GitHub Actions concurrency |
| エラーハンドリング | 指数バックオフ（通知なし） |
| 機密情報対策 | 正規表現で事前マスク |
| 品質管理 | 定期的な人間レビュー |
| Markdown操作 | remark/unified（AST） |
| AI呼び出し | Claude Code CLI |
| 保持上限 | 100件/ファイル |
| テスト戦略 | 単体テストのみ |

---

## 8. 改訂履歴

| バージョン | 日付 | 変更内容 |
|------------|------|----------|
| 1.0 | 2025-12-25 | 初版作成 |
| 1.1 | 2025-12-25 | 詳細設計追加（マージ戦略、同時実行制御、エラーハンドリング、セキュリティ、品質管理、技術スタック、テスト戦略） |
| 1.2 | 2025-12-31 | apply機能のreview-dojo-action移管を反映、Phase完了状態更新、ドキュメント整合性修正 |
| 1.3 | 2026-01-01 | トークン統合（KNOWLEDGE_REPO_TOKEN廃止、ORG_GITHUB_TOKENに統合）、Fine-grained PATでリポジトリ単位の権限制御を実現 |
