import { PrismaClient, SubscriptionStatus, SubscriptionInterval } from './prisma/client';

export async function createSubscriptionsAndPaymentMethodsForAllUsers(databaseUrl: string) {
    // Initialize Prisma client with connection string
    const prisma: any = new PrismaClient({
        datasources: {
            db: {
                url: databaseUrl,
            },
        },
    });

    try {
        // Get all users
        console.log('Retrieving users...');
        const users = await prisma.user.findMany();
        console.log(`${users.length} users found.`);

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

        for (const user of users) {
            // 1. Check if user already has a subscription
            // Find the user's primary space (first space owned by the user). If the user
            // doesn't have a space we'll create a personal one for them. We are using
            // the space to attach the subscription because the app determines tier by
            // subscription linked to a space.
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

            // Check if the space already has a subscription (ordered so active subscriptions are prioritized)
            const existingSubscription = await prisma.subscription.findFirst({
                where: { spaceId: userSpace.id },
                orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
            });

            if (existingSubscription && existingSubscription.active) {
                console.log(`User ${user.email} already has a subscription. Skipped.`);
                subscriptionsSkipped++;
            } else {
                // Create a new subscription
                // Ensure space is marked as pro (helps queries relying on `space.tier`)
                await prisma.space.update({ where: { id: userSpace.id }, data: { tier: 'pro' } });

                await prisma.subscription.create({
                    data: {
                        id: `sub_${Date.now()}_${user.id.substring(0, 8)}`,
                        priceId: 'price_lifetime_premium',
                        amount: 5600, // 56€/year in cents
                        status: SubscriptionStatus.active,
                        quantity: 999,
                        active: true,
                        currency: 'EUR',
                        interval: SubscriptionInterval.year,
                        createdAt: now,
                        periodStart: now,
                        periodEnd: periodEnd,
                        cancelAtPeriodEnd: false,
                        user: {
                            connect: {
                                id: user.id,
                            },
                        },
                        // `subscriptionItemId` is required in the schema
                        subscriptionItemId: `sitem_${Date.now()}_${user.id.substring(0, 8)}`,
                        // Attach subscription to the user's personal space by connecting the relation
                        space: { connect: { id: userSpace.id } },
                    }
                });

                console.log(`Subscription created for user ${user.email}`);
                subscriptionsCreated++;
            }

            // 2. Check if user already has a payment method
            const existingPaymentMethods = await prisma.paymentMethod.findMany({
                where: {
                    userId: user.id
                }
            });

            if (existingPaymentMethods.length > 0) {
                console.log(`User ${user.email} already has ${existingPaymentMethods.length} payment method(s). Skipped.`);
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

                console.log(`Payment method created for user ${user.email}`);
                paymentMethodsCreated++;
            }
        }

        return {
            subscriptionsCreated,
            subscriptionsSkipped,
            paymentMethodsCreated,
            paymentMethodsSkipped
        };
    } catch (error) {
        console.error('Error during processing:', error);
    } finally {
        await prisma.$disconnect();
    }
}