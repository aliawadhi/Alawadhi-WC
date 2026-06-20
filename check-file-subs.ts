import fs from 'fs';
import path from 'path';

const subsPath = path.join(process.cwd(), "push_subscriptions.json");
if (fs.existsSync(subsPath)) {
    try {
        const subs = JSON.parse(fs.readFileSync(subsPath, "utf8"));
        console.log(`Found ${subs.length} subscriptions in local JSON:`);
        subs.forEach((s: any, idx: number) => {
            console.log(`[Local Sub ${idx+1}] User ID: ${s.userId} | Endpoint: ${s.subscription?.endpoint?.substring(0, 50)}...`);
            console.log(`  -> Sent Alerts:`, JSON.stringify(s.subscription?.sent_alerts || {}));
        });
    } catch (e: any) {
        console.error("Error reading file:", e.message);
    }
} else {
    console.log("Local JSON file does not exist.");
}
