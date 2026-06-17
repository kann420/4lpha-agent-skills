type Tone = "default" | "accent" | "success" | "warning" | "muted";

interface CliUiOptions {
  plain?: boolean;
  stream?: NodeJS.WriteStream;
  tagline?: string;
}

const BANNER_LINES = [
  "██╗  ██╗     ██╗       ██████╗  ██╗  ██╗  █████╗     ███████╗ ██╗  ██╗ ██╗ ██╗     ██╗     ",
  "██║  ██║    ██╔╝       ██╔══██╗ ██║  ██║ ██╔══██╗    ██╔════╝ ██║ ██╔╝ ██║ ██║     ██║     ",
  "███████║   ██╔╝        ██████╔╝ ███████║ ███████║    ███████╗ █████╔╝  ██║ ██║     ██║     ",
  "╚════██║  ██╔╝         ██╔═══╝  ██╔══██║ ██╔══██║    ╚════██║ ██╔═██╗  ██║ ██║     ██║     ",
  "     ██║ ██╔╝ ███████╗ ██║      ██║  ██║ ██║  ██║    ███████║ ██║  ██╗ ██║ ███████╗███████╗",
  "     ╚═╝ ╚═╝  ╚══════╝ ╚═╝      ╚═╝  ╚═╝ ╚═╝  ╚═╝    ╚══════╝ ╚═╝  ╚═╝ ╚═╝ ╚══════╝╚══════╝",
] as const;
const DEFAULT_BRAND_TAGLINE = "CMC -> Four.Meme/bStocks -> Strategy Spec";
const BRAND_FRAME_TITLE = "4/_PHA Strategy Skill";
const BRAND_WEBSITE = "Website: 4lpha.tech";

export function createCliUi(options: CliUiOptions = {}) {
  const stream = options.stream ?? process.stdout;
  const useColor = !options.plain && Boolean(stream.isTTY) && !process.env.NO_COLOR;
  const tagline = options.tagline ?? DEFAULT_BRAND_TAGLINE;
  const frameWidth = Math.max(
    ...BANNER_LINES.map((line) => line.length),
    tagline.length,
    BRAND_WEBSITE.length,
  );

  function write(line = ""): void {
    stream.write(`${line}\n`);
  }

  function banner(tag: string, subtitle?: string): void {
    write(frameRule("top", BRAND_FRAME_TITLE));
    frameLine();
    for (const line of BANNER_LINES) {
      frameLine(line, "banner");
    }
    frameLine();
    frameLine(tagline, "muted");
    frameLine(BRAND_WEBSITE, "success");
    write(frameRule("bottom", tagline));
    if (subtitle) {
      write(`${color("|", "muted")} ${color(tag, "accent")}: ${color(subtitle, "muted")}`);
    } else {
      write(`${color("|", "muted")} ${color(tag, "accent")}`);
    }
  }

  function keyValue(label: string, value: string, tone: Tone = "default"): void {
    const markerTone = tone === "default" ? "accent" : tone;
    write(`${color("o", markerTone)} ${label}: ${color(value, tone)}`);
  }

  function branch(text: string, tone: Tone = "default"): void {
    write(`${color("|", "muted")} ${color(text, tone)}`);
  }

  function item(text: string, tone: Tone = "default"): void {
    write(`${color("|", "muted")} - ${color(text, tone)}`);
  }

  function section(title: string): void {
    write(color("|", "muted"));
    write(`${color(">", "accent")} ${bold(title)}`);
  }

  function spacer(): void {
    write(color("|", "muted"));
  }

  function step(text: string): void {
    write(`${color("|", "muted")} ${color("...", "accent")} ${text}`);
  }

  function success(text: string): void {
    write(`${color("o", "success")} ${color(text, "success")}`);
  }

  function warning(text: string): void {
    write(`${color("o", "warning")} ${color(text, "warning")}`);
  }

  function frameLine(text = "", tone: Tone | "banner" = "default"): void {
    const padded = padRight(text, frameWidth);
    const content = tone === "banner" ? colorBannerLine(padded) : color(padded, tone);
    write(`${colorFrame("|")} ${content} ${colorFrame("|")}`);
  }

  function frameRule(edge: "top" | "bottom", label: string): string {
    const left = edge === "top" ? "+" : "+";
    const right = edge === "top" ? "+" : "+";
    const fillWidth = frameWidth + 2;
    const marker = ` ${label} `;

    if (marker.length >= fillWidth) {
      return colorFrame(`${left}${"-".repeat(fillWidth)}${right}`);
    }

    const leftFill = Math.floor((fillWidth - marker.length) / 2);
    const rightFill = fillWidth - marker.length - leftFill;

    return colorFrame(`${left}${"-".repeat(leftFill)}${marker}${"-".repeat(rightFill)}${right}`);
  }

  function padRight(text: string, width: number): string {
    if (text.length >= width) {
      return text;
    }

    return `${text}${" ".repeat(width - text.length)}`;
  }

  function badge(text: string): string {
    if (!useColor) {
      return `[ ${text} ]`;
    }

    return `\u001b[44m\u001b[30m ${text} \u001b[0m`;
  }

  function colorBannerLine(line: string): string {
    if (!useColor) {
      return line;
    }

    return ansi256(line, 82);
  }

  function colorFrame(text: string): string {
    if (!useColor) {
      return text;
    }

    return ansi256(text, 40);
  }

  function ansi256(text: string, code: number): string {
    return `\u001b[38;5;${code}m${text}\u001b[0m`;
  }

  function bold(text: string): string {
    if (!useColor) {
      return text;
    }

    return `\u001b[1m${text}\u001b[0m`;
  }

  function color(text: string, tone: Tone): string {
    if (!useColor) {
      return text;
    }

    const code =
      tone === "accent"
        ? "36"
        : tone === "success"
          ? "32"
          : tone === "warning"
            ? "33"
            : tone === "muted"
              ? "90"
              : "37";

    return `\u001b[${code}m${text}\u001b[0m`;
  }

  return {
    banner,
    branch,
    item,
    keyValue,
    section,
    spacer,
    step,
    success,
    warning,
  };
}
