declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: (string | number)[][] }[];
    export(): Uint8Array;
  }
  export interface SqlJsStatic {
    Database: {
      new (data?: Uint8Array): Database;
    };
  }
  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }
  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
