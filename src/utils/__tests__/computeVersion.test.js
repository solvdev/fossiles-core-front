const {
  bumpTypeFromPr,
  highestFinalTag,
  highestTag,
  nextRcNumber,
  nextVersion,
  planRelease,
  resolveBuildEnv,
} = require("../../../scripts/compute-version");

describe("bumpTypeFromPr", () => {
  test("label major wins over feat titles", () => {
    expect(bumpTypeFromPr({ labels: ["major"], title: "feat: huge change" })).toBe("major");
    expect(bumpTypeFromPr({ labels: [{ name: "Major" }], title: "fix: x" })).toBe("major");
  });

  test("label minor bumps minor", () => {
    expect(bumpTypeFromPr({ labels: ["minor"], title: "fix: x" })).toBe("minor");
    expect(bumpTypeFromPr({ labels: [{ name: "MINOR" }], title: "chore: x" })).toBe("minor");
  });

  test("title starting with feat is minor", () => {
    expect(bumpTypeFromPr({ labels: [], title: "feat: add footer" })).toBe("minor");
    expect(bumpTypeFromPr({ labels: [], title: "feat(kardex): redesign" })).toBe("minor");
    expect(bumpTypeFromPr({ labels: [], title: "Feat: uppercase" })).toBe("minor");
    expect(bumpTypeFromPr({ labels: [], title: "FEAT(api): x" })).toBe("minor");
  });

  test("everything else is patch", () => {
    expect(bumpTypeFromPr({ labels: [], title: "fix: typo" })).toBe("patch");
    expect(bumpTypeFromPr({ labels: [], title: "chore: deps" })).toBe("patch");
    expect(bumpTypeFromPr({ labels: [], title: "Merge pull request #12 from foo" })).toBe("patch");
    expect(bumpTypeFromPr({ labels: [], title: "feature: not conventional" })).toBe("patch");
    expect(bumpTypeFromPr({})).toBe("patch");
  });
});

describe("bootstrap and nextVersion", () => {
  test("bootstraps 1.<N>.0 from the merge count when there is no final tag", () => {
    expect(nextVersion(null, "major", 313)).toBe("1.313.0");
    expect(nextVersion("", "minor", 313)).toBe("1.313.0");
    expect(nextVersion(undefined, "patch", 313)).toBe("1.313.0");
    expect(nextVersion("v1.312.1-rc.4", "patch", 313)).toBe("1.313.0");
  });

  test("throws if bootstrap is needed but merge count is missing", () => {
    expect(() => nextVersion(null, "patch")).toThrow(/merge count/);
  });

  test("ignores merge count when a final tag exists", () => {
    expect(nextVersion("v1.312.0", "patch", 313)).toBe("1.312.1");
    expect(nextVersion("1.312.0", "minor", 999)).toBe("1.313.0");
    expect(nextVersion("v1.312.0", "major", 313)).toBe("2.0.0");
  });
});

describe("highestFinalTag ignores rc", () => {
  test("picks the highest final semver and ignores prerelease tags", () => {
    expect(highestFinalTag(["v1.0.0", "v1.10.0", "v1.2.9", "not-a-tag"])).toBe("v1.10.0");
    expect(highestFinalTag(["v1.312.0", "v1.312.1-rc.9", "v1.311.5"])).toBe("v1.312.0");
    expect(highestFinalTag(["v1.312.1-rc.1", "v1.312.1-rc.2"])).toBeNull();
    expect(highestTag([])).toBeNull();
  });
});

describe("nextRcNumber", () => {
  test("starts at rc.1 and increments the highest rc for that next version", () => {
    expect(nextRcNumber([], "1.312.1")).toBe(1);
    expect(nextRcNumber(["v1.312.1-rc.1", "v1.312.1-rc.2"], "1.312.1")).toBe(3);
    expect(nextRcNumber(["v1.312.1-rc.1", "v1.312.1-rc.10"], "1.312.1")).toBe(11);
  });

  test("ignores rc tags of other versions", () => {
    expect(nextRcNumber(["v1.313.0-rc.4", "v1.312.0-rc.9"], "1.312.1")).toBe(1);
  });
});

