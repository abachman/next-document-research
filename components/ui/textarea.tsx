import * as React from "react";

import { cn } from "@/lib/utils";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      "min-h-20 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm shadow-xs outline-none placeholder:text-neutral-500 focus-visible:ring-2 focus-visible:ring-neutral-300",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Textarea.displayName = "Textarea";
