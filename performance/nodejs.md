# Performance - NodeJS

## N+1問題の解消

- **重要度**: warning
- **発生回数**: 5
- **概要**: ループ内でデータベースクエリを実行している
- **推奨対応**: バルククエリまたはJOINを使用して一括取得する
- **コード例**:
  ```javascript
  // NG
  for (const user of users) {
    const posts = await db.query('SELECT * FROM posts WHERE user_id = ?', [user.id]);
  }
  ```
  ```javascript
  // OK
  const userIds = users.map(u => u.id);
  const posts = await db.query('SELECT * FROM posts WHERE user_id IN (?)', [userIds]);
  ```
- **対象ファイル例**: `src/services/UserService.js`
- **参照PR**:
  - [PR #345](https://github.com/example/repo/pull/345)
  - [PR #678](https://github.com/example/repo/pull/678)

---

## 非同期処理の並列化

- **重要度**: info
- **発生回数**: 1
- **概要**: 独立した非同期処理を直列で実行している
- **推奨対応**: Promise.allを使用して並列実行する
- **コード例**:
  ```javascript
  // NG
  const user = await fetchUser();
  const posts = await fetchPosts();
  ```
  ```javascript
  // OK
  const [user, posts] = await Promise.all([fetchUser(), fetchPosts()]);
  ```
- **対象ファイル例**: `src/controllers/DashboardController.js`
- **参照PR**:
  - [PR #890](https://github.com/example/repo/pull/890)

---
