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
  ps.setString(1, userId);
  ```
- **対象ファイル例**: `src/main/java/UserDao.java`
- **参照PR**:
  - https://github.com/example/repo/pull/123
  - https://github.com/example/repo/pull/456
  - https://github.com/example/repo/pull/789

---

## パスワードのハードコード禁止

- **重要度**: critical
- **発生回数**: 2
- **概要**: パスワードやAPIキーがソースコードに直接記述されている
- **推奨対応**: 環境変数または設定ファイル（.gitignore対象）から読み込む
- **コード例**:
  ```java
  // NG
  String password = "mypassword123";
  ```
  ```java
  // OK
  String password = System.getenv("DB_PASSWORD");
  ```
- **対象ファイル例**: `src/main/java/DatabaseConfig.java`
- **参照PR**:
  - https://github.com/example/repo/pull/234
  - https://github.com/example/repo/pull/567

---
