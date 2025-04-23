import { PrismaClient, SubscriptionStatus, SubscriptionInterval } from './prisma/index.js';

export async function createSubscriptionsAndPaymentMethodsForAllUsers(databaseUrl: string) {
    // Initialize Prisma client with connection string
    const prisma = new PrismaClient({
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
            const existingSubscription = await prisma.subscription.findUnique({
                where: {
                    userId: user.id
                }
            });

            if (existingSubscription) {
                console.log(`User ${user.email} already has a subscription. Skipped.`);
                subscriptionsSkipped++;
            } else {
                // Create a new subscription
                await prisma.subscription.create({
                    data: {
                        id: `sub_${Date.now()}_${user.id.substring(0, 8)}`,
                        priceId: 'price_lifetime_premium',
                        amount: 5600, // 56€/year in cents
                        status: SubscriptionStatus.active,
                        active: true,
                        currency: 'EUR',
                        interval: SubscriptionInterval.year,
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
                            last4: (Math.floor(Math.random() * 10000)).toString(), // random integer between 0000 and 9999
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