export default function DebugPage() {
  return (
    <main style={{ padding: 20, fontFamily: "sans-serif" }}>
      <h1>Debug env</h1>
      <pre>
        {JSON.stringify(
          {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          },
          null,
          2
        )}
      </pre>
    </main>
  );
}
