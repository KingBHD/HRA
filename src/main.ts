import {job as HROneJob} from './jobs/mark-attendance'
import {job as EnsurePunchesJob} from './jobs/ensure-punches'

HROneJob.start()
EnsurePunchesJob.start()
