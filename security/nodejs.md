# Security - Nodejs

## 環境変数からAPI Keyを取得

- **重要度**: critical
- **発生回数**: 2
- **概要**: ハードコードされたAPI key: ***REDACTED*** を使用している。password: *** も含まれている
- **推奨対応**: 環境変数から取得する。AWS key ***REDACTED*** のような機密情報も注意
- **対象ファイル例**: `config.js`
- **参照PR**:
  - https://github.com/org/repo/pull/999
  - https://github.com/org/repo/pull/1000

---
