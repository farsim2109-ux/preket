import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-md px-4 py-16 min-h-[420px]">
          <div className="h-8 w-48 rounded-lg bg-zinc-800/80 animate-pulse mb-8" />
          <div className="space-y-4">
            <div className="h-10 w-full rounded-lg bg-zinc-800/60 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-zinc-800/60 animate-pulse" />
            <div className="h-10 w-full rounded-lg bg-zinc-800/60 animate-pulse" />
          </div>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
