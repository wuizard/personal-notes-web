// @vitest-environment jsdom
import {StrictMode} from "react";
import {cleanup, render, screen} from "@testing-library/react";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {useObjectUrl} from "./use-object-url";

/**
 * Guards the StrictMode double-mount bug.
 *
 * The original implementation derived the URL with `useMemo` and revoked it in
 * an effect cleanup. Under StrictMode — which mounts, unmounts and remounts in
 * development — the cleanup revoked the URL while the memo kept serving it, so
 * an image opened from a thumbnail rendered blank until the blob changed.
 *
 * jsdom implements neither createObjectURL nor revokeObjectURL, so they are
 * stubbed here with a registry that tracks which URLs are still live. That is
 * what makes "the rendered src points at a revoked URL" assertable at all.
 */

const live = new Set<string>();
let counter = 0;

beforeEach(() => {
  live.clear();
  counter = 0;
  URL.createObjectURL = () => {
    const url = `blob:mock/${++counter}`;
    live.add(url);
    return url;
  };
  URL.revokeObjectURL = (url: string) => {
    live.delete(url);
  };
});

afterEach(() => {
  // Vitest does not auto-cleanup without `globals: true`; without this the
  // previous test's DOM survives and getByTestId finds several matches.
  cleanup();
  live.clear();
});

function Probe({ blob }: { blob: Blob | null }) {
  const url = useObjectUrl(blob);
  return <span data-testid="url">{url ?? "none"}</span>;
}

function currentUrl() {
  return screen.getByTestId("url").textContent ?? "";
}

describe("useObjectUrl", () => {
  it("serves a LIVE url after a StrictMode mount/unmount/remount cycle", () => {
    const blob = new Blob(["x"], { type: "image/webp" });

    render(
      <StrictMode>
        <Probe blob={blob} />
      </StrictMode>,
    );

    const url = currentUrl();
    expect(url).not.toBe("none");
    // The regression: this was a revoked URL, so the <img> rendered blank.
    expect(live.has(url)).toBe(true);
  });

  it("revokes the previous url when the blob changes", () => {
    const first = new Blob(["a"], { type: "image/webp" });
    const second = new Blob(["b"], { type: "image/webp" });

    const { rerender } = render(<Probe blob={first} />);
    const firstUrl = currentUrl();
    expect(live.has(firstUrl)).toBe(true);

    rerender(<Probe blob={second} />);
    const secondUrl = currentUrl();

    expect(secondUrl).not.toBe(firstUrl);
    expect(live.has(secondUrl)).toBe(true);
    // Without this the app leaks one pinned Blob per image viewed.
    expect(live.has(firstUrl)).toBe(false);
  });

  it("revokes on unmount so nothing is left pinned", () => {
    const blob = new Blob(["x"], { type: "image/webp" });
    const { unmount } = render(<Probe blob={blob} />);

    expect(live.size).toBe(1);
    unmount();
    expect(live.size).toBe(0);
  });

  it("returns null and allocates nothing for an absent blob", () => {
    render(<Probe blob={null} />);
    expect(currentUrl()).toBe("none");
    expect(live.size).toBe(0);
  });
});