describe("planRelease", () => {
  test("main with no tags bootstraps v1.<N>.0 from the merge count", () => {
    expect(planRelease({
      branch: "main",
      tags: [],
      bumpType: "patch",
      bootstrapMinor: 313,
    })).toEqual({
      skip: false,
      version: "1.313.0",
      tag: "v1.313.0",
      bump: "initial",
      prerelease: false,
    });
  });

  test("release with no final tags creates v1.<N>.0-rc.K", () => {
    expect(planRelease({
      branch: "release",
      tags: [],
      bumpType: "patch",
      bootstrapMinor: 313,
    })).toEqual({
      skip: false,
      version: "1.313.0-rc.1",
      tag: "v1.313.0-rc.1",
      bump: "initial",
      prerelease: true,
    });
    expect(planRelease({
      branch: "release",
      tags: ["v1.313.0-rc.1"],
      bumpType: "patch",
      bootstrapMinor: 313,
    }).tag).toBe("v1.313.0-rc.2");
  });

  test("tags present: merge count is ignored", () => {
    const tags = ["v1.312.0", "v1.312.1-rc.1"];
    expect(planRelease({
      branch: "main",
      tags,
      bumpType: "patch",
      bootstrapMinor: 313,
    })).toEqual({
      skip: false,
      version: "1.312.1",
      tag: "v1.312.1",
      bump: "patch",
      prerelease: false,
    });
  });

  test("release increments rc for the next final version", () => {
    const tags = ["v1.312.0", "v1.312.1-rc.1", "v1.312.1-rc.2"];
    expect(planRelease({ branch: "release", tags, bumpType: "patch" })).toEqual({
      skip: false,
      version: "1.312.1-rc.3",
      tag: "v1.312.1-rc.3",
      bump: "patch",
      prerelease: true,
    });
  });

  test("main ignores rc tags when computing the final version", () => {
    const tags = ["v1.312.0", "v1.312.1-rc.1", "v1.312.1-rc.9"];
    expect(planRelease({ branch: "main", tags, bumpType: "patch" })).toEqual({
      skip: false,
      version: "1.312.1",
      tag: "v1.312.1",
      bump: "patch",
      prerelease: false,
    });
    expect(planRelease({ branch: "main", tags, bumpType: "minor" }).tag).toBe("v1.313.0");
  });

  test("skips when HEAD is already tagged for that channel", () => {
    expect(planRelease({
      branch: "main",
      tags: ["v1.312.0"],
      bumpType: "patch",
      headTags: ["v1.312.0"],
    }).skip).toBe(true);
    expect(planRelease({
      branch: "release",
      tags: ["v1.312.0", "v1.312.1-rc.1"],
      bumpType: "patch",
      headTags: ["v1.312.1-rc.1"],
    })).toMatchObject({
      skip: true,
      tag: "v1.312.1-rc.1",
      version: "1.312.1-rc.1",
      prerelease: true,
    });
  });
});

describe("resolveBuildEnv", () => {
  test("falls back to dev when computeRelease throws during a CI build", async () => {
    const previousActions = process.env.GITHUB_ACTIONS;
    const previousVersion = process.env.REACT_APP_VERSION;
    process.env.GITHUB_ACTIONS = "true";
    delete process.env.REACT_APP_VERSION;
    try {
      const result = await resolveBuildEnv(async () => {
        throw new Error("GitHub API down");
      });
      expect(result.version).toBe("dev");
      expect(result.commit).toBeTruthy();
    } finally {
      if (previousActions === undefined) delete process.env.GITHUB_ACTIONS;
      else process.env.GITHUB_ACTIONS = previousActions;
      if (previousVersion === undefined) delete process.env.REACT_APP_VERSION;
      else process.env.REACT_APP_VERSION = previousVersion;
    }
  });
});
