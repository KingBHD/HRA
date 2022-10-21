import {hrone, PrismaClient} from "@prisma/client";
import phin from "phin";
import Log from "./utils/logger";
import moment from "moment-timezone";
import {CustomDate, sendWebhookAlert} from "./utils/helpers";

const prisma = new PrismaClient();

export class HROneUser {

    public id: number;
    public empId?: number;
    public username: string;
    public password: string;

    public accessToken?: string;
    public expiredAt?: Date;

    public webhookUrl?: string;
    public skipTill?: Date;
    public punchState?: boolean = false;


    public constructor(
        id: number,
        empId?: number,
        username?: string,
        password?: string,
        accessToken?: string,
        webhookUrl?: string,
        expiredAt?: Date,
        skipTill?: Date,
        lastPunch?: boolean
    ) {
        this.id = id;
        this.empId = empId;
        this.username = username;
        this.password = password;
        this.accessToken = accessToken;
        this.webhookUrl = webhookUrl;
        this.expiredAt = expiredAt;
        this.skipTill = skipTill;
        this.punchState = lastPunch;
    }

    public static fromPrismaUser(user: hrone) {
        return new HROneUser(
            user.id,
            user.empId,
            user.username,
            user.password,
            user.accessToken,
            user.webhookUrl,
            user.expiresAt,
            user.skipTill,
            user.punchedState
        );
    }

    coinFlip() {
        return Math.random() >= 0.5;
    }

    hasSkipTill(now?: Date) {
        if (!this.skipTill) return false;
        if (!now) now = new Date();
        return now < this.skipTill;
    }

    isTokenExpired(now?: Date) {
        if (!this.expiredAt) return true;
        if (!now) now = new Date();
        return now > this.expiredAt;
    }

    async getNewToken() {
        Log.info(`Getting new token for ${this.username}`.gray, `HROUser`);
        const response: any = await phin({
            url: 'https://hroneauthapi.hrone.cloud/oauth2/token',
            method: 'POST', parse: 'json', form: {
                grant_type: 'password',
                username: this.username,
                password: this.password,
                loginType: `1`,
                companyDomainCode: process.env.COMPANY_DOMAIN,
            }
        });
        if (response.statusCode !== 200) {
            return null;
        }
        const access_token = response.body.access_token;
        const expires = moment().add(response.body.expires_in, 'seconds').toDate();
        await prisma.hrone.update({
            where: {id: this.id}, data: {accessToken: access_token, expiresAt: expires}
        });

        return access_token;
    }

    async gotValidToken() {
        if (!this.accessToken) {
            this.accessToken = await this.getNewToken();
            return this.accessToken !== null;
        }
        return true;
    }

    async getEmpId() {
        Log.info(`Getting empId for ${this.username}`.gray, `HROUser`);
        const response: any = await phin({
            url: `https://hronewebapi.hrone.cloud/api/LogOnUser/LogOnUserDetail`,
            method: 'GET', parse: 'json',
            headers: {Authorization: `Bearer ${this.accessToken}`}
        });
        if (response.statusCode !== 200) {
            return null;
        }
        const empId = response.body.employeeId;
        await prisma.hrone.update({where: {id: this.id}, data: {empId: empId}});

        return empId;
    }

    async gotValidEmpId() {
        this.empId = await this.getEmpId();
        return this.empId !== null;
    }

    async getTodayCalendar(now?: CustomDate) {
        Log.info(`Getting today calendar for ${this.username}`.gray, `HROUser`);
        let response: any = await phin({
            url: `https://hronewebapi.hrone.cloud/api/timeoffice/attendance/Calendar`,
            method: 'POST', parse: 'json',
            headers: {Authorization: `Bearer ${this.accessToken}`},
            form: {
                attendanceMonth: now.punchMonth,
                attendanceYear: now.punchYear,
                employeeId: this.empId.toString(),
            }
        });
        if (response.statusCode !== 200) {
            return null;
        }

        const calendar: any[] = response.body;
        return calendar.find(day => day.attendanceDate === now.todayDateString);
    }

    isWorkingDay(today: any) {
        return today.updatedFirstHalfStatus === "-" && today.updatedSecondHalfStatus === "-"
    }

    async getPunchDetails(now: CustomDate) {
        Log.info(`Getting punch details for ${this.username}`.gray, `HROUser`);
        let response = await phin({
            url: `https://hronewebapi.hrone.cloud/api/timeoffice/attendance/RawPunch/${this.empId}/2022-${now.punchMonth}-${now.punchDay}`,
            method: 'GET',
            parse: 'json',
            headers: {Authorization: `Bearer ${this.accessToken}`}
        })
        let timeIn = false;
        let timeOut = false;
        if (response.statusCode === 204) {
            timeIn = false;
            timeOut = false;
        } else if (response.statusCode === 200) {
            timeIn = !!response.body[0].punchDateTime;
            try {
                timeOut = !!response.body[1].punchDateTime;
            } catch (e) {
                timeOut = false;
            }
        } else {
            return null;
        }
        return {timeIn, timeOut};
    }

    shouldMarkPunch(currentHour, timeIn, timeOut) {
        // Proceed only if user has not punched in, and it's 8:00 AM
        if (!timeIn && currentHour == 8) {
            return true;
        }

        // Proceed only if user hasn't checked out yet, and it's 5:00 PM
        if (!timeOut && currentHour == 17) {
            return true;
        }

        // Proceed only when if user has checked in today, and it's 5:00 PM
        return (timeIn && currentHour == 17);
    }

    async punch(now: CustomDate) {
        Log.info(`Punching for ${this.username}`.gray, `HROUser`);
        // const response: any = await phin({
        //     url: `https://hronewebapi.hrone.cloud/api/timeoffice/mobile/checkin/Attendance/Request`,
        //     method: 'POST', parse: 'json',
        //     headers: {Authorization: `Bearer ${this.accessToken}`},
        //     form: {
        //         ipAddress: process.env.IP_ADDRESS,
        //         attendanceSource: 'W',
        //         attendanceType: 'Online',
        //         employeeId: this.empId.toString(),
        //         punchTime: now.punchDateString,
        //         requestType: "A"
        //     }
        // });
        // if (response.statusCode !== 200) {
        //     await this.sendFailedAlerts(now)
        //     return false;
        // }

        if (this.webhookUrl) {
            let checkin = now.date.getHours() >= 8 && now.date.getHours() < 17 ? 'in' : 'out';
            await sendWebhookAlert(
                process.env.ALERT_WEBHOOK,
                `[RANDOM] Attendance Check${checkin}`,
                `**${this.empId || this.username}** has checked ${checkin} at ${now.punchDateString}.`,
                checkin === 'in' ? '#00ff00' : '#ff9200'
            );
        }
        return true;
    }

    async sendFailedAlerts(now: CustomDate, message?: string) {
        if (this.webhookUrl) {
            await sendWebhookAlert(
                process.env.ALERT_WEBHOOK,
                `Punching failed`,
                `Punching failed for ${this.username} at ${now.punchDateString} Kindly punch manually.` + (message ? `\n\n${message}` : ''),
                '#ff0000'
            );
        }
    }
}
