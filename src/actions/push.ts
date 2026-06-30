"use server";

import { sql } from "@/lib/db";
import { getStudentSession, isAdmin } from "@/lib/auth";

type SubscriptionInput = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function saveStudentSubscription(sub: SubscriptionInput): Promise<void> {
  const studentId = await getStudentSession();
  if (!studentId) return;
  await sql`
    INSERT INTO push_subscriptions (student_id, role, endpoint, p256dh, auth)
    VALUES (${studentId}, 'student', ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

export async function saveAdminSubscription(sub: SubscriptionInput): Promise<void> {
  const admin = await isAdmin();
  if (!admin) return;
  await sql`
    INSERT INTO push_subscriptions (student_id, role, endpoint, p256dh, auth)
    VALUES (NULL, 'admin', ${sub.endpoint}, ${sub.keys.p256dh}, ${sub.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth
  `;
}

export async function removeSubscription(endpoint: string): Promise<void> {
  await sql`DELETE FROM push_subscriptions WHERE endpoint = ${endpoint}`;
}
