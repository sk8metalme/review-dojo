# クイックスタート

このガイドでは、review-dojoを5分以内に試して、その価値を体験できます。

## 前提条件

- Node.js 20以上
- GitHubアカウント
- （オプション）Claude Code / VSCode

## Step 1: ローカルで試す（2分）

### 1.1 リポジトリのクローン

```bash
git clone https://github.com/sk8metalme/review-dojo.git
cd review-dojo
```

### 1.2 依存関係のインストールとビルド

```bash
npm install
npm run build
```

### 1.3 サンプル知見ファイルの確認

すでにいくつかのサンプル知見が含まれています。

```bash
# ディレクトリ構造を確認
ls -la security/ performance/ design/

# サンプル知見ファイルの内容を確認
cat security/java.md
```

知見は以下のMarkdown形式で保存されます：

```markdown
## タイトル

- **重要度**: critical
- **発生回数**: 3
- **概要**: 問題の説明
- **推奨対応**: 解決方法
- **コード例**: ...
- **参照PR**: ...
```

### 1.4 動作確認（オプション）

テストを実行してすべてが正常に動作することを確認：

```bash
npm test
```

✅ すべてのテストがパスすればOKです！

## Step 2: MCPサーバーを試す（3分）

MCPサーバーを使うと、Claude Code / VSCode から知見を検索できます。

### 2.1 MCPサーバーの設定

Claude Code を使用している場合：

```bash
# Claude Code の設定ファイルに追加
claude mcp add review-dojo node $(pwd)/dist/interfaces/mcp/McpServer.js
```

手動で設定する場合は `~/.claude.json` に以下を追加：

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

### 2.2 Claude Code / VSCode を再起動

設定を反映するため、Claude Code / VSCode を再起動してください。

### 2.3 知見検索を試す

Claude Code で以下のように質問してみてください：

```
Javaのセキュリティに関する知見を検索して
```

または：

```
SQLインジェクション対策について教えて
```

Claude Codeが自動的にMCPサーバー経由で知見を検索し、関連情報を提示します。

### 2.4 利用可能なツール

MCPサーバーは以下のツールを提供します：

| ツール | 用途 |
|--------|------|
| `search_knowledge` | 条件で知見を検索 |
| `get_knowledge_detail` | 知見の詳細を取得 |
| `list_categories` | カテゴリ一覧を取得 |
| `list_languages` | 言語一覧を取得 |
| `suggest_for_file` | ファイルに関連する知見を提案 |

## 次のステップ

ローカルで動作を確認できたら、次は実際のプロジェクトへの導入です：

### 本番導入したい方
→ **[統合ガイド](docs/integration-guide.md)** をご覧ください

以下の手順で自組織のリポジトリにreview-dojoを導入できます：
- GitHub Secretsの設定
- 各リポジトリへのワークフロー配置
- CI/CD連携の設定

### より詳しい機能を知りたい方
→ **[README.md](README.md)** をご覧ください

Phase 1-3の詳細な機能説明：
- Phase 1: PRマージ時の自動収集
- Phase 2: MCPサーバー（実装時の提案）
- Phase 3: CI/CD連携（PR自動コメント）

### 問題が発生した方
→ **[トラブルシューティング](docs/troubleshooting.md)** をご覧ください

よくある問題と解決方法を確認できます。

## ヘルプとサポート

問題が発生した場合：
1. [トラブルシューティング](docs/troubleshooting.md)を確認
2. [GitHub Issues](https://github.com/sk8metalme/review-dojo/issues)で検索
3. 新規Issueを作成（再現手順を含めてください）
