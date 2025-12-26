# Performance - Nodejs

## N+1問題の回避

- **重要度**: warning
- **発生回数**: 1
- **概要**: ループ内でDB問い合わせを実行している
- **推奨対応**: 一括取得またはJOINを使用する
- **対象ファイル例**: `src/services/user-service.js`
- **参照PR**:
  - https://github.com/org/repo/pull/124

---
