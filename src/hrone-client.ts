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
    public hasLeaveUntil?: Date;

    public timeIn: boolean = false;
    public timeOut: boolean = false;


    public constructor(
        id: number,
        empId?: number,
        username?: string,
        password?: string,
        accessToken?: string,
        webhookUrl?: string,
        expiredAt?: Date,
        hasLeaveUntil?: Date
    ) {
        this.id = id;
        this.empId = empId;
        this.username = username;
        this.password = password;
        this.accessToken = accessToken;
        this.webhookUrl = webhookUrl;
        this.expiredAt = expiredAt;
        this.hasLeaveUntil = hasLeaveUntil;
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
            user.hasLeaveUntil
        );
    }

    hasLeaves(now?: Date) {
        if (!this.hasLeaveUntil) return false;
        if (!now) now = new Date();
        return now < this.hasLeaveUntil;
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
                companyDomainCode: process.env.COMPANY_DOMAIN
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

    async hasValidToken() {
        if (!this.accessToken || this.isTokenExpired()) {
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

    async hasValidEmpId() {
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
        });
        console.log(response.statusCode, response.body);
        if (response.statusCode === 204) {
            this.timeIn = false;
            this.timeOut = false;
        } else if (response.statusCode === 200) {
            this.timeIn = !!response.body[0].punchDateTime;
            try {
                this.timeOut = !!response.body[1].punchDateTime;
            } catch (e) {
                this.timeOut = false;
            }
        }
    }

    hasAlreadyMarked(currentHour) {
        console.log(currentHour, this.timeIn, this.timeOut);
        if (!this.timeIn && currentHour == 8) {
            Log.info(`Needs to punch in`.gray, 'HROUser');
            return false;
        } else if (this.timeIn && !this.timeOut && currentHour == 17) {
            Log.info(`Needs to punch out`.gray, 'HROUser');
            return false;
        }

        Log.info(`No need to punch in/out`.gray, 'HROUser');
        return true;
    }

    async punch(now: CustomDate) {
        Log.info(`Punching for ${this.username}`.gray, `HROUser`);
        const form = {
            ipAddress: process.env.IP_ADDRESS,
            attendanceSource: 'W',
            attendanceType: 'Online',
            employeeId: this.empId.toString(),
            punchTime: now.punchDateString,
            requestType: "A"
        }

        const response: any = await phin({
            url: `https://hronewebapi.hrone.cloud/api/timeoffice/mobile/checkin/Attendance/Request`,
            method: 'POST', parse: 'json',
            headers: {Authorization: `Bearer ${this.accessToken}`},
            form: form
        });
        if (response.statusCode !== 200) {
            await this.pushFailedAlert(now)
            return false;
        }
        console.log(form);

        if (this.webhookUrl) {
            let checkin = now.date.getHours() >= 8 && now.date.getHours() < 17 ? 'In' : 'Out';
            await this.pushSkipAlert(
                `**${this.empId || this.username}** has checked ${checkin} at ${now.punchDateString}.`,
                `Attendance Check${checkin}`,
                checkin === 'in' ? '#00ff00' : '#ff9200'
            )
        }
        return true;
    }

    async pushFailedAlert(message?: string) {
        let url = this.webhookUrl || process.env.ALERT_WEBHOOK;
        if (url) {
            await sendWebhookAlert(
                url,
                `Punching failed [${this.username}]`,
                `Kindly punch manually` + (message ? `\n\n${message}` : ''),
                '#ff0000'
            );
        }
    }

    async pushSkipAlert(message: string, title?: string, color?: string) {
        let url = this.webhookUrl || process.env.ALERT_WEBHOOK;
        if (url) {
            await sendWebhookAlert(
                url,
                (title) ? title : `Punching skipped [${this.username}]`,
                message,
                (color) ? color : '#aaa'
            );
        }
    }
}
