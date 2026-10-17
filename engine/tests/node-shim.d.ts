// The few Node built-ins the logic tests use, declared here so the tests
// type-check without @types/node (nothing is installed for this repo).
declare module "node:test" {
  export function test(name: string, fn: () => void | Promise<void>): void;
}
declare module "node:assert/strict" {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
declare module "node:fs" {
  export function readFileSync(path: string, encoding: "utf8"): string;
}
declare module "node:vm" {
  export function createContext(sandbox?: object): object;
  export function runInContext(code: string, context: object, options?: { filename?: string }): unknown;
}
declare const process: { env: Record<string, string | undefined> };
