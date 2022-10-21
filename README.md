# HRA

An automated system to mark attendance for HROne Inbox V5 https://app.hrone.cloud/app

## Environment Variables

- `DATABASE_PROVIDER` - The database provider to use. Currently only `sqlite` is supported.
- `DATABASE_URL` - The database file path. E.g: `file:./main.db`
- `IP_ADDRESS` - IP address of the VPS or server. _This is required during pushing_
- `COMPANY_DOMAIN` - Your HROne Inbox V5 company domain
- `ALERT_WEBHOOK` - The webhook to send alerts too, I used Discord Webhooks

## Usage
- Add your HROne credentials on the sqlite database file

```sql
INSERT INTO hrone (username, password) VALUES ('username', 'password');

-- Recommended to use webhook for alerts
INSERT INTO hrone (username, password, webhookUrl) VALUES ('username', 'password', 'https://discord.com/api/webhooks/...');
```

- `npm install` - Install dependencies
- `npx prisma db push` - Push the database schema
- `npm start` - Start the script and the crons

## Important Notes

- Shift timings are hardcoded in the script. You can change it in the files located in `src/jobs/` & in the file `/src/hrone-client.ts`.
- The script will only work if you have a VPS or server with a public IP address. This is because HROne Inbox V5
  requires a public IP address to push the attendance data.
- This script is not affiliated with HROne Inbox V5
- This script is not guaranteed to work. Use at your own risk.
