import {CronJob} from "cron";
import {PrismaClient} from "@prisma/client";
import {CustomDate} from "../utils/helpers";
import Log from "../utils/logger";
import {HROneUser} from "../hrone-client";


const prisma = new PrismaClient();


export const job = new CronJob({
    cronTime: '1 8,17 * * 1-5', onTick: async () => {
        Log.info("Cron Job Started", "HROne");
        let now = new CustomDate();

        Log.info(`Checking for HROne Checkin at ${now.punchDateString}`.green, `HROne`);
        let users = await prisma.hrone.findMany();

        for (let user of users) {
            let employee = HROneUser.fromPrismaUser(user);

            // Check if user have any applied leaves on record
            if (employee.hasLeaves(now.date)) {
                Log.info(`Continuing ${employee.username} coz of applied leaves`.yellow, `HROne`);
                await employee.pushSkipAlert(`Because of applied leaves on records`);
                continue;
            }

            // Check if access token is valid and not expired, if not, refresh it
            if (employee.isTokenExpired()) {
                if (!await employee.hasValidToken()) {
                    Log.error(`Failed to get valid token for ${employee.username}`.red, `HROne`);
                    await employee.pushFailedAlert(`Failed to get valid token for ${employee.username}`);
                    continue;
                }
            }

            // Check if employee id is present, if not get it
            if (!employee.empId) {
                if (!await employee.hasValidEmpId()) {
                    Log.error(`Failed to get empId for ${employee.username}`.red, `HROne`);
                    await employee.pushFailedAlert(`Failed to get empId for ${employee.username}`);
                    continue;
                }
            }

            // Get today's attendance
            let today = await employee.getTodayCalendar(now);
            if (!today) {
                Log.error(`Failed to get today's calendar for ${employee.username}`.red, `HROne`);
                await employee.pushFailedAlert(`Failed to get today's calendar for ${employee.username}`);
                continue;
            }

            // Check if it's working day or not
            if (!employee.isWorkingDay(today)) {
                Log.info(`Continuing ${employee.username} coz of non-working day`.yellow, `HROne`);
                await employee.pushSkipAlert(`Because of non-working day`);
                continue;
            }

            // Get the punch in and punch out times if present
            await employee.getPunchDetails(now);

            // Check if user has already checkin or checkout
            if (!employee.hasAlreadyMarked(now.date.getHours())) {
                Log.info(`Continuing ${employee.username} coz of already punched by the user or it's not a right time`.yellow, `HROne`);
                await employee.pushSkipAlert(`Because of already punched by the user`);
                continue;
            }

            // Mark attendance
            if (await employee.punch(now)) {
                Log.info(`Successfully punched for ${employee.username}`.green, `HROne`);
            } else {
                Log.error(`Failed to punch for ${employee.username}`.red, `HROne`);
                await employee.pushFailedAlert(`HR-One server returned error`);
            }
        }
    }, runOnInit: false, timeZone: 'Asia/Kolkata'
})
