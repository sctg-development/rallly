import { getProPricing, stripe } from "@rallly/billing";
import { prisma } from "@rallly/database";
import { absoluteUrl } from "@rallly/utils/absolute-url";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";

import type {
  SubscriptionCheckoutMetadata,
  SubscriptionMetadata,
} from "@/features/subscription/schema";
import { auth } from "@/next-auth";

const inputSchema = z.object({
  period: z.enum(["monthly", "yearly"]).optional(),
  success_path: z.string().optional(),
  return_path: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const userSession = await auth();
  const formData = await request.formData();
  const { period = "monthly", return_path } = inputSchema.parse(
    Object.fromEntries(formData.entries()),
  );

  if (!userSession?.user || userSession.user?.email === null) {
    // You need to be logged in to subscribe
    return NextResponse.redirect(
      new URL(
        `/login${
          return_path ? `?redirect=${encodeURIComponent(return_path)}` : ""
        }`,
        request.url,
      ),
      303,
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userSession.user.id,
    },
    select: {
      email: true,
      name: true,
      customerId: true,
      subscription: {
        select: {
          active: true,
        },
      },
      spaces: {
        select: {
          id: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json(
      { error: `User with ID ${userSession.user.id} not found` },
      { status: 404 },
    );
  }

  if (user.spaces.length === 0) {
    return NextResponse.json(
      { error: `Space with owner ID ${userSession.user.id} not found` },
      { status: 404 },
    );
  }

  let customerId = user.customerId;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
    });

    await prisma.user.update({
      where: {
        id: userSession.user.id,
      },
      data: {
        customerId: customer.id,
      },
    });

    customerId = customer.id;
  }

  if (user.subscription?.active === true) {
    // User already has an active subscription. Take them to customer portal
    return NextResponse.redirect(
      new URL("/api/stripe/portal", request.url),
      303,
    );
  }

  const proPricingData = await getProPricing();

  const spaceId = user.spaces[0].id;

  const session = await stripe.checkout.sessions.create({
    success_url: absoluteUrl(
      return_path ?? "/api/stripe/portal?session_id={CHECKOUT_SESSION_ID}",
    ),
    cancel_url: absoluteUrl(return_path),
    customer: customerId,
    customer_update: {
      name: "auto",
      address: "auto",
    },
    mode: "subscription",
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    tax_id_collection: {
      enabled: true,
    },
    metadata: {
      userId: userSession.user.id,
      spaceId,
    } satisfies SubscriptionCheckoutMetadata,
    subscription_data: {
      metadata: {
        userId: userSession.user.id,
        spaceId,
      } satisfies SubscriptionMetadata,
    },
    line_items: [
      {
        price:
          period === "yearly"
            ? proPricingData.yearly.id
            : proPricingData.monthly.id,
        quantity: 1,
      },
    ],
    automatic_tax: {
      enabled: true,
    },
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60, // 30 minutes
    after_expiration: {
      recovery: {
        enabled: true,
        allow_promotion_codes: true,
      },
    },
  });

  if (session.url) {
    // redirect to checkout session
    return NextResponse.redirect(session.url, 303);
  }

  return NextResponse.json(
    { error: "Something went wrong while creating a checkout session" },
    { status: 500 },
  );
}
