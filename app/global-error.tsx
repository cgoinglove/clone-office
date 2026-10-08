"use client";

// The app's frame itself failed, so nothing of it (its words, its theme) can be counted on: a
// plain page in English, the language every screen falls back to, with a way to try again.
export default function GlobalFailed({ reset }: { reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          display: "grid",
          placeItems: "center",
          minHeight: "100vh",
          margin: 0,
        }}
      >
        <main style={{ textAlign: "center", padding: 32 }}>
          <h1 style={{ fontSize: 20 }}>
            Clone Office could not open this screen
          </h1>
          <p style={{ color: "#62656b" }}>
            Your clone and what it keeps are fine.
          </p>
          <button type="button" onClick={() => reset()}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
