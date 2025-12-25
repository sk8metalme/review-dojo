// Example user service with intentional security issues for testing

class UserService {
  constructor(db) {
    this.db = db;
  }

  // Get user by ID
  async getUserById(userId) {
    // TODO: Add input validation and use prepared statements
    const query = `SELECT * FROM users WHERE id = ${userId}`;
    return await this.db.query(query);
  }

  // SECURITY ISSUE: Storing password in plain text
  // TODO: Implement password hashing with bcrypt
  async createUser(username, password) {
    const query = `INSERT INTO users (username, password) VALUES ('${username}', '${password}')`;
    return await this.db.query(query);
  }

  // PERFORMANCE ISSUE: N+1 query problem
  async getUsersWithPosts() {
    const users = await this.db.query('SELECT * FROM users');

    for (const user of users) {
      user.posts = await this.db.query(`SELECT * FROM posts WHERE user_id = ${user.id}`);
    }

    return users;
  }

  // ERROR HANDLING ISSUE: No error handling
  async updateUser(userId, data) {
    const query = `UPDATE users SET username = '${data.username}' WHERE id = ${userId}`;
    return await this.db.query(query);
  }
}

module.exports = UserService;
