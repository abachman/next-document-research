declare module "better-sqlite3" {
  type DatabaseConstructor = new (filename: string, options?: unknown) => Database;

  interface Database {
    exec(sql: string): this;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
