import { Fragment } from "react";
import { cn } from "@/lib/utils";

// Solo http(s); evita esquemas peligrosos y recorta puntuación final típica.
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

type TextSegment = { type: "text"; value: string };
type UrlSegment = { type: "url"; value: string; href: string };
type Segment = TextSegment | UrlSegment;

function trimTrailingPunctuation(url: string): {
  href: string;
  trailing: string;
} {
  const match = url.match(TRAILING_PUNCTUATION);
  if (!match) {
    return { href: url, trailing: "" };
  }
  return {
    href: url.slice(0, -match[0].length),
    trailing: match[0],
  };
}

export function splitTextWithUrls(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const rawUrl = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        type: "text",
        value: text.slice(lastIndex, matchIndex),
      });
    }

    const { href, trailing } = trimTrailingPunctuation(rawUrl);
    if (href) {
      segments.push({ type: "url", value: href, href });
    }
    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }

    lastIndex = matchIndex + rawUrl.length;
  }

  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }

  return segments;
}

export function toExternalHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Dominios sin esquema (p. ej. website de empresa)
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return null;
}

export function LinkifiedText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const segments = splitTextWithUrls(text);

  return (
    <span className={cn(className)}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Fragment key={index}>{segment.value}</Fragment>;
        }

        return (
          <a
            key={index}
            href={segment.href}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80"
          >
            {segment.value}
          </a>
        );
      })}
    </span>
  );
}
