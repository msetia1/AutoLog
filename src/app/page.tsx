"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";

export default function Home() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  if (isPending || session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">Autolog</h1>
        <p className="text-muted-foreground mb-8">AI-Powered Changelog Generator</p>

        <button
          onClick={() => signIn.social({ provider: "github" })}
          className="neo-button bg-white px-6 py-3 rounded-md"
        >
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
