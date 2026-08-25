import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAdmin, requireRole } from "../middleware/auth";
import { asyncHandler } from "../lib/asyncHandler";
import { addCredits, getCreditAccount, GLOBAL_CREDIT_ACCOUNT_ID } from "../services/credits";

export const creditsRouter = Router();
creditsRouter.use(requireAdmin);
creditsRouter.post("/deposit", requireRole("ADMIN"));
creditsRouter.patch("/pricing", requireRole("ADMIN"));

creditsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const account = await getCreditAccount();
    const transactions = await prisma.creditTransaction.findMany({
      where: { accountId: GLOBAL_CREDIT_ACCOUNT_ID },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { user: { select: { id: true, displayName: true, username: true } } },
    });
    res.json({
      balance: account.balance,
      pricing: {
        creditsPerGB: account.creditsPerGB,
        packages: {
          "1M_1U": account.package1M1U,
          "1M_2U": account.package1M2U,
          "2M_1U": account.package2M1U,
          "2M_2U": account.package2M2U,
        },
      },
      transactions,
    });
  })
);

creditsRouter.post(
  "/deposit",
  asyncHandler(async (req, res) => {
    const parsed = z.object({ amount: z.number().int().positive(), description: z.string().trim().max(200).optional() }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const account = await addCredits(parsed.data.amount, parsed.data.description);
    res.status(201).json({ balance: account.balance });
  })
);

creditsRouter.patch(
  "/pricing",
  asyncHandler(async (req, res) => {
    const parsed = z.object({
      creditsPerGB: z.number().int().positive(),
      packages: z.object({
        "1M_1U": z.number().int().nonnegative(),
        "1M_2U": z.number().int().nonnegative(),
        "2M_1U": z.number().int().nonnegative(),
        "2M_2U": z.number().int().nonnegative(),
      }),
    }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { creditsPerGB, packages } = parsed.data;
    const account = await prisma.creditAccount.upsert({
      where: { id: GLOBAL_CREDIT_ACCOUNT_ID },
      create: {
        id: GLOBAL_CREDIT_ACCOUNT_ID,
        creditsPerGB,
        package1M1U: packages["1M_1U"],
        package1M2U: packages["1M_2U"],
        package2M1U: packages["2M_1U"],
        package2M2U: packages["2M_2U"],
      },
      update: {
        creditsPerGB,
        package1M1U: packages["1M_1U"],
        package1M2U: packages["1M_2U"],
        package2M1U: packages["2M_1U"],
        package2M2U: packages["2M_2U"],
      },
    });
    res.json({
      balance: account.balance,
      pricing: { creditsPerGB, packages },
    });
  })
);
