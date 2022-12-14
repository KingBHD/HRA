import {job as HROneJob} from './jobs/mark-attendance'
import Log from "./utils/logger";

Log.info('⚡ Starting job'.green)
HROneJob.start()
