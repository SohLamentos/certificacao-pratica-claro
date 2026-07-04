interface D1PreparedStatement {
  bind(...args: any[]): D1PreparedStatement;
  run(): Promise<any>;
  all(): Promise<{ results: any[] }>;
  first<T = any>(colName?: string): Promise<T | null>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

type PagesFunction<Env = any> = (context: {
  request: Request;
  env: Env;
  params: Record<string, string>;
  next: () => Promise<Response>;
}) => Response | Promise<Response>;

interface ResponseConstructor {
  json(data: any, init?: ResponseInit): Response;
}
