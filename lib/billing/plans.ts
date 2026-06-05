/** Scout Plus — India pricing (Razorpay amounts in paise). */
export const SCOUT_PLUS_PLAN = {
  id: "scout_plus_monthly",
  name: "Scout Plus",
  description: "Unlimited Ask Scout AI, full insights, saved basket sync",
  amount_paise: 19900,
  currency: "INR",
  interval: "monthly" as const,
  /** Free tier AI searches per calendar day */
  free_daily_ai_searches: 5,
};

export function formatInr(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
