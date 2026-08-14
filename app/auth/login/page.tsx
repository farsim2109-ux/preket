import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-16 text-center text-[var(--muted)]">Loading...</div>}>
      <LoginForm />
    </Suspense>
  );
}
