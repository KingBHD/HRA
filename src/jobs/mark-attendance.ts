import {CronJob} from "cron";
import {PrismaClient} from "@prisma/client";
import {CustomDate} from "../utils/helpers";
import Log from "../utils/logger";
import {HROneUser} from "../hrone-client";


const prisma = new PrismaClient();


export const job = new CronJob({
    cronTime: '1-5 8,17 * * 1-5', onTick: async () => {
        Log.info("Cron Job Started", "HROne");
        let now = new CustomDate();

        Log.info(`Checking for HROne Checkin at ${now.punchDateString}`.green, `HROne`);
        let users = await prisma.hrone.findMany({});

        for (let user of users) {
            let HROUser = HROneUser.fromPrismaUser(user);

            // For adding random delay to each user
            if (!HROUser.coinFlip()) {
                Log.info(`Skipping ${HROUser.username} due to coin flip`.yellow, `HROne`);
                continue;
            }

            // Check if user has set up any skips?
            if (HROUser.hasSkipTill(now.date)) {
                Log.info(`Skipping ${HROUser.username} due to skipTill`.yellow, `HROne`);
                continue;
            }

            // Check if access token is valid and not expired, if not, refresh it
            if (HROUser.isTokenExpired()) {
                if (!await HROUser.gotValidToken()) {
                    Log.error(`Failed to get valid token for ${HROUser.username}`.red, `HROne`);
                    continue;
                }
            }

            // Check if employee id is present, if not get it
            if (!HROUser.empId) {
                if (!await HROUser.gotValidEmpId()) {
                    Log.error(`Failed to get empId for ${HROUser.username}`.red, `HROne`);
                    continue;
                }
            }

            // Get today's attendance
            let today = await HROUser.getTodayCalendar(now);
            if (!today) {
                Log.error(`Failed to get today's calendar for ${HROUser.username}`.red, `HROne`);
                continue;
            }

            // Check if it's working day or not
            if (!HROUser.isWorkingDay(today)) {
                Log.info(`Skipping ${HROUser.username} due to non-working day`.yellow, `HROne`);
                continue;
            }

            // Get the punch in and punch out times if present
            const timeDetails = await HROUser.getPunchDetails(now);
            if (!timeDetails) {
                Log.error(`Failed to get punch details for ${HROUser.username}`.red, `HROne`);
                continue;
            }
            const {timeIn, timeOut} = timeDetails;

            // Check if user has already checkin or checkout
            if (!HROUser.shouldMarkPunch(now.date.getHours(), timeIn, timeOut)) {
                Log.info(`Skipping ${HROUser.username} due to already punched by the user or it's not a right time`.yellow, `HROne`);
                continue;
            }

            // Mark attendance
            if (await HROUser.punch(now)) {
                Log.info(`Successfully punched for ${HROUser.username}`.green, `HROne`);
            } else {
                Log.error(`Failed to punch for ${HROUser.username}`.red, `HROne`);
            }
        }
    }, runOnInit: false, timeZone: 'Asia/Kolkata'
})
