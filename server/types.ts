import type { Role } from "../shared/types";

export type Row = Record<string, any>;
export type Query = (text: string, params?: unknown[]) => Promise<Row[]>;
export type Body = Record<string, any>;

export interface Req {
  method?: string;
  body?: any;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
export interface Res {
  setHeader(name: string, value: string): unknown;
  status(code: number): Res;
  json(body: unknown): unknown;
}

export interface Actor {
  username: string;
  role: Role;
  flat?: string | null;
}

export interface Ctx {
  me: Actor;
  req: Req;
  audit: { target?: unknown; detail?: unknown } | null;
}

export interface Action {
  role?: "user" | "admin" | "developer" | "super" | "superadmin" | "security";
  users?: boolean;
  flag?: () => boolean;
  run(b: Body, ctx: Ctx): Promise<unknown>;
}
