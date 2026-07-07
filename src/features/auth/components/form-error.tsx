import { CircleAlert } from "lucide-react";

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="flex items-start gap-1.5 text-[12.5px] leading-5 text-[var(--destructive)]"
    >
      <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      {message}
    </p>
  );
}
