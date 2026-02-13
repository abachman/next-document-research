"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function TagInput({
  value,
  allTags,
  onChange,
  placeholder,
}: {
  value: string[];
  allTags: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [current, setCurrent] = useState("");

  const normalizedValue = useMemo(() => value.map((tag) => normalize(tag)).filter(Boolean), [value]);
  const suggestions = useMemo(
    () =>
      allTags
        .map((tag) => normalize(tag))
        .filter((tag) => tag.includes(normalize(current)))
        .filter((tag) => !normalizedValue.includes(tag))
        .slice(0, 8),
    [allTags, current, normalizedValue],
  );

  function addTag(raw: string) {
    const next = normalize(raw);
    if (!next || normalizedValue.includes(next)) {
      return;
    }
    onChange([...normalizedValue, next]);
    setCurrent("");
  }

  function removeTag(tag: string) {
    onChange(normalizedValue.filter((valueTag) => valueTag !== tag));
  }

  return (
    <div className="space-y-2">
      <Input
        value={current}
        placeholder={placeholder ?? "Add tags and press Enter"}
        onChange={(event) => setCurrent(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            addTag(current);
          }
        }}
      />

      {suggestions.length ? (
        <div className="flex flex-wrap gap-1">
          {suggestions.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => addTag(tag)}
              className="rounded border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs hover:bg-neutral-100"
            >
              {tag}
            </button>
          ))}
        </div>
      ) : null}

      {normalizedValue.length ? (
        <div className="flex flex-wrap gap-1">
          {normalizedValue.map((tag) => (
            <Badge key={tag} className="gap-1">
              {tag}
              <button type="button" onClick={() => removeTag(tag)}>
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}
