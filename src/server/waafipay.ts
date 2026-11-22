import { randomUUID } from "node:crypto";

/**
 * WaafiPay Direct API — `API_PURCHASE` with a mobile wallet (EVC Plus, Zaad, Sahal, eDahab …).
 * Same settings as the old WooCommerce plugin: Store ID = API user id, HPP Key = API key,
 * Merchant ID = merchant uid.
 *
 * The request is synchronous: WaafiPay pushes a USSD prompt to the payer's phone and answers only
 * after the payer entered the PIN, rejected it, or the prompt timed out (≈ 1 minute).
 *
 * Credentials come only from the server process environment (WAAFIPAY_*), loaded by
 * `npm run dev:rehearsal` from D:\Laambad-Migration\phase3\secrets\waafipay.env. They are never sent
 * to the browser, never logged, and never stored in the repo or the database.
 */
const ENDPOINTS = {
  live: "https://api.waafipay.net/asm",
  test: "https://sandbox.waafipay.net/asm",
} as const;

/** Generous: the payer may take up to ~60 s to enter the PIN. */
const REQUEST_TIMEOUT_MS = 120_000;

type Config = { endpoint: string; apiUserId: string; apiKey: string; merchantUid: string };

function config(): Config | null {
  const apiUserId = process.env.WAAFIPAY_API_USER_ID?.trim();
  const apiKey = process.env.WAAFIPAY_API_KEY?.trim();
  const merchantUid = process.env.WAAFIPAY_MERCHANT_UID?.trim();
  if (!apiUserId || !apiKey || !merchantUid) return null;
  const mode = process.env.WAAFIPAY_MODE?.trim().toLowerCase() === "test" ? "test" : "live";
  return { endpoint: ENDPOINTS[mode], apiUserId, apiKey, merchantUid };
}

export function isWaafiPayConfigured(): boolean {
  return config() !== null;
}

/**
 * Somali mobile number → international form without "+" (e.g. "252615123456"), or null.
 * Accepts 61xxxxxxx, 0615…, +252 61…, 00252 61…, with spaces or dashes.
 */
export function normalizeSomaliMobile(raw: string | undefined | null): string | null {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (d.startsWith("00252")) d = d.slice(5);
  else if (d.startsWith("252")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  // 61/77 Hormuud (EVC Plus), 62/65/66 Somtel (eDahab), 63 Telesom (Zaad), 90 Golis (Sahal), …
  if (!/^(6[1-9]|7[0-9]|9[0-9])\d{7}$/.test(d)) return null;
  return `252${d}`;
}

/** "252615123456" → "+252 61 ***3456" for screens and logs. */
export function maskMobile(msisdn: string | null | undefined): string {
  const m = String(msisdn ?? "");
  if (m.length < 8) return m ? "***" : "";
  return `+${m.slice(0, 3)} ${m.slice(3, 5)} ***${m.slice(-4)}`;
}

export type WaafiOutcome =
  /** Money taken. */
  | { kind: "approved"; transactionId: string; referenceId: string }
  /** WaafiPay answered with a refusal (rejected on the phone, low balance, timeout on the phone …). */
  | { kind: "declined"; message: string; code: string }
  /** No usable answer (network, timeout, malformed). The payment may or may not have happened. */
  | { kind: "unknown"; message: string };

type WaafiResponse = {
  responseCode?: string;
  errorCode?: string;
  responseMsg?: string;
  params?: { state?: string; transactionId?: string; referenceId?: string } | null;
};

/** Payer-facing text for WaafiPay's refusal messages (which are often technical codes). */
function declineMessage(r: WaafiResponse): string {
  const raw = String(r.responseMsg ?? "").trim();
  const up = raw.toUpperCase();
  if (up.includes("USER_REJECTED") || up.includes("REJECTED") || up.includes("CANCEL"))
    return "The payment was cancelled on the phone.";
  if (up.includes("TIMEOUT") || up.includes("TIMED OUT")) return "No PIN was entered in time. Please try again.";
  if (up.includes("INSUFFICIENT") || raw.toLowerCase().includes("haraaga"))
    return "Your balance is not enough for this payment.";
  if (up.includes("INVALID") && up.includes("ACCOUNT")) return "This mobile number has no active wallet account.";
  // WaafiPay's own text is human readable when it is not an RCS_* code; keep it short
  if (raw && !/^RCS_/i.test(raw)) return raw.length > 180 ? `${raw.slice(0, 177)}…` : raw;
  return "The payment was not completed. Please try again.";
}

export async function waafiPurchase(input: {
  msisdn: string;
  /** integer cents */
  amountMinor: number;
  currency: string;
  /** our payment row id: unique per attempt, lets the admin match WaafiPay's report */
  referenceId: string;
  invoiceId: string;
  description: string;
}): Promise<WaafiOutcome> {
  const cfg = config();
  if (!cfg) return { kind: "unknown", message: "WaafiPay is not configured" };

  const body = {
    schemaVersion: "1.0",
    requestId: randomUUID(),
    timestamp: new Date().toISOString(),
    channelName: "WEB",
    serviceName: "API_PURCHASE",
    serviceParams: {
      merchantUid: cfg.merchantUid,
      apiUserId: cfg.apiUserId,
      apiKey: cfg.apiKey,
      paymentMethod: "MWALLET_ACCOUNT",
      payerInfo: { accountNo: input.msisdn },
      transactionInfo: {
        referenceId: input.referenceId,
        invoiceId: input.invoiceId,
        amount: (input.amountMinor / 100).toFixed(2),
        currency: input.currency.toUpperCase(),
        description: input.description.slice(0, 120),
      },
    },
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(cfg.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: ctrl.signal,
    });
  } catch (err) {
    const aborted = (err as { name?: string })?.name === "AbortError";
    console.error(`[waafipay] request ${aborted ? "timed out" : "failed"} ref=${input.referenceId}`);
    return { kind: "unknown", message: aborted ? "timeout" : "network error" };
  } finally {
    clearTimeout(timer);
  }

  let json: WaafiResponse | null = null;
  try {
    json = (await res.json()) as WaafiResponse;
  } catch {
    json = null;
  }
  // log only codes — never the request (it holds the API key) nor the payer number
  console.info(
    `[waafipay] ref=${input.referenceId} http=${res.status} code=${json?.responseCode ?? "-"} err=${json?.errorCode ?? "-"} msg=${String(json?.responseMsg ?? "-").slice(0, 60)} state=${json?.params?.state ?? "-"}`
  );
  if (!res.ok || !json || !json.responseCode) {
    return { kind: "unknown", message: `gateway http ${res.status}` };
  }
  const state = String(json.params?.state ?? "").toUpperCase();
  if (json.responseCode === "2001" && state === "APPROVED") {
    return {
      kind: "approved",
      transactionId: String(json.params?.transactionId ?? ""),
      referenceId: String(json.params?.referenceId ?? input.referenceId),
    };
  }
  // "success" envelope without an APPROVED state: do not guess, let an admin check it
  if (json.responseCode === "2001") return { kind: "unknown", message: `state ${state || "missing"}` };
  return { kind: "declined", message: declineMessage(json), code: `${json.responseCode}/${json.errorCode ?? ""}` };
}
