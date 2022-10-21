import phin from "phin";


export function hexToDecimal(hex) {
    return parseInt(hex.replace("#", ""), 16)
}

export async function sendWebhookAlert(webhook: string, title: string, message: string, color?: string) {
    if (!color) color = '#ff0000';
    await phin({
        url: webhook,
        method: 'POST', parse: 'json', headers: {
            'Content-Type': 'application/json'
        },
        data: {
            embeds: [{
                title: title,
                description: message,
                color: hexToDecimal(color),
            }]
        }
    });
}

export class CustomDate {
    public date: Date;
    public punchYear: string;
    public punchMonth: string;
    public punchDay: string;
    public punchHour: string;
    public punchMinute: string;

    public todayDateString: string;
    public punchDateString: string;

    constructor(date?: Date) {
        this.date = date || new Date();

        this.punchYear = this.date.getFullYear().toString();
        this.punchMonth = `${this.date.getMonth() + 1}`.padStart(2, '0');
        this.punchDay = `${this.date.getDate()}`.padStart(2, '0');
        this.punchHour = `${this.date.getHours()}`.padStart(2, '0');
        this.punchMinute = `${this.date.getMinutes()}`.padStart(2, '0');

        this.todayDateString = `${this.punchYear}-${this.punchMonth}-${this.punchDay}T00:00:00`
        this.punchDateString = `${this.punchYear}-${this.punchMonth}-${this.punchDay}T${this.punchHour}:${this.punchMinute}`;
    }
}
