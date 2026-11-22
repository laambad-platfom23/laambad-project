import { NextRequest } from "next/server";
import { dispatch } from "@/server/router";

// WaafiPay purchases wait for the payer's PIN on the phone; give the function time to get the answer.
export const maxDuration = 150;

type Ctx ={ params: Promise<{ path: string[] }> };

async function handle(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  return dispatch(req, path || []);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
