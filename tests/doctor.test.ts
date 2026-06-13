import { describe, expect, it } from "vitest";
import { checkPlaywrightSystemDependencies, renderDoctorReport } from "../src/doctor/doctor.js";

describe("checkPlaywrightSystemDependencies", () => {
  it("detects libasound when ldconfig lists it", async () => {
    const report = await checkPlaywrightSystemDependencies({
      execFile: async () => ({ stdout: "libasound.so.2 (libc6,x86-64) => /lib/libasound.so.2", stderr: "", exitCode: 0 })
    });

    expect(report.ok).toBe(true);
    expect(report.missing).toEqual([]);
  });

  it("reports libasound install commands when missing", async () => {
    const report = await checkPlaywrightSystemDependencies({
      execFile: async () => ({ stdout: "", stderr: "", exitCode: 0 })
    });

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual(["libasound.so.2"]);
    expect(renderDoctorReport(report)).toContain("sudo apt-get install -y libasound2");
    expect(renderDoctorReport(report)).toContain('sudo env "PATH=$PATH" npx playwright install-deps chromium');
    expect(renderDoctorReport(report)).toContain("sudo may otherwise pick an older Node.js");
  });
});
