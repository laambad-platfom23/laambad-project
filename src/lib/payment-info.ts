/**
 * Where students send money, in one place (checkout, diplomas, WhatsApp texts).
 * WaafiPay takes EVC Plus, Zaad and Sahal only (not eDahab) — Phase 2 test, 2026-11-28.
 */
export const WAAFI_WALLETS = "EVC Plus · Zaad · Sahal";

export const MANUAL_PAYMENT = {
  evc: { label: "EVC Plus", number: "061 0887755" },
  bank: { label: "Salaam Bank", account: "35517225" },
} as const;

/** "EVC Plus 061 0887755 or Salaam Bank 35517225" */
export const MANUAL_PAYMENT_TEXT = `${MANUAL_PAYMENT.evc.label} ${MANUAL_PAYMENT.evc.number} or ${MANUAL_PAYMENT.bank.label} ${MANUAL_PAYMENT.bank.account}`;
