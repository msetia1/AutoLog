"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "@/lib/auth-client";
import { Spotlight } from "@/components/ui/spotlight";

export default function Home() {
  const { data: session, isPending } = useSession();
  const router = useRouter();

  // Typewriter effect
  const [titleText, setTitleText] = useState("");
  const [titleComplete, setTitleComplete] = useState(false);

  useEffect(() => {
    if (session) {
      router.push("/dashboard");
    }
  }, [session, router]);

  // Typewriter animation
  useEffect(() => {
    const fullWord = "auto changelog";
    const deleteUntil = 4; // Keep "auto"
    const finalWord = "autolog";
    const typeSpeed = 80;
    const deleteSpeed = 40;
    const pauseBeforeDelete = 1500;
    const pauseBeforeType = 300;

    let timeout: NodeJS.Timeout;
    let currentIndex = 0;
    let phase: "typing" | "pausing" | "deleting" | "typing-final" | "done" = "typing";

    const animate = () => {
      if (phase === "typing") {
        if (currentIndex < fullWord.length) {
          setTitleText(fullWord.slice(0, currentIndex + 1));
          currentIndex++;
          timeout = setTimeout(animate, typeSpeed);
        } else {
          phase = "pausing";
          timeout = setTimeout(animate, pauseBeforeDelete);
        }
      } else if (phase === "pausing") {
        phase = "deleting";
        currentIndex = fullWord.length;
        animate();
      } else if (phase === "deleting") {
        if (currentIndex > deleteUntil) {
          currentIndex--;
          setTitleText(fullWord.slice(0, currentIndex));
          timeout = setTimeout(animate, deleteSpeed);
        } else {
          phase = "typing-final";
          currentIndex = deleteUntil;
          timeout = setTimeout(animate, pauseBeforeType);
        }
      } else if (phase === "typing-final") {
        if (currentIndex < finalWord.length) {
          setTitleText(finalWord.slice(0, currentIndex + 1));
          currentIndex++;
          timeout = setTimeout(animate, typeSpeed);
        } else {
          phase = "done";
          // Blink 3 times before hiding cursor
          timeout = setTimeout(() => setTitleComplete(true), 3000);
        }
      }
    };

    timeout = setTimeout(animate, 300);

    return () => clearTimeout(timeout);
  }, []);

  if (isPending || session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-950">
        <p className="text-neutral-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-neutral-950 overflow-hidden">
      <Spotlight
        className="-top-40 left-0 md:left-60 md:-top-20"
        fill="white"
      />

      <div className="relative z-10 text-center max-w-md px-4">
        <h1
          className="text-5xl font-semibold text-white mb-4 tracking-tight"
          style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace' }}
        >
          {titleText}
          <span
            className={`inline-block w-[3px] h-[1em] bg-white ml-1 align-middle ${titleComplete ? 'opacity-0' : 'animate-[blink_1s_step-end_infinite]'}`}
          />
        </h1>
        <p className="text-neutral-400 text-lg mb-10">
          AI-powered changelogs from your commits in seconds
        </p>

        <button
          onClick={() => signIn.social({ provider: "github" })}
          className="btn-primary px-6 py-3 rounded-lg flex items-center gap-3 mx-auto"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Sign in with GitHub
        </button>
      </div>
    </div>
  );
}
