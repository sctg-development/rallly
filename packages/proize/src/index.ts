import { createSubscriptionsAndPaymentMethodsForAllUsers } from './proize';

console.log('Initializing Prisma client...');
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL environment variable is not set.');
  process.exit(1);
}

createSubscriptionsAndPaymentMethodsForAllUsers(process.env.DATABASE_URL)
  .then((ret) => {
    if (!ret) {
      console.error('No return value from createSubscriptionsAndPaymentMethodsForAllUsers.');
      process.exit(1);
    }
    console.log(`
      ===== SUMMARY =====
      Subscriptions created: ${ret?.subscriptionsCreated}
      Subscriptions skipped: ${ret?.subscriptionsSkipped}
      Payment methods created: ${ret?.paymentMethodsCreated}
      Payment methods skipped: ${ret?.paymentMethodsSkipped}
      =================
      `);
    console.log('Processing complete.')
  })
  .catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });