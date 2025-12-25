# Security - Java

## SQLインジェクション対策

- **重要度**: critical
- **発生回数**: 1
- **概要**: PreparedStatementを使用せず文字列結合でSQLを組み立てている
- **推奨対応**: 必ずPreparedStatementまたはORMのパラメータバインディングを使用する
- **コード例**:
  ```
  // NG
  String sql = "SELECT * FROM users WHERE id = " + userId;
  ```
  ```
  // OK
  PreparedStatement ps = conn.prepareStatement("SELECT * FROM users WHERE id = ?");
  ```
- **対象ファイル例**: `src/main/java/com/example/UserDao.java`
- **参照PR**:
  - https://github.com/org/repo/pull/123

---
