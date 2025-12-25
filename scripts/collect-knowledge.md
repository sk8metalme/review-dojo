# PR Review Knowledge Extraction

あなたは経験豊富なソフトウェアエンジニアリングの専門家です。
GitHub PRのレビューコメントから有益な知見を抽出し、チームで共有可能な形式に整理してください。

## 入力情報

以下の環境変数から情報を取得してください：

- `PR_URL`: レビュー対象のPR URL
- `REPO_OWNER`: リポジトリオーナー
- `REPO_NAME`: リポジトリ名
- `PR_NUMBER`: PR番号

## タスク

1. **PRレビューコメントの取得**
   - **重要**: **resolved（解決済み）のレビュースレッドのみ**を対象とする
   - 理由: resolvedコメントは実際に問題が修正され、有益な知見として確定したもの
   - GitHub GraphQL APIを使用してresolvedのレビュースレッドを取得
   - コード差分と関連付けられたコメントを優先的に収集

2. **有益な知見の判定**
   以下の基準で有益な知見を抽出してください：

   **含めるべきコメント：**
   - セキュリティリスクの指摘（SQLインジェクション、XSS、認証バイパス等）
   - パフォーマンス問題の指摘（N+1問題、メモリリーク等）
   - 設計・アーキテクチャの改善提案
   - エラーハンドリングの不備
   - テストの不足や改善点
   - ベストプラクティスからの逸脱
   - 可読性・保守性の問題

   **除外すべきコメント：**
   - タイポ・スペルミスの指摘のみ
   - フォーマット・スタイルのみの指摘
   - 「LGTM」「承認します」等の承認コメント
   - 個人的な好みのみに基づく指摘
   - 具体的な改善提案がないコメント

3. **知見の分類**
   各知見を以下のカテゴリに分類：
   - `security`: セキュリティ関連
   - `performance`: パフォーマンス関連
   - `readability`: 可読性・命名関連
   - `design`: 設計・アーキテクチャ関連
   - `testing`: テスト関連
   - `error-handling`: エラーハンドリング関連
   - `other`: その他

4. **重要度の判定**
   - `critical`: セキュリティリスクや重大なバグに直結
   - `warning`: 品質低下やメンテナンス性に影響
   - `info`: ベストプラクティスの提案

5. **言語の識別**
   ファイル拡張子から言語を識別：
   - `.java` → `java`
   - `.php` → `php`
   - `.js`, `.ts`, `.jsx`, `.tsx` → `nodejs`
   - `.py` → `python`
   - その他 → 拡張子をそのまま使用

## 出力形式

以下のJSON形式で知見を出力してください（`knowledge.json`ファイルに保存）：

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

## 重要な注意事項

1. **機密情報の除外**
   - APIキー、パスワード、トークン等の機密情報は含めない
   - 実際の本番環境の情報は含めない

2. **具体性**
   - 抽象的な指摘ではなく、具体的な問題点と解決策を記載
   - コード例は可能な限り含める

3. **再現性**
   - 同じ問題が他の箇所でも検出できるよう、一般化した形で記述

4. **重複排除**
   - 同じPR内で同じ指摘が複数ある場合は1つにまとめる

## 実行手順

以下の手順で知見を抽出してください：

### 1. PR情報の取得

**resolvedのレビュースレッドのみを取得:**

```bash
gh api graphql -f query='
  query($owner: String!, $repo: String!, $number: Int!) {
    repository(owner: $owner, name: $repo) {
      pullRequest(number: $number) {
        title
        body
        files(first: 100) {
          nodes {
            path
          }
        }
        reviewThreads(first: 100) {
          nodes {
            isResolved
            comments(first: 10) {
              nodes {
                body
                author {
                  login
                }
                path
                diffHunk
              }
            }
          }
        }
      }
    }
  }
' -f owner=$REPO_OWNER -f repo=$REPO_NAME -F number=$PR_NUMBER
```

### 2. レビューコメントの分析

上記コマンドで取得したPR情報から以下を確認：
- `reviewThreads[].nodes[]`: レビュースレッド（**isResolved = true のみ対象**）
- `reviewThreads[].nodes[].comments[].nodes[]`: スレッド内のコメント
- `files[].nodes[].path`: 変更ファイル（言語識別用）

**重要**: `isResolved = true` のスレッドのみを処理対象とする

### 3. 知見抽出

各コメントについて：
1. 有益性を判定（含めるべき/除外すべき基準に従う）
2. カテゴリ・重要度・言語を決定
3. タイトル・概要・推奨対応を簡潔にまとめる
4. コード例があれば抽出（Bad/Good形式）

### 4. JSON出力

すべての知見を`knowledge.json`ファイルに出力：

```bash
cat > knowledge.json << 'EOF'
{
  "knowledge_items": [...],
  "skipped_comments": [...]
}
EOF
```

### 5. 知見適用

```bash
node scripts/apply-knowledge.js knowledge.json
```

このコマンドが自動的にMarkdownファイルを更新します。
