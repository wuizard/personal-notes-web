import type {PlanTier} from "./types";

/**
 * Backend plan check — docs/10 §10.13, stage 6 seam.
 *
 * There is no billing backend yet: Phase 2 (Go + MongoDB + Polar, docs/10
 * §10.5/§10.10) is sequenced at stage 6, and this project is currently at
 * stage 5 (auth just landed). Every signed-in user is therefore "free" until
 * that stage ships — this stub is what use-plan.ts calls, so wiring the real
 * `GET /me/plan` (or equivalent) endpoint later is a one-function change with
 * no caller-side rework, the same seam shape as ../storage/remote.ts.
 */
export async function checkRemotePlan(uid: string): Promise<PlanTier> {
  void uid;
  return "free";
}
