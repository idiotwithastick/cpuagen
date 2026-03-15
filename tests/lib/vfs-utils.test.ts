import { describe, it, expect } from "vitest";
import { detectLanguage, formatBytes } from "@/lib/vfs";

describe("detectLanguage", () => {
  it("detects TypeScript", () => {
    expect(detectLanguage("index.ts")).toBe("typescript");
  });

  it("detects TSX", () => {
    expect(detectLanguage("App.tsx")).toBe("tsx");
  });

  it("detects JavaScript", () => {
    expect(detectLanguage("main.js")).toBe("javascript");
  });

  it("detects Python", () => {
    expect(detectLanguage("script.py")).toBe("python");
  });

  it("detects Rust", () => {
    expect(detectLanguage("lib.rs")).toBe("rust");
  });

  it("detects Go", () => {
    expect(detectLanguage("main.go")).toBe("go");
  });

  it("detects HTML", () => {
    expect(detectLanguage("index.html")).toBe("html");
    expect(detectLanguage("page.htm")).toBe("html");
  });

  it("detects CSS and SCSS", () => {
    expect(detectLanguage("styles.css")).toBe("css");
    expect(detectLanguage("theme.scss")).toBe("scss");
  });

  it("detects JSON", () => {
    expect(detectLanguage("package.json")).toBe("json");
  });

  it("detects YAML", () => {
    expect(detectLanguage("config.yaml")).toBe("yaml");
    expect(detectLanguage("ci.yml")).toBe("yaml");
  });

  it("detects Markdown", () => {
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it("detects SQL", () => {
    expect(detectLanguage("migration.sql")).toBe("sql");
  });

  it("detects shell scripts", () => {
    expect(detectLanguage("deploy.sh")).toBe("bash");
  });

  it("detects SVG", () => {
    expect(detectLanguage("icon.svg")).toBe("svg");
  });

  it("detects C/C++", () => {
    expect(detectLanguage("main.c")).toBe("c");
    expect(detectLanguage("lib.cpp")).toBe("cpp");
    expect(detectLanguage("header.h")).toBe("c");
  });

  it("returns text for unknown extensions", () => {
    expect(detectLanguage("file.xyz")).toBe("text");
    expect(detectLanguage("noext")).toBe("text");
  });

  it("handles files with multiple dots", () => {
    expect(detectLanguage("my.component.tsx")).toBe("tsx");
    expect(detectLanguage("data.backup.json")).toBe("json");
  });

  it("is case-insensitive for extensions", () => {
    expect(detectLanguage("README.MD")).toBe("markdown");
    expect(detectLanguage("index.HTML")).toBe("html");
  });
});

describe("formatBytes", () => {
  it("formats 0 bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("formats bytes (< 1KB)", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("formats kilobytes", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2560)).toBe("2.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatBytes(1048576)).toBe("1.0 MB");
    expect(formatBytes(5242880)).toBe("5.0 MB");
  });

  it("formats gigabytes", () => {
    expect(formatBytes(1073741824)).toBe("1.0 GB");
  });
});
