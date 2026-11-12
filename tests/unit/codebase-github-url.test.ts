import { describe, expect, it } from "vitest";
import { githubDisplayUrl, parseGithubUrl } from "@/features/codebase/github-url";

/** M7-06: parser URL GitHub (murni). Host yang dihubungi tidak pernah berasal dari masukan. */

const ok = (input: string) => {
  const result = parseGithubUrl(input);
  if (!result.ok) throw new Error(`diharapkan lolos: ${input} (${result.problem})`);
  return result.value;
};
const problem = (input: string) => {
  const result = parseGithubUrl(input);
  return result.ok ? "ok" : result.problem;
};

describe("parseGithubUrl", () => {
  it("menerima bentuk URL repo yang umum", () => {
    const expected = { owner: "vercel", repo: "next.js", tree: [] };
    for (const input of [
      "https://github.com/vercel/next.js",
      "http://github.com/vercel/next.js/",
      "github.com/vercel/next.js",
      "www.github.com/vercel/next.js",
      "  https://github.com/vercel/next.js.git  ",
      "git@github.com:vercel/next.js.git",
      "https://GitHub.com/vercel/next.js?tab=readme#top",
    ]) {
      expect(ok(input), input).toEqual(expected);
    }
  });

  it("memisahkan segmen setelah /tree/ (batas cabang ditentukan server)", () => {
    expect(ok("github.com/a/b/tree/main")).toEqual({
      owner: "a",
      repo: "b",
      tree: ["main"],
    });
    expect(ok("https://github.com/a/b/tree/feature/x/packages/web").tree).toEqual([
      "feature",
      "x",
      "packages",
      "web",
    ]);
    expect(ok("github.com/a/b/tree/rilis%201").tree).toEqual(["rilis 1"]);
  });

  it("menolak host lain, IP, localhost, port, dan skema lain (SSRF)", () => {
    for (const input of [
      "https://gitlab.com/a/b",
      "https://github.com.evil.test/a/b",
      "https://evil.test/github.com/a/b",
      "http://127.0.0.1/a/b",
      "http://localhost:3000/a/b",
      "https://github.com:8443/a/b",
      "https://api.github.com/repos/a/b",
      "https://codeload.github.com/a/b/zip/main",
      "file:///etc/passwd",
      "ftp://github.com/a/b",
      "github.com/a/b\nHost: evil",
    ]) {
      expect(problem(input), input).toBe("not_github");
    }
  });

  it("menolak kredensial di URL", () => {
    expect(problem("https://user:ghp_rahasia@github.com/a/b")).toBe("credentials");
    expect(problem("https://ghp_rahasia@github.com/a/b")).toBe("credentials");
  });

  it("menolak nama tidak valid dan jalur selain /tree/", () => {
    expect(problem("")).toBe("empty");
    expect(problem("   ")).toBe("empty");
    expect(problem("github.com/a")).toBe("invalid_repo");
    expect(problem("github.com/-a/b")).toBe("invalid_repo");
    expect(problem("github.com/a/..")).toBe("invalid_repo");
    expect(problem("github.com/a/b%2")).toBe("invalid_repo");
    expect(problem("github.com/a/b/issues")).toBe("unsupported_path");
    expect(problem("github.com/a/b/blob/main/README.md")).toBe("unsupported_path");
    expect(problem("github.com/a/b/tree")).toBe("unsupported_path");
    // URL http dinormalkan oleh `URL` (`..` diselesaikan); bentuk SSH tidak, jadi dicek sendiri.
    expect(problem("git@github.com:a/b/tree/main/../x")).toBe("unsupported_path");
  });
});

describe("githubDisplayUrl", () => {
  it("menyusun URL kanonis tanpa kredensial", () => {
    expect(githubDisplayUrl("a", "b")).toBe("https://github.com/a/b");
    expect(githubDisplayUrl("a", "b", "main")).toBe("https://github.com/a/b/tree/main");
    expect(githubDisplayUrl("a", "b", "feature/x", "web")).toBe(
      "https://github.com/a/b/tree/feature/x/web",
    );
  });
});
