import { prisma } from "@rallly/database";
import { NextResponse } from "next/server";

import { checkApiAuthorization } from "@/utils/api-auth";

/**
 * Transforms regular users into pro users by creating subscriptions and payment methods
 * for all users who don't have active subscriptions.
 * This is useful for enabling premium features for all users in self-hosted instances.
 */
export async function POST() {
  const unauthorized = checkApiAuthorization();
  if (unauthorized) return unauthorized;

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
    // 1. Check if user already has a subscription
    const existingSubscription = await prisma.subscription.findUnique({
      where: {
        userId: user.id
      }
    });

    if (existingSubscription) {
      subscriptionsSkipped++;
    } else {
      // Create a new subscription
      await prisma.subscription.create({
        data: {
          id: `sub_${Date.now()}_${user.id.substring(0, 8)}`,
          priceId: 'price_lifetime_premium',
          amount: 5600, // 56€/year in cents
          status: "active",
          active: true,
          currency: 'EUR',
          interval: "year",
          createdAt: now,
          periodStart: now,
          periodEnd: periodEnd,
          cancelAtPeriodEnd: false,
          user: {
            connect: {
              id: user.id
            }
          }
        }
      });

      subscriptionsCreated++;
    }

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
}