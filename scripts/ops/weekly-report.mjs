import { generateWeeklyReport } from "../lib/weekly-report.mjs";

const result = await generateWeeklyReport();
console.log(result.markdown);
