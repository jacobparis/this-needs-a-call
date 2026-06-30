"use client";

import type { ReactNode } from "react";
import { useState } from "react";

type CopyableCommandProps = {
  command: string;
  className?: string;
};

export function CopyableCommand({
  command,
  className = "",
}: CopyableCommandProps) {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className={`relative grid overflow-hidden rounded-lg bg-[var(--code-bg)] text-[var(--code-ink)] shadow-[inset_0_0_0_1px_var(--line)] ${className}`}
    >
      <button
        aria-live="polite"
        className="absolute right-2 top-2 rounded-md bg-[var(--code-hover)] px-2 py-1 text-[11px] font-bold text-[var(--code-muted)] hover:text-[var(--code-ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
        onClick={copyCommand}
        type="button"
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre className="w-full overflow-x-auto p-3 pr-16 text-[13px] leading-[1.55]">
        <code className="whitespace-pre [font-family:var(--font-geist-mono)]">
          {highlightShell(command)}
        </code>
      </pre>
    </div>
  );
}

const tokenPattern =
  /(https?:\/\/[^\s\\]+|--[\w-]+|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\$[A-Z_][A-Z0-9_]*|[A-Z_][A-Z0-9_]*(?==)|\b(?:cd|curl|export|git|node|npm|vercel)\b|\\)/g;

function highlightShell(command: string): ReactNode[] {
  const lines = command.split("\n");

  return lines.flatMap((line, lineIndex) => [
    ...highlightShellLine(line, lineIndex),
    ...(lineIndex < lines.length - 1 ? ["\n"] : []),
  ]);
}

function highlightShellLine(line: string, lineIndex: number): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;

  for (const match of line.matchAll(tokenPattern)) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > cursor) {
      nodes.push(line.slice(cursor, index));
    }

    nodes.push(
      <span className={tokenClassName(token)} key={`${lineIndex}-${index}`}>
        {token}
      </span>,
    );
    cursor = index + token.length;
  }

  if (cursor < line.length) {
    nodes.push(line.slice(cursor));
  }

  return nodes;
}

function tokenClassName(token: string) {
  if (token === "\\") {
    return "text-[var(--code-operator)]";
  }

  if (token.startsWith("--")) {
    return "text-[var(--code-flag)]";
  }

  if (token.startsWith("$") || /^[A-Z_][A-Z0-9_]*$/.test(token)) {
    return "text-[var(--code-variable)]";
  }

  if (token.startsWith("http")) {
    return "text-[var(--code-url)]";
  }

  if (token.startsWith('"') || token.startsWith("'")) {
    return "text-[var(--code-string)]";
  }

  return "font-semibold text-[var(--code-command)]";
}
