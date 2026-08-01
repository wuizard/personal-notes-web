// @vitest-environment jsdom
import {NextIntlClientProvider} from "next-intl";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import messages from "../../../../messages/en.json";
import {resetSyncStatus, setSyncStatus} from "../status";
import {SyncPill} from "./sync-pill";

/**
 * The pill is the entire ambient surface of sync (docs/04 §4.7), and the
 * states that matter most are the ones hardest to reach by hand: offline with
 * a queue, and a server refusal. Both are unreachable in a local browser
 * without a configured Firebase project, so they are asserted here instead.
 */

function renderPill() {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SyncPill />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => resetSyncStatus());
afterEach(cleanup);

describe("SyncPill", () => {
  // Free tier, signed out, or no API: the caller shows "stored on this
  // device" instead, which is a promise rather than a degraded state.
  it("renders nothing while sync is disabled", () => {
    const { container } = renderPill();
    expect(container.innerHTML).toBe("");
  });

  it("says it is up to date when nothing is queued", () => {
    setSyncStatus({ state: "idle", queued: 0 });
    renderPill();
    expect(screen.getByText("Synced")).toBeDefined();
  });

  it("counts what is waiting while offline", () => {
    setSyncStatus({ state: "offline", queued: 3 });
    renderPill();
    expect(screen.getByText("Offline — 3 changes queued")).toBeDefined();
  });

  it("uses the singular for one queued change", () => {
    setSyncStatus({ state: "offline", queued: 1 });
    renderPill();
    expect(screen.getByText("Offline — 1 change queued")).toBeDefined();
  });

  it("reports a server refusal distinctly from being offline", () => {
    setSyncStatus({ state: "error", queued: 0, error: "premium required" });
    renderPill();
    expect(screen.getByText("Sync problem")).toBeDefined();
  });

  // Sync moves without the user doing anything, so its changes have to be
  // announced — but politely enough never to interrupt typing.
  it("announces itself politely rather than assertively", () => {
    setSyncStatus({ state: "syncing", queued: 1 });
    const { container } = renderPill();
    expect(container.querySelector("[aria-live='polite']")).not.toBeNull();
  });
});
