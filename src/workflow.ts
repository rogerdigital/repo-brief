export interface WorkflowRunCommand {
  command: string;
}

function leadingWhitespaceLength(line: string): number {
  return line.length - line.trimStart().length;
}

function isBlockScalar(value: string): boolean {
  return /^[|>][+-]?$/.test(value);
}

export function stripWrappingQuotes(value: string): string {
  if (value.length < 2) return value;
  const first = value[0];
  const last = value[value.length - 1];
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
    return value.slice(1, -1);
  }
  return value;
}

function extractRunValue(line: string): string | null {
  const trimmed = line.trim();
  if (trimmed.startsWith("- run:")) return trimmed.slice("- run:".length).trim();
  if (trimmed.startsWith("run:")) return trimmed.slice("run:".length).trim();
  return null;
}

export function extractWorkflowRunCommands(content: string): WorkflowRunCommand[] {
  const commands: WorkflowRunCommand[] = [];
  const lines = content.split("\n");

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const runValue = extractRunValue(line);
    if (runValue === null) continue;

    if (!isBlockScalar(runValue)) {
      commands.push({ command: stripWrappingQuotes(runValue) });
      continue;
    }

    const runIndent = leadingWhitespaceLength(line);
    for (let bodyIndex = index + 1; bodyIndex < lines.length; bodyIndex += 1) {
      const bodyLine = lines[bodyIndex];
      const bodyTrimmed = bodyLine.trim();
      if (bodyTrimmed === "") continue;

      const bodyIndent = leadingWhitespaceLength(bodyLine);
      if (bodyIndent <= runIndent) break;

      commands.push({ command: stripWrappingQuotes(bodyTrimmed) });
      index = bodyIndex;
    }
  }

  return commands;
}

export function rewriteWorkflowRunCommands(
  content: string,
  rewriteCommand: (command: string) => string,
): string {
  const patchedLines: string[] = [];
  let multilineRunIndent: number | null = null;

  for (const line of content.split("\n")) {
    const trimmed = line.trim();

    if (multilineRunIndent !== null) {
      const lineIndent = leadingWhitespaceLength(line);
      if (trimmed !== "" && lineIndent > multilineRunIndent) {
        const rewritten = rewriteCommand(trimmed);
        if (rewritten !== trimmed) {
          const commandIndex = line.indexOf(trimmed);
          patchedLines.push(
            line.slice(0, commandIndex) +
              rewritten +
              line.slice(commandIndex + trimmed.length),
          );
          continue;
        }
        patchedLines.push(line);
        continue;
      }
      multilineRunIndent = null;
    }

    const runValue = extractRunValue(line);
    if (runValue === null) {
      patchedLines.push(line);
      continue;
    }

    if (isBlockScalar(runValue)) {
      multilineRunIndent = leadingWhitespaceLength(line);
      patchedLines.push(line);
      continue;
    }

    const unquoted = stripWrappingQuotes(runValue);
    const rewritten = rewriteCommand(unquoted);
    if (rewritten === unquoted) {
      patchedLines.push(line);
      continue;
    }

    const quote = runValue.startsWith('"') && runValue.endsWith('"')
      ? '"'
      : runValue.startsWith("'") && runValue.endsWith("'")
        ? "'"
        : "";
    const newRunValue = quote ? `${quote}${rewritten}${quote}` : rewritten;
    const runIndex = line.indexOf(runValue);
    patchedLines.push(line.slice(0, runIndex) + newRunValue + line.slice(runIndex + runValue.length));
  }

  return patchedLines.join("\n");
}
