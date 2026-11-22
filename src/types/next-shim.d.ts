/** Temporary shims when next package types are incomplete after a partial install. */
declare module "next" {
  export type NextConfig = Record<string, unknown>;
  export type Metadata = Record<string, unknown>;
  const Next: unknown;
  export default Next;
}
declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
}
declare module "next/navigation";
declare module "next/link";
declare module "next/image";
declare module "next/font/google";
declare module "next/dist/lib/metadata/types/metadata-interface.js";
