describe("bundle report parsing", () => {
  let parseBuildOutput: (output: string) => { routes: Record<string, { sizeKb: number; firstLoadJsKb: number }>; sharedFirstLoadJsKb: number | null };
  let parseSizeToKb: (value: string) => number;
  let calculateDelta: (current: number, baseline: number) => { absolute: number; percent: number | null } | null;

  beforeAll(async () => {
    const module = await import("../../scripts/bundle-report.mjs");
    parseBuildOutput = module.parseBuildOutput;
    parseSizeToKb = module.parseSizeToKb;
    calculateDelta = module.calculateDelta;
  });

  it("converts various units to kilobytes", () => {
    expect(parseSizeToKb("102 kB")).toBe(102);
    expect(parseSizeToKb("1 MB")).toBe(1024);
    expect(parseSizeToKb("512 B")).toBeCloseTo(0.5, 1);
  });

  it("parses next build output for primary route metrics", () => {
    const sampleOutput = `
Route (app)                                 Size  First Load JS
┌ ○ /                                     112 kB         246 kB
├ ○ /_not-found                            990 B         103 kB
└ ƒ /api/realtime-token                    123 B         102 kB
+ First Load JS shared by all             102 kB
  ├ chunks/255-4efeec91c7871d79.js       45.7 kB
  ├ chunks/4bd1b696-c023c6e3521b1417.js  54.2 kB
  └ other shared chunks (total)          1.94 kB
`;

    const result = parseBuildOutput(sampleOutput);
    expect(result.routes["/"]).toEqual({ sizeKb: 112, firstLoadJsKb: 246 });
    expect(result.sharedFirstLoadJsKb).toBe(102);
  });

  it("calculates absolute and percentage deltas", () => {
    const delta = calculateDelta(209, 246);
    expect(delta).toEqual({ absolute: -37, percent: -15.04 });
  });

  it("returns null delta when baseline is zero", () => {
    expect(calculateDelta(100, 0)).toBeNull();
  });
});
