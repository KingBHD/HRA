import {job as HROneJob} from './jobs/mark-attendance'
import Log from "./utils/logger";

HROneJob.start()
Log.info('⚡ Started job'.green)
