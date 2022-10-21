import 'colors';

export default class Log {
    static getSource(src?: string) {
        return src?.toUpperCase() || 'OTHER';
    }

    static info(message?: any, src?: string) {
        console.log(
            `[${this.toHHMMSS(new Date())}]`.green +
            (` [` + 'INFO'.padEnd(6, ' ') + `] `).cyan +
            `[${this.getSource(src).padEnd(10, ' ')}] `.gray +
            `${message}`
        );
    }

    static error(message?: any, err?: any, src?: string) {
        const err_msg = err?.message || err || 'Unknown error';
        console.error(
            `[${this.toHHMMSS(new Date())}]`.green +
            (` [` + 'ERROR'.padEnd(6, ' ') + `] `).red +
            `[${this.getSource(src).padEnd(10, ' ')}] `.gray +
            `${message} : ${err_msg}`
        );
    }

    private static toHHMMSS(time: Date) {
        let hours = time.getHours().toString().padStart(2, '0');
        let minutes = time.getMinutes().toString().padStart(2, '0');
        let seconds = time.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }
}
