'use client';

/** "Try again": the page asked once more, as the shopper would by pulling down -- the network may be back. */
export function ReloadButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="btn primary"
      onClick={() => {
        window.location.reload();
      }}
    >
      {label}
    </button>
  );
}
