"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check } from "lucide-react";
import { PLANS, PLAN_IDS } from "@/modules/billing/plans";
import { changeTenantPlanAction, type ChangePlanState } from "../../actions";

const initialState: ChangePlanState = {};

/**
 * Moving a restaurant onto a different plan, by hand.
 *
 * The operator's override for what billing cannot express: payment by
 * bank transfer, a trial extension, a partner on a permanent free Pro
 * account, or simply undoing a mistake.
 *
 * It deliberately says when Stripe will overwrite the change rather
 * than letting an operator believe a setting has stuck when the next
 * webhook is about to undo it.
 */
export function PlanControl({
  tenantId,
  currentPlan,
  currentStatus,
  hasStripeSubscription,
}: {
  tenantId: string;
  currentPlan: string;
  currentStatus: string;
  hasStripeSubscription: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    changeTenantPlanAction.bind(null, tenantId),
    initialState,
  );

  const [plan, setPlan] = useState(currentPlan);
  const [status, setStatus] = useState(currentStatus);

  // Free has no subscription to be active on, so the status picker is
  // meaningless there and the server forces CANCELED anyway.
  const isFree = plan === "FREE";
  const isUnchanged = plan === currentPlan && status === currentStatus;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="plan" className="text-sm font-medium text-zinc-800">
            Plan
          </label>
          <select
            id="plan"
            name="plan"
            value={plan}
            onChange={(event) => setPlan(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 transition-colors outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
          >
            {PLAN_IDS.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].name}
                {PLANS[id].monthlyPriceCents !== null &&
                  ` — $${Math.round(PLANS[id].monthlyPriceCents / 100)}/mo`}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="subscriptionStatus"
            className="text-sm font-medium text-zinc-800"
          >
            Subscription status
          </label>
          <select
            id="subscriptionStatus"
            name="subscriptionStatus"
            value={isFree ? "CANCELED" : status}
            onChange={(event) => setStatus(event.target.value)}
            disabled={isFree}
            className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 transition-colors outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10 disabled:bg-zinc-100 disabled:text-zinc-500"
          >
            <option value="ACTIVE">Active</option>
            <option value="TRIALING">Trialing</option>
            <option value="CANCELED">Cancelled</option>
          </select>
          <p className="mt-1.5 text-xs text-zinc-500">
            {isFree
              ? "Free has no subscription, so this is set automatically."
              : "A paid plan only takes effect while this is Active or Trialing."}
          </p>
        </div>
      </div>

      {/* The thing an operator most needs to know before pressing save. */}
      {hasStripeSubscription && !isUnchanged && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            This restaurant has a live Stripe subscription. A change here is not sent to
            Stripe, and the next webhook will overwrite it. Cancel or change the
            subscription in Stripe instead, unless you are correcting something
            temporarily.
          </span>
        </p>
      )}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={pending || isUnchanged}
          className="rounded-full bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-700 disabled:opacity-40"
        >
          {pending ? "Saving…" : "Change plan"}
        </button>

        {state.ok && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-green-700">
            <Check className="h-4 w-4" />
            Plan updated.
          </span>
        )}
        {state.error && (
          <span role="alert" className="text-sm font-medium text-red-600">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
