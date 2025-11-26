import { prisma } from "@rallly/database";
import { NextResponse } from "next/server";

import { checkApiAuthorization } from "@/utils/api-auth";

/**
 * Clean up verifications data to restore DB integrity.
 *
 * Features:
 * - Detect duplicate `verifications.identifier` and remove older entries (keep latest)
 * - Detect orphaned `email-verification-otp-...` entries where the underlying email doesn't exist in `users`
 *
 * Usage (POST):
 * - body or query parameter `dryRun=true` => no deletion, returns summary + lists to delete
 * - dryRun absent or false => performs deletions inside transaction
 */
export async function POST(req: Request) {
    const unauthorized = await checkApiAuthorization();
    if (unauthorized) return unauthorized;

    const url = new URL(req.url);
    const parsedBody = await req.json().catch(() => ({}));
    const dryRunParam = url.searchParams.get("dryRun") || parsedBody?.dryRun;
    const dryRun = (dryRunParam === "true" || dryRunParam === true) ?? false;

    try {
        // 1) Find duplicate identifiers
        // Raw query to fetch identifier and ids ordered by created_at desc (most recent first)
        const duplicates: { identifier: string; ids: string[] }[] = await prisma.$queryRawUnsafe(
            `SELECT identifier, array_agg(id ORDER BY created_at DESC) AS ids
       FROM verifications
       GROUP BY identifier
       HAVING COUNT(*) > 1;`
        );

        const dupeSummary = duplicates.map((d) => ({ identifier: d.identifier, keep: d.ids[0], delete: d.ids.slice(1) }));
        const dupeDeleteIds = dupeSummary.flatMap((d) => d.delete);

        // 2) Find orphaned email verification OTPs (identifier like 'email-verification-otp-%', where email not in users table)
        // We'll extract emails by removing the prefix.
        const orphanedRows: { id: string; identifier: string; email: string }[] = await prisma.$queryRawUnsafe(
            `SELECT v.id, v.identifier, regexp_replace(v.identifier, '^email-verification(-otp)?-', '') AS email
                 FROM verifications v
                 WHERE v.identifier LIKE 'email-verification-%'
                 AND lower(regexp_replace(v.identifier, '^email-verification(-otp)?-', '')) NOT IN (SELECT lower(email) FROM users);
            `
        );
        const orphanedIds = orphanedRows.map((r) => r.id);

        const result: any = {
            duplicatesCount: dupeSummary.length,
            duplicates: dupeSummary,
            orphanedCount: orphanedRows.length,
            orphanedRows,
        };

        // To actually delete, the client must pass `confirm=true` either as query param or in JSON body
        const confirmParam = url.searchParams.get("confirm") || parsedBody?.confirm;
        const confirm = confirmParam === "true" || confirmParam === true;

        if (dryRun) {
            return NextResponse.json({ ok: true, dryRun: true, ...result });
        }

        if (!confirm) {
            return NextResponse.json(
                { ok: false, message: "To perform the deletion, pass confirm=true or include { confirm: true } in POST body." },
                { status: 400 },
            );
        }

        // 3) Perform deletions in a transaction
        const deleted = await prisma.$transaction(async (tx) => {
            let deletedDupesCount = 0;
            let deletedOrphansCount = 0;

            if (dupeDeleteIds.length > 0) {
                const d1 = await tx.verification.deleteMany({ where: { id: { in: dupeDeleteIds } } });
                deletedDupesCount = Number(d1.count ?? d1);
            }

            if (orphanedIds.length > 0) {
                const d2 = await tx.verification.deleteMany({ where: { id: { in: orphanedIds } } });
                deletedOrphansCount = Number(d2.count ?? d2);
            }

            return { deletedDupesCount, deletedOrphansCount };
        });

        result.deleted = deleted;

        return NextResponse.json({ ok: true, dryRun: false, ...result });
    } catch (err: any) {
        console.error("Error in /api/proize/clean-verifications", err);
        return NextResponse.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
    }
}

export const GET = POST; // Allow GET for quick testing (not recommended in prod)
