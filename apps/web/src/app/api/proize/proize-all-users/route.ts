import { prisma } from "@rallly/database";
import { NextResponse } from "next/server";

import { checkApiAuthorization } from "@/utils/api-auth";

/**
 * Transforms regular users into pro users by creating subscriptions and payment methods
 * for all users who don't have active subscriptions.
 * This is useful for enabling premium features for all users in self-hosted instances.
 */
export async function POST() {
  console.log('[proize] POST /api/proize/proize-all-users called');
  const unauthorized = await checkApiAuthorization();
  console.log('[proize] unauthorized:', !!unauthorized);
  if (unauthorized) return unauthorized;
  try {
    console.log('[proize] Starting proize processing');

    // Current date
    const now = new Date();

    // Period end date (99 years from now)
    const periodEnd = new Date();
    periodEnd.setFullYear(periodEnd.getFullYear() + 99);

    // Counters for summary
    let subscriptionsCreated = 0;
    let subscriptionsSkipped = 0;
    let paymentMethodsCreated = 0;
    let paymentMethodsSkipped = 0;

    // Get all users without active subscriptions
    const users = await prisma.user.findMany();

    for (const user of users) {
      // Find or create the user's primary owned space (first owned space)
      let userSpace = await prisma.space.findFirst({ where: { ownerId: user.id } });
      if (!userSpace) {
        userSpace = await prisma.space.create({
          data: {
            name: 'Personal',
            ownerId: user.id,
            members: { create: { userId: user.id, role: 'ADMIN', lastSelectedAt: new Date() } },
          },
        });
      }

      // Skip if the space is already 'pro'
      if (userSpace.tier === 'pro') {
        subscriptionsSkipped++;
        continue;
      }

      // Check for existing subscription on this space (prefer active)
      const existingSubscription = await prisma.subscription.findFirst({
        where: { spaceId: userSpace.id },
        orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
      });

      if (existingSubscription && existingSubscription.active) {
        subscriptionsSkipped++;
        continue;
      }

      // At this point, space is hobby (or missing active subscription) => create subscription + mark as pro
      await prisma.space.update({ where: { id: userSpace.id }, data: { tier: 'pro' } });

      await prisma.subscription.create({
        data: {
          id: `sub_${Date.now()}_${user.id.substring(0, 8)}`,
          priceId: 'price_lifetime_premium',
          amount: 5600, // 56€/year in cents
          status: 'active',
          quantity: 999,
          active: true,
          currency: 'EUR',
          interval: 'year',
          createdAt: now,
          periodStart: now,
          periodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          user: {
            connect: { id: user.id },
          },
          subscriptionItemId: `sitem_${Date.now()}_${user.id.substring(0, 8)}`,
          space: { connect: { id: userSpace.id } },
        },
      });

      subscriptionsCreated++;
      console.log(`Created subscription for user ${user.email} in space ${userSpace.id}`);

      // 2. Check if user already has a payment method
      const existingPaymentMethods = await prisma.paymentMethod.findMany({
        where: {
          userId: user.id
        }
      });

      if (existingPaymentMethods.length > 0) {
        paymentMethodsSkipped++;
      } else {
        // Create a new payment method
        await prisma.paymentMethod.create({
          data: {
            id: `pm_${Date.now()}_${user.id.substring(0, 8)}`,
            type: 'card',
            data: {
              brand: 'visa',
              last4: (Math.floor(Math.random() * 10000)).toString().padStart(4, '0'), // random integer between 0000 and 9999
              expMonth: 12,
              expYear: new Date().getFullYear() + 5,
              name: user.name || 'Default Card'
            },
            userId: user.id,
            createdAt: now,
            updatedAt: now
          }
        });

        paymentMethodsCreated++;
      }
    }

    return NextResponse.json({
      success: true,
      summary: {
        usersProcessed: users.length,
        subscriptionsCreated,
        subscriptionsSkipped,
        paymentMethodsCreated,
        paymentMethodsSkipped
      }
    });
  } catch (err: any) {
    console.error('Error in /api/proize/proize-all-users', err);
    return NextResponse.json({ success: false, error: err?.message ?? String(err) }, { status: 500 });
  }
}