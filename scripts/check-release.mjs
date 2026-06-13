import { printReleaseReport, validatePublicRelease } from "./check-public-release.mjs";

const result = await validatePublicRelease();
printReleaseReport(result, "Release check");
if (!result.ok) process.exitCode = 1;
